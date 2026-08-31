import type { Dispatch, MutableRefObject, SetStateAction } from "react";
import type { ChatMode } from "@/platform/rpc/chat-api";
import { sendChatMessage } from "@/platform/rpc/chat-api";
import type {
	AdditionalContextItem,
	WorkbenchPatch,
	WorkbenchSnapshot,
	WorkspaceConfig,
} from "@/platform/rpc/types";
import type { SkillSummary } from "@/platform/rpc/skill-api";
import {
	createChatRequestId,
	createFrontendFailedRunEvent,
	getChatOutputTarget,
	getCurrentWorkspaceId,
	isBackendRpcErrorMessage,
} from "@/domain/application/app-helpers";
import { extractEnabledSkillRefs } from "@/domain/composer/composer-completion";
import { applyBackendEventToTimeline } from "@/domain/workbench/workbench-state";
import {
	finishOptimisticRunState,
	isRunControllerActive,
	type RunControllerState,
} from "@/domain/workbench/run-state";
import {
	markRunStopped,
	type RunningSessionState,
} from "@/domain/workspace/session-running";
import type { TimelinePageState } from "@/domain/workbench/workbench-state";
import type { TimelinePageStore } from "@/domain/workbench/timeline-page-store";
import { mergeWorkbenchPatch } from "@/features/workbench/controllers/useWorkbenchPatchQueue";

export type ComposerSendRequest = {
	message: string;
	additionalContext: AdditionalContextItem[];
	chatMode: ChatMode;
	modeOverride?: ChatMode;
	provider?: string;
	model?: string;
	reasoningEffort?: string;
	workspace: WorkspaceConfig | null;
	workbench: WorkbenchSnapshot;
};

export type ComposerSendControllerParams = {
	activeSessionId: string | null;
	activeSessionIdRef: MutableRefObject<string | null>;
	runState: RunControllerState;
	skills: readonly SkillSummary[];
	setRunState: Dispatch<SetStateAction<RunControllerState>>;
	setRunningSessionState: Dispatch<SetStateAction<RunningSessionState>>;
	setWorkbench: Dispatch<SetStateAction<WorkbenchSnapshot | null>>;
	setSessionError: (message: string | null) => void;
	setActiveRetryRequestId: Dispatch<SetStateAction<string | null>>;
	activeChatRequestIdRef: MutableRefObject<string | null>;
	cancelledChatRequestIdsRef: MutableRefObject<Set<string>>;
	takePendingWorkbenchPatch: () => WorkbenchPatch;
	sendWorkbenchPatch: (
		patch: WorkbenchPatch,
		applyResult?: boolean,
	) => Promise<unknown>;
	handleQueueMessageSubmit: (
		message: string,
		modeOverride?: ChatMode,
	) => Promise<void>;
	applyOptimisticSend: (
		requestId: string,
		message: string,
		additionalContext: AdditionalContextItem[],
	) => void;
	finishOptimisticActiveRun: (requestId: string) => void;
	replaceComposerInput: (text: string, scopeId?: string) => void;
	refreshLatestTimeline: () => Promise<void>;
	timelineStore: TimelinePageStore;
};

export type ComposerSendController = {
	submitComposerMessage: (
		request: ComposerSendRequest,
	) => Promise<boolean | null>;
};

function useComposerSendController({
	activeSessionId,
	activeSessionIdRef,
	runState,
	skills,
	setRunState,
	setRunningSessionState,
	setWorkbench,
	setSessionError,
	setActiveRetryRequestId,
	activeChatRequestIdRef,
	cancelledChatRequestIdsRef,
	takePendingWorkbenchPatch,
	sendWorkbenchPatch,
	handleQueueMessageSubmit,
	applyOptimisticSend,
	finishOptimisticActiveRun,
	replaceComposerInput,
	refreshLatestTimeline,
	timelineStore,
}: ComposerSendControllerParams): ComposerSendController {
	async function submitComposerMessage(
		request: ComposerSendRequest,
	): Promise<boolean | null> {
		if (isRunControllerActive(runState)) {
			await handleQueueMessageSubmit(
				request.message,
				request.modeOverride,
			);
			return null;
		}

		const requestId: string = createChatRequestId();
		const skillRefs: string[] = extractEnabledSkillRefs(
			request.message,
			skills,
		);
		const pendingPatch: WorkbenchPatch = mergeWorkbenchPatch(
			mergeWorkbenchPatch(
				takePendingWorkbenchPatch(),
				request.modeOverride === undefined
					? {}
					: { composer: { chatMode: request.chatMode } },
			),
			{
				additionalContextAction: { action: "clearUnpinned" },
			},
		);
		const flushPendingPatch: Promise<unknown> = sendWorkbenchPatch(
			pendingPatch,
			false,
		);

		try {
			setSessionError(null);
			setActiveRetryRequestId(null);
			activeChatRequestIdRef.current = requestId;
			applyOptimisticSend(
				requestId,
				request.message,
				request.additionalContext,
			);

			await flushPendingPatch;
			await sendChatMessage({
				requestId,
				message: request.message,
				mode: request.chatMode,
				provider: request.provider,
				model: request.model,
				reasoningEffort: request.reasoningEffort,
				executionPolicy: "auto",
				outputTarget: getChatOutputTarget(
					request.chatMode,
					getCurrentWorkspaceId(request.workspace, request.workbench),
				),
				additionalContext: request.additionalContext,
				skillRefs,
			});
			if (request.chatMode !== "goal") {
				await refreshLatestTimeline();
			}
			return true;
		} catch (error: unknown) {
			if (cancelledChatRequestIdsRef.current.has(requestId)) {
				finishOptimisticActiveRun(requestId);
				setSessionError(null);
				return false;
			}
			const errorMessage: string =
				error instanceof Error
					? error.message
					: "Failed to send message";

			replaceComposerInput(request.message, activeSessionId ?? "home");
			setRunState(
				(currentState: RunControllerState): RunControllerState =>
					finishOptimisticRunState(currentState, requestId),
			);
			setRunningSessionState(
				(current: RunningSessionState): RunningSessionState =>
					markRunStopped(current, requestId),
			);
			setWorkbench(
				(
					currentWorkbench: WorkbenchSnapshot | null,
				): WorkbenchSnapshot | null => {
					return currentWorkbench === null
						? currentWorkbench
						: {
								...currentWorkbench,
								composer: {
									...currentWorkbench.composer,
									additionalContext: request.additionalContext,
								},
								activeRun:
									currentWorkbench.activeRun.requestId === requestId
										? { status: "idle" }
										: currentWorkbench.activeRun,
							};
				},
			);
			setSessionError(errorMessage);
			if (!isBackendRpcErrorMessage(errorMessage)) {
				timelineStore.update(
					(currentPage: TimelinePageState): TimelinePageState => ({
						...currentPage,
						blocks: applyBackendEventToTimeline(
							currentPage.blocks,
							createFrontendFailedRunEvent(
								requestId,
								currentPage.sessionId ??
									activeSessionIdRef.current ??
									"",
								errorMessage,
							),
						),
					}),
				);
			}
			console.error("[App] send message failed", error);
			return false;
		} finally {
			cancelledChatRequestIdsRef.current.delete(requestId);
			if (activeChatRequestIdRef.current === requestId) {
				activeChatRequestIdRef.current = null;
			}
		}
	}

	return { submitComposerMessage };
}

export default useComposerSendController;

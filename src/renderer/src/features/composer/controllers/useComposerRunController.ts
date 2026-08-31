import type { Dispatch, MutableRefObject, SetStateAction } from "react";
import {
	cancelChatMessage,
	retryAgentRun,
	sendChatMessage,
	type ChatMode,
} from "@/platform/rpc/chat-api";
import type { AdditionalContextItem, WorkbenchPatch, WorkbenchSnapshot, WorkspaceConfig } from "@/platform/rpc/types";
import type { SkillSummary } from "@/platform/rpc/skill-api";
import type { RetryUserMessagePayload } from "@/domain/conversation/retry-user-message";
import {
	createChatRequestId,
	getChatMode,
	getChatOutputTarget,
	getCurrentWorkspaceId,
} from "@/domain/application/app-helpers";
import { extractEnabledSkillRefs } from "@/domain/composer/composer-completion";
import {
	finishOptimisticRunState,
	getRunControllerRequestId,
	isRunControllerActive,
	type RunControllerState,
} from "@/domain/workbench/run-state";
import type { RunningSessionState } from "@/domain/workspace/session-running";

export type ComposerRunControllerParams = {
	activeSessionId: string | null;
	activeSessionIdRef: MutableRefObject<string | null>;
	activeWorkspace: WorkspaceConfig | null;
	workbench: WorkbenchSnapshot | null;
	runState: RunControllerState;
	isSessionLoading: boolean;
	skills: readonly SkillSummary[];
	setSessionError: (message: string | null) => void;
	setActiveRetryRequestId: Dispatch<SetStateAction<string | null>>;
	setRunState: Dispatch<SetStateAction<RunControllerState>>;
	setWorkbench: Dispatch<SetStateAction<WorkbenchSnapshot | null>>;
	setIsHomeSubmitting: Dispatch<SetStateAction<boolean>>;
	activeChatRequestIdRef: MutableRefObject<string | null>;
	cancelledChatRequestIdsRef: MutableRefObject<Set<string>>;
	homeSubmissionPendingRef: MutableRefObject<boolean>;
	takePendingWorkbenchPatch: () => WorkbenchPatch;
	sendWorkbenchPatch: (
		patch: WorkbenchPatch,
		applyResult?: boolean,
	) => Promise<unknown>;
	applyOptimisticRetry: (
		retryFromRequestId: string,
		requestId: string,
		message: string,
		additionalContext: AdditionalContextItem[],
	) => void;
	finishOptimisticActiveRun: (requestId: string) => void;
	refreshLatestTimeline: () => Promise<void>;
	resetPlanClarificationUiState: () => void;
	resetPlanApprovalUiState: () => void;
	showTransientError: (message: string) => void;
};

export type ComposerRunController = {
	handleRetryFromUserMessage: (
		payload: RetryUserMessagePayload,
	) => Promise<boolean>;
	handleInterruptedRunRetry: (runId: string) => Promise<void>;
	handleComposerCancel: () => Promise<void>;
};

function useComposerRunController({
	activeSessionId,
	activeSessionIdRef,
	activeWorkspace,
	workbench,
	runState,
	isSessionLoading,
	skills,
	setSessionError,
	setActiveRetryRequestId,
	setRunState,
	setWorkbench,
	setIsHomeSubmitting,
	activeChatRequestIdRef,
	cancelledChatRequestIdsRef,
	homeSubmissionPendingRef,
	takePendingWorkbenchPatch,
	sendWorkbenchPatch,
	applyOptimisticRetry,
	finishOptimisticActiveRun,
	refreshLatestTimeline,
	resetPlanClarificationUiState,
	resetPlanApprovalUiState,
	showTransientError,
}: ComposerRunControllerParams): ComposerRunController {
	async function handleRetryFromUserMessage(
		payload: RetryUserMessagePayload,
	): Promise<boolean> {
		if (activeSessionId === null || workbench === null) {
			setSessionError("Please open a session before retrying.");
			return false;
		}

		if (isRunControllerActive(runState) || isSessionLoading) {
			return false;
		}

		const message: string = payload.message.trim();
		if (message.length === 0 && payload.additionalContext.length === 0) {
			return false;
		}

		const requestId: string = createChatRequestId();
		const chatMode: ChatMode = getChatMode(workbench);
		const skillRefs: string[] = extractEnabledSkillRefs(message, skills);
		const pendingPatch: WorkbenchPatch = takePendingWorkbenchPatch();
		const flushPendingPatch: Promise<unknown> = sendWorkbenchPatch(
			pendingPatch,
			false,
		);
		const currentWorkbench: WorkbenchSnapshot = workbench;

		try {
			setSessionError(null);
			activeChatRequestIdRef.current = requestId;
			applyOptimisticRetry(
				payload.requestId,
				requestId,
				message,
				payload.additionalContext,
			);
			setActiveRetryRequestId(null);

			await flushPendingPatch;
			await sendChatMessage({
				requestId,
				message,
				mode: chatMode,
				provider: currentWorkbench.composer.provider ?? undefined,
				model: currentWorkbench.composer.model ?? undefined,
				reasoningEffort:
					currentWorkbench.composer.reasoningEffort ?? undefined,
				executionPolicy: "auto",
				outputTarget: getChatOutputTarget(
					chatMode,
					getCurrentWorkspaceId(activeWorkspace, currentWorkbench),
				),
				retryFromRequestId: payload.requestId,
				additionalContext: payload.additionalContext,
				skillRefs,
			});
			if (chatMode !== "goal") {
				await refreshLatestTimeline();
			}
			return true;
		} catch (error: unknown) {
			if (cancelledChatRequestIdsRef.current.has(requestId)) {
				finishOptimisticActiveRun(requestId);
				setSessionError(null);
				return true;
			}
			const errorMessage: string =
				error instanceof Error
					? error.message
					: "Failed to retry message";

			setRunState(
				(currentState: RunControllerState): RunControllerState =>
					finishOptimisticRunState(currentState, requestId),
			);
			setWorkbench(
				(
					currentWorkbench: WorkbenchSnapshot | null,
				): WorkbenchSnapshot | null =>
					currentWorkbench === null
						? currentWorkbench
						: {
								...currentWorkbench,
								activeRun:
									currentWorkbench.activeRun.requestId === requestId
										? { status: "idle" }
										: currentWorkbench.activeRun,
							},
			);
			setSessionError(errorMessage);
			await refreshLatestTimeline().catch(
				(refreshError: unknown): void => {
					console.error(
						"[App] refresh timeline after retry failure failed",
						refreshError,
					);
				},
			);
			console.error("[App] retry message failed", error);
			return false;
		} finally {
			cancelledChatRequestIdsRef.current.delete(requestId);
			if (activeChatRequestIdRef.current === requestId) {
				activeChatRequestIdRef.current = null;
			}
		}
	}

	async function handleInterruptedRunRetry(runId: string): Promise<void> {
		if (
			activeSessionIdRef.current === null ||
			isSessionLoading ||
			isRunControllerActive(runState)
		) {
			return;
		}
		try {
			setSessionError(null);
			await retryAgentRun(runId);
			await refreshLatestTimeline();
		} catch (error: unknown) {
			const message: string =
				error instanceof Error
					? error.message
					: "Failed to retry interrupted run";
			setSessionError(message);
			console.error("[App] retry interrupted run failed", error);
		}
	}

	async function handleComposerCancel(): Promise<void> {
		const requestId: string | null = getRunControllerRequestId(runState);
		const cancellationRequestId: string | null =
			requestId ?? activeChatRequestIdRef.current;
		if (cancellationRequestId === null) {
			return;
		}
		if (
			runState.status === "cancelling" ||
			cancelledChatRequestIdsRef.current.has(cancellationRequestId)
		) {
			return;
		}

		const wasCreatingSession: boolean = homeSubmissionPendingRef.current;
		const previousRunState: RunControllerState = runState;
		cancelledChatRequestIdsRef.current.add(cancellationRequestId);
		setRunState(
			(currentState: RunControllerState): RunControllerState => ({
				...currentState,
				status: "cancelling",
				requestId: cancellationRequestId,
				startedAt: currentState.startedAt ?? new Date().toISOString(),
			}),
		);
		try {
			activeChatRequestIdRef.current = cancellationRequestId;
			const result = await cancelChatMessage(cancellationRequestId);
			if (
				result.cancelled ||
				result.alreadyFinished ||
				wasCreatingSession
			) {
				// The cancellation response is authoritative. Terminal events remain the
				// persisted source of truth, but the Composer must not stay in a stopping
				// state while waiting for an event that may already have been delivered.
				if (activeChatRequestIdRef.current === cancellationRequestId) {
					activeChatRequestIdRef.current = null;
				}
				if (result.alreadyFinished === true) {
					cancelledChatRequestIdsRef.current.delete(
						cancellationRequestId,
					);
				}
				finishOptimisticActiveRun(cancellationRequestId);
				setIsHomeSubmitting(false);
				resetPlanClarificationUiState();
				resetPlanApprovalUiState();
				return;
			}
			if (
				!result.cancelled &&
				!result.alreadyFinished &&
				!wasCreatingSession
			) {
				throw new Error(
					"The backend did not accept the cancellation request.",
				);
			}
		} catch (error: unknown) {
			console.error("[App] cancel chat failed", error);
			if (wasCreatingSession) {
				if (activeChatRequestIdRef.current === cancellationRequestId) {
					activeChatRequestIdRef.current = null;
				}
				finishOptimisticActiveRun(cancellationRequestId);
				setIsHomeSubmitting(false);
				resetPlanClarificationUiState();
				resetPlanApprovalUiState();
				return;
			}
			cancelledChatRequestIdsRef.current.delete(cancellationRequestId);
			setRunState(
				(currentState: RunControllerState): RunControllerState =>
					currentState.requestId === cancellationRequestId
						? previousRunState
						: currentState,
			);
			showTransientError(
				error instanceof Error
					? error.message
					: "Failed to stop the response",
			);
		}
	}

	return {
		handleRetryFromUserMessage,
		handleInterruptedRunRetry,
		handleComposerCancel,
	};
}

export default useComposerRunController;

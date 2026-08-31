import type { Dispatch, MutableRefObject, SetStateAction } from "react";
import type { ChatMode } from "@/platform/rpc/chat-api";
import { sendChatMessage } from "@/platform/rpc/chat-api";
import {
	createSession,
	createSessionWorktree,
} from "@/platform/rpc/session-api";
import type {
	AdditionalContextItem,
	SessionMetadata,
	WorkbenchSnapshot,
	WorkflowTodoSnapshot,
	WorkspaceConfig,
} from "@/platform/rpc/types";
import type { ApprovalMode } from "@/platform/rpc/approval-api";
import type { ClientPreferences } from "@/platform/rpc/client-preferences-api";
import type { ProviderModelSelection } from "@/platform/rpc/provider-api";
import type { SkillSummary } from "@/platform/rpc/skill-api";
import {
	createChatRequestId,
	createFrontendFailedRunEvent,
	createPreferredHomeDraft,
	createWorkspaceFromSessionMetadata,
	getChatOutputTarget,
	isBackendRpcErrorMessage,
	type HomeDraft,
} from "@/domain/application/app-helpers";
import { extractEnabledSkillRefs } from "@/domain/composer/composer-completion";
import { applyBackendEventToTimeline } from "@/domain/workbench/workbench-state";
import {
	finishOptimisticRunState,
	type RunControllerState,
} from "@/domain/workbench/run-state";
import {
	markRunStopped,
	type RunningSessionState,
} from "@/domain/workspace/session-running";
import type { TimelinePageState } from "@/domain/workbench/workbench-state";
import type { TimelinePageStore } from "@/domain/workbench/timeline-page-store";
import { recordOpenedSession } from "@/domain/session/session-navigation-history";

export type HomeComposerControllerParams = {
	homeDraft: HomeDraft;
	clientPreferences: ClientPreferences;
	providerModelSelection: ProviderModelSelection | null;
	approvalMode: ApprovalMode;
	skills: readonly SkillSummary[];
	getWorktreeUnavailableMessage: () => string;
	persistNewSessionComposerDefaults: (
		patch: Partial<ClientPreferences["newSessionComposer"]>,
	) => void;
	setHomeDraft: Dispatch<SetStateAction<HomeDraft>>;
	setIsHomeSubmitting: Dispatch<SetStateAction<boolean>>;
	setIsWorktreePreparing: Dispatch<SetStateAction<boolean>>;
	setIsNewSessionHome: Dispatch<SetStateAction<boolean>>;
	materializeTemporarySessionLayout: (sessionId: string) => void;
	setActiveSessionId: Dispatch<SetStateAction<string | null>>;
	activeSessionIdRef: MutableRefObject<string | null>;
	setActiveSessionMetadata: Dispatch<SetStateAction<SessionMetadata | null>>;
	setActiveWorkspace: Dispatch<SetStateAction<WorkspaceConfig | null>>;
	setWorkbench: Dispatch<SetStateAction<WorkbenchSnapshot | null>>;
	setWorkflowTodoSnapshot: Dispatch<
		SetStateAction<WorkflowTodoSnapshot | null>
	>;
	rememberLoadedWorkflowTodo: (snapshot: WorkflowTodoSnapshot | null) => void;
	setSessionError: (message: string | null) => void;
	setActiveRetryRequestId: Dispatch<SetStateAction<string | null>>;
	setRunState: Dispatch<SetStateAction<RunControllerState>>;
	setRunningSessionState: Dispatch<SetStateAction<RunningSessionState>>;
	activeChatRequestIdRef: MutableRefObject<string | null>;
	cancelledChatRequestIdsRef: MutableRefObject<Set<string>>;
	homeSubmissionPendingRef: MutableRefObject<boolean>;
	replaceComposerInput: (text: string, scopeId?: string) => void;
	applyOptimisticSend: (
		requestId: string,
		message: string,
		additionalContext: AdditionalContextItem[],
	) => void;
	refreshLatestTimeline: (sessionIdOverride?: string) => Promise<void>;
	finishOptimisticActiveRun: (requestId: string) => void;
	timelineStore: TimelinePageStore;
};

export type HomeComposerController = {
	handleHomeComposerSubmit: (
		nextMessage: string,
		modeOverride?: ChatMode,
	) => Promise<void>;
};

function useHomeComposerController({
	homeDraft,
	clientPreferences,
	providerModelSelection,
	approvalMode,
	skills,
	getWorktreeUnavailableMessage,
	persistNewSessionComposerDefaults,
	setHomeDraft,
	setIsHomeSubmitting,
	setIsWorktreePreparing,
	setIsNewSessionHome,
	materializeTemporarySessionLayout,
	setActiveSessionId,
	activeSessionIdRef,
	setActiveSessionMetadata,
	setActiveWorkspace,
	setWorkbench,
	setWorkflowTodoSnapshot,
	rememberLoadedWorkflowTodo,
	setSessionError,
	setActiveRetryRequestId,
	setRunState,
	setRunningSessionState,
	activeChatRequestIdRef,
	cancelledChatRequestIdsRef,
	homeSubmissionPendingRef,
	replaceComposerInput,
	applyOptimisticSend,
	refreshLatestTimeline,
	finishOptimisticActiveRun,
	timelineStore,
}: HomeComposerControllerParams): HomeComposerController {
	async function handleHomeComposerSubmit(
		nextMessage: string,
		modeOverride?: ChatMode,
	): Promise<void> {
		const message: string = nextMessage.trim();
		if (message.length === 0 || homeSubmissionPendingRef.current) {
			return;
		}
		homeSubmissionPendingRef.current = true;

		const chatMode: ChatMode = modeOverride ?? homeDraft.chatMode;
		if (modeOverride !== undefined && modeOverride !== homeDraft.chatMode) {
			persistNewSessionComposerDefaults({ mode: modeOverride });
			setHomeDraft(
				(currentDraft: HomeDraft): HomeDraft => ({
					...currentDraft,
					chatMode: modeOverride,
				}),
			);
		}
		const requestId: string = createChatRequestId();
		const providerId: string | null =
			homeDraft.providerId ??
			providerModelSelection?.activeModel.providerId ??
			null;
		const modelId: string | null =
			homeDraft.modelId ??
			providerModelSelection?.activeModel.modelId ??
			null;
		const skillRefs: string[] = extractEnabledSkillRefs(message, skills);
		let sessionCreated: boolean = false;
		let enteredSession: boolean = false;
		let createdRuntimeWorkspace: WorkspaceConfig | null = null;
		replaceComposerInput("", "home");

		try {
			setIsHomeSubmitting(true);
			setSessionError(null);
			setActiveRetryRequestId(null);
			activeChatRequestIdRef.current = requestId;

			let created = await createSession({
				title: "New session",
				temporary: homeDraft.executionEnvironment === "worktree",
				workspaceId: homeDraft.workspaceId,
				provider: providerId ?? undefined,
				model: modelId ?? undefined,
				reasoningEffort: homeDraft.reasoningEffort,
				chatMode,
				approvalMode,
				workspaceLaunch: homeDraft.workspaceLaunch,
			});
			sessionCreated = true;
			const activeSessionId: string = created.id;
			materializeTemporarySessionLayout(activeSessionId);
			activeSessionIdRef.current = activeSessionId;
			if (homeDraft.executionEnvironment === "worktree") {
				if (homeDraft.workspaceId === null) {
					throw new Error(getWorktreeUnavailableMessage());
				}
				setIsWorktreePreparing(true);
				const worktreeResult = await createSessionWorktree(
					created.id,
					homeDraft.workspaceId,
					homeDraft.worktreeSources,
				);
				if (worktreeResult.workbench === null) {
					throw new Error(
						"Worktree session did not return a workbench.",
					);
				}
				created = {
					...worktreeResult.metadata,
					workbench: worktreeResult.workbench,
				};
				createdRuntimeWorkspace = worktreeResult.workspace;
				if (
					(worktreeResult.metadata.worktree?.status ?? "ready") !==
					"ready"
				) {
					setIsNewSessionHome(false);
					enteredSession = true;
					setActiveSessionId(activeSessionId);
					setActiveSessionMetadata(created);
					setActiveWorkspace(worktreeResult.workspace);
					setWorkbench(created.workbench);
					replaceComposerInput(message, activeSessionId);
					setSessionError(
						worktreeResult.metadata.worktree?.status ===
							"setup-failed"
							? "Worktree setup failed. Retry, skip, or delete the worktree before sending."
							: "Review and trust the selected development environment before setup can continue.",
					);
					return;
				}
			}

			setIsNewSessionHome(false);
			enteredSession = true;
			setActiveSessionId(activeSessionId);
			setActiveSessionMetadata(created);
			recordOpenedSession(activeSessionId);
			setActiveWorkspace(
				createdRuntimeWorkspace ??
					createWorkspaceFromSessionMetadata(
						created,
						created.workbench,
					),
			);
			timelineStore.reset();
			setWorkbench(created.workbench);
			setWorkflowTodoSnapshot(null);
			rememberLoadedWorkflowTodo(null);
			setHomeDraft(
				createPreferredHomeDraft(
					clientPreferences,
					providerModelSelection,
				),
			);
			if (cancelledChatRequestIdsRef.current.has(requestId)) {
				replaceComposerInput(message, activeSessionId);
				return;
			}
			applyOptimisticSend(
				requestId,
				message,
				created.workbench.composer.additionalContext,
			);

			const createdChatMode: ChatMode =
				created.workbench.composer.chatMode ?? chatMode;
			await sendChatMessage({
				requestId,
				message,
				mode: createdChatMode,
				provider: providerId ?? undefined,
				model: modelId ?? undefined,
				reasoningEffort:
					created.workbench.composer.reasoningEffort ?? undefined,
				executionPolicy: "auto",
				outputTarget: getChatOutputTarget(
					createdChatMode,
					created.workspaceId ?? homeDraft.workspaceId,
				),
				additionalContext: created.workbench.composer.additionalContext,
				skillRefs,
			});
			if (createdChatMode !== "goal") {
				await refreshLatestTimeline(activeSessionId);
			}
		} catch (error: unknown) {
			if (cancelledChatRequestIdsRef.current.has(requestId)) {
				finishOptimisticActiveRun(requestId);
				setSessionError(null);
				return;
			}
			const errorMessage: string =
				error instanceof Error
					? error.message
					: "Failed to start new session";

			if (enteredSession && activeSessionIdRef.current !== null) {
				replaceComposerInput(message, activeSessionIdRef.current);
			} else {
				setIsNewSessionHome(true);
				replaceComposerInput(message, "home");
			}
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
								activeRun:
									currentWorkbench.activeRun.requestId ===
									requestId
										? { status: "idle" }
										: currentWorkbench.activeRun,
							};
				},
			);
			setSessionError(errorMessage);
			if (sessionCreated && !isBackendRpcErrorMessage(errorMessage)) {
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
			console.error("[App] start new session failed", error);
		} finally {
			setIsWorktreePreparing(false);
			homeSubmissionPendingRef.current = false;
			cancelledChatRequestIdsRef.current.delete(requestId);
			if (activeChatRequestIdRef.current === requestId) {
				activeChatRequestIdRef.current = null;
			}
			setIsHomeSubmitting(false);
		}
	}

	return { handleHomeComposerSubmit };
}

export default useHomeComposerController;

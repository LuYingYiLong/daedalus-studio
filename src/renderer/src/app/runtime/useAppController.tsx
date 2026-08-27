import { useCallback, useRef, useState } from "react";
import { Input, message as antdMessage, Spin } from "antd";
import { useTranslation } from "react-i18next";
import useAppRuntimeEventController from "./hooks/useAppRuntimeEventController";
import useSessionNavigationController from "./hooks/useSessionNavigationController";
import useComposerInteractionController from "./hooks/useComposerInteractionController";
import useComposerTimelineRuntimeController from "./hooks/useComposerTimelineRuntimeController";
import useHomeWorkspaceResourcesController from "./hooks/useHomeWorkspaceResourcesController";
import useAppPreferencesController from "./hooks/useAppPreferencesController";
import useSessionActivationController from "./hooks/useSessionActivationController";
import useTemporarySessionController from "./hooks/useTemporarySessionController";
import useSessionForkController from "./hooks/useSessionForkController";
import useSessionWorktreeController from "./hooks/useSessionWorktreeController";
import useSessionLifecycleController from "./hooks/useSessionLifecycleController";
import useWorkspaceMutationController from "./hooks/useWorkspaceMutationController";
import useSessionPreferenceController from "./hooks/useSessionPreferenceController";
import useTimelineRefreshController from "./hooks/useTimelineRefreshController";
import useWorkflowTodoPresentationController from "./hooks/useWorkflowTodoPresentationController";
import useComposerViewModel from "./hooks/useComposerViewModel";
import useAppRuntimeNotificationEffects from "./hooks/useAppRuntimeNotificationEffects";
import useHomeWorkspaceNavigationController from "./hooks/useHomeWorkspaceNavigationController";
import useSessionHomeNavigationController, {
	type NewSessionLifecycleOptions,
} from "./hooks/useSessionHomeNavigationController";
import useSessionPresentationResetController from "./hooks/useSessionPresentationResetController";
import useTraySessionIntegration from "./hooks/useTraySessionIntegration";
import useAppSessionBackendEffects from "./hooks/useAppSessionBackendEffects";
import useSessionLayoutController from "./hooks/useSessionLayoutController";
import useWorkbenchNavigationPersistenceController from "./hooks/useWorkbenchNavigationPersistenceController";
import useFullTrustConfirmationController from "./hooks/useFullTrustConfirmationController";
import useAppSessionStateController from "./hooks/useAppSessionStateController";
import { createHomePageViewModelFromRuntime } from "./home-page-view-model";
import {
	createHomePageActions,
	createHomePageDirectActionHandlers,
} from "./home-page-actions";
import useWorkspaceContextController from "@/features/workspace/controllers/useWorkspaceContextController";
import useApprovalController from "@/features/approval/controllers/useApprovalController";
import usePlanGoalController from "@/features/composer/controllers/usePlanGoalController";
import useTimelineController from "@/features/conversation/controllers/useTimelineController";
import type {
	SessionMetadata,
	WorkflowTodoSnapshot,
} from "@/platform/rpc/types";
import {
	dismissWorkflowTodo,
} from "@/platform/rpc/session-api";
import {
	applyBackendEventToTimeline,
} from "@/domain/workbench/workbench-state";
import { createIdleRunState, type RunControllerState } from "@/domain/workbench/run-state";
import {
	type SessionLayoutPreferences,
} from "@/domain/session/session-layout";
import type { RunningSessionState } from "@/domain/workspace/session-running";
import {
	type AppProps,
	CONTEXT_SUBTITLE_MAX_CHARS,
	DEFAULT_SESSION_LAYOUT,
	FULL_TRUST_CONFIRMATION_TEXT,
	MAX_IMAGE_ATTACHMENT_BYTES,
	RECENT_CONTEXT_FILE_WINDOW_MS,
	SUPPORTED_IMAGE_MIME_TYPES,
	createChatRequestId,
	createContextFileSignature,
	createContextId,
	createFrontendFailedRunEvent,
	createHomeDraft,
	createWorkspacePathContextItem,
	createExternalFileContextItem,
	findProviderModel,
	getChatOutputTarget,
	getContextTitle,
	getCurrentWorkspaceId,
	getFileNameFromLocalPath,
	getLocalPathForFile,
	getRecentSessions,
	getSessionSortTime,
	getWorkflowTodoSnapshotIdentity,
	isBackendRpcErrorMessage,
	isLocalPathInsideWorkspace,
	isSupportedImageMimeType,
	normalizeLocalPathForCompare,
	readFileAsDataUrl,
	readImageDimensions,
} from "./app-helpers";
import {
	DEFAULT_WORKSPACE_LAUNCH_TARGET_ID,
} from "@/domain/workspace/workspace-launch";

export default function useAppController({ bootstrapData }: AppProps) {
	const { t } = useTranslation();
	const {
		workspaceRefreshToken,
		setWorkspaceRefreshToken,
		isNewSessionHome,
		setIsNewSessionHome,
		homeComposerMessage,
		setHomeComposerMessage,
		homeComposerMessageRef,
		homeDraft,
		setHomeDraft,
		homeDraftRef,
		homeWorkspaceOptions,
		setHomeWorkspaceOptions,
		isWorkspaceProjectDialogOpen,
		setIsWorkspaceProjectDialogOpen,
		isWorkspaceSessionCreating,
		setIsWorkspaceSessionCreating,
		setPendingTextAttachmentCount,
		isAddingTextAttachment,
		isHomeSubmitting,
		setIsHomeSubmitting,
		isWorktreePreparing,
		setIsWorktreePreparing,
		activeSessionId,
		setActiveSessionId,
		firstTurnModelTransition,
		setFirstTurnModelTransition,
		sessionLayouts,
		setSessionLayouts,
		temporarySessionLayout,
		setTemporarySessionLayout,
		activeSessionIdRef,
		temporaryDraftSessionIdRef,
		temporarySessionCreationRef,
		activeSessionMetadata,
		setActiveSessionMetadata,
		recentSessions,
		setRecentSessions,
		recentSessionsRef,
		activeWorkspace,
		setActiveWorkspace,
		timelineStore,
		timelineBlockCount,
		selectionAskThreads,
		setSelectionAskThreads,
		workbench,
		setWorkbench,
		activeWorkbenchRef,
		sessionError,
		setSessionError,
	} = useAppSessionStateController({ bootstrapData });
	const {
		workflowTodoSnapshot,
		setWorkflowTodoSnapshot,
		rememberLoadedWorkflowTodo,
		clearWorkflowTodoUiState,
		expandWorkflowTodoPanel,
		showWorkflowTodo,
		applyInitialWorkflowTodoPreference,
	} = useWorkflowTodoPresentationController({
		activeSessionMetadata,
		setActiveSessionMetadata,
	});
	const timelineController = useTimelineController({
		activeSessionId,
		activeSessionIdRef,
		timelineStore,
		timelineBlockCount,
		setSessionError,
	});
	const {
		timelineNavigationEntries,
		isTimelineLoadingBefore,
		isTimelineLoadingAfter,
		handleLoadMoreBefore,
		handleLoadMoreAfter,
		handleTimelineSearchLoadOffset,
		handleTimelineNavigationLoadEntry,
		refreshTimelineNavigationEntries,
		resetTimelineUiState,
	} = timelineController;
	const [isSessionLoading, setIsSessionLoading] = useState(false);
	const {
		providerModelSelection,
		slashCommands,
		skills,
		loadSlashCommands,
		loadSkills,
		handleCompletionOpen,
		clientPreferences,
		setClientPreferences,
		clientPreferencesRef,
		generalSettings,
	} = useAppPreferencesController({
		bootstrapData,
		activeSessionId,
		workspaceId: (activeWorkspace ?? homeDraft.workspace)?.id ?? null,
	});
	const [messageApi, messageContextHolder] = antdMessage.useMessage();
	const fullTrustOpenRef = useRef<() => void>(() => undefined);
	const [activeRetryRequestId, setActiveRetryRequestId] = useState<
		string | null
	>(null);
	const [forkingSourceSessionId, setForkingSourceSessionId] = useState<
		string | null
	>(null);
	const [forkingRequestId, setForkingRequestId] = useState<string | null>(
		null,
	);
	const forkOperationRef = useRef<boolean>(false);
	const dismissedTerminalGoalIdsRef = useRef<Set<string>>(new Set());
	const [runState, setRunState] = useState<RunControllerState>(() =>
		createIdleRunState(),
	);
	const [runningSessionState, setRunningSessionState] =
		useState<RunningSessionState>(() => new Map());
	const [unreadSessionIds, setUnreadSessionIds] = useState<
		ReadonlySet<string>
	>(() => new Set<string>());
	const windowFocusedRef = useRef<boolean>(document.hasFocus());
	const navigationVersionRef = useRef<number>(0);
	const activeChatRequestIdRef = useRef<string | null>(null);
	const cancelledChatRequestIdsRef = useRef<Set<string>>(new Set());
	const homeSubmissionPendingRef = useRef<boolean>(false);
	const composerDraftsRef = useRef<Map<string, string>>(new Map());
	const [composerInputReset, setComposerInputReset] = useState<{
		scopeId: string;
		revision: number;
	}>({
		scopeId: "home",
		revision: 0,
	});
	const {
		loadHomeWorkspaces,
		worktreeDisabledReason,
	} = useHomeWorkspaceResourcesController({
		isNewSessionHome,
		activeSessionId,
		workspaceId: homeDraft.workspaceId,
		workspace: homeDraft.workspace,
		workspaceRefreshToken,
		setHomeWorkspaceOptions,
	});
	const pendingUserActionRequestIdsRef = useRef<Set<string>>(new Set());
	const activeSessionTitleRef = useRef<string>("Daedalus session");
	const activeSessionLayout: SessionLayoutPreferences =
		activeSessionId === null
			? temporarySessionLayout
			: (sessionLayouts[activeSessionId] ?? DEFAULT_SESSION_LAYOUT);
	const {
		applyWorkbench,
		takePendingWorkbenchPatch,
		sendWorkbenchPatch,
		queueWorkbenchPatch,
		replaceComposerInput,
		handleComposerDraftChange,
		applyOptimisticActiveRun,
		appendOptimisticUserBlock,
		applyOptimisticSend,
		appendQueuedRunUserBlock,
		finishOptimisticActiveRun,
		applyOptimisticRetry,
	} = useComposerTimelineRuntimeController({
		activeSessionIdRef,
		composerDraftsRef,
		isNewSessionHome,
		runState,
		timelineStore,
		setComposerInputReset,
		setFirstTurnModelTransition,
		setHomeComposerMessage,
		setRunningSessionState,
		setRunState,
		setWorkbench,
		clearWorkflowTodoUiState,
	});
	const { persistPendingWorkbenchPatchBeforeNavigation } =
		useWorkbenchNavigationPersistenceController({
			takePendingWorkbenchPatch,
			sendWorkbenchPatch,
		});
	const planGoalController = usePlanGoalController({
		activeSessionId,
		activeChatRequestIdRef,
		dismissedTerminalGoalIdsRef,
		setSessionError,
		setWorkbench,
		setActiveSessionMetadata,
		applyOptimisticActiveRun,
		applyOptimisticSend,
		finishOptimisticActiveRun,
		showWorkflowTodo,
		dismissWorkflowTodoForGoal: async (): Promise<void> => {
			const snapshot: WorkflowTodoSnapshot | null = workflowTodoSnapshot;
			if (snapshot === null) return;
			const dismissParams: { workflowId?: string; runId?: string } = {};
			if (snapshot.workflowId !== undefined)
				dismissParams.workflowId = snapshot.workflowId;
			if (snapshot.runId !== undefined)
				dismissParams.runId = snapshot.runId;
			await dismissWorkflowTodo(dismissParams);
			setWorkflowTodoSnapshot(null);
		},
	});
	const {
		currentGoal,
		setCurrentGoal,
		applyCurrentGoalSnapshot,
		latestPlanClarification,
		setLatestPlanClarification,
		suppressedPlanClarificationKey,
		setSuppressedPlanClarificationKey,
		isPlanClarificationSubmitting,
		setIsPlanClarificationSubmitting,
		planClarificationError,
		setPlanClarificationError,
		latestPlanApproval,
		setLatestPlanApproval,
		isPlanApproving,
		setIsPlanApproving,
		isPlanRevising,
		setIsPlanRevising,
		planApprovalError,
		setPlanApprovalError,
		pendingPlanClarification,
		pendingPlanApproval,
		latestPlanClarificationKey,
		latestPlanApprovalKey,
		resetPlanClarificationUiState,
		resetPlanApprovalUiState,
		resetPlanGoalUiState,
		handlePlanClarificationSubmit,
		handlePlanApprove,
		handlePlanRevise,
		handleTerminalGoalDismiss,
	} = planGoalController;
	const { resetSessionPresentationState } =
		useSessionPresentationResetController({
			timelineStore,
			resetTimelineUiState,
			clearWorkflowTodoUiState,
			resetPlanGoalUiState,
			setWorkbench,
			setActiveRetryRequestId,
			setRunState,
		});
	const {
		refreshLatestTimeline,
		handleWorkflowTodoDismiss,
	} = useTimelineRefreshController({
		activeSessionId,
		activeSessionIdRef,
		activeChatRequestIdRef,
		activeSessionMetadata,
		runState,
		timelineStore,
		refreshTimelineNavigationEntries,
		rememberLoadedWorkflowTodo,
		expandWorkflowTodoPanel,
		setLatestPlanClarification,
		setLatestPlanApproval,
		setWorkflowTodoSnapshot,
		setActiveSessionMetadata,
		setActiveWorkspace,
		setSessionError,
	});
	const {
		persistSessionUiMetadata,
		handleWorkspaceLaunchChange,
		handleModeChange,
		handleProviderModelChange,
		handleReasoningEffortChange,
		persistNewSessionComposerDefaults,
	} = useSessionPreferenceController({
		activeSessionId,
		activeSessionIdRef,
		isNewSessionHome,
		isHomeSubmitting,
		homeDraft,
		workbench,
		runState,
		activeSessionMetadata,
		providerModelSelection,
		clientPreferencesRef,
		setClientPreferences,
		setHomeDraft,
		setWorkbench,
		setActiveSessionMetadata,
		setSessionError,
		queueWorkbenchPatch,
		applyWorkbench,
		onInfo: (message: string): void => {
			void messageApi.info(message);
		},
	});
	const approvalController = useApprovalController({
		initialMode:
			bootstrapData.clientPreferences.newSessionComposer.approvalMode,
		activeSessionId,
		pendingToolBudgetId: workbench?.pendingToolBudget?.budgetId,
		activeSessionIdRef,
		persistSessionUiMetadata,
		persistNewSessionComposerDefaults,
		refreshLatestTimeline,
		setSessionError,
		onFullTrustRequested: (): void => {
			fullTrustOpenRef.current();
		},
	});
	const {
		approvalMode,
		setApprovalModeState,
		isApprovalModeSaving,
		pendingApproval,
		setPendingApproval,
		approvalError,
		clearApprovalError,
		isApproving,
		isApprovalAutoSafeEnabling,
		isRejecting,
		isToolBudgetContinuing,
		isToolBudgetStopping,
		toolBudgetError,
		refreshPendingApproval,
		saveApprovalMode,
		handleApprovalModeChange,
		handleApprovalApprove,
		handleApprovalApproveAndEnableAutoSafe,
		handleApprovalReject,
		handleToolBudgetContinue,
		handleToolBudgetStop,
	} = approvalController;
	const fullTrustController = useFullTrustConfirmationController({
		confirmationToken: FULL_TRUST_CONFIRMATION_TEXT,
		isSaving: isApprovalModeSaving,
		saveApprovalMode,
		onInvalidConfirmation: (confirmationToken: string): void => {
			void messageApi.error(
				t("app.fullTrust.errors.confirmation", { confirmationText: confirmationToken }),
			);
		},
	});
	fullTrustOpenRef.current = fullTrustController.open;

	const {
		handleWorkspaceSidebarChange,
		handleSessionLayoutChange,
		materializeTemporarySessionLayout,
		removeStoredSessionLayouts,
		deleteSessionWithLayout,
	} = useSessionLayoutController({
		activeSessionId,
		clientPreferencesRef,
		composerDraftsRef,
		setClientPreferences,
		setSessionLayouts,
		activeSessionLayout,
		setTemporarySessionLayout,
		setRunningSessionState,
		setUnreadSessionIds,
	});
	const {
		createTemporarySession,
		restoreMaterializedHomeDraftSession,
		discardTemporarySessionIfEmpty,
		beginLocalNewSessionDraft,
	} = useTemporarySessionController({
		activeSessionId,
		activeSessionMetadata,
		activeSessionIdRef,
		homeComposerMessageRef,
		homeDraftRef,
		clientPreferencesRef,
		providerModelSelection,
		workbench,
		composerDraftsRef,
		temporaryDraftSessionIdRef,
		temporarySessionCreationRef,
		navigationVersionRef,
		timelineStore,
		deleteSessionWithLayout,
		materializeTemporarySessionLayout,
		setActiveSessionId,
		setActiveSessionMetadata,
		setSelectionAskThreads,
		setHomeDraft,
		setActiveWorkspace,
		setWorkbench,
		setApprovalModeState,
		setIsNewSessionHome,
		setIsSessionLoading,
		setSessionError,
		setFirstTurnModelTransition,
		resetSessionPresentationState,
		replaceComposerInput,
	});

	const {
		handleNewWorkspaceSession,
		handleHomeWorkspaceSelect,
		handleHomeWorkspaceClear,
		handleHomeWorkspaceAdd,
		resetToNewSessionHome,
	} = useHomeWorkspaceNavigationController({
		activeSessionId,
		activeSessionMetadata,
		activeSessionIdRef,
		temporaryDraftSessionIdRef,
		navigationVersionRef,
		homeWorkspaceOptions,
		setHomeWorkspaceOptions,
		setHomeDraft,
		setActiveWorkspace,
		setActiveSessionMetadata,
		setSessionError,
		setIsWorkspaceProjectDialogOpen,
		setIsWorkspaceSessionCreating,
		beginLocalNewSessionDraft,
		deleteSessionWithLayout,
		takePendingWorkbenchPatch,
		onError: showTransientError,
	});

	const handleSessionsChange = useCallback(
		(sessions: SessionMetadata[]): void => {
			setRecentSessions(getRecentSessions(sessions));
		},
		[],
	);

	const handleNewSession = async (
		options: NewSessionLifecycleOptions = {},
	): Promise<void> => {
		await handleNewSessionFromController(options);
	};

	const {
		handleSessionWorktreeDelete,
		handleSessionWorkspaceMove,
		handleSessionWorktreeHandoff,
		handleSessionWorktreeSetup,
	} = useSessionWorktreeController({
		activeSessionIdRef,
		activeSessionMetadata,
		sessionLayouts,
		setSessionLayouts,
		setActiveSessionMetadata,
		setActiveWorkspace,
		setWorkbench,
		setWorkspaceRefreshToken,
		setSessionError,
		onError: (message: string): void => {
			void messageApi.error(message);
		},
		onWarning: (message: string): void => {
			void messageApi.warning(message);
		},
	});

	const {
		findWorkspaceForSession,
		handleSessionArchive,
		handleSessionRename,
		checkActiveSessionIntegrity,
	} = useSessionLifecycleController({
		activeSessionId,
		activeSessionIdRef,
		activeWorkspace,
		activeSessionMetadata,
		homeWorkspaceOptions,
		handleNewSession,
		setRunningSessionState,
		setUnreadSessionIds,
		setActiveSessionMetadata,
		setSessionError,
	});

	const {
		handleWorkspaceDelete,
		handleWorkspaceUpdate,
		handleWorkspaceProjectCreated,
		handleWorkspaceTreeProjectCreated,
	} = useWorkspaceMutationController({
		activeSessionId,
		activeSessionMetadata,
		composerDraftsRef,
		removeStoredSessionLayouts,
		resetToNewSessionHome,
		handleHomeWorkspaceSelect,
		handleNewWorkspaceSession,
		isNewSessionHome,
		setUnreadSessionIds,
		setHomeWorkspaceOptions,
		setHomeDraft,
		setActiveWorkspace,
		setActiveSessionMetadata,
		setWorkspaceRefreshToken,
		setIsWorkspaceProjectDialogOpen,
		showTransientError,
	});

	const { handleSessionFork } = useSessionForkController({
		forkOperationRef,
		navigationVersionRef,
		activeSessionIdRef,
		timelineStore,
		discardTemporarySessionIfEmpty,
		persistPendingWorkbenchPatchBeforeNavigation,
		resetSessionPresentationState,
		rememberLoadedWorkflowTodo,
		checkActiveSessionIntegrity,
		setForkingSourceSessionId,
		setForkingRequestId,
		setIsNewSessionHome,
		setActiveSessionId,
		setActiveSessionMetadata,
		setSelectionAskThreads,
		setWorkbench,
		setLatestPlanClarification,
		setLatestPlanApproval,
		setRunState,
		setRunningSessionState,
		setCurrentGoal,
		setWorkflowTodoSnapshot,
		setApprovalModeState,
		setActiveWorkspace,
		setSessionError,
		setWorkspaceRefreshToken,
		onError: (message: string): void => {
			void messageApi.error(message);
		},
	});

	const { handleSessionSelect } = useSessionActivationController({
		activeSessionIdRef,
		navigationVersionRef,
		dismissedTerminalGoalIdsRef,
		homeWorkspaceOptions,
		timelineStore,
		discardTemporarySessionIfEmpty,
		persistPendingWorkbenchPatchBeforeNavigation,
		resetSessionPresentationState,
		rememberLoadedWorkflowTodo,
		expandWorkflowTodoPanel,
		checkActiveSessionIntegrity,
		setIsSessionLoading,
		setSessionError,
		setIsNewSessionHome,
		setActiveSessionId,
		setActiveSessionMetadata,
		setSelectionAskThreads,
		setActiveWorkspace,
		setLatestPlanClarification,
		setLatestPlanApproval,
		setWorkbench,
		setRunState,
		setRunningSessionState,
		setCurrentGoal,
		setApprovalModeState,
		setWorkflowTodoSnapshot,
	});
	useAppSessionBackendEffects({
		activeSessionId,
		activeSessionMetadata,
		activeSessionIdRef,
		isNewSessionHome,
		workbench,
		takePendingWorkbenchPatch,
		restoreMaterializedHomeDraftSession,
		handleSessionSelect,
		setPendingApproval,
		clearApprovalError,
		refreshPendingApproval,
	});

	const { openForkSource } = useSessionNavigationController({
		activeSessionIdRef,
		setRecentSessions,
		onSessionSelect: handleSessionSelect,
		showTransientError,
		onInfo: (message: string): void => {
			void messageApi.info(message);
		},
		onError: (message: string): void => {
			void messageApi.error(message);
		},
	});

	function showTransientError(errorMessage: string): void {
		void messageApi.error(errorMessage);
	}

	const {
		handleNewSession: handleNewSessionFromController,
	} = useSessionHomeNavigationController({
		activeSessionId,
		activeSessionMetadata,
		temporaryDraftSessionIdRef,
		composerDraftsRef,
		setHomeComposerMessage,
		setIsNewSessionHome,
		onSessionSelect: handleSessionSelect,
		onHomeWorkspaceSelect: handleHomeWorkspaceSelect,
		beginLocalNewSessionDraft,
		deleteSessionWithLayout,
		persistPendingWorkbenchPatchBeforeNavigation,
		loadHomeWorkspaces,
	});
	useTraySessionIntegration({
		recentSessions,
		recentSessionsRef,
		handleNewSession,
		handleSessionSelect,
		setRecentSessions,
		showTransientError,
	});

	const {
		handleQueueMessageSubmit,
		handleGuideSubmit,
		handleQueueMessageRemove,
		handleQueueMessageEdit,
		handleQueueMessageReorder,
		handleGuideDelete,
		handleGuideReorder,
		handleRetryFromUserMessage,
		handleInterruptedRunRetry,
		handleComposerCancel,
		submitComposerMessage,
		handleHomeComposerSubmit,
		prepareFirstTurnWorktree,
		handleComposerSubmit,
	} = useComposerInteractionController({
		state: {
			activeSessionId,
			isNewSessionHome,
			homeDraft,
			clientPreferences,
			providerModelSelection,
			approvalMode,
			skills,
			activeWorkspace,
			workbench,
			runState,
			isSessionLoading,
		},
		refs: {
			activeSessionIdRef,
			activeChatRequestIdRef,
			cancelledChatRequestIdsRef,
			homeSubmissionPendingRef,
			temporaryDraftSessionIdRef,
		},
		setters: {
			setHomeDraft,
			setIsHomeSubmitting,
			setIsWorktreePreparing,
			setIsNewSessionHome,
			setActiveSessionId,
			setActiveSessionMetadata,
			setActiveWorkspace,
			setWorkbench,
			setWorkflowTodoSnapshot,
			setSessionError,
			setActiveRetryRequestId,
			setRunState,
			setRunningSessionState,
			setFirstTurnModelTransition,
		},
		runtime: {
			getWorktreeUnavailableMessage: (): string =>
				t("composer.worktree.unavailable"),
			materializeTemporarySessionLayout,
			persistNewSessionComposerDefaults,
			persistSessionUiMetadata,
			applyWorkbench,
			takePendingWorkbenchPatch,
			sendWorkbenchPatch,
			replaceComposerInput,
			applyOptimisticSend,
			finishOptimisticActiveRun,
			refreshLatestTimeline,
			applyOptimisticRetry,
			resetPlanClarificationUiState,
			resetPlanApprovalUiState,
			rememberLoadedWorkflowTodo,
			showTransientError,
			onInfo: (message: string): void => {
				void messageApi.info(message);
			},
			timelineStore,
		},
	});
	const {
		patchContext,
		handleAddImageFiles,
		handleAddPastedTextAttachment,
		handleAddWorkspaceContext,
		handleAddContextFiles,
	} = useWorkspaceContextController({
		ensureActiveSessionId: async (): Promise<string | null> => {
			if (activeSessionIdRef.current !== null) {
				return activeSessionIdRef.current;
			}
			if (!isNewSessionHome) {
				return null;
			}
			await createTemporarySession(homeDraft.workspace);
			return activeSessionIdRef.current;
		},
		activeWorkspace,
		activeSessionMetadata,
		queueWorkbenchPatch,
		setPendingTextAttachmentCount,
		showTransientError,
	});
	const {
		selectedProviderId,
		selectedModelId,
		pendingToolBudget,
		chatTitle,
		composerMessage,
		composerInstanceKey,
		composerMode,
		composerReasoningEffort,
		composerContextItems,
		composerMessageQueue,
		composerPendingGuides,
		currentSessionWorkspaceId,
		composerWorkspaceLocked,
		displayedWorkspace,
		godotLaunchExecutablePath,
		composerIsSending,
		composerIsCancelling,
		appUpdateRuntimeBusy,
		nextStepSuggestion,
		runningSessionIds,
	} = useComposerViewModel({
		isNewSessionHome,
		activeSessionId,
		homeDraft,
		workbench,
		activeWorkspace,
		activeSessionMetadata,
		providerModelSelection,
		firstTurnModelTransition,
		composerInputReset,
		composerDraftsRef,
		homeComposerMessage,
		isWorkspaceSessionCreating,
		generalSettings,
		runState,
		isHomeSubmitting,
		runningSessionState,
	});

	useAppRuntimeEventController({
		state: {
			activeSessionId,
			isNewSessionHome,
			providerModelSelection,
			clientPreferences,
			workbench,
			runState,
			chatTitle,
			appUpdateRuntimeBusy,
		},
		refs: {
			activeSessionIdRef,
			activeChatRequestIdRef,
			cancelledChatRequestIdsRef,
			pendingUserActionRequestIdsRef,
			activeSessionTitleRef,
			activeWorkbenchRef,
			windowFocusedRef,
			clientPreferencesRef,
		},
		setters: {
			setRunState,
			setIsHomeSubmitting,
			setHomeDraft,
			setUnreadSessionIds,
			setRunningSessionState,
			setClientPreferences,
			setActiveSessionMetadata,
			setWorkflowTodoSnapshot,
			setCurrentGoalSnapshot: applyCurrentGoalSnapshot,
			setLatestPlanClarification,
			setLatestPlanApproval,
			setPlanClarificationError,
			setIsPlanClarificationSubmitting,
			setPlanApprovalError,
			setIsPlanApproving,
			setIsPlanRevising,
		},
		timeline: {
			timelineStore,
			applyWorkbench,
			appendQueuedRunUserBlock,
			loadSkills,
			clearWorkflowTodoUiState,
			rememberLoadedWorkflowTodo,
			applyInitialWorkflowTodoPreference,
			showWorkflowTodo,
			expandWorkflowTodoPanel,
			refreshLatestTimeline,
		},
		interaction: {
			handleInterruptedRunRetry,
			handleNewSession,
			runCompletionNotificationsEnabled:
				clientPreferences.notifyOnRunCompleted,
			pendingApproval,
			pendingToolBudget,
			pendingPlanApproval,
			pendingPlanClarification,
		},
		notificationCopy: {
			approvalTitle: t("nativeNotifications.approvalTitle"),
			toolApprovalBody: t("nativeNotifications.toolApprovalBody"),
			toolBudgetBody: t("nativeNotifications.toolBudgetBody"),
			planApprovalBody: t("nativeNotifications.planApprovalBody"),
			clarificationTitle: t("nativeNotifications.clarificationTitle"),
			clarificationBody: t("nativeNotifications.clarificationBody"),
		},
	});

	const homePageProps = createHomePageViewModelFromRuntime({
		layout: {
			workspaceRefreshToken,
			isNewSessionHome,
			activeSessionId,
			clientPreferences,
			onWorkspaceSidebarChange: handleWorkspaceSidebarChange,
			activeSessionLayout,
			onSessionLayoutChange: handleSessionLayoutChange,
			activeSessionMetadata,
			homeWorkspaceId: homeDraft.workspaceId,
			currentSessionWorkspaceId,
			chatTitle,
			timelineStore,
			timelineNavigationEntries,
			isSessionLoading,
			sessionError,
			isLoadingMoreBefore: isTimelineLoadingBefore,
			isLoadingMoreAfter: isTimelineLoadingAfter,
			isSending: composerIsSending,
			activeRetryRequestId,
		},
		composer: {
			providerModelSelection,
			selectedProviderId,
			selectedModelId,
			reasoningEffort: composerReasoningEffort,
			composerInstanceKey,
			message: composerMessage,
			nextStepSuggestion,
			onDraftChange: handleComposerDraftChange,
			contextItems: composerContextItems,
			selectionAskThreads,
			messageQueue: composerMessageQueue,
			pendingGuides: composerPendingGuides,
			workflowTodoSnapshot,
			currentGoal,
			activeSessionMetadata,
			mode: composerMode,
			approvalMode,
			pendingApproval,
			isApproving,
			isApprovalAutoSafeEnabling,
			isRejecting,
			approvalError,
			pendingToolBudget,
			isToolBudgetContinuing,
			isToolBudgetStopping,
			toolBudgetError,
			pendingPlanClarification,
			isPlanClarificationSubmitting,
			planClarificationError,
			pendingPlanApproval,
			isPlanApproving,
			isPlanRevising,
			planApprovalError,
			slashCommands,
			skills,
			isSending: composerIsSending,
			isCancelling: composerIsCancelling,
			isAddingTextAttachment,
			isApprovalModeSaving,
			activeQueueItemId: workbench?.activeRun.queueItemId ?? null,
		},
		workspace: {
			workspaceOptions: homeWorkspaceOptions,
			initialWorkspaces: bootstrapData.workspaceList.workspaces,
			initialSessions: bootstrapData.sessionList.sessions,
			initialActiveWorkspaceId: bootstrapData.workspaceList.active,
			initialWorkspaceTreeOrder: bootstrapData.workspaceTreeOrder,
			runningSessionIds,
			unreadSessionIds,
			forkingSessionId: forkingSourceSessionId,
			forkingRequestId,
			isSending: composerIsSending,
			isSessionLoading,
			hasForkingSession: forkingSourceSessionId !== null,
			homeWorkspace: homeDraft.workspace,
			homeExecutionEnvironment: homeDraft.executionEnvironment,
			homeWorktreeSources: homeDraft.worktreeSources,
			worktreeDisabledReason,
			isWorktreePreparing,
			isHomeSubmitting,
			composerWorkspaceLocked,
			activeWorkspace: displayedWorkspace,
			godotLaunchExecutablePath,
			activeSessionId,
			activeSessionMetadata,
			homeWorkspaceLaunchPreference: homeDraft.workspaceLaunch,
			defaultWorkspaceLaunchPreference:
				DEFAULT_WORKSPACE_LAUNCH_TARGET_ID,
		},
		actions: createHomePageActions({
			activeSessionMetadata,
			worktreeDisabledReason,
			setWorkspaceRefreshToken,
			setHomeDraft,
			setActiveRetryRequestId,
			handlers: createHomePageDirectActionHandlers({
				navigation: {
					handleNewSession,
					handleNewWorkspaceSession,
					handleHomeWorkspaceSelect,
					handleHomeWorkspaceAdd,
					handleHomeWorkspaceClear,
					handleSessionSelect,
					handleSessionFork,
					onForkSourceOpen: openForkSource,
					handleSessionArchive,
					handleSessionRename,
					handleSessionWorkspaceMove,
					handleSessionWorktreeDelete,
					handleSessionWorktreeHandoff,
					handleSessionWorktreeSetup,
					handleSessionsChange,
					handleWorkspaceDelete,
					handleWorkspaceUpdate,
					handleWorkspaceProjectCreated: handleWorkspaceTreeProjectCreated,
				},
				timeline: {
					handleLoadMoreBefore,
					handleLoadMoreAfter,
					handleTimelineNavigationLoadEntry,
					handleTimelineSearchLoadOffset,
					handleRetryFromUserMessage,
					handlePlanClarificationSubmit,
					handlePlanApprove,
					handlePlanRevise,
					handleWorkflowTodoDismiss,
					applyCurrentGoalSnapshot,
					handleTerminalGoalDismiss,
					handleCompletionOpen,
				},
				settings: {
					handleModeChange,
					handleApprovalModeChange,
					handleApprovalApprove,
					handleApprovalApproveAndEnableAutoSafe,
					handleApprovalReject,
					handleToolBudgetContinue,
					handleToolBudgetStop,
					handleProviderModelChange,
					handleReasoningEffortChange,
					handleWorkspaceLaunchChange,
					handleAddPastedTextAttachment,
				},
			}),
			handleSessionFork,
			handleAddWorkspaceContext,
			handleAddImageFiles,
			handleAddContextFiles,
			patchContext,
			handleComposerCancel,
			handleComposerSubmit,
			handleGuideSubmit,
			handleQueueMessageRemove,
			handleQueueMessageEdit,
			handleQueueMessageReorder,
			handleGuideDelete,
			handleGuideReorder,
		}),
	});

	return {
		messageContextHolder,
		homePageProps,
		fullTrustOpen: fullTrustController.isOpen,
		fullTrustConfirmationText: fullTrustController.confirmationText,
		isApprovalModeSaving,
		fullTrustConfirmationToken: FULL_TRUST_CONFIRMATION_TEXT,
		fullTrustTitle: t("app.fullTrust.title"),
		fullTrustEnableLabel: t("app.fullTrust.actions.enable"),
		fullTrustCancelLabel: t("app.fullTrust.actions.cancel"),
		fullTrustDescription: t("app.fullTrust.description"),
		fullTrustConfirmationPrefix: t("app.fullTrust.confirmationPrefix"),
		fullTrustConfirmationSuffix: t("app.fullTrust.confirmationSuffix"),
		fullTrustConfirmationError: (confirmationText: string): void => {
			void messageApi.error(
				t("app.fullTrust.errors.confirmation", { confirmationText }),
			);
		},
		onFullTrustConfirm: (): void => {
			void fullTrustController.confirm();
		},
		onFullTrustCancel: fullTrustController.cancel,
		onFullTrustConfirmationTextChange: fullTrustController.setConfirmationText,
		workspaceProjectDialogOpen: isWorkspaceProjectDialogOpen,
		onWorkspaceProjectDialogCancel: (): void =>
			setIsWorkspaceProjectDialogOpen(false),
		onWorkspaceProjectSaved: handleWorkspaceProjectCreated,
	};
}

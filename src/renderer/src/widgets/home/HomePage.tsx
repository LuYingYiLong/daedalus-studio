import ComputerObservationBoundary from "@/widgets/computer-observation/ComputerObservationBoundary";
import { useExternalBrowserSession } from "@/features/external-browser/useExternalBrowserSession";
import {
	useCallback,
	useLayoutEffect,
	useMemo,
	useRef,
} from "react";
import { message as antdMessage } from "antd";
import { useTranslation } from "react-i18next";
import type {
	AdditionalContextItem,
	AgentGoalState,
	MessageQueueItem,
	PendingGuide,
	PendingToolBudget,
	PlanApprovalState,
	PlanClarificationState,
	SelectionAskThread,
	SessionMetadata,
	SessionTimelineNavigationEntry,
	WorkflowTodoSnapshot,
	WorkspaceConfig,
} from "@/platform/rpc/types";
import type { ChatMode } from "@/platform/rpc/chat-api";
import type {
	ApprovalMode,
	PendingApproval,
} from "@/platform/rpc/approval-api";
import type { SlashCommandDefinition } from "@/platform/rpc/command-api";
import type { ProviderModelSelection } from "@/platform/rpc/provider-api";
import type {
	DeleteWorkspaceResult,
	WorkspaceTreeOrderPreferences,
} from "@/platform/rpc/workspace-api";
import type { SkillSummary } from "@/platform/rpc/skill-api";
import type { WorkspaceSidebarPreferences } from "@/platform/rpc/client-preferences-api";
import type { KeyboardShortcutOverrides } from "@/platform/rpc/keyboard-shortcuts";
import {
	type SessionArchiveContext,
	type WorkspaceTreeProps,
} from "@/widgets/workspace/WorkspaceTree";
import type { ConversationTimelinePaneHandle } from "@/widgets/conversation/ConversationTimelinePane";
import type { ComposerCompletionTrigger } from "@/domain/composer/composer-completion";
import type { PastedTextAttachmentInput } from "@/features/conversation/pasted-text-attachment";
import type { RetryUserMessagePayload } from "@/widgets/conversation/UserBubble";
import styles from "./HomePage.module.css";
import HomeWorkspaceSidebar from "./workspace/HomeWorkspaceSidebar";
import HomePageShell from "./surface/HomePageShell";
import TimelineWorkflowTodoPanel from "./surface/TimelineWorkflowTodoPanel";
import type { SessionLayoutPreferences } from "@/domain/session/session-layout";
import SessionSummaryPopover from "./summary/SessionSummaryPopover";
import useHomePageDockController, {
	BOTTOM_DOCK_CLOSED_SIZE,
	BOTTOM_DOCK_MAX_SIZE,
	SIDE_DOCK_CLOSED_SIZE,
	SIDE_DOCK_MAX_SIZE,
} from "./dock/useHomePageDockController";
import useHomePageSummaryController, {
	SUMMARY_PREVIEW_LIMIT,
} from "./summary/useHomePageSummaryController";
import HomePageDialogs from "./summary/HomePageDialogs";
import { createHomeDockPanelConfigs } from "./dock/home-dock-panel-config";
import useHomeSurfaceController, {
	type NewSessionOptions,
} from "./surface/useHomeSurfaceController";
import useHomePageComposerController from "./surface/useHomePageComposerController";
import useIntegratedBrowserSession from "@/features/browser/useIntegratedBrowserSession";
import useHomePageLaunchController from "./surface/useHomePageLaunchController";
import useHomePageKeyboardShortcuts from "./surface/useHomePageKeyboardShortcuts";
import HomePageActionBar from "./surface/HomePageActionBar";
import HomePageWorkbench from "./surface/HomePageWorkbench";
import type { HomeChatSurfaceProps } from "./surface/HomeChatSurface";
import type { TimelinePageStore } from "@/domain/workbench/timeline-page-store";
import {
	type WorkspaceLaunchTargetId,
} from "@/domain/workspace/workspace-launch";

type HomePageProps = {
	workspaceRefreshToken: number;
	isHome: boolean;
	activeSessionId: string | null;
	workspaceSidebar: WorkspaceSidebarPreferences;
	keyboardShortcuts: KeyboardShortcutOverrides;
	onWorkspaceSidebarChange: (
		workspaceSidebar: WorkspaceSidebarPreferences,
		options?: { persist?: boolean },
	) => void;
	sessionLayout: SessionLayoutPreferences;
	onSessionLayoutChange: (
		layout: SessionLayoutPreferences,
		options?: { persist?: boolean },
	) => void;
	activeSessionMetadata: SessionMetadata | null;
	activeWorkspaceId: string | null;
	chatTitle: string;
	timelineStore: TimelinePageStore;
	timelineNavigationEntries: SessionTimelineNavigationEntry[];
	isSessionLoading: boolean;
	sessionError: string | null;
	isLoadingMoreBefore: boolean;
	isLoadingMoreAfter: boolean;
	retryDisabled: boolean;
	activeRetryRequestId: string | null;
	providerModelSelection: ProviderModelSelection | null;
	selectedProviderId: string | null;
	selectedModelId: string | null;
	reasoningEffort: string | null;
	composerInstanceKey: string;
	message: string;
	nextStepSuggestion: string | null;
	onDraftChange: (message: string) => void;
	contextItems: AdditionalContextItem[];
	selectionAskThreads: SelectionAskThread[];
	messageQueue: MessageQueueItem[];
	pendingGuides: PendingGuide[];
	workflowTodoSnapshot: WorkflowTodoSnapshot | null;
	currentGoal: AgentGoalState | null;
	workflowTodoCollapsed: boolean;
	mode: ChatMode;
	approvalMode: ApprovalMode;
	pendingApproval: PendingApproval | null;
	isApproving: boolean;
	isApprovalAutoSafeEnabling: boolean;
	isRejecting: boolean;
	approvalError: string | null;
	pendingToolBudget: PendingToolBudget | null;
	isToolBudgetContinuing: boolean;
	isToolBudgetStopping: boolean;
	toolBudgetError: string | null;
	pendingPlanClarification: PlanClarificationState | null;
	isPlanClarificationSubmitting: boolean;
	planClarificationError: string | null;
	pendingPlanApproval: PlanApprovalState | null;
	isPlanApproving: boolean;
	isPlanRevising: boolean;
	planApprovalError: string | null;
	slashCommands: SlashCommandDefinition[];
	skills: SkillSummary[];
	isSending: boolean;
	isCancelling: boolean;
	isAddingTextAttachment: boolean;
	isApprovalModeSaving: boolean;
	workspaceOptions: WorkspaceConfig[];
	initialWorkspaces: WorkspaceConfig[];
	initialSessions: SessionMetadata[];
	initialActiveWorkspaceId: string | null;
	initialWorkspaceTreeOrder: WorkspaceTreeOrderPreferences;
	runningSessionIds: readonly string[];
	unreadSessionIds: readonly string[];
	forkingSessionId: string | null;
	forkingRequestId: string | null;
	forkDisabled: boolean;
	homeWorkspace: WorkspaceConfig | null;
	homeExecutionEnvironment: "local" | "worktree";
	homeWorktreeSources: Record<
		string,
		{
			startingState?: import("@/platform/rpc/types").WorktreeStartingState;
			environmentId?: string | null;
			environmentFingerprint?: string | null;
		}
	>;
	worktreeDisabledReason: string | null;
	isWorktreePreparing: boolean;
	workspaceFooterDisabled: boolean;
	activeWorkspace: WorkspaceConfig | null;
	godotLaunchExecutablePath: string | null;
	workspaceLaunchPreference: WorkspaceLaunchTargetId;
	onNewSession: (options?: NewSessionOptions) => void;
	onNewUnboundSession: () => void;
	onNewWorkspaceSession: (
		workspace: WorkspaceConfig,
		environment?: "local" | "worktree",
	) => void;
	onWorkspaceRefresh: () => void;
	onHomeWorkspaceSelect: (workspaceId: string) => void;
	onHomeWorkspaceAdd: () => void;
	onHomeWorkspaceClear: () => void;
	onHomeExecutionEnvironmentChange: (
		environment: "local" | "worktree",
	) => void;
	onHomeWorktreeSourcesChange: (
		value: Record<
			string,
			{
				startingState?: import("@/platform/rpc/types").WorktreeStartingState;
				environmentId?: string | null;
				environmentFingerprint?: string | null;
			}
		>,
	) => void;
	onSessionSelect: (session: SessionMetadata) => void;
	onSessionFork: (session: SessionMetadata) => void;
	onForkFromUserMessage: (requestId: string) => Promise<void>;
	onForkSourceOpen: (sessionId: string) => Promise<void>;
	onSessionArchive: (
		session: SessionMetadata,
		context: SessionArchiveContext,
	) => void;
	onSessionRename: (session: SessionMetadata) => void;
	onSessionWorkspaceMove: (
		session: SessionMetadata,
		workspace: WorkspaceConfig,
	) => Promise<
		import("@/platform/rpc/session-api").MoveSessionWorkspaceResult
	>;
	onSessionWorktreeDelete: (
		session: SessionMetadata,
	) => Promise<SessionMetadata>;
	onSessionWorktreeHandoff: (target: "local" | "worktree") => Promise<void>;
	onSessionWorktreeSetup: (action: "retry" | "skip") => Promise<void>;
	onSessionsChange: (sessions: SessionMetadata[]) => void;
	onWorkspaceDelete: (result: DeleteWorkspaceResult) => void;
	onWorkspaceUpdate: (workspace: WorkspaceConfig) => void;
	onWorkspaceProjectCreated: (workspace: WorkspaceConfig) => void;
	onLoadMoreBefore: () => void;
	onLoadMoreAfter: () => void;
	onTimelineNavigationLoadEntry: (
		entry: SessionTimelineNavigationEntry,
	) => Promise<void>;
	onTimelineSearchLoadOffset: (blockOffset: number) => Promise<void>;
	onRetryEditStart: (requestId: string) => void;
	onRetryEditCancel: (requestId: string) => void;
	onRetryFromUserMessage: (
		payload: RetryUserMessagePayload,
	) => Promise<boolean>;
	onModeChange: (mode: ChatMode) => void;
	onApprovalModeChange: (mode: ApprovalMode) => void;
	onApprovalApprove: (approvalId: string, consentText?: string) => void;
	onApprovalApproveAndEnableAutoSafe: (
		approvalId: string,
		consentText?: string,
	) => void;
	onApprovalReject: (approvalId: string) => void;
	onToolBudgetContinue: (budgetId: string) => void;
	onToolBudgetStop: (budgetId: string) => void;
	onPlanClarificationSubmit: (reply: string) => void;
	onPlanClarificationSkip: () => void;
	onPlanApprove: (planId: string) => void;
	onPlanRevise: (planId: string, feedback: string) => void;
	onProviderModelChange: (providerId: string, modelId: string) => void;
	onReasoningEffortChange: (effort: string) => void;
	onWorkspaceLaunchChange: (targetId: WorkspaceLaunchTargetId) => void;
	onAddFiles: () => void;
	onAddFolder: () => void;
	onAddImages: (files: File[]) => void;
	onAddWindowScreenshot?: () => void;
	onAddPastedTextAttachment: (input: PastedTextAttachmentInput) => boolean;
	onAddContextFiles: (files: File[]) => void;
	onAddContext: (item: AdditionalContextItem) => void;
	onRemoveContext: (contextId: string) => void;
	onPinContext: (contextId: string, pinned: boolean) => void;
	onClearUnpinnedContext: () => void;
	onCancel: () => void;
	onSubmit: (message: string, modeOverride?: ChatMode) => void;
	onGuideSubmit: (message: string) => void;
	activeQueueItemId: number | null;
	onQueueMessageRemove: (queueId: number) => void;
	onQueueMessageEdit: (item: MessageQueueItem) => void;
	onQueueMessageReorder: (queueIds: number[]) => void;
	onGuideDelete: (guideId: string) => void;
	onGuideReorder: (guideIds: string[]) => void;
	onWorkflowTodoDismiss: (snapshot: WorkflowTodoSnapshot) => void;
	onGoalChange: (goal: AgentGoalState) => void;
	onGoalDismiss: (goal: AgentGoalState) => Promise<void>;
	onCompletionOpen: (trigger: ComposerCompletionTrigger) => void;
};

function HomePage({
	workspaceRefreshToken,
	isHome,
	activeSessionId,
	workspaceSidebar,
	keyboardShortcuts,
	onWorkspaceSidebarChange,
	sessionLayout,
	onSessionLayoutChange,
	activeSessionMetadata,
	activeWorkspaceId,
	chatTitle,
	timelineStore,
	timelineNavigationEntries,
	isSessionLoading,
	sessionError,
	isLoadingMoreBefore,
	isLoadingMoreAfter,
	retryDisabled,
	activeRetryRequestId,
	providerModelSelection,
	selectedProviderId,
	selectedModelId,
	reasoningEffort,
	composerInstanceKey,
	message,
	nextStepSuggestion,
	onDraftChange,
	contextItems,
	selectionAskThreads,
	messageQueue,
	pendingGuides,
	workflowTodoSnapshot,
	currentGoal,
	workflowTodoCollapsed,
	mode,
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
	isSending,
	isCancelling,
	isAddingTextAttachment,
	isApprovalModeSaving,
	workspaceOptions,
	initialWorkspaces,
	initialSessions,
	initialActiveWorkspaceId,
	initialWorkspaceTreeOrder,
	runningSessionIds,
	unreadSessionIds,
	forkingSessionId,
	forkingRequestId,
	forkDisabled,
	homeWorkspace,
	homeExecutionEnvironment,
	homeWorktreeSources,
	worktreeDisabledReason,
	isWorktreePreparing,
	workspaceFooterDisabled,
	activeWorkspace,
	godotLaunchExecutablePath,
	workspaceLaunchPreference,
	onNewSession,
	onNewUnboundSession,
	onNewWorkspaceSession,
	onWorkspaceRefresh,
	onHomeWorkspaceSelect,
	onHomeWorkspaceAdd,
	onHomeWorkspaceClear,
	onHomeExecutionEnvironmentChange,
	onHomeWorktreeSourcesChange,
	onSessionSelect,
	onSessionFork,
	onForkFromUserMessage,
	onForkSourceOpen,
	onSessionArchive,
	onSessionRename,
	onSessionWorkspaceMove,
	onSessionWorktreeDelete,
	onSessionWorktreeHandoff,
	onSessionWorktreeSetup,
	onSessionsChange,
	onWorkspaceDelete,
	onWorkspaceUpdate,
	onWorkspaceProjectCreated,
	onLoadMoreBefore,
	onLoadMoreAfter,
	onTimelineNavigationLoadEntry,
	onTimelineSearchLoadOffset,
	onRetryEditStart,
	onRetryEditCancel,
	onRetryFromUserMessage,
	onModeChange,
	onApprovalModeChange,
	onApprovalApprove,
	onApprovalApproveAndEnableAutoSafe,
	onApprovalReject,
	onToolBudgetContinue,
	onToolBudgetStop,
	onPlanClarificationSubmit,
	onPlanClarificationSkip,
	onPlanApprove,
	onPlanRevise,
	onProviderModelChange,
	onReasoningEffortChange,
	onWorkspaceLaunchChange,
	onAddFiles,
	onAddFolder,
	onAddImages,
	onAddWindowScreenshot,
	onAddPastedTextAttachment,
	onAddContextFiles,
	onAddContext,
	onRemoveContext,
	onPinContext,
	onClearUnpinnedContext,
	onCancel,
	onSubmit,
	onGuideSubmit,
	activeQueueItemId,
	onQueueMessageRemove,
	onQueueMessageEdit,
	onQueueMessageReorder,
	onGuideDelete,
	onGuideReorder,
	onWorkflowTodoDismiss,
	onGoalChange,
	onGoalDismiss,
	onCompletionOpen,
}: HomePageProps): React.JSX.Element {
	const { t } = useTranslation();
	const [messageApi, messageContextHolder] = antdMessage.useMessage();
	const {
		mainSurface,
		chatSurfaceSettled,
		scheduledTaskAttentionCount,
		composerInputRequest,
		handleHomeStarterSelect,
		transitionToChatSurface,
		showScheduledTasksSurface,
		handleScheduledTasksOverlayTransitionEnd,
		beginNewSessionSurface,
		requestNewSessionSurface,
		requestNewUnboundSessionSurface,
		requestNewWorkspaceSessionSurface,
		openScheduledTaskSession,
		createScheduledTask,
	} = useHomeSurfaceController({
		onNewSession,
		onNewUnboundSession,
		onNewWorkspaceSession,
		onSessionSelect,
	});
	const conversationTimelinePaneRef =
		useRef<ConversationTimelinePaneHandle | null>(null);
	const chatBodyRef = useRef<HTMLDivElement | null>(null);
	const scrollToBottomButtonRef = useRef<HTMLButtonElement | null>(null);
	const scrollToBottomButtonVisibleRef = useRef<boolean>(false);

	const workspaceSnapshotForActions: WorkspaceConfig | null =
		activeWorkspace ?? (isHome ? homeWorkspace : null);
	const workspaceForActions: WorkspaceConfig | null =
		workspaceSnapshotForActions === null
			? null
			: (workspaceOptions.find(
					(workspace: WorkspaceConfig): boolean =>
						workspace.id === workspaceSnapshotForActions.id,
				) ?? workspaceSnapshotForActions);
	const {
		visualWorkspaceSidebar,
		visualSessionLayout,
		visualWorkspaceSidebarRef,
		visualSessionLayoutRef,
		commitSessionLayout,
		scheduleWorkspaceSidebarSave,
		fullscreenMotionDisabled,
		workspaceSidebarOpen,
		sideDockOpen,
		sideDockSize,
		bottomDockOpen,
		bottomDockSize,
		fullscreenDock,
		sideDockFullscreen,
		bottomDockFullscreen,
		isDockFullscreen,
		activeFullscreenDock,
		fullscreenDockLayout,
		isFullscreenBrowserPanel,
		sideDockActivationRequest,
		updateSideDock,
		updateBottomDock,
		updateFilePanel,
		updateBrowserPanel,
		toggleDockFullscreen,
		openSideDock,
		closeSideDock,
		toggleSideDock,
		openReviewPanel,
		openBottomDock,
		closeBottomDock,
		toggleBottomDock,
		handleWorkspaceSidebarResize,
		handleWorkspaceSidebarResizeEnd,
		handleSideDockResize,
		handleSideDockResizeEnd,
		handleBottomDockResize,
		handleBottomDockResizeEnd,
	} = useHomePageDockController({
		workspaceSidebar,
		sessionLayout,
		onWorkspaceSidebarChange,
		onSessionLayoutChange,
		activeSessionId,
		workspaceForActions,
	});
	const showDockControls: boolean = true;
	const showWorkspaceLaunchControls: boolean = workspaceForActions !== null;
	const showSummaryButton: boolean = true;
	const showSideDockButton: boolean = showDockControls;
	const showBottomDockButton: boolean = showDockControls;
	const terminalWaitForCwd: boolean =
		!isHome && isSessionLoading && workspaceForActions === null;
	const showWorkflowTodoPanel: boolean =
		!workflowTodoCollapsed && workflowTodoSnapshot !== null;
	const showExecutionStatusPanel: boolean =
		!isHome &&
		pendingApproval === null &&
		pendingToolBudget === null &&
		pendingPlanClarification === null &&
		pendingPlanApproval === null &&
		(currentGoal !== null || showWorkflowTodoPanel);
	const effectiveGodotLaunchExecutablePath: string | null =
		godotLaunchExecutablePath?.trim()
			? godotLaunchExecutablePath.trim()
			: null;
	const launchController = useHomePageLaunchController({
		workspaceForActions,
		effectiveGodotLaunchExecutablePath,
		showWorkspaceLaunchControls,
		workspaceLaunchPreference,
		activeSessionMetadata,
		onWorkspaceLaunchChange,
		messageApi,
	});
	const {
		workspaceLaunchTargets,
		selectedLaunchTarget,
		selectedLaunchTargetId,
		workspaceLaunchMenuItems,
		isOpeningLaunchTarget,
		handleWorkspaceLaunchMenuClick,
		openWorkspaceLaunchTarget,
	} = launchController;
	const summaryController = useHomePageSummaryController({
		activeSessionId,
		isHome,
		workspaceForActions,
		effectiveGodotLaunchExecutablePath,
		messageApi,
		onWorkspaceRefresh,
		onOpenReviewPanel: openReviewPanel,
		openWorkspaceLaunchTarget,
	});
	const {
		summaryOpen,
		summaryOverview,
		isSummaryLoading,
		summaryError,
		setSummaryOpen,
		loadSummaryOverview,
		handleSummaryOpenChange,
		summaryGitSourceFolderId,
		gitStateRevision,
		handleDockGitStateChange,
		handleGitReviewSourceFolderChange,
		gitActions,
		showGodotSummaryActions,
		summaryCollapseItems,
		plansModalOpen,
		plansDialogOverview,
		isPlansDialogLoading,
		plansDialogError,
		setPlansModalOpen,
		openPlanPreview,
		previewPlan,
		isPlanPreviewLoading,
		planPreviewError,
		closePlanPreview,
		sourcesModalOpen,
		sourcesDialogOverview,
		isSourcesDialogLoading,
		sourcesDialogError,
		closeSourcesModal,
		previewSource,
		setPreviewSource,
		closeGodotSceneModal,
		isGodotSceneModalOpen,
		filteredGodotSceneFiles,
		isGodotSceneLoading,
		godotSceneSearch,
		setGodotSceneSearch,
		runGodotScene,
	} = summaryController;
	const selectionMarkerContextItems: AdditionalContextItem[] =
		useMemo((): AdditionalContextItem[] => {
			const byId = new Map<string, AdditionalContextItem>();
			for (const item of contextItems) {
				byId.set(item.id, item);
			}
			for (const queueItem of messageQueue) {
				if (queueItem.status !== "pending") {
					continue;
				}
				for (const item of queueItem.additionalContext) {
					if (item.kind === "message_selection") {
						byId.set(item.id, item);
					}
				}
			}
			return [...byId.values()];
		}, [contextItems, messageQueue]);

	const setScrollToBottomButtonVisible = useCallback(
		(visible: boolean): void => {
			scrollToBottomButtonVisibleRef.current = visible;
			const button: HTMLButtonElement | null =
				scrollToBottomButtonRef.current;
			if (button === null) {
				return;
			}

			button.classList.toggle(
				styles.scrollToBottomButtonHidden,
				!visible,
			);
			button.tabIndex = visible ? 0 : -1;
			button.setAttribute("aria-hidden", visible ? "false" : "true");
		},
		[],
	);

	useLayoutEffect((): void => {
		setScrollToBottomButtonVisible(scrollToBottomButtonVisibleRef.current);
	});

	useLayoutEffect((): void => {
		setScrollToBottomButtonVisible(false);
	}, [activeSessionId, isHome, setScrollToBottomButtonVisible]);

	const scrollMessageListToBottom = useCallback((): void => {
		conversationTimelinePaneRef.current?.scrollToBottom("smooth");
		setScrollToBottomButtonVisible(false);
	}, [setScrollToBottomButtonVisible]);

	const { openMessageWebUrl, openMessageHtmlFile } =
		useIntegratedBrowserSession({
			activeSessionId,
			visualSessionLayoutRef,
			commitSessionLayout,
			messageApi,
		});
	useExternalBrowserSession(
		mainSurface === "chat" ? activeSessionId : null,
		workspaceForActions?.id ?? null,
	);

	const toggleWorkspaceSidebar = useCallback((): void => {
		scheduleWorkspaceSidebarSave({
			...visualWorkspaceSidebarRef.current,
			open: !visualWorkspaceSidebarRef.current.open,
		});
	}, [scheduleWorkspaceSidebarSave]);

	useHomePageKeyboardShortcuts({
		keyboardShortcuts,
		activeSessionId,
		isHome,
		timelineNavigationEntriesLength: timelineNavigationEntries.length,
		conversationTimelinePaneRef,
		chatBodyRef,
		showBottomDockButton,
		showSideDockButton,
		toggleWorkspaceSidebar,
		toggleBottomDock,
		toggleSideDock,
		requestNewSessionSurface,
	});

	function handlePageDragOver(event: React.DragEvent<HTMLDivElement>): void {
		if (event.dataTransfer.types.includes("Files")) {
			event.preventDefault();
			event.dataTransfer.dropEffect = "copy";
		}
	}

	function handlePageDrop(event: React.DragEvent<HTMLDivElement>): void {
		if (!event.dataTransfer.types.includes("Files")) {
			return;
		}

		event.preventDefault();
		const files: File[] = Array.from(event.dataTransfer.files);
		if (files.length > 0) {
			onAddContextFiles(files);
		}
	}

	function renderSummaryButton(): React.ReactNode {
		return (
			<SessionSummaryPopover
				open={summaryOpen}
				onOpenChange={handleSummaryOpenChange}
				isLoading={isSummaryLoading}
				hasOverview={summaryOverview !== null}
				error={summaryError}
				items={summaryCollapseItems}
				onReload={(): void => {
					void loadSummaryOverview();
				}}
				onExpandEnvironment={(): void => {
					void loadSummaryOverview(
						SUMMARY_PREVIEW_LIMIT,
						SUMMARY_PREVIEW_LIMIT,
						true,
					);
				}}
			/>
		);
	}

	const { renderComposer } = useHomePageComposerController({
		state: {
			composerInstanceKey,
			inputRequest: composerInputRequest,
			providerModelSelection,
			selectedProviderId,
			selectedModelId,
			reasoningEffort,
			message,
			nextStepSuggestion,
			contextItems,
			mode,
			approvalMode,
			slashCommands,
			skills,
			isSending,
			isCancelling,
			isAddingTextAttachment,
			isApprovalModeSaving,
			workspaceOptions,
			workspaceFooterDisabled,
			isHome,
			homeExecutionEnvironment,
			homeWorktreeSources,
			activeWorkspace,
			homeWorkspace,
			worktreeDisabledReason,
			isWorktreePreparing,
		},
		actions: {
			onDraftChange,
			onModeChange,
			onApprovalModeChange,
			onProviderModelChange,
			onReasoningEffortChange,
			onAddFiles,
			onAddFolder,
			onAddImages,
			onAddWindowScreenshot,
			onAddPastedTextAttachment,
			onAddContextFiles,
			onHomeWorkspaceSelect,
			onHomeWorkspaceAdd,
			onHomeWorkspaceClear,
			onHomeWorktreeModeChange: onHomeExecutionEnvironmentChange,
			onHomeWorktreeSourceOptionsChange: onHomeWorktreeSourcesChange,
			onRemoveContext,
			onPinContext,
			onClearUnpinnedContext,
			onCancel,
			onSubmit,
			onGuideSubmit,
			onCompletionOpen,
		},
	});

	const workspaceTreeProps: WorkspaceTreeProps = {
		refreshToken: workspaceRefreshToken,
		selectedSessionId: mainSurface === "chat" ? activeSessionId : null,
		selectedWorkspaceId: activeWorkspaceId,
		initialWorkspaces,
		initialSessions,
		initialActiveWorkspaceId,
		initialWorkspaceTreeOrder,
		runningSessionIds,
		unreadSessionIds,
		forkingSessionId,
		sessionUpdate: activeSessionMetadata,
		onNewSession: requestNewUnboundSessionSurface,
		onSessionSelect: (session): void => {
			transitionToChatSurface();
			onSessionSelect(session);
		},
		onSessionFork,
		onSessionArchive,
		onSessionRename,
		onSessionWorkspaceMove,
		onSessionWorktreeDelete,
		onSessionsChange,
		onNewWorkspaceSession: requestNewWorkspaceSessionSurface,
		onWorkspaceDelete,
		onWorkspaceUpdate,
		onWorkspaceProjectCreated,
	};

	const commonDockPanelProps = {
		sessionId: activeSessionId,
		workspaceId: workspaceForActions?.id ?? null,
		workspace: workspaceForActions,
		launchTargets: workspaceLaunchTargets,
		workspaceLaunchTargetId: selectedLaunchTargetId,
		sourceFolderId: summaryGitSourceFolderId,
		sourceFolders: workspaceForActions?.sourceFolders ?? [],
		primarySourceFolderId:
			workspaceForActions?.primarySourceFolderId ?? null,
		onSourceFolderChange: handleGitReviewSourceFolderChange,
		cwd: workspaceForActions?.rootPath ?? null,
		contextItems,
		onAddContext,
		onRemoveContext,
		gitStateRevision,
		onGitStateChange: handleDockGitStateChange,
		waitForCwd: terminalWaitForCwd,
		filePanels: visualSessionLayout.filePanels,
		onFilePanelChange: updateFilePanel,
		browserPanels: visualSessionLayout.browserPanels,
		onBrowserPanelChange: updateBrowserPanel,
	};

	const {
		sideDockConfig,
		bottomDockConfig,
		renderSideDock,
		renderBottomDock,
	} = createHomeDockPanelConfigs({
		sharedProps: commonDockPanelProps,
		side: {
			enabled: showSideDockButton,
			isOpen: sideDockOpen,
			size: sideDockSize,
			isFullscreen: sideDockFullscreen,
			layout: visualSessionLayout.side,
			activationRequest: sideDockActivationRequest,
			onLayoutChange: updateSideDock,
			onFullscreenToggle: (): void => toggleDockFullscreen("side"),
			slotClassName: styles.sideDockSlot,
			closedSize: SIDE_DOCK_CLOSED_SIZE,
			maxSize: SIDE_DOCK_MAX_SIZE,
		},
		bottom: {
			enabled: showBottomDockButton,
			isOpen: bottomDockOpen,
			size: bottomDockSize,
			isFullscreen: bottomDockFullscreen,
			isSideFullscreen: sideDockFullscreen,
			layout: visualSessionLayout.bottom,
			onLayoutChange: updateBottomDock,
			onFullscreenToggle: (): void => toggleDockFullscreen("bottom"),
			slotClassName: styles.bottomDockSlot,
			closedSize: BOTTOM_DOCK_CLOSED_SIZE,
			maxSize: BOTTOM_DOCK_MAX_SIZE,
				},
			});
	const executionStatusPanel: React.ReactNode = showExecutionStatusPanel ? (
		<TimelineWorkflowTodoPanel
			timelineStore={timelineStore}
			sessionId={activeSessionId!}
			snapshot={workflowTodoSnapshot}
			goal={currentGoal}
			onDismiss={onWorkflowTodoDismiss}
			onGoalChange={onGoalChange}
			onGoalDismiss={onGoalDismiss}
		/>
	) : null;
	const chatSurfaceProps: HomeChatSurfaceProps = {
		activeSessionMetadata,
		isSessionLoading,
		onForkSourceOpen,
		onSessionWorktreeSetup,
		onSessionWorktreeHandoff,
		chatTitle,
		sideDockOpen,
		isHome,
		chatBodyRef,
		homeWorkspace,
		sessionError,
		message,
		chatSurfaceSettled,
		handleHomeStarterSelect,
		activeSessionId,
		workspaceForActions,
		effectiveGodotLaunchExecutablePath,
		selectedLaunchTarget,
		workspaceLaunchTargets,
		openMessageWebUrl,
		openMessageHtmlFile,
		conversationTimelinePaneRef,
		timelineStore,
		timelineNavigationEntries,
		isLoadingMoreBefore,
		isLoadingMoreAfter,
		retryDisabled,
		activeRetryRequestId,
		onLoadMoreBefore,
		onLoadMoreAfter,
		onTimelineNavigationLoadEntry,
		onTimelineSearchLoadOffset,
		onRetryEditStart,
		onRetryEditCancel,
		onRetryFromUserMessage,
		onForkFromUserMessage,
		forkDisabled,
		forkingRequestId,
		openReviewPanel,
		setScrollToBottomButtonVisible,
		selectionMarkerContextItems,
		onAddContext,
		selectionAskThreads,
		currentGoal,
		scrollToBottomButtonRef,
		showExecutionStatusPanel,
		executionStatusPanel,
		isDockFullscreen,
		scrollMessageListToBottom,
		pendingApproval,
		isApproving,
		isApprovalAutoSafeEnabling,
		isRejecting,
		approvalError,
		onApprovalApprove,
		onApprovalApproveAndEnableAutoSafe,
		onApprovalReject,
		pendingToolBudget,
		isToolBudgetContinuing,
		isToolBudgetStopping,
		isCancelling,
		toolBudgetError,
		onToolBudgetContinue,
		onToolBudgetStop,
		onCancel,
		pendingPlanClarification,
		isPlanClarificationSubmitting,
		planClarificationError,
		onPlanClarificationSubmit,
		onPlanClarificationSkip,
		pendingPlanApproval,
		isPlanApproving,
		isPlanRevising,
		planApprovalError,
		onPlanApprove,
		onPlanRevise,
		messageQueue,
		pendingGuides,
		activeQueueItemId,
		onQueueMessageRemove,
		onQueueMessageEdit,
		onQueueMessageReorder,
		onGuideDelete,
		onGuideReorder,
		renderComposer,
	};
	const pageActionControls = (
		<HomePageActionBar
			showWorkspaceLaunchControls={showWorkspaceLaunchControls}
			isOpeningLaunchTarget={isOpeningLaunchTarget}
			selectedLaunchTarget={selectedLaunchTarget}
			workspaceLaunchMenuItems={workspaceLaunchMenuItems}
			handleWorkspaceLaunchMenuClick={handleWorkspaceLaunchMenuClick}
			openWorkspaceLaunchTarget={openWorkspaceLaunchTarget}
			showSummaryButton={showSummaryButton}
			renderSummaryButton={renderSummaryButton}
			showBottomDockButton={showBottomDockButton}
			bottomDockOpen={bottomDockOpen}
			toggleBottomDock={toggleBottomDock}
			showSideDockButton={showSideDockButton}
			sideDockOpen={sideDockOpen}
			toggleSideDock={toggleSideDock}
		/>
	);

	return (
		<>
			<ComputerObservationBoundary sessionId={mainSurface === "chat" ? activeSessionId : null} workspaceId={workspaceForActions?.id ?? null} />
			<HomePageShell
			messageContextHolder={messageContextHolder}
			workspaceSidebarPreferences={visualWorkspaceSidebar}
			onDragOver={handlePageDragOver}
			onDrop={handlePageDrop}
			onWorkspaceSidebarResize={handleWorkspaceSidebarResize}
			onWorkspaceSidebarResizeEnd={handleWorkspaceSidebarResizeEnd}
			workspaceSidebar={
					<HomeWorkspaceSidebar
						treeProps={workspaceTreeProps}
						isOpen={workspaceSidebarOpen}
						onNewSession={requestNewSessionSurface}
						onOpenScheduledTasks={showScheduledTasksSurface}
						scheduledTasksActive={mainSurface === "scheduledTasks"}
						scheduledTaskAttentionCount={
							scheduledTaskAttentionCount
						}
						onOpenSettings={(): void => {
							void window.electronAPI.windowControl.openSettings();
						}}
					/>
			}
		>
					<HomePageWorkbench
						mainSurface={mainSurface}
						activeFullscreenDock={activeFullscreenDock}
						fullscreenMotionDisabled={fullscreenMotionDisabled}
						bottomDockFullscreen={bottomDockFullscreen}
						sideDockFullscreen={sideDockFullscreen}
						isDockFullscreen={isDockFullscreen}
						isFullscreenBrowserPanel={isFullscreenBrowserPanel}
						pageActionControls={pageActionControls}
						chatSurfaceProps={chatSurfaceProps}
						sideDockConfig={sideDockConfig}
						bottomDockConfig={bottomDockConfig}
						renderSideDock={renderSideDock}
						renderBottomDock={renderBottomDock}
						renderComposer={renderComposer}
						onBottomDockResize={handleBottomDockResize}
						onBottomDockResizeEnd={handleBottomDockResizeEnd}
						onSideDockResize={handleSideDockResize}
						onSideDockResizeEnd={handleSideDockResizeEnd}
						onScheduledTasksOverlayTransitionEnd={
							handleScheduledTasksOverlayTransitionEnd
						}
						onCreateScheduledTask={createScheduledTask}
						onOpenScheduledTaskSession={openScheduledTaskSession}
						defaultWorkspaceId={
							isHome ? (homeWorkspace?.id ?? null) : activeWorkspaceId
						}
						defaultProviderId={selectedProviderId}
						defaultModelId={selectedModelId}
						defaultReasoningEffort={reasoningEffort}
					/>
			</HomePageShell>
			<HomePageDialogs summaryController={summaryController} />
		</>
	);
}

export default HomePage;

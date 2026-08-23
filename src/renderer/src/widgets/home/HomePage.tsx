import {
	useCallback,
	useEffect,
	useLayoutEffect,
	useMemo,
	useRef,
	useState,
	type TransitionEvent,
} from "react";
import {
	Button,
	Divider,
	Dropdown,
	Empty,
	Input,
	message as antdMessage,
	Modal,
	Space,
	Spin,
	Splitter,
	Typography,
	Tooltip,
} from "antd";
import type { CollapseProps, MenuProps } from "antd";
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
	TimelineBlock,
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
import { getPlan, type PlanResult } from "@/platform/rpc/plan-api";
import type {
	DeleteWorkspaceResult,
	WorkspaceTreeOrderPreferences,
} from "@/platform/rpc/workspace-api";
import type { SkillSummary } from "@/platform/rpc/skill-api";
import { fetchSessions } from "@/platform/rpc/session-api";
import {
	getCachedClientPreferences,
	type WorkspaceSidebarPreferences,
} from "@/platform/rpc/client-preferences-api";
import {
	detectShortcutPlatform,
	findMatchingShortcutCommand,
	type KeyboardShortcutOverrides,
	type ShortcutCommandId,
	type ShortcutPlatform,
} from "@/platform/rpc/keyboard-shortcuts";
import {
	fetchSessionOverview,
	type SessionOverviewGitInfo,
	type SessionOverviewPlanItem,
	type SessionOverviewResult,
	type SessionOverviewSourceItem,
} from "@/platform/rpc/session-overview-api";
import {
	type SessionArchiveContext,
	type WorkspaceTreeProps,
} from "@/widgets/workspace/WorkspaceTree";
import ConversationTimelinePane, {
	type ConversationTimelinePaneHandle,
} from "@/widgets/conversation/ConversationTimelinePane";
import Composer, {
	type ComposerInputRequest,
} from "@/widgets/composer/Composer";
import FloatingWorkflowTodoPanel, {
	type WorkflowFileChangeSummary,
} from "@/widgets/composer/FloatingWorkflowTodoPanel";
import FloatingGoalPanel from "@/widgets/composer/FloatingGoalPanel";
import MessageQueuePanel from "@/widgets/composer/MessageQueuePanel";
import NewSessionHome from "./NewSessionHome";
import ApprovalDialog from "@/widgets/approval/ApprovalDialog";
import ToolBudgetDialog from "@/widgets/approval/ToolBudgetDialog";
import type { ComposerCompletionTrigger } from "@/domain/composer/composer-completion";
import type { PastedTextAttachmentInput } from "@/features/conversation/pasted-text-attachment";
import type { RetryUserMessagePayload } from "@/widgets/conversation/UserBubble";
import styles from "./HomePage.module.css";
import { Icon } from "@/assets/icons";
import ClarificationDialog from "@/widgets/clarification/ClarificationDialog";
import PlanApprovalDialog from "@/widgets/approval/PlanApprovalDialog";
import {
	createDockTab,
	type DockPanelActivationRequest,
	type DockPanelKind,
} from "@/widgets/dock/DockPanelTabs";
import HomeWorkspaceSidebar from "./HomeWorkspaceSidebar";
import ScheduledTasksPage from "@/widgets/scheduled-tasks/ScheduledTasksPage";
import FullscreenComposerShelf from "./FullscreenComposerShelf";
import HomeDockPanel from "./HomeDockPanel";
import {
	listTerminalRuntimeIds,
	createDefaultBrowserPanelLayout,
	type BrowserPanelLayoutPreferences,
	type DockLayoutPreferences,
	type DockFullscreenPlacement,
	type FilePanelLayoutPreferences,
	type SessionLayoutPreferences,
} from "@/domain/session/session-layout";
import BranchActionDialog from "@/widgets/git/BranchActionDialog";
import CommitActionDialog from "@/widgets/git/CommitActionDialog";
import CreateBranchDialog from "@/widgets/git/CreateBranchDialog";
import { useGitActionDialogController } from "@/features/git/useGitActionDialogController";
import SessionPlansDialog from "./SessionPlansDialog";
import SessionPlanPreviewDialog from "./SessionPlanPreviewDialog";
import SessionSourcesDialog from "./SessionSourcesDialog";
import SessionSourcePreviewDialog from "./SessionSourcePreviewDialog";
import SessionSummaryPopover from "./SessionSummaryPopover";
import useHomeDockLayout from "./useHomeDockLayout";
import useSessionSummaryOverview from "./useSessionSummaryOverview";
import { createHomeDockPanelConfigs } from "./home-dock-panel-config";
import { formatSourceSubtitle } from "./session-overview-formatters";
import type { TimelinePageStore } from "@/domain/workbench/timeline-page-store";
import { useTimelineSelector } from "@/domain/workbench/timeline-page-store";
import { MarkdownResourceActionsProvider } from "@/widgets/markdown/markdown-resource-actions";
import {
	DEFAULT_WORKSPACE_LAUNCH_TARGET_ID,
	type WorkspaceLaunchTargetId,
} from "@/domain/workspace/workspace-launch";
import {
	navigateSessionHistory,
	SESSION_NAVIGATION_EVENT,
} from "@/domain/session/session-navigation-history";
import { createBackendClient } from "@/platform/rpc/transport/backend-client";
import type { BackendEvent } from "@/platform/rpc/transport/backend-rpc-client";
import {
	findBrowserRuntime,
	waitForBrowserRuntime,
	type BrowserRuntimeRegistration,
} from "@/widgets/browser/browser-runtime-registry";

type WorkspaceLaunchTarget = {
	id: WorkspaceLaunchTargetId;
	label: string;
};

type GodotSceneFile = {
	relativePath: string;
	resourcePath: string;
	name: string;
};

type SummaryGitAction = "diff" | "branch" | "commit";

type SummaryGitActionRequest = {
	id: number;
	action: SummaryGitAction;
	sourceFolderId: string;
};

const FALLBACK_WORKSPACE_LAUNCH_TARGETS: WorkspaceLaunchTarget[] = [
	{ id: "file-explorer", label: "File Explorer" },
	{ id: "terminal", label: "Terminal" },
];

const MAX_GODOT_SCENE_FILES: number = 500;
const SUMMARY_PREVIEW_LIMIT: number = 3;
const SUMMARY_SEE_MORE_LIMIT: number = 100;
const WORKSPACE_SIDEBAR_CLOSED_SIZE: number = 0;
const WORKSPACE_SIDEBAR_MAX_SIZE: number = 720;
const WORKSPACE_SIDEBAR_CLOSE_THRESHOLD: number = 150;
const SIDE_DOCK_CLOSED_SIZE: number = 0;
const SIDE_DOCK_DEFAULT_SIZE: number = 520;
const SIDE_DOCK_MAX_SIZE: number = 720;
const SIDE_DOCK_CLOSE_THRESHOLD: number = 150;
const SIDE_DOCK_PROGRAMMATIC_OPEN_GUARD_MS: number = 400;
const CHAT_SURFACE_POST_TRANSITION_DELAY_MS: number = 80;
const CHAT_SURFACE_TRANSITION_FALLBACK_MS: number = 500;
const BOTTOM_DOCK_CLOSED_SIZE: number = 0;
const BOTTOM_DOCK_DEFAULT_SIZE: number = 280;
const BOTTOM_DOCK_MAX_SIZE: number = 520;
const BOTTOM_DOCK_CLOSE_THRESHOLD: number = 120;
const MAX_SELECTED_SEARCH_QUERY_LENGTH: number = 500;
function ensureDockTab(
	layout: DockLayoutPreferences,
	dockId: string,
	defaultKind: DockPanelKind,
): DockLayoutPreferences {
	const firstTab: DockLayoutPreferences["tabs"][number] | undefined =
		layout.tabs[0];
	if (firstTab !== undefined) {
		const activeTabKey: string | null = layout.tabs.some(
			(tab): boolean => tab.key === layout.activeTabKey,
		)
			? layout.activeTabKey
			: firstTab.key;
		return activeTabKey === layout.activeTabKey
			? layout
			: { ...layout, activeTabKey };
	}
	const tab = createDockTab(dockId, defaultKind, 1);
	return { ...layout, tabs: [tab], activeTabKey: tab.key };
}

function getSelectedConversationSearchQuery(
	container: HTMLElement | null,
): string | undefined {
	const selection: Selection | null = window.getSelection();
	if (
		container === null ||
		selection === null ||
		selection.isCollapsed ||
		selection.rangeCount === 0 ||
		selection.anchorNode === null ||
		selection.focusNode === null ||
		!container.contains(selection.anchorNode) ||
		!container.contains(selection.focusNode)
	) {
		return undefined;
	}
	const anchorElement: Element | null =
		selection.anchorNode instanceof Element
			? selection.anchorNode
			: selection.anchorNode.parentElement;
	const focusElement: Element | null =
		selection.focusNode instanceof Element
			? selection.focusNode
			: selection.focusNode.parentElement;
	if (
		anchorElement === null ||
		focusElement === null ||
		anchorElement.closest('[data-chat-search-text="true"]') === null ||
		focusElement.closest('[data-chat-search-text="true"]') === null ||
		anchorElement.closest("[data-chat-search-ignore]") !== null ||
		focusElement.closest("[data-chat-search-ignore]") !== null
	) {
		return undefined;
	}
	const selectedText: string = selection.toString().trim();
	return selectedText.length > 0 &&
		selectedText.length <= MAX_SELECTED_SEARCH_QUERY_LENGTH &&
		!/[\r\n]/u.test(selectedText)
		? selectedText
		: undefined;
}

function shouldIgnoreGlobalShortcut(event: KeyboardEvent): boolean {
	if (event.isComposing) {
		return true;
	}
	const target: EventTarget | null = event.target;
	if (!(target instanceof Element)) {
		return false;
	}
	return (
		target.closest(
			[
				"input",
				"textarea",
				"select",
				"[contenteditable='true']",
				"[contenteditable='']",
				"[role='textbox']",
				"[role='combobox']",
				"[role='dialog']",
				"[role='menu']",
				"[role='listbox']",
			].join(","),
		) !== null
	);
}

function isWorkspaceLaunchTargetId(
	value: string,
): value is WorkspaceLaunchTargetId {
	return (
		value === "file-explorer" ||
		value === "terminal" ||
		value === "vscode" ||
		value === "visual-studio" ||
		value === "github-desktop" ||
		value === "git-bash" ||
		value === "godot"
	);
}

function getWorkspaceLaunchIcon(
	targetId: WorkspaceLaunchTargetId,
): React.ReactNode {
	if (targetId === "file-explorer") {
		return <Icon name="folder" />;
	}
	if (targetId === "terminal") {
		return <Icon name="terminal" />;
	}
	if (targetId === "git-bash") {
		return <Icon name="git-bash" />;
	}
	if (targetId === "godot") {
		return <Icon name="godot" />;
	}
	return <Icon name="external-link" />;
}

function isGodotScenePath(relativePath: string): boolean {
	const normalizedPath: string = relativePath.toLowerCase();
	return normalizedPath.endsWith(".tscn") || normalizedPath.endsWith(".scn");
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function getRecordString(record: Record<string, unknown>, key: string): string {
	const value: unknown = record[key];
	return typeof value === "string" ? value : "";
}

function getRecordNumber(record: Record<string, unknown>, key: string): number {
	const value: unknown = record[key];
	return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function getPathBasename(inputPath: string): string {
	return inputPath.split(/[\\/]/u).filter(Boolean).at(-1) ?? inputPath;
}

type WorkflowFileChangeContribution = WorkflowFileChangeSummary & {
	batchIds: string[];
};

const timelineFileChangeContributionCache: WeakMap<
	TimelineBlock,
	WorkflowFileChangeContribution[]
> = new WeakMap();

function getTimelineFileChangeContributions(
	block: TimelineBlock,
): WorkflowFileChangeContribution[] {
	const cached: WorkflowFileChangeContribution[] | undefined =
		timelineFileChangeContributionCache.get(block);
	if (cached !== undefined) {
		return cached;
	}
	const contributions: WorkflowFileChangeContribution[] = [];
	if (block.type === "assistant") {
		for (const part of block.bodyParts) {
			if (part.type === "inline_diff") {
				contributions.push({
					additions: part.additions,
					deletions: part.deletions,
					changedFiles: part.editedFileCount,
					batchIds: part.batchIds.filter(
						(batchId: string): boolean => batchId.length > 0,
					),
				});
				continue;
			}
			if (part.type !== "tool") {
				continue;
			}
			for (const event of part.events) {
				const fileEditBatch: unknown = event.fileEditBatch;
				if (!isRecord(fileEditBatch)) {
					continue;
				}
				const batchId: string = getRecordString(
					fileEditBatch,
					"batchId",
				);
				contributions.push({
					additions: getRecordNumber(fileEditBatch, "additions"),
					deletions: getRecordNumber(fileEditBatch, "deletions"),
					changedFiles: getRecordNumber(
						fileEditBatch,
						"editedFileCount",
					),
					batchIds: batchId.length > 0 ? [batchId] : [],
				});
			}
		}
	}
	timelineFileChangeContributionCache.set(block, contributions);
	return contributions;
}

function aggregateTimelineFileChanges(
	blocks: TimelineBlock[],
): WorkflowFileChangeSummary {
	const countedBatchIds: Set<string> = new Set();
	let additions: number = 0;
	let deletions: number = 0;
	let changedFiles: number = 0;

	for (const block of blocks) {
		for (const contribution of getTimelineFileChangeContributions(block)) {
			if (
				contribution.batchIds.length > 0 &&
				contribution.batchIds.every((batchId: string): boolean =>
					countedBatchIds.has(batchId),
				)
			) {
				continue;
			}
			additions += contribution.additions;
			deletions += contribution.deletions;
			changedFiles += contribution.changedFiles;
			for (const batchId of contribution.batchIds) {
				countedBatchIds.add(batchId);
			}
		}
	}

	return { additions, deletions, changedFiles };
}

type TimelineWorkflowTodoPanelProps = {
	timelineStore: TimelinePageStore;
	sessionId: string;
	snapshot: WorkflowTodoSnapshot | null;
	goal: AgentGoalState | null;
	onDismiss: (snapshot: WorkflowTodoSnapshot) => void;
	onGoalChange: (goal: AgentGoalState) => void;
	onGoalDismiss: (goal: AgentGoalState) => Promise<void>;
};

function TimelineWorkflowTodoPanel({
	timelineStore,
	sessionId,
	snapshot,
	goal,
	onDismiss,
	onGoalChange,
	onGoalDismiss,
}: TimelineWorkflowTodoPanelProps): React.JSX.Element | null {
	const timelineBlocks: TimelineBlock[] = useTimelineSelector(
		timelineStore,
		(page): TimelineBlock[] => page.blocks,
	);
	const fileChangeSummary: WorkflowFileChangeSummary = useMemo(
		(): WorkflowFileChangeSummary =>
			aggregateTimelineFileChanges(timelineBlocks),
		[timelineBlocks],
	);

	if (goal !== null) {
		return (
			<FloatingGoalPanel
				goal={goal}
				sessionId={sessionId}
				workflowTodo={snapshot}
				fileChangeSummary={fileChangeSummary}
				onChange={onGoalChange}
				onDismiss={onGoalDismiss}
			/>
		);
	}
	return snapshot === null ? null : (
		<FloatingWorkflowTodoPanel
			snapshot={snapshot}
			fileChangeSummary={fileChangeSummary}
			onDismiss={onDismiss}
		/>
	);
}

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
	onNewSession: () => void;
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
	) => Promise<import("@/platform/rpc/session-api").MoveSessionWorkspaceResult>;
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
	const [workspaceLaunchTargets, setWorkspaceLaunchTargets] = useState<
		WorkspaceLaunchTarget[]
	>(FALLBACK_WORKSPACE_LAUNCH_TARGETS);
	const [selectedLaunchTargetId, setSelectedLaunchTargetId] =
		useState<WorkspaceLaunchTargetId>(workspaceLaunchPreference);
	const [isOpeningLaunchTarget, setIsOpeningLaunchTarget] =
		useState<boolean>(false);
	const [summaryGitSourceFolderId, setSummaryGitSourceFolderId] = useState<
		string | null
	>(null);
	const [summaryGitActionRequest, setSummaryGitActionRequest] =
		useState<SummaryGitActionRequest | null>(null);
	const [gitStateRevision, setGitStateRevision] = useState<number>(0);
	const [plansModalOpen, setPlansModalOpen] = useState<boolean>(false);
	const [plansDialogOverview, setPlansDialogOverview] =
		useState<SessionOverviewResult | null>(null);
	const [isPlansDialogLoading, setIsPlansDialogLoading] =
		useState<boolean>(false);
	const [plansDialogError, setPlansDialogError] = useState<string | null>(
		null,
	);
	const [sourcesModalOpen, setSourcesModalOpen] = useState<boolean>(false);
	const [sourcesDialogOverview, setSourcesDialogOverview] =
		useState<SessionOverviewResult | null>(null);
	const [isSourcesDialogLoading, setIsSourcesDialogLoading] =
		useState<boolean>(false);
	const [sourcesDialogError, setSourcesDialogError] = useState<string | null>(
		null,
	);
	const [previewSource, setPreviewSource] =
		useState<SessionOverviewSourceItem | null>(null);
	const [previewPlan, setPreviewPlan] =
		useState<SessionOverviewPlanItem | null>(null);
	const [isPlanPreviewLoading, setIsPlanPreviewLoading] =
		useState<boolean>(false);
	const [planPreviewError, setPlanPreviewError] = useState<string | null>(
		null,
	);
	const [isGodotProject, setIsGodotProject] = useState<boolean>(false);
	const [isGodotSceneModalOpen, setIsGodotSceneModalOpen] =
		useState<boolean>(false);
	const [godotSceneFiles, setGodotSceneFiles] = useState<GodotSceneFile[]>(
		[],
	);
	const [isGodotSceneLoading, setIsGodotSceneLoading] =
		useState<boolean>(false);
	const [godotSceneSearch, setGodotSceneSearch] = useState<string>("");
	const [composerInputRequest, setComposerInputRequest] =
		useState<ComposerInputRequest | null>(null);
	const [mainSurface, setMainSurface] = useState<"chat" | "scheduledTasks">("chat");
	const [chatSurfaceRevealPending, setChatSurfaceRevealPending] =
		useState<boolean>(false);
	const [chatSurfaceSettled, setChatSurfaceSettled] = useState<boolean>(true);
	const [scheduledTaskAttentionCount, setScheduledTaskAttentionCount] = useState<number>(0);
	const scheduledTaskPrefillRef = useRef<string | null>(null);
	const {
		visualWorkspaceSidebar,
		visualSessionLayout,
		visualWorkspaceSidebarRef,
		visualSessionLayoutRef,
		applyVisualWorkspaceSidebar,
		applyVisualSessionLayout,
		commitWorkspaceSidebar,
		commitSessionLayout,
		scheduleWorkspaceSidebarSave,
		scheduleSessionLayoutSave,
	} = useHomeDockLayout({
		workspaceSidebar,
		sessionLayout,
		onWorkspaceSidebarChange,
		onSessionLayoutChange,
	});
	const [fullscreenMotionDisabled, setFullscreenMotionDisabled] =
		useState<boolean>(false);
	const dockActivationRequestIdRef = useRef<number>(0);
	const chatSurfaceSettleTimerRef = useRef<number | null>(null);
	const sideDockProgrammaticOpenUntilRef = useRef<number>(0);
	const summaryGitActionRequestIdRef = useRef<number>(0);
	const planPreviewRequestIdRef = useRef<number>(0);
	const [sideDockActivationRequest, setSideDockActivationRequest] =
		useState<DockPanelActivationRequest | null>(null);
	const previousSessionLayoutRef = useRef<{
		sessionId: string | null;
		layout: SessionLayoutPreferences;
	}>({
		sessionId: activeSessionId,
		layout: sessionLayout,
	});
	const conversationTimelinePaneRef =
		useRef<ConversationTimelinePaneHandle | null>(null);
	const chatBodyRef = useRef<HTMLDivElement | null>(null);
	const scrollToBottomButtonRef = useRef<HTMLButtonElement | null>(null);
	const scrollToBottomButtonVisibleRef = useRef<boolean>(false);

	const handleHomeStarterSelect = useCallback((prompt: string): void => {
		setComposerInputRequest(
			(
				currentRequest: ComposerInputRequest | null,
			): ComposerInputRequest => ({
				requestId: (currentRequest?.requestId ?? 0) + 1,
				message: prompt,
			}),
		);
	}, []);

	const clearChatSurfaceSettleTimer = useCallback((): void => {
		if (chatSurfaceSettleTimerRef.current === null) return;
		window.clearTimeout(chatSurfaceSettleTimerRef.current);
		chatSurfaceSettleTimerRef.current = null;
	}, []);

	const transitionToChatSurface = useCallback((): void => {
		const wasScheduledTasksSurface: boolean = mainSurface === "scheduledTasks";
		clearChatSurfaceSettleTimer();
		setMainSurface("chat");

		if (!wasScheduledTasksSurface) {
			setChatSurfaceSettled(true);
			return;
		}

		// The overlay fades out for 260ms. Keep the starter actions unmounted
		// until that compositor transition has finished and the chat surface has
		// had one more frame to settle.
		setChatSurfaceSettled(false);
		chatSurfaceSettleTimerRef.current = window.setTimeout((): void => {
			chatSurfaceSettleTimerRef.current = null;
			setChatSurfaceSettled(true);
		}, CHAT_SURFACE_TRANSITION_FALLBACK_MS);
	}, [clearChatSurfaceSettleTimer, mainSurface]);

	const showScheduledTasksSurface = useCallback((): void => {
		clearChatSurfaceSettleTimer();
		setChatSurfaceSettled(false);
		setChatSurfaceRevealPending(false);
		setMainSurface("scheduledTasks");
	}, [clearChatSurfaceSettleTimer]);

	const handleScheduledTasksOverlayTransitionEnd = useCallback(
		(event: TransitionEvent<HTMLDivElement>): void => {
			if (
				event.target !== event.currentTarget ||
				mainSurface !== "chat"
			) {
				return;
			}
			if (event.propertyName === "opacity") {
				// In the normal motion path the slide finishes after opacity. Only
				// accept the opacity event when there is no transform transition left.
				if (window.getComputedStyle(event.currentTarget).transform !== "none") {
					return;
				}
			} else if (event.propertyName !== "transform") {
				return;
			}

			clearChatSurfaceSettleTimer();
			chatSurfaceSettleTimerRef.current = window.setTimeout((): void => {
				chatSurfaceSettleTimerRef.current = null;
				setChatSurfaceSettled(true);
			}, CHAT_SURFACE_POST_TRANSITION_DELAY_MS);
		},
		[clearChatSurfaceSettleTimer, mainSurface],
	);

	useEffect((): (() => void) => {
		return (): void => {
			clearChatSurfaceSettleTimer();
		};
	}, [clearChatSurfaceSettleTimer]);

	useEffect((): (() => void) | undefined => {
		const prompt: string | null = scheduledTaskPrefillRef.current;
		if (
			prompt === null ||
			mainSurface !== "chat" ||
			!isHome ||
			!chatSurfaceSettled ||
			activeSessionMetadata?.temporary !== true
		) {
			return undefined;
		}

		const frameId: number = window.requestAnimationFrame((): void => {
			if (scheduledTaskPrefillRef.current !== prompt) return;
			scheduledTaskPrefillRef.current = null;
			handleHomeStarterSelect(prompt);
		});
		return (): void => window.cancelAnimationFrame(frameId);
	}, [activeSessionMetadata?.temporary, chatSurfaceSettled, handleHomeStarterSelect, isHome, mainSurface]);

	const beginNewSessionSurface = useCallback((): Promise<void> => {
		if (mainSurface === "scheduledTasks") {
			setChatSurfaceRevealPending(true);
			setChatSurfaceSettled(false);
		} else {
			transitionToChatSurface();
		}
		return Promise.resolve(onNewSession());
	}, [mainSurface, onNewSession, transitionToChatSurface]);

	const requestNewSessionSurface = useCallback((): void => {
		void beginNewSessionSurface().catch((error: unknown): void => {
			console.error("[HomePage] failed to prepare new session", error);
		});
	}, [beginNewSessionSurface]);

	const requestNewUnboundSessionSurface = useCallback((): void => {
		if (mainSurface === "scheduledTasks") {
			setChatSurfaceRevealPending(true);
			setChatSurfaceSettled(false);
		} else {
			transitionToChatSurface();
		}
		onNewUnboundSession();
	}, [mainSurface, onNewUnboundSession, transitionToChatSurface]);

	const requestNewWorkspaceSessionSurface = useCallback(
		(
			workspace: WorkspaceConfig,
			environment: "local" | "worktree" = "local",
		): void => {
			if (mainSurface === "scheduledTasks") {
				setChatSurfaceRevealPending(true);
				setChatSurfaceSettled(false);
			} else {
				transitionToChatSurface();
			}
			onNewWorkspaceSession(workspace, environment);
		},
		[mainSurface, onNewWorkspaceSession, transitionToChatSurface],
	);

	useEffect((): (() => void) | undefined => {
		if (
			!chatSurfaceRevealPending ||
			mainSurface !== "scheduledTasks" ||
			!isHome ||
			isSessionLoading ||
			activeSessionMetadata?.temporary !== true
		) {
			return undefined;
		}

		let secondFrame: number | null = null;
		const firstFrame: number = window.requestAnimationFrame((): void => {
			secondFrame = window.requestAnimationFrame((): void => {
				setChatSurfaceRevealPending(false);
				transitionToChatSurface();
			});
		});

		return (): void => {
			window.cancelAnimationFrame(firstFrame);
			if (secondFrame !== null) window.cancelAnimationFrame(secondFrame);
		};
	}, [
		activeSessionMetadata?.temporary,
		chatSurfaceRevealPending,
		isHome,
		isSessionLoading,
		mainSurface,
		transitionToChatSurface,
	]);

	const openScheduledTaskSession = useCallback((sessionId: string): void => {
		scheduledTaskPrefillRef.current = null;
		setChatSurfaceRevealPending(false);
		void fetchSessions().then((result): void => {
			const session = result.sessions.find((candidate): boolean => candidate.id === sessionId);
			if (session !== undefined) { transitionToChatSurface(); onSessionSelect(session); }
		}).catch((): void => {});
	}, [onSessionSelect, transitionToChatSurface]);

	useEffect((): (() => void) => {
		const refresh = (): void => { void window.electronAPI.scheduledTasks.list().then((result): void => setScheduledTaskAttentionCount(result.attentionCount)); };
		refresh();
		const offChanged = window.electronAPI.scheduledTasks.onChanged(refresh);
		const offNavigate = window.electronAPI.scheduledTasks.onNavigate((target): void => {
			if (target.sessionId !== null) {
				openScheduledTaskSession(target.sessionId);
				return;
			}
			showScheduledTasksSurface();
		});
		return (): void => { offChanged(); offNavigate(); };
	}, [openScheduledTaskSession, showScheduledTasksSurface]);

	const createScheduledTask = useCallback((): void => {
		const prompt: string = t("scheduledTasks.prefill", { defaultValue: "帮我安排一个定时任务：" });
		scheduledTaskPrefillRef.current = prompt;
		void beginNewSessionSurface()
			.catch((error: unknown): void => {
				scheduledTaskPrefillRef.current = null;
				console.error("[HomePage] failed to prepare scheduled task composer", error);
			});
	}, [beginNewSessionSurface, t]);

	const workspaceSnapshotForActions: WorkspaceConfig | null =
		activeWorkspace ?? (isHome ? homeWorkspace : null);
	const workspaceForActions: WorkspaceConfig | null =
		workspaceSnapshotForActions === null
			? null
			: (workspaceOptions.find(
					(workspace: WorkspaceConfig): boolean =>
						workspace.id === workspaceSnapshotForActions.id,
				) ?? workspaceSnapshotForActions);
	const summarySessionId: string | null = isHome ? null : activeSessionId;
	const summaryScopeKey: string =
		summarySessionId ?? `workspace:${workspaceForActions?.id ?? "none"}`;
	const {
		summaryOpen,
		summaryOverview,
		isSummaryLoading,
		summaryError,
		setSummaryOpen,
		loadSummaryOverview,
		handleSummaryOpenChange,
	} = useSessionSummaryOverview({
		scopeKey: summaryScopeKey,
		sessionId: summarySessionId,
		workspace: workspaceForActions,
		previewLimit: SUMMARY_PREVIEW_LIMIT,
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
	const showGodotSummaryActions: boolean =
		workspaceForActions !== null &&
		effectiveGodotLaunchExecutablePath !== null &&
		isGodotProject;
	const workspaceSidebarOpen: boolean = visualWorkspaceSidebar.open;
	const workspaceSidebarSize: number = visualWorkspaceSidebar.size;
	const sideDockOpen: boolean = visualSessionLayout.side.open;
	const sideDockSize: number = visualSessionLayout.side.size;
	const bottomDockOpen: boolean = visualSessionLayout.bottom.open;
	const bottomDockSize: number = visualSessionLayout.bottom.size;
	const fullscreenDock: DockFullscreenPlacement | null = showDockControls
		? visualSessionLayout.fullscreenDock
		: null;
	const sideDockFullscreen: boolean =
		fullscreenDock === "side" && sideDockOpen;
	const bottomDockFullscreen: boolean =
		fullscreenDock === "bottom" && bottomDockOpen;
	const isDockFullscreen: boolean =
		sideDockFullscreen || bottomDockFullscreen;
	const activeFullscreenDock: DockFullscreenPlacement | null =
		isDockFullscreen ? fullscreenDock : null;
	const fullscreenDockLayout: DockLayoutPreferences | null =
		activeFullscreenDock === "side"
			? visualSessionLayout.side
			: activeFullscreenDock === "bottom"
				? visualSessionLayout.bottom
				: null;
	const isFullscreenBrowserPanel: boolean =
		fullscreenDockLayout?.tabs.find(
			(tab) => tab.key === fullscreenDockLayout.activeTabKey,
		)?.kind === "browser";
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

	const updateSideDock = useCallback(
		(
			nextSideLayout: DockLayoutPreferences,
			persist: boolean = true,
		): void => {
			commitSessionLayout(
				{
					...visualSessionLayoutRef.current,
					side: nextSideLayout,
				},
				persist,
			);
		},
		[commitSessionLayout],
	);

	const updateBottomDock = useCallback(
		(
			nextBottomLayout: DockLayoutPreferences,
			persist: boolean = true,
		): void => {
			commitSessionLayout(
				{
					...visualSessionLayoutRef.current,
					bottom: nextBottomLayout,
				},
				persist,
			);
		},
		[commitSessionLayout],
	);

	const updateFilePanel = useCallback(
		(
			panelKey: string,
			nextFilePanel: FilePanelLayoutPreferences | null,
		): void => {
			const nextFilePanels: Record<string, FilePanelLayoutPreferences> = {
				...visualSessionLayoutRef.current.filePanels,
			};
			if (nextFilePanel === null) {
				delete nextFilePanels[panelKey];
			} else {
				nextFilePanels[panelKey] = nextFilePanel;
			}
			commitSessionLayout({
				...visualSessionLayoutRef.current,
				filePanels: nextFilePanels,
			});
		},
		[commitSessionLayout],
	);

	const updateBrowserPanel = useCallback(
		(
			panelKey: string,
			nextBrowserPanel: BrowserPanelLayoutPreferences | null,
		): void => {
			const nextBrowserPanels: Record<
				string,
				BrowserPanelLayoutPreferences
			> = {
				...visualSessionLayoutRef.current.browserPanels,
			};
			if (nextBrowserPanel === null) {
				delete nextBrowserPanels[panelKey];
			} else {
				nextBrowserPanels[panelKey] = nextBrowserPanel;
			}
			commitSessionLayout({
				...visualSessionLayoutRef.current,
				browserPanels: nextBrowserPanels,
			});
		},
		[commitSessionLayout],
	);

	const toggleDockFullscreen = useCallback(
		(placement: DockFullscreenPlacement): void => {
			const currentPlacement: DockFullscreenPlacement | null =
				visualSessionLayoutRef.current.fullscreenDock;
			setFullscreenMotionDisabled(true);
			commitSessionLayout({
				...visualSessionLayoutRef.current,
				fullscreenDock:
					currentPlacement === placement ? null : placement,
			});
			window.requestAnimationFrame((): void => {
				setFullscreenMotionDisabled(false);
			});
		},
		[commitSessionLayout],
	);

	useLayoutEffect((): void => {
		const previous = previousSessionLayoutRef.current;
		if (previous.sessionId !== activeSessionId) {
			for (const terminalId of listTerminalRuntimeIds(
				previous.sessionId,
				previous.layout,
			)) {
				void window.electronAPI.terminal
					.kill({ terminalId })
					.catch((error: unknown): void => {
						console.error(
							"[HomePage] failed to stop previous session terminal",
							error,
						);
					});
			}
		}
		previousSessionLayoutRef.current = {
			sessionId: activeSessionId,
			layout: sessionLayout,
		};
	}, [activeSessionId, sessionLayout]);

	const filteredGodotSceneFiles: GodotSceneFile[] =
		useMemo((): GodotSceneFile[] => {
			const query: string = godotSceneSearch.trim().toLowerCase();
			if (query.length === 0) {
				return godotSceneFiles;
			}
			return godotSceneFiles.filter((scene: GodotSceneFile): boolean => {
				return (
					scene.relativePath.toLowerCase().includes(query) ||
					scene.name.toLowerCase().includes(query)
				);
			});
		}, [godotSceneFiles, godotSceneSearch]);
	const selectedLaunchTarget: WorkspaceLaunchTarget =
		useMemo((): WorkspaceLaunchTarget => {
			return (
				workspaceLaunchTargets.find(
					(target: WorkspaceLaunchTarget): boolean =>
						target.id === selectedLaunchTargetId,
				) ??
				workspaceLaunchTargets[0] ??
				FALLBACK_WORKSPACE_LAUNCH_TARGETS[0]!
			);
		}, [selectedLaunchTargetId, workspaceLaunchTargets]);
	const workspaceLaunchMenuItems: MenuProps["items"] =
		useMemo((): MenuProps["items"] => {
			return workspaceLaunchTargets.map(
				(target: WorkspaceLaunchTarget) => {
					return {
						key: target.id,
						label: target.label,
						icon: getWorkspaceLaunchIcon(target.id),
					};
				},
			);
		}, [workspaceLaunchTargets]);
	const openSummaryDiffReview = useCallback((): void => {
		setSummaryOpen(false);
		if (workspaceForActions === null) {
			return;
		}

		sideDockProgrammaticOpenUntilRef.current =
			performance.now() + SIDE_DOCK_PROGRAMMATIC_OPEN_GUARD_MS;
		dockActivationRequestIdRef.current += 1;
		setSideDockActivationRequest({
			id: dockActivationRequestIdRef.current,
			kind: "review",
		});
		updateSideDock({ ...visualSessionLayoutRef.current.side, open: true });
	}, [updateSideDock, workspaceForActions]);
	useEffect((): (() => void) | void => {
		if (!showWorkspaceLaunchControls) {
			return;
		}

		let cancelled: boolean = false;
		window.electronAPI.workspaceFs
			.listLaunchTargets({
				godotExecutablePath: effectiveGodotLaunchExecutablePath,
			})
			.then((targets: WorkspaceLaunchTarget[]): void => {
				if (cancelled) {
					return;
				}

				const nextTargets: WorkspaceLaunchTarget[] =
					targets.length > 0
						? targets
						: FALLBACK_WORKSPACE_LAUNCH_TARGETS;
				const preferredTargetId: WorkspaceLaunchTargetId =
					workspaceLaunchPreference;
				const fallbackTargetId: WorkspaceLaunchTargetId =
					nextTargets.find(
						(target: WorkspaceLaunchTarget): boolean =>
							target.id === DEFAULT_WORKSPACE_LAUNCH_TARGET_ID,
					)?.id ?? DEFAULT_WORKSPACE_LAUNCH_TARGET_ID;
				const resolvedTargetId: WorkspaceLaunchTargetId =
					nextTargets.some(
						(target: WorkspaceLaunchTarget): boolean =>
							target.id === preferredTargetId,
					)
						? preferredTargetId
						: fallbackTargetId;
				setWorkspaceLaunchTargets(nextTargets);
				setSelectedLaunchTargetId(resolvedTargetId);
				if (
					activeSessionMetadata?.workspaceLaunch !== undefined &&
					activeSessionMetadata.workspaceLaunch !== resolvedTargetId
				) {
					onWorkspaceLaunchChange(resolvedTargetId);
				}
			})
			.catch((error: unknown): void => {
				console.error(
					"[HomePage] failed to list workspace launch targets",
					error,
				);
				if (!cancelled) {
					setWorkspaceLaunchTargets(
						FALLBACK_WORKSPACE_LAUNCH_TARGETS,
					);
					setSelectedLaunchTargetId(
						DEFAULT_WORKSPACE_LAUNCH_TARGET_ID,
					);
					if (
						activeSessionMetadata?.workspaceLaunch !== undefined &&
						activeSessionMetadata.workspaceLaunch !==
							DEFAULT_WORKSPACE_LAUNCH_TARGET_ID
					) {
						onWorkspaceLaunchChange(
							DEFAULT_WORKSPACE_LAUNCH_TARGET_ID,
						);
					}
				}
			});

		return (): void => {
			cancelled = true;
		};
	}, [
		activeSessionMetadata?.workspaceLaunch,
		effectiveGodotLaunchExecutablePath,
		onWorkspaceLaunchChange,
		showWorkspaceLaunchControls,
		workspaceLaunchPreference,
	]);

	useEffect((): (() => void) | void => {
		if (
			workspaceForActions === null ||
			effectiveGodotLaunchExecutablePath === null
		) {
			setIsGodotProject(false);
			return;
		}

		let cancelled: boolean = false;
		window.electronAPI.workspaceFs
			.listChildren({
				workspaceRoot: workspaceForActions.rootPath,
				relativePath: "",
			})
			.then((result): void => {
				if (cancelled) {
					return;
				}
				setIsGodotProject(
					result.entries.some(
						(entry): boolean =>
							entry.kind === "file" &&
							entry.name === "project.godot",
					),
				);
			})
			.catch((error: unknown): void => {
				console.error(
					"[HomePage] failed to detect Godot project",
					error,
				);
				if (!cancelled) {
					setIsGodotProject(false);
				}
			});

		return (): void => {
			cancelled = true;
		};
	}, [effectiveGodotLaunchExecutablePath, workspaceForActions]);

	useEffect((): void => {
		setSummaryGitSourceFolderId(null);
		setSummaryGitActionRequest(null);
		setPlansModalOpen(false);
		setPlansDialogOverview(null);
		setIsPlansDialogLoading(false);
		setPlansDialogError(null);
		setSourcesModalOpen(false);
		setSourcesDialogOverview(null);
		setIsSourcesDialogLoading(false);
		setSourcesDialogError(null);
		setIsGodotSceneModalOpen(false);
		setGodotSceneSearch("");
		setPreviewSource(null);
		setPreviewPlan(null);
		setIsPlanPreviewLoading(false);
		setPlanPreviewError(null);
		planPreviewRequestIdRef.current += 1;
	}, [summaryScopeKey]);

	useEffect((): (() => void) | void => {
		if (!plansModalOpen || activeSessionId === null) {
			return;
		}

		let cancelled: boolean = false;
		setIsPlansDialogLoading(true);
		setPlansDialogError(null);
		const frameId: number = window.requestAnimationFrame((): void => {
			void fetchSessionOverview({
				sessionId: activeSessionId,
				planLimit: SUMMARY_SEE_MORE_LIMIT,
				sourceLimit: 0,
				includePlanPreviews: false,
				includeSourceImages: false,
			})
				.then((result: SessionOverviewResult): void => {
					if (!cancelled) {
						setPlansDialogOverview(result);
					}
				})
				.catch((error: unknown): void => {
					if (!cancelled) {
						console.error(
							"[HomePage] failed to load session plans",
							error,
						);
						setPlansDialogError(
							error instanceof Error
								? error.message
								: t("agentPage.summary.errors.load"),
						);
					}
				})
				.finally((): void => {
					if (!cancelled) {
						setIsPlansDialogLoading(false);
					}
				});
		});

		return (): void => {
			cancelled = true;
			window.cancelAnimationFrame(frameId);
		};
	}, [activeSessionId, plansModalOpen, t]);

	useEffect((): (() => void) | void => {
		if (!sourcesModalOpen || activeSessionId === null) {
			return;
		}

		let cancelled: boolean = false;
		setIsSourcesDialogLoading(true);
		setSourcesDialogError(null);
		const frameId: number = window.requestAnimationFrame((): void => {
			void fetchSessionOverview({
				sessionId: activeSessionId,
				planLimit: 0,
				sourceLimit: SUMMARY_SEE_MORE_LIMIT,
				includeSourceImages: false,
			})
				.then((result: SessionOverviewResult): void => {
					if (!cancelled) {
						setSourcesDialogOverview(result);
					}
				})
				.catch((error: unknown): void => {
					if (!cancelled) {
						console.error(
							"[HomePage] failed to load session sources",
							error,
						);
						setSourcesDialogError(
							error instanceof Error
								? error.message
								: t("agentPage.summary.errors.load"),
						);
					}
				})
				.finally((): void => {
					if (!cancelled) {
						setIsSourcesDialogLoading(false);
					}
				});
		});

		return (): void => {
			cancelled = true;
			window.cancelAnimationFrame(frameId);
		};
	}, [activeSessionId, sourcesModalOpen, t]);

	const handleDockGitStateChange = useCallback(async (): Promise<void> => {
		setGitStateRevision((current: number): number => current + 1);
		onWorkspaceRefresh();
		await loadSummaryOverview();
	}, [loadSummaryOverview, onWorkspaceRefresh]);
	const handleGitReviewSourceFolderChange = useCallback(
		(sourceFolderId: string | null): void => {
			setSummaryGitSourceFolderId(sourceFolderId);
			setSummaryGitActionRequest(
				(
					current: SummaryGitActionRequest | null,
				): SummaryGitActionRequest | null =>
					current !== null &&
					current.sourceFolderId !== sourceFolderId
						? null
						: current,
			);
		},
		[],
	);

	const gitActions = useGitActionDialogController({
		workspaceId: workspaceForActions?.id ?? null,
		sourceFolderId: summaryGitSourceFolderId,
		resetKey: summaryScopeKey,
		onBeforeCommitOpen: (): void => {
			setSummaryOpen(false);
		},
		onBeforeBranchOpen: (): void => {
			setSummaryOpen(false);
		},
		onCommitSuccess: handleDockGitStateChange,
		onBranchSuccess: handleDockGitStateChange,
	});

	const requestSummaryGitAction = useCallback(
		(sourceFolderId: string, action: SummaryGitAction): void => {
			setSummaryOpen(false);
			setSummaryGitSourceFolderId(sourceFolderId);
			summaryGitActionRequestIdRef.current += 1;
			setSummaryGitActionRequest({
				id: summaryGitActionRequestIdRef.current,
				action,
				sourceFolderId,
			});
		},
		[],
	);

	useEffect((): void => {
		if (
			summaryGitActionRequest === null ||
			summaryGitActionRequest.sourceFolderId !== summaryGitSourceFolderId
		) {
			return;
		}
		if (summaryGitActionRequest.action === "diff") {
			openSummaryDiffReview();
		} else if (summaryGitActionRequest.action === "branch") {
			gitActions.openBranchDialog();
		} else {
			gitActions.openCommitDialog();
		}
		setSummaryGitActionRequest(null);
	}, [
		gitActions.openBranchDialog,
		gitActions.openCommitDialog,
		openSummaryDiffReview,
		summaryGitActionRequest,
		summaryGitSourceFolderId,
	]);

	const summaryEnvInfos: SessionOverviewGitInfo[] =
		useMemo((): SessionOverviewGitInfo[] => {
			if (summaryOverview === null) {
				return [];
			}
			if ((summaryOverview.envInfos?.length ?? 0) > 0) {
				return summaryOverview.envInfos ?? [];
			}
			if (summaryOverview.envInfo === null) {
				return [];
			}
			const fallbackSource =
				workspaceForActions?.sourceFolders.find(
					(source): boolean =>
						source.path ===
						summaryOverview.envInfo?.sourceFolderPath,
				) ??
				workspaceForActions?.sourceFolders.find(
					(source): boolean =>
						source.id === workspaceForActions.primarySourceFolderId,
				) ??
				workspaceForActions?.sourceFolders[0];
			const sourceFolderPath: string =
				summaryOverview.envInfo.sourceFolderPath ||
				fallbackSource?.path ||
				workspaceForActions?.rootPath ||
				"";
			return [
				{
					...summaryOverview.envInfo,
					sourceFolderId:
						summaryOverview.envInfo.sourceFolderId ||
						fallbackSource?.id ||
						"primary",
					sourceFolderPath,
					title:
						summaryOverview.envInfo.title ||
						getPathBasename(sourceFolderPath),
				},
			];
		}, [summaryOverview, workspaceForActions]);

	const loadGodotSceneFiles = useCallback(async (): Promise<void> => {
		if (workspaceForActions === null) {
			setGodotSceneFiles([]);
			return;
		}

		const workspaceRoot: string = workspaceForActions.rootPath;
		setIsGodotSceneLoading(true);
		try {
			const scenes: GodotSceneFile[] = [];
			async function scan(relativePath: string): Promise<void> {
				if (scenes.length >= MAX_GODOT_SCENE_FILES) {
					return;
				}

				const result =
					await window.electronAPI.workspaceFs.listChildren({
						workspaceRoot,
						relativePath,
					});
				const entries = [...result.entries].sort(
					(left, right): number => {
						if (left.kind !== right.kind) {
							return left.kind === "folder" ? -1 : 1;
						}
						return left.relativePath.localeCompare(
							right.relativePath,
						);
					},
				);

				for (const entry of entries) {
					if (scenes.length >= MAX_GODOT_SCENE_FILES) {
						return;
					}
					if (entry.kind === "folder") {
						if (entry.name === ".godot") {
							continue;
						}
						await scan(entry.relativePath);
						continue;
					}
					if (isGodotScenePath(entry.relativePath)) {
						scenes.push({
							name: entry.name,
							relativePath: entry.relativePath,
							resourcePath: entry.resourcePath,
						});
					}
				}
			}

			await scan("");
			setGodotSceneFiles(scenes);
		} catch (error: unknown) {
			const message: string =
				error instanceof Error
					? error.message
					: t("agentPage.summary.godot.errors.loadScenes");
			console.error("[HomePage] failed to load Godot scenes", error);
			void messageApi.error(message);
			setGodotSceneFiles([]);
		} finally {
			setIsGodotSceneLoading(false);
		}
	}, [messageApi, t, workspaceForActions]);

	const openGodotSceneModal = useCallback((): void => {
		setSummaryOpen(false);
		setGodotSceneSearch("");
		setIsGodotSceneModalOpen(true);
		void loadGodotSceneFiles();
	}, [loadGodotSceneFiles]);

	const runGodotProject = useCallback((): void => {
		setSummaryOpen(false);
		void openWorkspaceLaunchTarget("godot", { godotRunMode: "project" });
	}, [openWorkspaceLaunchTarget]);

	const runGodotScene = useCallback(
		(scene: GodotSceneFile): void => {
			setIsGodotSceneModalOpen(false);
			void openWorkspaceLaunchTarget("godot", {
				godotRunMode: "scene",
				godotScenePath: scene.relativePath,
			});
		},
		[openWorkspaceLaunchTarget],
	);

	const summaryCollapseItems: NonNullable<CollapseProps["items"]> =
		useMemo((): NonNullable<CollapseProps["items"]> => {
			if (summaryOverview === null) {
				return [];
			}

			const items: NonNullable<CollapseProps["items"]> = [];
			for (const envInfo of summaryEnvInfos) {
				const hasDiff: boolean = envInfo.changedFiles > 0;
				const hasDiffStats: boolean =
					envInfo.additions > 0 || envInfo.deletions > 0;
				items.push({
					key: `env_info:${envInfo.sourceFolderId}`,
					label: (
						<Tooltip title={envInfo.sourceFolderPath}>
							{envInfo.title}
						</Tooltip>
					),
					children: (
						<div className={styles.summarySection}>
							<Button
								type="text"
								block
								icon={<Icon name="git-diff" />}
								className={styles.summaryActionButton}
								onClick={(): void =>
									requestSummaryGitAction(
										envInfo.sourceFolderId,
										"diff",
									)
								}
							>
								<span className={styles.diffRow}>
									<span className={styles.diffLabel}>
										{t("agentPage.summary.actions.diff")}
									</span>
									{hasDiffStats ? (
										<>
											<span className={styles.additions}>
												{`+${envInfo.additions}`}
											</span>
											<span className={styles.deletions}>
												{`-${envInfo.deletions}`}
											</span>
										</>
									) : null}
								</span>
							</Button>
							<Button
								type="text"
								block
								icon={<Icon name="git-branch" />}
								className={styles.summaryActionButton}
								onClick={(): void => {
									requestSummaryGitAction(
										envInfo.sourceFolderId,
										"branch",
									);
								}}
							>
								{envInfo.branch ??
									t("agentPage.summary.detachedHead")}
							</Button>
							<Button
								type="text"
								block
								disabled={!hasDiff}
								aria-busy={gitActions.isCommitMessageGenerating}
								icon={
									gitActions.isCommitMessageGenerating ? (
										<Spin size="small" />
									) : (
										<Icon name="git-commit" />
									)
								}
								className={styles.summaryActionButton}
								onClick={(): void => {
									requestSummaryGitAction(
										envInfo.sourceFolderId,
										"commit",
									);
								}}
							>
								{t("agentPage.summary.actions.commitOrPush")}
							</Button>
						</div>
					),
					showArrow: false,
				});
			}

			if (showGodotSummaryActions) {
				items.push({
					key: "godot",
					label: t("agentPage.summary.sections.godot"),
					children: (
						<div className={styles.summarySection}>
							<Button
								type="text"
								block
								icon={<Icon name="play" />}
								className={styles.summaryActionButton}
								onClick={runGodotProject}
							>
								{t("agentPage.summary.godot.runProject")}
							</Button>
							<Button
								type="text"
								block
								icon={<Icon name="scene" />}
								className={styles.summaryActionButton}
								onClick={openGodotSceneModal}
							>
								{t("agentPage.summary.godot.runScene")}
							</Button>
						</div>
					),
					showArrow: false,
				});
			}

			if (summaryOverview.plans.total > 0) {
				items.push({
					key: "plans",
					label: t("agentPage.summary.sections.plans"),
					children: (
						<div className={styles.planList}>
							{summaryOverview.plans.items
								.slice(0, SUMMARY_PREVIEW_LIMIT)
								.map(
									(
										plan: SessionOverviewPlanItem,
									): React.ReactNode => (
										<Button
											key={plan.planId}
											type="text"
											block
											className={
												styles.summaryActionButton
											}
											onClick={(): void => {
												setSummaryOpen(false);
												setPreviewPlan(plan);
											}}
										>
											{plan.title}
										</Button>
									),
								)}
							{summaryOverview.plans.total >
							SUMMARY_PREVIEW_LIMIT ? (
								<Button
									type="text"
									block
									icon={<Icon name="external-link" />}
									className={styles.summaryActionButton}
									onClick={(): void => {
										void openPlansModal();
									}}
								>
									{t("agentPage.summary.actions.seeMore")}
								</Button>
							) : null}
						</div>
					),
					showArrow: false,
				});
			}

			if (summaryOverview.sources.total > 0) {
				items.push({
					key: "source",
					label: t("agentPage.summary.sections.source"),
					children: (
						<div className={styles.sourceList}>
							{summaryOverview.sources.items
								.slice(0, SUMMARY_PREVIEW_LIMIT)
								.map(
									(
										source: SessionOverviewSourceItem,
									): React.ReactNode => (
										<Button
											key={`${source.kind}:${source.id}`}
											type="text"
											block
											className={styles.sourceButton}
											icon={
												source.thumbnailDataUrl !==
												undefined ? (
													<img
														src={
															source.thumbnailDataUrl
														}
														alt=""
														className={
															styles.sourceThumbnail
														}
													/>
												) : (
													<Icon
														name="txt"
														className={
															styles.sourceTextIcon
														}
													/>
												)
											}
											onClick={(): void => {
												setSummaryOpen(false);
												setPreviewSource(source);
											}}
										>
											<span className={styles.sourceText}>
												<span
													className={
														styles.summaryItemTitle
													}
												>
													{source.title}
												</span>
												<span
													className={
														styles.summaryMeta
													}
												>
													{formatSourceSubtitle(
														source,
														t,
													)}
												</span>
											</span>
										</Button>
									),
								)}
							{summaryOverview.sources.total >
							SUMMARY_PREVIEW_LIMIT ? (
								<Button
									type="text"
									block
									icon={<Icon name="external-link" />}
									className={styles.summaryActionButton}
									onClick={(): void => {
										void openSourcesModal();
									}}
								>
									{t("agentPage.summary.actions.seeMore")}
								</Button>
							) : null}
						</div>
					),
					showArrow: false,
				});
			}

			return items;
		}, [
			gitActions.isCommitMessageGenerating,
			openGodotSceneModal,
			requestSummaryGitAction,
			runGodotProject,
			showGodotSummaryActions,
			summaryEnvInfos,
			summaryOverview,
			t,
		]);

	function openPlansModal(): void {
		setSummaryOpen(false);
		setPlansDialogOverview(summaryOverview);
		setPlansDialogError(null);
		setPlansModalOpen(true);
	}

	function openPlanPreview(plan: SessionOverviewPlanItem): void {
		const requestId: number = ++planPreviewRequestIdRef.current;
		setPreviewPlan(plan);
		setPlanPreviewError(null);
		if (plan.previewMarkdown.trim().length > 0) {
			setIsPlanPreviewLoading(false);
			return;
		}
		if (activeSessionId === null) {
			setIsPlanPreviewLoading(false);
			setPlanPreviewError(t("agentPage.summary.errors.load"));
			return;
		}

		setIsPlanPreviewLoading(true);
		void getPlan(plan.planId, activeSessionId)
			.then((result: PlanResult): void => {
				if (requestId !== planPreviewRequestIdRef.current) {
					return;
				}
				setPreviewPlan({
					...plan,
					title: result.title || plan.title,
					status: result.status,
					updatedAt: result.updatedAt,
					previewMarkdown:
						result.previewMarkdown || result.markdown || "",
				});
			})
			.catch((error: unknown): void => {
				if (requestId === planPreviewRequestIdRef.current) {
					console.error(
						"[HomePage] failed to load plan preview",
						error,
					);
					setPlanPreviewError(
						error instanceof Error
							? error.message
							: t("agentPage.summary.errors.load"),
					);
				}
			})
			.finally((): void => {
				if (requestId === planPreviewRequestIdRef.current) {
					setIsPlanPreviewLoading(false);
				}
			});
	}

	function openSourcesModal(): void {
		setSummaryOpen(false);
		setSourcesDialogOverview(summaryOverview);
		setSourcesDialogError(null);
		setSourcesModalOpen(true);
	}

	async function openWorkspaceLaunchTarget(
		targetId: WorkspaceLaunchTargetId,
		options: {
			godotRunMode?: "editor" | "project" | "scene";
			godotScenePath?: string;
		} = {},
	): Promise<void> {
		if (workspaceForActions === null) {
			return;
		}

		setSelectedLaunchTargetId(targetId);
		onWorkspaceLaunchChange(targetId);
		setIsOpeningLaunchTarget(true);
		try {
			await window.electronAPI.workspaceFs.openLaunchTarget({
				workspaceRoot: workspaceForActions.rootPath,
				targetId,
				godotExecutablePath:
					targetId === "godot"
						? effectiveGodotLaunchExecutablePath
						: undefined,
				godotRunMode:
					targetId === "godot" ? options.godotRunMode : undefined,
				godotScenePath:
					targetId === "godot" ? options.godotScenePath : undefined,
			});
		} catch (error: unknown) {
			const message: string =
				error instanceof Error
					? error.message
					: t("agentPage.workspaceLaunch.errors.open");
			console.error(
				"[HomePage] failed to open workspace launch target",
				error,
			);
			void messageApi.error(message);
		} finally {
			setIsOpeningLaunchTarget(false);
		}
	}

	const handleWorkspaceLaunchMenuClick: MenuProps["onClick"] = ({
		key,
	}): void => {
		const targetId: string = String(key);
		if (!isWorkspaceLaunchTargetId(targetId)) {
			return;
		}

		void openWorkspaceLaunchTarget(targetId);
	};

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

	const requestSideDockKind = useCallback((kind: DockPanelKind): void => {
		dockActivationRequestIdRef.current += 1;
		setSideDockActivationRequest({
			id: dockActivationRequestIdRef.current,
			kind,
		});
	}, []);

	const openSideDock = useCallback(
		(kind?: DockPanelKind): void => {
			sideDockProgrammaticOpenUntilRef.current =
				performance.now() + SIDE_DOCK_PROGRAMMATIC_OPEN_GUARD_MS;
			const currentSideLayout: DockLayoutPreferences =
				visualSessionLayoutRef.current.side;
			const defaultKind: DockPanelKind =
				kind ?? (workspaceForActions === null ? "browser" : "review");
			commitSessionLayout({
				...visualSessionLayoutRef.current,
				side: {
					...ensureDockTab(currentSideLayout, "side", defaultKind),
					open: true,
				},
			});
			if (kind !== undefined) {
				requestSideDockKind(kind);
			}
		},
		[commitSessionLayout, requestSideDockKind, workspaceForActions],
	);

	const closeSideDock = useCallback((): void => {
		sideDockProgrammaticOpenUntilRef.current = 0;
		commitSessionLayout({
			...visualSessionLayoutRef.current,
			fullscreenDock:
				visualSessionLayoutRef.current.fullscreenDock === "side"
					? null
					: visualSessionLayoutRef.current.fullscreenDock,
			side: { ...visualSessionLayoutRef.current.side, open: false },
		});
	}, [commitSessionLayout]);

	const toggleSideDock = useCallback((): void => {
		if (sideDockOpen) {
			closeSideDock();
			return;
		}
		openSideDock();
	}, [closeSideDock, openSideDock, sideDockOpen]);

	const openReviewPanel = useCallback((): void => {
		if (workspaceForActions === null) {
			return;
		}
		openSideDock("review");
	}, [openSideDock, workspaceForActions]);

	const openBottomDock = useCallback((): void => {
		const currentBottomLayout: DockLayoutPreferences =
			visualSessionLayoutRef.current.bottom;
		commitSessionLayout({
			...visualSessionLayoutRef.current,
			bottom: {
				...ensureDockTab(currentBottomLayout, "bottom", "terminal"),
				open: true,
			},
		});
	}, [commitSessionLayout]);

	const closeBottomDock = useCallback((): void => {
		commitSessionLayout({
			...visualSessionLayoutRef.current,
			fullscreenDock:
				visualSessionLayoutRef.current.fullscreenDock === "bottom"
					? null
					: visualSessionLayoutRef.current.fullscreenDock,
			bottom: { ...visualSessionLayoutRef.current.bottom, open: false },
		});
	}, [commitSessionLayout]);

	const toggleBottomDock = useCallback((): void => {
		if (bottomDockOpen) {
			closeBottomDock();
			return;
		}
		openBottomDock();
	}, [bottomDockOpen, closeBottomDock, openBottomDock]);

	const ensureBrowserRuntime = useCallback(
		async (sessionId: string): Promise<BrowserRuntimeRegistration> => {
			const registered: BrowserRuntimeRegistration | null =
				findBrowserRuntime(sessionId);
			if (registered !== null) {
				const current: SessionLayoutPreferences =
					visualSessionLayoutRef.current;
				const targetLayout: DockLayoutPreferences =
					registered.placement === "side"
						? current.side
						: current.bottom;
				commitSessionLayout({
					...current,
					[registered.placement]: {
						...targetLayout,
						open: true,
						activeTabKey: registered.panelKey,
					},
				});
				return registered;
			}

			const current: SessionLayoutPreferences =
				visualSessionLayoutRef.current;
			const sideTab = current.side.tabs.find(
				(tab): boolean => tab.kind === "browser",
			);
			const bottomTab = current.bottom.tabs.find(
				(tab): boolean => tab.kind === "browser",
			);
			if (sideTab !== undefined || bottomTab !== undefined) {
				const placement =
					sideTab !== undefined
						? ("side" as const)
						: ("bottom" as const);
				const tab = sideTab ?? bottomTab!;
				const targetLayout: DockLayoutPreferences =
					placement === "side" ? current.side : current.bottom;
				commitSessionLayout({
					...current,
					[placement]: {
						...targetLayout,
						open: true,
						activeTabKey: tab.key,
					},
				});
				return await waitForBrowserRuntime(sessionId);
			}

			const tab = createDockTab("side", "browser", 1);
			commitSessionLayout({
				...current,
				side: {
					...current.side,
					open: true,
					tabs: [...current.side.tabs, tab],
					activeTabKey: tab.key,
				},
				browserPanels: {
					...current.browserPanels,
					[tab.key]: createDefaultBrowserPanelLayout(),
				},
			});
			return await waitForBrowserRuntime(sessionId);
		},
		[commitSessionLayout],
	);

	const openMessageWebUrl = useCallback(
		(url: string): void => {
			const rawUrl: string = url.trim();
			let parsed: URL;
			try {
				parsed = new URL(rawUrl);
			} catch {
				return;
			}
			if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
				return;
			}

			const preferences = getCachedClientPreferences();
			if (preferences.webLinkOpenMode === "external" || activeSessionId === null) {
				void window.electronAPI.windowControl.openExternal(rawUrl);
				return;
			}

			void ensureBrowserRuntime(activeSessionId)
				.then((runtime: BrowserRuntimeRegistration): Promise<unknown> =>
					window.electronAPI.browser.view.navigate(runtime.browserId, rawUrl),
				)
				.catch((error: unknown): void => {
					console.error("[HomePage] failed to open web link in integrated browser", error);
					messageApi.error(t("chat.markdownResource.openWebLinkFailed"));
				});
		},
		[activeSessionId, ensureBrowserRuntime, messageApi, t],
	);

	const openMessageHtmlFile = useCallback(
		(params: { workspaceRoot: string; filePath: string }): void => {
			const preferences = getCachedClientPreferences();
			if (preferences.webLinkOpenMode === "external" || activeSessionId === null) {
				void window.electronAPI.workspaceFs.openFile(params).catch((error: unknown): void => {
					console.error("[HomePage] failed to open HTML file externally", error);
					messageApi.error(t("chat.markdownResource.openWebLinkFailed"));
				});
				return;
			}

			void ensureBrowserRuntime(activeSessionId)
				.then((runtime: BrowserRuntimeRegistration): Promise<unknown> =>
					window.electronAPI.browser.view.openFile(runtime.browserId, params),
				)
				.catch((error: unknown): void => {
					console.error("[HomePage] failed to open HTML file in integrated browser", error);
					messageApi.error(t("chat.markdownResource.openWebLinkFailed"));
				});
		},
		[activeSessionId, ensureBrowserRuntime, messageApi, t],
	);

	const activeBrowserCallsRef = useRef<Map<string, string>>(new Map());
	useEffect((): (() => void) => {
		let disposed: boolean = false;
		let removeListener: (() => void) | null = null;
		void createBackendClient()
			.then((client): void => {
				if (disposed) return;
				removeListener = client.addEventListener(
					(event: BackendEvent): void => {
						if (event.event === "browser.tool.cancel") {
							const data = event.data as
								| { callId?: unknown }
								| undefined;
							if (typeof data?.callId !== "string") return;
							const browserId: string | undefined =
								activeBrowserCallsRef.current.get(data.callId);
							if (browserId !== undefined)
								void window.electronAPI.browser.automation.cancel(
									browserId,
									data.callId,
								);
							return;
						}
						if (event.event !== "browser.tool.request") return;
						const data = event.data as
							| {
									callId?: unknown;
									sessionId?: unknown;
									toolName?: unknown;
									args?: unknown;
							  }
							| undefined;
						if (
							typeof data?.callId !== "string" ||
							typeof data.sessionId !== "string" ||
							typeof data.toolName !== "string" ||
							data.args === null ||
							typeof data.args !== "object" ||
							Array.isArray(data.args)
						)
							return;
						const callId: string = data.callId;
						const requestSessionId: string = data.sessionId;
						const toolName: string = data.toolName;
						const args: Record<string, unknown> =
							data.args as Record<string, unknown>;
						void (async (): Promise<void> => {
							if (requestSessionId !== activeSessionId)
								throw new Error("browser_session_not_active");
							const runtime: BrowserRuntimeRegistration =
								await ensureBrowserRuntime(requestSessionId);
							activeBrowserCallsRef.current.set(
								callId,
								runtime.browserId,
							);
							try {
								const result =
									await window.electronAPI.browser.automation.execute(
										{
											browserId: runtime.browserId,
											callId,
											toolName,
											args,
										},
									);
								await client.request("browser.tool.result", {
									callId,
									ok: true,
									result,
								});
							} finally {
								activeBrowserCallsRef.current.delete(callId);
							}
						})().catch((error: unknown): void => {
							const message: string =
								error instanceof Error
									? error.message
									: String(error);
							void client
								.request("browser.tool.result", {
									callId,
									ok: false,
									error: {
										code:
											message.match(
												/browser_[a-z_]+/u,
											)?.[0] ?? "browser_tool_failed",
										message,
										retryable:
											/busy|timeout|unavailable/u.test(
												message,
											),
									},
								})
								.catch((): void => {});
						});
					},
				);
			})
			.catch((error: unknown): void => {
				console.error(
					"[HomePage] failed to attach browser tool runtime",
					error,
				);
			});
		return (): void => {
			disposed = true;
			removeListener?.();
		};
	}, [activeSessionId, ensureBrowserRuntime]);

	const toggleWorkspaceSidebar = useCallback((): void => {
		scheduleWorkspaceSidebarSave({
			...visualWorkspaceSidebarRef.current,
			open: !visualWorkspaceSidebarRef.current.open,
		});
	}, [scheduleWorkspaceSidebarSave]);

	useEffect((): (() => void) => {
		const platform: ShortcutPlatform = detectShortcutPlatform();
		const handleGlobalShortcut = (event: KeyboardEvent): void => {
			if (event.defaultPrevented) {
				return;
			}
			if (
				event.key === "Escape" &&
				conversationTimelinePaneRef.current?.closeSearch() === true
			) {
				event.preventDefault();
				return;
			}
			if (shouldIgnoreGlobalShortcut(event)) {
				return;
			}
			const commandId: ShortcutCommandId | null =
				findMatchingShortcutCommand(event, keyboardShortcuts, platform);
			if (commandId === null || event.repeat) {
				return;
			}
			if (commandId === "workbench.toggleWorkspaceSidebar") {
				event.preventDefault();
				toggleWorkspaceSidebar();
				return;
			}
			if (commandId === "workbench.toggleBottomPanel") {
				if (!showBottomDockButton) {
					return;
				}
				event.preventDefault();
				toggleBottomDock();
				return;
			}
			if (commandId === "workbench.toggleSessionSidebar") {
				if (activeSessionId === null || !showSideDockButton) {
					return;
				}
				event.preventDefault();
				toggleSideDock();
				return;
			}
			if (commandId === "session.new") {
				event.preventDefault();
				requestNewSessionSurface();
				return;
			}
			if (
				commandId === "session.previous" ||
				commandId === "session.next"
			) {
				event.preventDefault();
				const sessionId: string | null = navigateSessionHistory(
					commandId === "session.previous" ? "back" : "forward",
				);
				if (sessionId === null) {
					return;
				}
				window.dispatchEvent(
					new CustomEvent<string>(SESSION_NAVIGATION_EVENT, {
						detail: sessionId,
					}),
				);
				return;
			}
			if (activeSessionId === null || isHome) {
				return;
			}
			if (commandId === "conversation.find") {
				event.preventDefault();
				conversationTimelinePaneRef.current?.openSearch(
					getSelectedConversationSearchQuery(chatBodyRef.current),
				);
				return;
			}
			if (timelineNavigationEntries.length === 0) {
				return;
			}
			event.preventDefault();
			conversationTimelinePaneRef.current?.navigateTurn(
				commandId === "conversation.previousTurn" ? "previous" : "next",
			);
		};
		window.addEventListener("keydown", handleGlobalShortcut);
		return (): void => {
			window.removeEventListener("keydown", handleGlobalShortcut);
		};
	}, [
		activeSessionId,
		isHome,
		keyboardShortcuts,
		showBottomDockButton,
		showSideDockButton,
		timelineNavigationEntries.length,
		requestNewSessionSurface,
		toggleBottomDock,
		toggleSideDock,
		toggleWorkspaceSidebar,
	]);

	function handleWorkspaceSidebarResize(sizes: number[]): void {
		const nextSize: number | undefined = sizes[0];
		if (nextSize === undefined || !Number.isFinite(nextSize)) {
			return;
		}

		const normalizedSize: number = Math.min(
			WORKSPACE_SIDEBAR_MAX_SIZE,
			Math.max(WORKSPACE_SIDEBAR_CLOSED_SIZE, Math.trunc(nextSize)),
		);
		if (normalizedSize < WORKSPACE_SIDEBAR_CLOSE_THRESHOLD) {
			applyVisualWorkspaceSidebar({
				...visualWorkspaceSidebarRef.current,
				open: false,
			});
			return;
		}

		applyVisualWorkspaceSidebar({
			open: true,
			size: normalizedSize,
		});
	}

	function handleWorkspaceSidebarResizeEnd(sizes: number[]): void {
		const nextSize: number | undefined = sizes[0];
		if (nextSize === undefined || !Number.isFinite(nextSize)) {
			return;
		}
		if (nextSize < WORKSPACE_SIDEBAR_CLOSE_THRESHOLD) {
			commitWorkspaceSidebar({
				...visualWorkspaceSidebarRef.current,
				open: false,
			});
			return;
		}

		commitWorkspaceSidebar({
			open: true,
			size: Math.min(
				WORKSPACE_SIDEBAR_MAX_SIZE,
				Math.max(
					WORKSPACE_SIDEBAR_CLOSE_THRESHOLD,
					Math.trunc(nextSize),
				),
			),
		});
	}

	function handleSideDockResize(sizes: number[]): void {
		const nextSize: number | undefined = sizes[1];
		if (nextSize === undefined || !Number.isFinite(nextSize)) {
			return;
		}

		const normalizedSize: number = Math.min(
			SIDE_DOCK_MAX_SIZE,
			Math.max(SIDE_DOCK_CLOSED_SIZE, Math.trunc(nextSize)),
		);
		if (normalizedSize < SIDE_DOCK_CLOSE_THRESHOLD) {
			if (performance.now() < sideDockProgrammaticOpenUntilRef.current) {
				return;
			}
			applyVisualSessionLayout({
				...visualSessionLayoutRef.current,
				side: { ...visualSessionLayoutRef.current.side, open: false },
			});
			return;
		}

		sideDockProgrammaticOpenUntilRef.current = 0;
		applyVisualSessionLayout({
			...visualSessionLayoutRef.current,
			side: {
				...visualSessionLayoutRef.current.side,
				open: true,
				size: normalizedSize,
			},
		});
	}

	function handleSideDockResizeEnd(sizes: number[]): void {
		const nextSize: number | undefined = sizes[1];
		if (nextSize === undefined || !Number.isFinite(nextSize)) {
			return;
		}
		if (nextSize < SIDE_DOCK_CLOSE_THRESHOLD) {
			if (performance.now() < sideDockProgrammaticOpenUntilRef.current) {
				return;
			}
			commitSessionLayout({
				...visualSessionLayoutRef.current,
				side: { ...visualSessionLayoutRef.current.side, open: false },
			});
			return;
		}

		sideDockProgrammaticOpenUntilRef.current = 0;
		const validSize: number = Math.min(
			SIDE_DOCK_MAX_SIZE,
			Math.max(SIDE_DOCK_CLOSE_THRESHOLD, Math.trunc(nextSize)),
		);
		commitSessionLayout({
			...visualSessionLayoutRef.current,
			side: {
				...visualSessionLayoutRef.current.side,
				open: true,
				size: validSize,
			},
		});
	}

	function handleBottomDockResize(sizes: number[]): void {
		const nextSize: number | undefined = sizes[1];
		if (nextSize === undefined || !Number.isFinite(nextSize)) {
			return;
		}

		const normalizedSize: number = Math.min(
			BOTTOM_DOCK_MAX_SIZE,
			Math.max(BOTTOM_DOCK_CLOSED_SIZE, Math.trunc(nextSize)),
		);
		if (normalizedSize < BOTTOM_DOCK_CLOSE_THRESHOLD) {
			applyVisualSessionLayout({
				...visualSessionLayoutRef.current,
				bottom: {
					...visualSessionLayoutRef.current.bottom,
					open: false,
				},
			});
			return;
		}

		applyVisualSessionLayout({
			...visualSessionLayoutRef.current,
			bottom: {
				...visualSessionLayoutRef.current.bottom,
				open: true,
				size: normalizedSize,
			},
		});
	}

	function handleBottomDockResizeEnd(sizes: number[]): void {
		const nextSize: number | undefined = sizes[1];
		if (nextSize === undefined || !Number.isFinite(nextSize)) {
			return;
		}
		if (nextSize < BOTTOM_DOCK_CLOSE_THRESHOLD) {
			commitSessionLayout({
				...visualSessionLayoutRef.current,
				bottom: {
					...visualSessionLayoutRef.current.bottom,
					open: false,
				},
			});
			return;
		}

		const validSize: number = Math.min(
			BOTTOM_DOCK_MAX_SIZE,
			Math.max(BOTTOM_DOCK_CLOSE_THRESHOLD, Math.trunc(nextSize)),
		);
		commitSessionLayout({
			...visualSessionLayoutRef.current,
			bottom: {
				...visualSessionLayoutRef.current.bottom,
				open: true,
				size: validSize,
			},
		});
	}

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
				onReload={(): void => { void loadSummaryOverview(); }}
				onExpandEnvironment={(): void => {
					void loadSummaryOverview(SUMMARY_PREVIEW_LIMIT, SUMMARY_PREVIEW_LIMIT, true);
				}}
			/>
		);
	}

	const renderComposer = (compact: boolean): React.JSX.Element => (
		<Composer
			key={composerInstanceKey}
			providerModelSelection={providerModelSelection}
			inputRequest={composerInputRequest ?? undefined}
			nextStepSuggestion={nextStepSuggestion}
			selectedProviderId={selectedProviderId}
			selectedModelId={selectedModelId}
			reasoningEffort={reasoningEffort}
			message={message}
			onDraftChange={onDraftChange}
			contextItems={contextItems}
			mode={mode}
			approvalMode={approvalMode}
			slashCommands={slashCommands}
			skills={skills}
			isSending={isSending}
			isCancelling={isCancelling}
			isAddingTextAttachment={isAddingTextAttachment}
			isApprovalModeSaving={isApprovalModeSaving}
			workspaceOptions={workspaceOptions}
			selectedWorkspace={isHome ? homeWorkspace : activeWorkspace}
			workspaceFooterDisabled={workspaceFooterDisabled}
			worktreeMode={isHome ? homeExecutionEnvironment : undefined}
			worktreeSourceOptions={isHome ? homeWorktreeSources : undefined}
			worktreeDisabledReason={isHome ? worktreeDisabledReason : null}
			isWorktreePreparing={isWorktreePreparing}
			showContextUsage={!isHome}
			compact={compact}
			floating={compact}
			onModeChange={onModeChange}
			onApprovalModeChange={onApprovalModeChange}
			onProviderModelChange={onProviderModelChange}
			onConfigureProvider={(): void => {
				void window.electronAPI.windowControl.openSettings("provider");
			}}
			onReasoningEffortChange={onReasoningEffortChange}
			onAddFiles={onAddFiles}
			onAddFolder={onAddFolder}
			onAddImages={onAddImages}
			onAddPastedTextAttachment={onAddPastedTextAttachment}
			onAddContextFiles={onAddContextFiles}
			onAddPluginContext={(value: Record<string, unknown>): void => {
				const content = typeof value.content === "string"
					? value.content.slice(0, 1_000_000)
					: JSON.stringify(value).slice(0, 1_000_000);
				const providerId = typeof value.providerId === "string" ? value.providerId : "plugin-context";
				onAddContext({
					id: `plugin-context:${providerId}:${Date.now().toString(36)}`,
					kind: "text_attachment",
					title: typeof value.title === "string" && value.title.trim().length > 0
						? value.title.slice(0, 200)
						: "Plugin context",
					subtitle: typeof value.source === "string" ? value.source.slice(0, 400) : undefined,
					source: "manual",
					data: {
						attachmentId: `plugin-context-${Date.now().toString(36)}`,
						mimeType: "text/plain",
						byteSize: new TextEncoder().encode(content).byteLength,
						fileName: `${providerId.replace(/[^a-z0-9._-]+/giu, "-").slice(0, 80) || "plugin-context"}.txt`,
						content
					},
					summary: typeof value.title === "string" ? value.title.slice(0, 1200) : undefined
				});
			}}
			onWorkspaceSelect={isHome ? onHomeWorkspaceSelect : undefined}
			onWorkspaceAdd={isHome ? onHomeWorkspaceAdd : undefined}
			onWorkspaceClear={isHome ? onHomeWorkspaceClear : undefined}
			onWorktreeModeChange={
				isHome ? onHomeExecutionEnvironmentChange : undefined
			}
			onWorktreeSourceOptionsChange={
				isHome ? onHomeWorktreeSourcesChange : undefined
			}
			onRemoveContext={onRemoveContext}
			onPinContext={onPinContext}
			onClearUnpinnedContext={onClearUnpinnedContext}
			onCancel={onCancel}
			onSubmit={onSubmit}
			onGuideSubmit={onGuideSubmit}
			onCompletionOpen={onCompletionOpen}
		/>
	);

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
			scheduledTaskPrefillRef.current = null;
			setChatSurfaceRevealPending(false);
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
	const pageActionControls =
		showWorkspaceLaunchControls ||
		showSummaryButton ||
		showBottomDockButton ||
		showSideDockButton ? (
			<div className={styles.floatingActions}>
				{showWorkspaceLaunchControls ? (
					<Space.Compact className={styles.workspaceLaunchControls}>
						<Button
							loading={isOpeningLaunchTarget}
							icon={getWorkspaceLaunchIcon(
								selectedLaunchTarget.id,
							)}
							onClick={(): void => {
								void openWorkspaceLaunchTarget(
									selectedLaunchTarget.id,
								);
							}}
						>
							{t("agentPage.workspaceLaunch.openIn", {
								target: selectedLaunchTarget.label,
							})}
						</Button>
						<Dropdown
							menu={{
								items: workspaceLaunchMenuItems,
								selectedKeys: [selectedLaunchTarget.id],
								onClick: handleWorkspaceLaunchMenuClick,
							}}
							trigger={["click"]}
						>
							<Button
								aria-label={t(
									"agentPage.workspaceLaunch.aria.selectTarget",
								)}
								icon={<Icon name="arrow-down" />}
							/>
						</Dropdown>
					</Space.Compact>
				) : null}
				{showSummaryButton ? renderSummaryButton() : null}
				{showBottomDockButton ? (
					<Tooltip
						title={
							bottomDockOpen
								? t("agentPage.dock.closeBottom")
								: t("agentPage.dock.openBottom")
						}
						placement="bottom"
					>
						<Button
							type="text"
							shape="circle"
							aria-pressed={bottomDockOpen}
							icon={
								<Icon
									name={
										bottomDockOpen
											? "layout-bottom-toggled"
											: "layout-bottom"
									}
								/>
							}
							onClick={toggleBottomDock}
						/>
					</Tooltip>
				) : null}
				{showSideDockButton ? (
					<Tooltip
						title={
							sideDockOpen
								? t("agentPage.dock.closeSidebar")
								: t("agentPage.dock.openSidebar")
						}
						placement="bottom"
					>
						<Button
							type="text"
							shape="circle"
							aria-pressed={sideDockOpen}
							icon={
								<Icon
									name={
										sideDockOpen
											? "layout-right-toggled"
											: "layout-right"
									}
								/>
							}
							onClick={toggleSideDock}
						/>
					</Tooltip>
				) : null}
			</div>
		) : null;

	return (
		<div
			className={styles.page}
			onDragOver={handlePageDragOver}
			onDrop={handlePageDrop}
		>
			{messageContextHolder}
			<Splitter
				className={styles.workspaceSplitter}
				draggerIcon={null}
				collapsible={{ motion: true }}
				onResize={handleWorkspaceSidebarResize}
				onResizeEnd={handleWorkspaceSidebarResizeEnd}
			>
				<Splitter.Panel
					size={
						workspaceSidebarOpen
							? workspaceSidebarSize
							: WORKSPACE_SIDEBAR_CLOSED_SIZE
					}
					min={WORKSPACE_SIDEBAR_CLOSED_SIZE}
					max={WORKSPACE_SIDEBAR_MAX_SIZE}
					collapsible={{ end: true, showCollapsibleIcon: false }}
				>
					<HomeWorkspaceSidebar
						treeProps={workspaceTreeProps}
						isOpen={workspaceSidebarOpen}
						onNewSession={requestNewSessionSurface}
						onOpenScheduledTasks={showScheduledTasksSurface}
						scheduledTasksActive={mainSurface === "scheduledTasks"}
						scheduledTaskAttentionCount={scheduledTaskAttentionCount}
						onOpenSettings={(): void => {
							void window.electronAPI.windowControl.openSettings();
						}}
					/>
				</Splitter.Panel>

				<Splitter.Panel min={360}>
					<div
						className={styles.agentMain}
						data-main-surface={mainSurface}
						data-dock-fullscreen={activeFullscreenDock ?? undefined}
					>
						{pageActionControls !== null ? (
							<div className={styles.floatingActionSlot}>
								{pageActionControls}
							</div>
						) : null}
						<Splitter
							className={styles.agentVerticalSplitter}
							data-dock-fullscreen={
								activeFullscreenDock ?? undefined
							}
							data-fullscreen-motion-disabled={
								fullscreenMotionDisabled ? "true" : undefined
							}
							draggerIcon={null}
							orientation="vertical"
							collapsible={{ motion: true }}
							onResize={handleBottomDockResize}
							onResizeEnd={handleBottomDockResizeEnd}
						>
							<Splitter.Panel
								min={
									bottomDockFullscreen
										? BOTTOM_DOCK_CLOSED_SIZE
										: 360
								}
								size={bottomDockFullscreen ? 0 : undefined}
							>
								<Splitter
									className={styles.agentSplitter}
									data-dock-fullscreen={
										sideDockFullscreen ? "side" : undefined
									}
									data-fullscreen-motion-disabled={
										fullscreenMotionDisabled
											? "true"
											: undefined
									}
									draggerIcon={null}
									collapsible={{ motion: true }}
									onResize={handleSideDockResize}
									onResizeEnd={handleSideDockResizeEnd}
								>
									<Splitter.Panel
										min={
											sideDockFullscreen
												? SIDE_DOCK_CLOSED_SIZE
												: 360
										}
										size={
											sideDockFullscreen ? 0 : undefined
										}
									>
										<section className={styles.chatPanel}>
											<header
												className={styles.chatHeader}
												data-side-dock-open={
													sideDockOpen
														? "true"
														: undefined
												}
											>
												<div
													className={
														styles.chatTitleRow
													}
												>
													<Typography.Text
														className={
															styles.chatText
														}
														ellipsis={{
															tooltip: chatTitle,
														}}
													>
														{chatTitle}
													</Typography.Text>
													{activeSessionMetadata?.forkedFrom !==
													undefined ? (
														<Tooltip
															placement="bottom"
															title={t(
																"chat.fork.openSourceTooltip",
															)}
														>
															<Button
																type="text"
																size="small"
																shape="circle"
																className={
																	styles.forkOriginButton
																}
																aria-label={t(
																	"chat.fork.openSourceAria",
																)}
																icon={
																	<Icon name="fork" />
																}
																disabled={
																	isSessionLoading
																}
																onClick={(): void => {
																	void onForkSourceOpen(
																		activeSessionMetadata
																			.forkedFrom!
																			.sessionId,
																	);
																}}
															/>
														</Tooltip>
													) : null}
													{activeSessionMetadata?.worktree !==
													undefined ? (
														<Space size={4}>
															<Tooltip
																title={t(
																	"agentPage.worktree.source",
																	{
																		workspace:
																			activeSessionMetadata
																				.worktree
																				.sourceWorkspaceName,
																	},
																)}
															>
																<span
																	className={
																		styles.worktreeBadge
																	}
																>
																	<Icon name="git-branch" />
																	{t(
																		"agentPage.worktree.label",
																	)}
																</span>
															</Tooltip>
															<Dropdown
																menu={{
																	items: [
																		...((activeSessionMetadata
																			.worktree
																			.status ??
																			"ready") ===
																		"ready"
																			? []
																			: [
																					{
																						key: "setup-retry",
																						label: t(
																							"agentPage.worktree.setupRetry",
																						),
																					},
																					{
																						key: "setup-skip",
																						label: t(
																							"agentPage.worktree.setupSkip",
																						),
																					},
																					{
																						type: "divider" as const,
																					},
																				]),
																		{
																			key: "local",
																			label: t(
																				"agentPage.worktree.handoffLocal",
																			),
																			disabled:
																				(activeSessionMetadata
																					.worktree
																					.location ??
																					"worktree") ===
																				"local",
																		},
																		{
																			key: "worktree",
																			label: t(
																				"agentPage.worktree.handoffWorktree",
																			),
																			disabled:
																				(activeSessionMetadata
																					.worktree
																					.location ??
																					"worktree") ===
																				"worktree",
																		},
																	],
																	onClick: ({
																		key,
																	}): void => {
																		if (
																			key ===
																				"setup-retry" ||
																			key ===
																				"setup-skip"
																		) {
																			void onSessionWorktreeSetup(
																				key ===
																					"setup-retry"
																					? "retry"
																					: "skip",
																			);
																			return;
																		}
																		void onSessionWorktreeHandoff(
																			key as
																				| "local"
																				| "worktree",
																		);
																	},
																}}
															>
																<Button
																	type="text"
																	size="small"
																	icon={
																		<Icon name="arrow-forward" />
																	}
																	aria-label={t(
																		"agentPage.worktree.handoff",
																	)}
																/>
															</Dropdown>
														</Space>
													) : null}
												</div>
											</header>

											<Divider size="small" />

											<div
												ref={chatBodyRef}
												className={styles.chatBody}
											>
												{isHome ? (
													<NewSessionHome
														workspace={
															homeWorkspace
														}
														errorMessage={
															sessionError
														}
														message={message}
														showStarters={chatSurfaceSettled}
														onStarterSelect={
															handleHomeStarterSelect
														}
													/>
												) : activeSessionId !== null ? (
													<MarkdownResourceActionsProvider
														value={{
															workspaceRoots:
																workspaceForActions ===
																null
																	? []
																	: [
																			workspaceForActions.rootPath,
																			...workspaceForActions.sourceFolders.map(
																				(
																					sourceFolder,
																				): string =>
																					sourceFolder.path,
																			),
																		],
															godotExecutablePath:
																effectiveGodotLaunchExecutablePath,
															currentWorkspaceLaunch:
																workspaceForActions ===
																null
																	? null
																	: selectedLaunchTarget,
															launchTargets:
																workspaceLaunchTargets,
															openWebUrl: openMessageWebUrl,
															openHtmlFile: openMessageHtmlFile,
														}}
													>
														<ConversationTimelinePane
															ref={
																conversationTimelinePaneRef
															}
															sessionId={
																activeSessionId
															}
															timelineStore={
																timelineStore
															}
															timelineNavigationEntries={
																timelineNavigationEntries
															}
															isLoading={
																isSessionLoading
															}
															errorMessage={
																sessionError
															}
															isLoadingMoreBefore={
																isLoadingMoreBefore
															}
															isLoadingMoreAfter={
																isLoadingMoreAfter
															}
															retryDisabled={
																retryDisabled
															}
															activeRetryRequestId={
																activeRetryRequestId
															}
															onLoadMoreBefore={
																onLoadMoreBefore
															}
															onLoadMoreAfter={
																onLoadMoreAfter
															}
															onTimelineNavigationLoadEntry={
																onTimelineNavigationLoadEntry
															}
															onTimelineSearchLoadOffset={
																onTimelineSearchLoadOffset
															}
															onRetryEditStart={
																onRetryEditStart
															}
															onRetryEditCancel={
																onRetryEditCancel
															}
															onRetryFromUserMessage={
																onRetryFromUserMessage
															}
															onForkFromUserMessage={
																onForkFromUserMessage
															}
															onOpenForkSource={
																onForkSourceOpen
															}
															forkDisabled={
																forkDisabled
															}
															forkingRequestId={
																forkingRequestId
															}
															onInlineDiffReview={
																openReviewPanel
															}
															onAwayFromBottomChange={
																setScrollToBottomButtonVisible
															}
															contextItems={
																selectionMarkerContextItems
															}
															onAddContext={
																onAddContext
															}
															initialSelectionAskThreads={
																selectionAskThreads
															}
															goal={currentGoal}
														/>
													</MarkdownResourceActionsProvider>
												) : null}
											</div>

											<footer className={styles.composer}>
												{!isHome ? (
													<Button
														ref={
															scrollToBottomButtonRef
														}
														shape="circle"
														title={t(
															"agentPage.actions.scrollToBottom",
														)}
														icon={
															<Icon name="arrow-bottom" />
														}
														tabIndex={-1}
														className={[
															styles.scrollToBottomButton,
															showExecutionStatusPanel
																? styles.scrollToBottomButtonAboveExecutionStatus
																: "",
															styles.scrollToBottomButtonHidden,
														]
															.filter(Boolean)
															.join(" ")}
														onClick={
															scrollMessageListToBottom
														}
													/>
												) : null}
												{!isHome &&
												pendingApproval !== null ? (
													<ApprovalDialog
														pendingApproval={
															pendingApproval
														}
														isApproving={
															isApproving
														}
														isApprovalAutoSafeEnabling={
															isApprovalAutoSafeEnabling
														}
														isRejecting={
															isRejecting
														}
														errorMessage={
															approvalError
														}
														onApprove={
															onApprovalApprove
														}
														onApproveAndEnableAutoSafe={
															onApprovalApproveAndEnableAutoSafe
														}
														onReject={
															onApprovalReject
														}
													/>
												) : !isHome &&
												  pendingToolBudget !== null ? (
													<ToolBudgetDialog
														pendingToolBudget={
															pendingToolBudget
														}
														isContinuing={
															isToolBudgetContinuing
														}
														isStopping={
															isToolBudgetStopping
														}
														isCancelling={
															isCancelling
														}
														errorMessage={
															toolBudgetError
														}
														onContinue={
															onToolBudgetContinue
														}
														onStop={
															onToolBudgetStop
														}
														onCancel={onCancel}
													/>
												) : !isHome &&
												  pendingPlanClarification !==
														null ? (
													<ClarificationDialog
														planId={
															pendingPlanClarification.planId
														}
														title={
															pendingPlanClarification.title
														}
														question={
															pendingPlanClarification.question
														}
														recommendedReplies={
															pendingPlanClarification.recommendedReplies
														}
														isSubmitting={
															isPlanClarificationSubmitting
														}
														errorMessage={
															planClarificationError
														}
														onSubmit={
															onPlanClarificationSubmit
														}
														onSkip={
															onPlanClarificationSkip
														}
													/>
												) : !isHome &&
												  pendingPlanApproval !==
														null ? (
													<PlanApprovalDialog
														plan={
															pendingPlanApproval
														}
														isApproving={
															isPlanApproving
														}
														isRevising={
															isPlanRevising
														}
														errorMessage={
															planApprovalError
														}
														onApprove={
															onPlanApprove
														}
														onRevise={onPlanRevise}
													/>
												) : (
													<>
														{showExecutionStatusPanel ? (
															<TimelineWorkflowTodoPanel
																timelineStore={
																	timelineStore
																}
																sessionId={
																	activeSessionId!
																}
																snapshot={
																	workflowTodoSnapshot
																}
																goal={
																	currentGoal
																}
																onDismiss={
																	onWorkflowTodoDismiss
																}
																onGoalChange={
																	onGoalChange
																}
																onGoalDismiss={
																	onGoalDismiss
																}
															/>
														) : null}
														{!isHome ? (
															<MessageQueuePanel
																messageQueue={
																	messageQueue
																}
																pendingGuides={
																	pendingGuides
																}
																activeQueueItemId={
																	activeQueueItemId
																}
																onQueueRemove={
																	onQueueMessageRemove
																}
																onQueueEdit={
																	onQueueMessageEdit
																}
																onQueueReorder={
																	onQueueMessageReorder
																}
																onGuideDelete={
																	onGuideDelete
																}
																onGuideReorder={
																	onGuideReorder
																}
															/>
														) : null}
														{isDockFullscreen
															? null
															: renderComposer(
																	false,
																)}
													</>
												)}
											</footer>
										</section>
									</Splitter.Panel>
									<Splitter.Panel
										size={
											sideDockConfig?.panel.size ??
											SIDE_DOCK_CLOSED_SIZE
										}
										min={
											sideDockConfig?.panel.min ??
											SIDE_DOCK_CLOSED_SIZE
										}
										max={sideDockConfig?.panel.max}
										collapsible={{
											start: true,
											showCollapsibleIcon: false,
										}}
									>
										{renderSideDock &&
										sideDockConfig !== null ? (
											<HomeDockPanel
												{...sideDockConfig.content}
											/>
										) : null}
									</Splitter.Panel>
								</Splitter>
							</Splitter.Panel>
							<Splitter.Panel
								size={
									bottomDockConfig?.panel.size ??
									BOTTOM_DOCK_CLOSED_SIZE
								}
								min={
									bottomDockConfig?.panel.min ??
									BOTTOM_DOCK_CLOSED_SIZE
								}
								max={bottomDockConfig?.panel.max}
								collapsible={{
									start: true,
									showCollapsibleIcon: false,
								}}
							>
								{renderBottomDock &&
								bottomDockConfig !== null ? (
									<HomeDockPanel
										{...bottomDockConfig.content}
									/>
								) : null}
							</Splitter.Panel>
						</Splitter>
						{isDockFullscreen && !isFullscreenBrowserPanel ? (
							<FullscreenComposerShelf>
								{renderComposer(true)}
							</FullscreenComposerShelf>
						) : null}
						<div
							className={[
								styles.scheduledTasksOverlay,
								mainSurface === "scheduledTasks"
									? styles.scheduledTasksOverlayActive
									: "",
							]
								.filter(Boolean)
								.join(" ")}
							onTransitionEnd={handleScheduledTasksOverlayTransitionEnd}
							aria-hidden={mainSurface !== "scheduledTasks"}
						>
							<ScheduledTasksPage
								onCreate={createScheduledTask}
								onOpenSession={openScheduledTaskSession}
								defaultWorkspaceId={
									isHome
										? (homeWorkspace?.id ?? null)
										: activeWorkspaceId
								}
								defaultProviderId={selectedProviderId}
								defaultModelId={selectedModelId}
								defaultReasoningEffort={reasoningEffort}
							/>
						</div>
					</div>
				</Splitter.Panel>
			</Splitter>
			<SessionPlansDialog
				overview={plansDialogOverview}
				open={plansModalOpen}
				loading={isPlansDialogLoading}
				error={plansDialogError}
				onClose={(): void => setPlansModalOpen(false)}
				onPlanSelect={openPlanPreview}
			/>
			<SessionPlanPreviewDialog
				plan={previewPlan}
				loading={isPlanPreviewLoading}
				error={planPreviewError}
				onClose={(): void => {
					planPreviewRequestIdRef.current += 1;
					setPreviewPlan(null);
					setIsPlanPreviewLoading(false);
					setPlanPreviewError(null);
				}}
			/>
			<SessionSourcesDialog
				overview={sourcesDialogOverview}
				open={sourcesModalOpen}
				loading={isSourcesDialogLoading}
				error={sourcesDialogError}
				onClose={(): void => setSourcesModalOpen(false)}
				onSourceSelect={setPreviewSource}
			/>
			<SessionSourcePreviewDialog
				source={previewSource}
				onClose={(): void => setPreviewSource(null)}
			/>
			<Modal
				open={isGodotSceneModalOpen}
				title={t("agentPage.summary.godot.sceneModal.title")}
				footer={null}
				width={720}
				onCancel={(): void => setIsGodotSceneModalOpen(false)}
			>
				<div className={styles.godotSceneModalBody}>
					<Input.Search
						allowClear
						value={godotSceneSearch}
						placeholder={t(
							"agentPage.summary.godot.sceneModal.searchPlaceholder",
						)}
						onChange={(
							event: React.ChangeEvent<HTMLInputElement>,
						): void => {
							setGodotSceneSearch(event.target.value);
						}}
					/>
					{isGodotSceneLoading ? (
						<div className={styles.godotSceneLoading}>
							<Spin />
						</div>
					) : filteredGodotSceneFiles.length > 0 ? (
						<div className={styles.godotSceneList}>
							{filteredGodotSceneFiles.map(
								(scene: GodotSceneFile): React.ReactNode => (
									<Button
										key={scene.relativePath}
										type="text"
										block
										className={styles.godotSceneButton}
										onClick={(): void =>
											runGodotScene(scene)
										}
									>
										<span className={styles.godotSceneText}>
											<span
												className={
													styles.summaryItemTitle
												}
											>
												{scene.name}
											</span>
											<span
												className={styles.summaryMeta}
											>
												{scene.resourcePath}
											</span>
										</span>
									</Button>
								),
							)}
						</div>
					) : (
						<Empty
							image={Empty.PRESENTED_IMAGE_SIMPLE}
							description={t(
								"agentPage.summary.godot.sceneModal.empty",
							)}
						/>
					)}
				</div>
			</Modal>
			<CommitActionDialog {...gitActions.commitDialogProps} />
			<BranchActionDialog {...gitActions.branchDialogProps} />
			<CreateBranchDialog {...gitActions.createBranchDialogProps} />
		</div>
	);
}

export default HomePage;

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Button, Divider, Dropdown, Empty, Input, message as antdMessage, Modal, Space, Spin, Splitter, Typography, Popover, Collapse, Tooltip } from "antd";
import type { CollapseProps, MenuProps, SplitterProps } from "antd";
import { useTranslation } from "react-i18next";
import type { AdditionalContextItem, AgentGoalState, MessageQueueItem, PendingGuide, PendingToolBudget, PlanApprovalState, PlanClarificationState, SelectionAskThread, SessionMetadata, SessionTimelineNavigationEntry, TimelineBlock, WorkflowTodoSnapshot, WorkspaceConfig } from "@/api/types";
import type { ChatMode } from "@/api/chat-api";
import type { ApprovalMode, PendingApproval } from "@/api/approval-api";
import type { SlashCommandDefinition } from "@/api/command-api";
import type { ProviderModelSelection } from "@/api/provider-api";
import { getPlan, type PlanResult } from "@/api/plan-api";
import type { DeleteWorkspaceResult, WorkspaceTreeOrderPreferences } from "@/api/workspace-api";
import type { SkillSummary } from "@/api/skill-api";
import type { WorkspaceSidebarPreferences } from "@/api/client-preferences-api";
import {
	detectShortcutPlatform,
	findMatchingShortcutCommand,
	type KeyboardShortcutOverrides,
	type ShortcutCommandId,
	type ShortcutPlatform
} from "@/api/keyboard-shortcuts";
import { fetchSessionOverview, fetchWorkspaceOverview, type SessionOverviewGitInfo, type SessionOverviewPlanItem, type SessionOverviewResult, type SessionOverviewSourceItem } from "@/api/session-overview-api";
import WorkspaceTree, { type SessionArchiveContext } from "@/features/workspace/WorkspaceTree";
import ConversationTimelinePane, { type ConversationTimelinePaneHandle } from "@/features/chat/ConversationTimelinePane";
import Composer from "@/features/composer/Composer";
import FloatingWorkflowTodoPanel, { type WorkflowFileChangeSummary } from "@/features/composer/FloatingWorkflowTodoPanel";
import FloatingGoalPanel from "@/features/composer/FloatingGoalPanel";
import MessageQueuePanel from "@/features/composer/MessageQueuePanel";
import NewSessionHome from "./NewSessionHome";
import ApprovalDialog from "@/features/approval/ApprovalDialog";
import ToolBudgetDialog from "@/features/approval/ToolBudgetDialog";
import type { ComposerCompletionTrigger } from "@/features/composer/composer-completion";
import type { RetryUserMessagePayload } from "@/features/chat/UserBubble";
import styles from "./HomePage.module.css";
import { Icon } from "@/assets/icons";
import ClarificationDialog from "@/features/clarification/ClarificationDialog";
import PlanApprovalDialog from "@/features/approval/PlanApprovalDialog";
import DockPanelTabs, { type DockPanelActivationRequest, type DockPanelKind } from "@/features/dock/DockPanelTabs";
import {
	listTerminalRuntimeIds,
	type DockLayoutPreferences,
	type SessionLayoutPreferences
} from "@/features/dock/session-layout";
import BranchActionDialog from "@/features/git/BranchActionDialog";
import CommitActionDialog from "@/features/git/CommitActionDialog";
import CreateBranchDialog from "@/features/git/CreateBranchDialog";
import { useGitActionDialogController } from "@/features/git/useGitActionDialogController";
import SessionPlansDialog from "./SessionPlansDialog";
import SessionPlanPreviewDialog from "./SessionPlanPreviewDialog";
import SessionSourcesDialog from "./SessionSourcesDialog";
import SessionSourcePreviewDialog from "./SessionSourcePreviewDialog";
import { formatSourceSubtitle } from "./session-overview-formatters";
import type { TimelinePageStore } from "@/features/workbench/timeline-page-store";
import { useTimelineSelector } from "@/features/workbench/timeline-page-store";
import { MarkdownResourceActionsProvider } from "@/features/markdown/markdown-resource-actions";

type WorkspaceLaunchTargetId = "file-explorer" | "terminal" | "vscode" | "visual-studio" | "github-desktop" | "git-bash" | "godot";

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

type SummaryOverviewTarget = {
	scopeKey: string;
	sessionId: string | null;
	workspace: WorkspaceConfig | null;
};

const FALLBACK_WORKSPACE_LAUNCH_TARGETS: WorkspaceLaunchTarget[] = [
	{ id: "file-explorer", label: "File Explorer" },
	{ id: "terminal", label: "Terminal" }
];

const MAX_GODOT_SCENE_FILES: number = 500;
const SUMMARY_PREVIEW_LIMIT: number = 3;
const SUMMARY_SEE_MORE_LIMIT: number = 100;
const SPLITTER_CLASS_NAMES: SplitterProps["classNames"] = {
	dragger: {
		default: styles.splitterDragger,
		active: styles.splitterDraggerActive
	}
};
const WORKSPACE_SIDEBAR_CLOSED_SIZE: number = 0;
const WORKSPACE_SIDEBAR_MAX_SIZE: number = 720;
const WORKSPACE_SIDEBAR_CLOSE_THRESHOLD: number = 150;
const SIDE_DOCK_CLOSED_SIZE: number = 0;
const SIDE_DOCK_DEFAULT_SIZE: number = 520;
const SIDE_DOCK_MAX_SIZE: number = 720;
const SIDE_DOCK_CLOSE_THRESHOLD: number = 150;
const BOTTOM_DOCK_CLOSED_SIZE: number = 0;
const BOTTOM_DOCK_DEFAULT_SIZE: number = 280;
const BOTTOM_DOCK_MAX_SIZE: number = 520;
const BOTTOM_DOCK_CLOSE_THRESHOLD: number = 120;
const MAX_SELECTED_SEARCH_QUERY_LENGTH: number = 500;
const PANEL_LAYOUT_PERSIST_DELAY_MS: number = 360;

function areWorkspaceSidebarPreferencesEqual(
	left: WorkspaceSidebarPreferences,
	right: WorkspaceSidebarPreferences
): boolean {
	return left.open === right.open && left.size === right.size;
}

function areDockLayoutPreferencesEqual(left: DockLayoutPreferences, right: DockLayoutPreferences): boolean {
	return left.open === right.open
		&& left.size === right.size
		&& left.activeTabKey === right.activeTabKey
		&& left.tabs.length === right.tabs.length
		&& left.tabs.every((tab, index): boolean => {
			const candidate = right.tabs[index];
			return candidate !== undefined
				&& tab.key === candidate.key
				&& tab.kind === candidate.kind
				&& tab.index === candidate.index;
		});
}

function areSessionLayoutPreferencesEqual(left: SessionLayoutPreferences, right: SessionLayoutPreferences): boolean {
	return areDockLayoutPreferencesEqual(left.side, right.side)
		&& areDockLayoutPreferencesEqual(left.bottom, right.bottom);
}

function getSelectedConversationSearchQuery(container: HTMLElement | null): string | undefined {
	const selection: Selection | null = window.getSelection();
	if (
		container === null
		|| selection === null
		|| selection.isCollapsed
		|| selection.rangeCount === 0
		|| selection.anchorNode === null
		|| selection.focusNode === null
		|| !container.contains(selection.anchorNode)
		|| !container.contains(selection.focusNode)
	) {
		return undefined;
	}
	const anchorElement: Element | null = selection.anchorNode instanceof Element
		? selection.anchorNode
		: selection.anchorNode.parentElement;
	const focusElement: Element | null = selection.focusNode instanceof Element
		? selection.focusNode
		: selection.focusNode.parentElement;
	if (
		anchorElement === null
		|| focusElement === null
		|| anchorElement.closest('[data-chat-search-text="true"]') === null
		|| focusElement.closest('[data-chat-search-text="true"]') === null
		|| anchorElement.closest("[data-chat-search-ignore]") !== null
		|| focusElement.closest("[data-chat-search-ignore]") !== null
	) {
		return undefined;
	}
	const selectedText: string = selection.toString().trim();
	return selectedText.length > 0
		&& selectedText.length <= MAX_SELECTED_SEARCH_QUERY_LENGTH
		&& !/[\r\n]/u.test(selectedText)
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
	return target.closest([
		"input",
		"textarea",
		"select",
		"[contenteditable='true']",
		"[contenteditable='']",
		"[role='textbox']",
		"[role='combobox']",
		"[role='dialog']",
		"[role='menu']",
		"[role='listbox']"
	].join(",")) !== null;
}

function isWorkspaceLaunchTargetId(value: string): value is WorkspaceLaunchTargetId {
	return value === "file-explorer"
		|| value === "terminal"
		|| value === "vscode"
		|| value === "visual-studio"
		|| value === "github-desktop"
		|| value === "git-bash"
		|| value === "godot";
}

function getWorkspaceLaunchIcon(targetId: WorkspaceLaunchTargetId): React.ReactNode {
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

const timelineFileChangeContributionCache: WeakMap<TimelineBlock, WorkflowFileChangeContribution[]> = new WeakMap();

function getTimelineFileChangeContributions(block: TimelineBlock): WorkflowFileChangeContribution[] {
	const cached: WorkflowFileChangeContribution[] | undefined = timelineFileChangeContributionCache.get(block);
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
					batchIds: part.batchIds.filter((batchId: string): boolean => batchId.length > 0)
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
				const batchId: string = getRecordString(fileEditBatch, "batchId");
				contributions.push({
					additions: getRecordNumber(fileEditBatch, "additions"),
					deletions: getRecordNumber(fileEditBatch, "deletions"),
					changedFiles: getRecordNumber(fileEditBatch, "editedFileCount"),
					batchIds: batchId.length > 0 ? [batchId] : []
				});
			}
		}
	}
	timelineFileChangeContributionCache.set(block, contributions);
	return contributions;
}

function aggregateTimelineFileChanges(blocks: TimelineBlock[]): WorkflowFileChangeSummary {
	const countedBatchIds: Set<string> = new Set();
	let additions: number = 0;
	let deletions: number = 0;
	let changedFiles: number = 0;

	for (const block of blocks) {
		for (const contribution of getTimelineFileChangeContributions(block)) {
			if (contribution.batchIds.length > 0 && contribution.batchIds.every((batchId: string): boolean => countedBatchIds.has(batchId))) {
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

function TimelineWorkflowTodoPanel({ timelineStore, sessionId, snapshot, goal, onDismiss, onGoalChange, onGoalDismiss }: TimelineWorkflowTodoPanelProps): React.JSX.Element | null {
	const timelineBlocks: TimelineBlock[] = useTimelineSelector(
		timelineStore,
		(page): TimelineBlock[] => page.blocks
	);
	const fileChangeSummary: WorkflowFileChangeSummary = useMemo(
		(): WorkflowFileChangeSummary => aggregateTimelineFileChanges(timelineBlocks),
		[timelineBlocks]
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
		options?: { persist?: boolean }
	) => void;
	sessionLayout: SessionLayoutPreferences;
	onSessionLayoutChange: (
		layout: SessionLayoutPreferences,
		options?: { persist?: boolean }
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
	homeWorkspace: WorkspaceConfig | null;
	workspaceFooterDisabled: boolean;
	activeWorkspace: WorkspaceConfig | null;
	godotLaunchExecutablePath: string | null;
	onNewSession: () => void;
	onNewUnboundSession: () => void;
	onNewWorkspaceSession: (workspace: WorkspaceConfig) => void;
	onWorkspaceRefresh: () => void;
	onHomeWorkspaceSelect: (workspaceId: string) => void;
	onHomeWorkspaceAdd: () => void;
	onHomeWorkspaceClear: () => void;
	onSessionSelect: (session: SessionMetadata) => void;
	onSessionArchive: (session: SessionMetadata, context: SessionArchiveContext) => void;
	onSessionRename: (session: SessionMetadata) => void;
	onSessionsChange: (sessions: SessionMetadata[]) => void;
	onWorkspaceDelete: (result: DeleteWorkspaceResult) => void;
	onWorkspaceUpdate: (workspace: WorkspaceConfig) => void;
	onWorkspaceProjectCreated: (workspace: WorkspaceConfig) => void;
	onLoadMoreBefore: () => void;
	onLoadMoreAfter: () => void;
	onTimelineNavigationLoadEntry: (entry: SessionTimelineNavigationEntry) => Promise<void>;
	onTimelineSearchLoadOffset: (blockOffset: number) => Promise<void>;
	onRetryEditStart: (requestId: string) => void;
	onRetryEditCancel: (requestId: string) => void;
	onRetryFromUserMessage: (payload: RetryUserMessagePayload) => Promise<boolean>;
	onModeChange: (mode: ChatMode) => void;
	onApprovalModeChange: (mode: ApprovalMode) => void;
	onApprovalApprove: (approvalId: string, consentText?: string) => void;
	onApprovalReject: (approvalId: string) => void;
	onToolBudgetContinue: (budgetId: string) => void;
	onToolBudgetStop: (budgetId: string) => void;
	onPlanClarificationSubmit: (reply: string) => void;
	onPlanClarificationSkip: () => void;
	onPlanApprove: (planId: string) => void;
	onPlanRevise: (planId: string, feedback: string) => void;
	onProviderModelChange: (providerId: string, modelId: string) => void;
	onReasoningEffortChange: (effort: string) => void;
	onAddFiles: () => void;
	onAddFolder: () => void;
	onAddImages: (files: File[]) => void;
	onAddPastedTextAttachment: (text: string) => boolean;
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
	homeWorkspace,
	workspaceFooterDisabled,
	activeWorkspace,
	godotLaunchExecutablePath,
	onNewSession,
	onNewUnboundSession,
	onNewWorkspaceSession,
	onWorkspaceRefresh,
	onHomeWorkspaceSelect,
	onHomeWorkspaceAdd,
	onHomeWorkspaceClear,
	onSessionSelect,
	onSessionArchive,
	onSessionRename,
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
	onApprovalReject,
	onToolBudgetContinue,
	onToolBudgetStop,
	onPlanClarificationSubmit,
	onPlanClarificationSkip,
	onPlanApprove,
	onPlanRevise,
	onProviderModelChange,
	onReasoningEffortChange,
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
	onCompletionOpen
}: HomePageProps): React.JSX.Element {
	const { t } = useTranslation();
	const [messageApi, messageContextHolder] = antdMessage.useMessage();
	const [workspaceLaunchTargets, setWorkspaceLaunchTargets] = useState<WorkspaceLaunchTarget[]>(FALLBACK_WORKSPACE_LAUNCH_TARGETS);
	const [selectedLaunchTargetId, setSelectedLaunchTargetId] = useState<WorkspaceLaunchTargetId>("file-explorer");
	const [isOpeningLaunchTarget, setIsOpeningLaunchTarget] = useState<boolean>(false);
	const [summaryOpen, setSummaryOpen] = useState<boolean>(false);
	const [summaryOverview, setSummaryOverview] = useState<SessionOverviewResult | null>(null);
	const [isSummaryLoading, setIsSummaryLoading] = useState<boolean>(false);
	const [summaryError, setSummaryError] = useState<string | null>(null);
	const [summaryGitSourceFolderId, setSummaryGitSourceFolderId] = useState<string | null>(null);
	const [summaryGitActionRequest, setSummaryGitActionRequest] = useState<SummaryGitActionRequest | null>(null);
	const [gitStateRevision, setGitStateRevision] = useState<number>(0);
	const [plansModalOpen, setPlansModalOpen] = useState<boolean>(false);
	const [plansDialogOverview, setPlansDialogOverview] = useState<SessionOverviewResult | null>(null);
	const [isPlansDialogLoading, setIsPlansDialogLoading] = useState<boolean>(false);
	const [plansDialogError, setPlansDialogError] = useState<string | null>(null);
	const [sourcesModalOpen, setSourcesModalOpen] = useState<boolean>(false);
	const [sourcesDialogOverview, setSourcesDialogOverview] = useState<SessionOverviewResult | null>(null);
	const [isSourcesDialogLoading, setIsSourcesDialogLoading] = useState<boolean>(false);
	const [sourcesDialogError, setSourcesDialogError] = useState<string | null>(null);
	const [previewSource, setPreviewSource] = useState<SessionOverviewSourceItem | null>(null);
	const [previewPlan, setPreviewPlan] = useState<SessionOverviewPlanItem | null>(null);
	const [isPlanPreviewLoading, setIsPlanPreviewLoading] = useState<boolean>(false);
	const [planPreviewError, setPlanPreviewError] = useState<string | null>(null);
	const [isGodotProject, setIsGodotProject] = useState<boolean>(false);
	const [isGodotSceneModalOpen, setIsGodotSceneModalOpen] = useState<boolean>(false);
	const [godotSceneFiles, setGodotSceneFiles] = useState<GodotSceneFile[]>([]);
	const [isGodotSceneLoading, setIsGodotSceneLoading] = useState<boolean>(false);
	const [godotSceneSearch, setGodotSceneSearch] = useState<string>("");
	const [visualWorkspaceSidebar, setVisualWorkspaceSidebar] = useState<WorkspaceSidebarPreferences>(workspaceSidebar);
	const [visualSessionLayout, setVisualSessionLayout] = useState<SessionLayoutPreferences>(sessionLayout);
	const dockActivationRequestIdRef = useRef<number>(0);
	const summaryRequestIdRef = useRef<number>(0);
	const summaryGitActionRequestIdRef = useRef<number>(0);
	const planPreviewRequestIdRef = useRef<number>(0);
	const [sideDockActivationRequest, setSideDockActivationRequest] = useState<DockPanelActivationRequest | null>(null);
	const previousSessionLayoutRef = useRef<{
		sessionId: string | null;
		layout: SessionLayoutPreferences;
	}>({
		sessionId: activeSessionId,
		layout: sessionLayout
	});
	const conversationTimelinePaneRef = useRef<ConversationTimelinePaneHandle | null>(null);
	const chatBodyRef = useRef<HTMLDivElement | null>(null);
	const scrollToBottomButtonRef = useRef<HTMLButtonElement | null>(null);
	const scrollToBottomButtonVisibleRef = useRef<boolean>(false);
	const visualWorkspaceSidebarRef = useRef<WorkspaceSidebarPreferences>(workspaceSidebar);
	const visualSessionLayoutRef = useRef<SessionLayoutPreferences>(sessionLayout);
	const workspaceSidebarSaveTimerRef = useRef<number | null>(null);
	const sessionLayoutSaveTimerRef = useRef<number | null>(null);
	const pendingWorkspaceSidebarSaveRef = useRef<{
		value: WorkspaceSidebarPreferences;
		save: HomePageProps["onWorkspaceSidebarChange"];
	} | null>(null);
	const pendingSessionLayoutSaveRef = useRef<{
		value: SessionLayoutPreferences;
		save: HomePageProps["onSessionLayoutChange"];
	} | null>(null);

	function applyVisualWorkspaceSidebar(nextWorkspaceSidebar: WorkspaceSidebarPreferences): void {
		visualWorkspaceSidebarRef.current = nextWorkspaceSidebar;
		setVisualWorkspaceSidebar(nextWorkspaceSidebar);
	}

	function applyVisualSessionLayout(nextSessionLayout: SessionLayoutPreferences): void {
		visualSessionLayoutRef.current = nextSessionLayout;
		setVisualSessionLayout(nextSessionLayout);
	}

	function clearWorkspaceSidebarSave(): void {
		if (workspaceSidebarSaveTimerRef.current !== null) {
			window.clearTimeout(workspaceSidebarSaveTimerRef.current);
			workspaceSidebarSaveTimerRef.current = null;
		}
		pendingWorkspaceSidebarSaveRef.current = null;
	}

	function clearSessionLayoutSave(): void {
		if (sessionLayoutSaveTimerRef.current !== null) {
			window.clearTimeout(sessionLayoutSaveTimerRef.current);
			sessionLayoutSaveTimerRef.current = null;
		}
		pendingSessionLayoutSaveRef.current = null;
	}

	function flushWorkspaceSidebarSave(): void {
		const pendingSave = pendingWorkspaceSidebarSaveRef.current;
		clearWorkspaceSidebarSave();
		pendingSave?.save(pendingSave.value);
	}

	function flushSessionLayoutSave(): void {
		const pendingSave = pendingSessionLayoutSaveRef.current;
		clearSessionLayoutSave();
		pendingSave?.save(pendingSave.value);
	}

	function commitWorkspaceSidebar(nextWorkspaceSidebar: WorkspaceSidebarPreferences, persist: boolean = true): void {
		clearWorkspaceSidebarSave();
		applyVisualWorkspaceSidebar(nextWorkspaceSidebar);
		onWorkspaceSidebarChange(nextWorkspaceSidebar, { persist });
	}

	function commitSessionLayout(nextSessionLayout: SessionLayoutPreferences, persist: boolean = true): void {
		clearSessionLayoutSave();
		applyVisualSessionLayout(nextSessionLayout);
		onSessionLayoutChange(nextSessionLayout, { persist });
	}

	function scheduleWorkspaceSidebarSave(nextWorkspaceSidebar: WorkspaceSidebarPreferences): void {
		applyVisualWorkspaceSidebar(nextWorkspaceSidebar);
		clearWorkspaceSidebarSave();
		pendingWorkspaceSidebarSaveRef.current = {
			value: nextWorkspaceSidebar,
			save: onWorkspaceSidebarChange
		};
		workspaceSidebarSaveTimerRef.current = window.setTimeout((): void => {
			const pendingSave = pendingWorkspaceSidebarSaveRef.current;
			workspaceSidebarSaveTimerRef.current = null;
			pendingWorkspaceSidebarSaveRef.current = null;
			pendingSave?.save(pendingSave.value);
		}, PANEL_LAYOUT_PERSIST_DELAY_MS);
	}

	function scheduleSessionLayoutSave(nextSessionLayout: SessionLayoutPreferences): void {
		applyVisualSessionLayout(nextSessionLayout);
		clearSessionLayoutSave();
		pendingSessionLayoutSaveRef.current = {
			value: nextSessionLayout,
			save: onSessionLayoutChange
		};
		sessionLayoutSaveTimerRef.current = window.setTimeout((): void => {
			const pendingSave = pendingSessionLayoutSaveRef.current;
			sessionLayoutSaveTimerRef.current = null;
			pendingSessionLayoutSaveRef.current = null;
			pendingSave?.save(pendingSave.value);
		}, PANEL_LAYOUT_PERSIST_DELAY_MS);
	}

	useEffect((): void => {
		if (!areWorkspaceSidebarPreferencesEqual(visualWorkspaceSidebarRef.current, workspaceSidebar)) {
			flushWorkspaceSidebarSave();
			applyVisualWorkspaceSidebar(workspaceSidebar);
		}
	}, [workspaceSidebar]);

	useEffect((): void => {
		if (!areSessionLayoutPreferencesEqual(visualSessionLayoutRef.current, sessionLayout)) {
			flushSessionLayoutSave();
			applyVisualSessionLayout(sessionLayout);
		}
	}, [sessionLayout]);

	useEffect((): (() => void) => {
		return (): void => {
			flushWorkspaceSidebarSave();
			flushSessionLayoutSave();
		};
	}, []);
	const workspaceForActions: WorkspaceConfig | null = activeWorkspace ?? (isHome ? homeWorkspace : null);
	const summaryScopeKey: string = activeSessionId ?? `workspace:${workspaceForActions?.id ?? "none"}`;
	const summaryOverviewTargetRef = useRef<SummaryOverviewTarget>({
		scopeKey: summaryScopeKey,
		sessionId: activeSessionId,
		workspace: workspaceForActions
	});
	summaryOverviewTargetRef.current = {
		scopeKey: summaryScopeKey,
		sessionId: activeSessionId,
		workspace: workspaceForActions
	};
	const showDockControls: boolean = !isHome || workspaceForActions !== null;
	const showWorkspaceLaunchControls: boolean = workspaceForActions !== null;
	const showSummaryButton: boolean = true;
	const showSideDockButton: boolean = showDockControls;
	const showBottomDockButton: boolean = showDockControls;
	const terminalWaitForCwd: boolean = !isHome && isSessionLoading && workspaceForActions === null;
	const showWorkflowTodoPanel: boolean = !workflowTodoCollapsed && workflowTodoSnapshot !== null;
	const showExecutionStatusPanel: boolean = !isHome
		&& pendingApproval === null
		&& pendingToolBudget === null
		&& pendingPlanClarification === null
		&& pendingPlanApproval === null
		&& (currentGoal !== null || showWorkflowTodoPanel);
	const effectiveGodotLaunchExecutablePath: string | null = godotLaunchExecutablePath?.trim()
		? godotLaunchExecutablePath.trim()
		: null;
	const showGodotSummaryActions: boolean = workspaceForActions !== null && effectiveGodotLaunchExecutablePath !== null && isGodotProject;
	const workspaceSidebarOpen: boolean = visualWorkspaceSidebar.open;
	const workspaceSidebarSize: number = visualWorkspaceSidebar.size;
	const sideDockOpen: boolean = visualSessionLayout.side.open;
	const sideDockSize: number = visualSessionLayout.side.size;
	const bottomDockOpen: boolean = visualSessionLayout.bottom.open;
	const bottomDockSize: number = visualSessionLayout.bottom.size;
	const selectionMarkerContextItems: AdditionalContextItem[] = useMemo((): AdditionalContextItem[] => {
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

	const updateSideDock = useCallback((
		nextSideLayout: DockLayoutPreferences,
		persist: boolean = true
	): void => {
		commitSessionLayout({
			...visualSessionLayoutRef.current,
			side: nextSideLayout
		}, persist);
	}, [commitSessionLayout]);

	const updateBottomDock = useCallback((
		nextBottomLayout: DockLayoutPreferences,
		persist: boolean = true
	): void => {
		commitSessionLayout({
			...visualSessionLayoutRef.current,
			bottom: nextBottomLayout
		}, persist);
	}, [commitSessionLayout]);

	useLayoutEffect((): void => {
		const previous = previousSessionLayoutRef.current;
		if (previous.sessionId !== activeSessionId) {
			for (const terminalId of listTerminalRuntimeIds(previous.sessionId, previous.layout)) {
				void window.electronAPI.terminal.kill({ terminalId }).catch((error: unknown): void => {
					console.error("[HomePage] failed to stop previous session terminal", error);
				});
			}
		}
		previousSessionLayoutRef.current = {
			sessionId: activeSessionId,
			layout: sessionLayout
		};
	}, [activeSessionId, sessionLayout]);

	const filteredGodotSceneFiles: GodotSceneFile[] = useMemo((): GodotSceneFile[] => {
		const query: string = godotSceneSearch.trim().toLowerCase();
		if (query.length === 0) {
			return godotSceneFiles;
		}
		return godotSceneFiles.filter((scene: GodotSceneFile): boolean => {
			return scene.relativePath.toLowerCase().includes(query) || scene.name.toLowerCase().includes(query);
		});
	}, [godotSceneFiles, godotSceneSearch]);
	const selectedLaunchTarget: WorkspaceLaunchTarget = useMemo((): WorkspaceLaunchTarget => {
		return workspaceLaunchTargets.find((target: WorkspaceLaunchTarget): boolean => target.id === selectedLaunchTargetId)
			?? workspaceLaunchTargets[0]
			?? FALLBACK_WORKSPACE_LAUNCH_TARGETS[0]!;
	}, [selectedLaunchTargetId, workspaceLaunchTargets]);
	const workspaceLaunchMenuItems: MenuProps["items"] = useMemo((): MenuProps["items"] => {
		return workspaceLaunchTargets.map((target: WorkspaceLaunchTarget) => {
			return {
				key: target.id,
				label: target.label,
				icon: getWorkspaceLaunchIcon(target.id)
			};
		});
	}, [workspaceLaunchTargets]);
	const openSummaryDiffReview = useCallback((): void => {
		setSummaryOpen(false);
		if (workspaceForActions === null) {
			return;
		}

		dockActivationRequestIdRef.current += 1;
		setSideDockActivationRequest({
			id: dockActivationRequestIdRef.current,
			kind: "review"
		});
		updateSideDock({ ...visualSessionLayoutRef.current.side, open: true });
	}, [updateSideDock, workspaceForActions]);
	useEffect((): (() => void) | void => {
		if (!showWorkspaceLaunchControls) {
			return;
		}

		let cancelled: boolean = false;
		window.electronAPI.workspaceFs.listLaunchTargets({
			godotExecutablePath: effectiveGodotLaunchExecutablePath
		})
			.then((targets: WorkspaceLaunchTarget[]): void => {
				if (cancelled) {
					return;
				}

				const nextTargets: WorkspaceLaunchTarget[] = targets.length > 0 ? targets : FALLBACK_WORKSPACE_LAUNCH_TARGETS;
				setWorkspaceLaunchTargets(nextTargets);
				setSelectedLaunchTargetId((currentTargetId: WorkspaceLaunchTargetId): WorkspaceLaunchTargetId => {
					if (nextTargets.some((target: WorkspaceLaunchTarget): boolean => target.id === currentTargetId)) {
						return currentTargetId;
					}
					return nextTargets.find((target: WorkspaceLaunchTarget): boolean => target.id === "vscode")?.id
						?? nextTargets[0]?.id
						?? "file-explorer";
				});
			})
			.catch((error: unknown): void => {
			console.error("[HomePage] failed to list workspace launch targets", error);
				if (!cancelled) {
					setWorkspaceLaunchTargets(FALLBACK_WORKSPACE_LAUNCH_TARGETS);
					setSelectedLaunchTargetId("file-explorer");
				}
			});

		return (): void => {
			cancelled = true;
		};
	}, [effectiveGodotLaunchExecutablePath, showWorkspaceLaunchControls]);

	useEffect((): (() => void) | void => {
		if (workspaceForActions === null || effectiveGodotLaunchExecutablePath === null) {
			setIsGodotProject(false);
			return;
		}

		let cancelled: boolean = false;
		window.electronAPI.workspaceFs.listChildren({
			workspaceRoot: workspaceForActions.rootPath,
			relativePath: ""
		}).then((result): void => {
			if (cancelled) {
				return;
			}
			setIsGodotProject(result.entries.some((entry): boolean => entry.kind === "file" && entry.name === "project.godot"));
		}).catch((error: unknown): void => {
		console.error("[HomePage] failed to detect Godot project", error);
			if (!cancelled) {
				setIsGodotProject(false);
			}
		});

		return (): void => {
			cancelled = true;
		};
	}, [effectiveGodotLaunchExecutablePath, workspaceForActions]);

	useEffect((): void => {
		summaryRequestIdRef.current += 1;
		setSummaryOpen(false);
		setSummaryOverview(null);
		setIsSummaryLoading(false);
		setSummaryError(null);
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

	const loadSummaryOverview = useCallback(async (
		planLimit: number = SUMMARY_PREVIEW_LIMIT,
		sourceLimit: number = SUMMARY_PREVIEW_LIMIT,
		silent: boolean = false
	): Promise<SessionOverviewResult | null> => {
		const target: SummaryOverviewTarget = summaryOverviewTargetRef.current;
		if (target.sessionId === null && target.workspace === null) {
			return null;
		}

		const requestId: number = ++summaryRequestIdRef.current;
		if (!silent) {
			setIsSummaryLoading(true);
			setSummaryError(null);
		}
		try {
			const result: SessionOverviewResult = target.sessionId !== null
				? await fetchSessionOverview({
					sessionId: target.sessionId,
					planLimit,
					sourceLimit
				})
				: await fetchWorkspaceOverview(target.workspace!);
			if (requestId !== summaryRequestIdRef.current || target.scopeKey !== summaryOverviewTargetRef.current.scopeKey) {
				return null;
			}
			setSummaryOverview(result);
			return result;
		} catch (error: unknown) {
			if (requestId !== summaryRequestIdRef.current || target.scopeKey !== summaryOverviewTargetRef.current.scopeKey) {
				return null;
			}
			console.error("[HomePage] failed to load session overview", error);
			if (!silent) {
				setSummaryError(error instanceof Error ? error.message : t("agentPage.summary.errors.load"));
			}
			return null;
		} finally {
			if (!silent && requestId === summaryRequestIdRef.current) {
				setIsSummaryLoading(false);
			}
		}
	}, [t]);

	useEffect((): void => {
		if (summaryOverviewTargetRef.current.sessionId !== null || summaryOverviewTargetRef.current.workspace !== null) {
			void loadSummaryOverview();
		}
	}, [loadSummaryOverview, summaryScopeKey]);

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
				includeSourceImages: false
			})
				.then((result: SessionOverviewResult): void => {
					if (!cancelled) {
						setPlansDialogOverview(result);
					}
				})
				.catch((error: unknown): void => {
					if (!cancelled) {
						console.error("[HomePage] failed to load session plans", error);
						setPlansDialogError(error instanceof Error ? error.message : t("agentPage.summary.errors.load"));
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
				includeSourceImages: false
			})
				.then((result: SessionOverviewResult): void => {
					if (!cancelled) {
						setSourcesDialogOverview(result);
					}
				})
				.catch((error: unknown): void => {
					if (!cancelled) {
						console.error("[HomePage] failed to load session sources", error);
						setSourcesDialogError(error instanceof Error ? error.message : t("agentPage.summary.errors.load"));
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

	const handleSummaryOpenChange = useCallback((open: boolean): void => {
		setSummaryOpen(open);
		if (!open) {
			return;
		}
		if (summaryOverview === null && summaryError === null && !isSummaryLoading) {
			void loadSummaryOverview();
			return;
		}
		// 先显示缓存，再静默读取当前 Git 工作区状态，避免 diff 长时间停留在旧快照。
		void loadSummaryOverview(SUMMARY_PREVIEW_LIMIT, SUMMARY_PREVIEW_LIMIT, true);
	}, [isSummaryLoading, loadSummaryOverview, summaryError, summaryOverview]);
	const handleDockGitStateChange = useCallback(async (): Promise<void> => {
		setGitStateRevision((current: number): number => current + 1);
		onWorkspaceRefresh();
		await loadSummaryOverview();
	}, [loadSummaryOverview, onWorkspaceRefresh]);

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
		onBranchSuccess: handleDockGitStateChange
	});

	const requestSummaryGitAction = useCallback((sourceFolderId: string, action: SummaryGitAction): void => {
		setSummaryOpen(false);
		setSummaryGitSourceFolderId(sourceFolderId);
		summaryGitActionRequestIdRef.current += 1;
		setSummaryGitActionRequest({
			id: summaryGitActionRequestIdRef.current,
			action,
			sourceFolderId
		});
	}, []);

	useEffect((): void => {
		if (summaryGitActionRequest === null || summaryGitActionRequest.sourceFolderId !== summaryGitSourceFolderId) {
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
	}, [gitActions.openBranchDialog, gitActions.openCommitDialog, openSummaryDiffReview, summaryGitActionRequest, summaryGitSourceFolderId]);

	const summaryEnvInfos: SessionOverviewGitInfo[] = useMemo((): SessionOverviewGitInfo[] => {
		if (summaryOverview === null) {
			return [];
		}
		if ((summaryOverview.envInfos?.length ?? 0) > 0) {
			return summaryOverview.envInfos ?? [];
		}
		if (summaryOverview.envInfo === null) {
			return [];
		}
		const fallbackSource = workspaceForActions?.sourceFolders.find(
			(source): boolean => source.path === summaryOverview.envInfo?.sourceFolderPath
		) ?? workspaceForActions?.sourceFolders.find(
			(source): boolean => source.id === workspaceForActions.primarySourceFolderId
		) ?? workspaceForActions?.sourceFolders[0];
		const sourceFolderPath: string = summaryOverview.envInfo.sourceFolderPath
			|| fallbackSource?.path
			|| workspaceForActions?.rootPath
			|| "";
		return [{
			...summaryOverview.envInfo,
			sourceFolderId: summaryOverview.envInfo.sourceFolderId || fallbackSource?.id || "primary",
			sourceFolderPath,
			title: summaryOverview.envInfo.title || getPathBasename(sourceFolderPath)
		}];
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

				const result = await window.electronAPI.workspaceFs.listChildren({
					workspaceRoot,
					relativePath
				});
				const entries = [...result.entries].sort((left, right): number => {
					if (left.kind !== right.kind) {
						return left.kind === "folder" ? -1 : 1;
					}
					return left.relativePath.localeCompare(right.relativePath);
				});

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
							resourcePath: entry.resourcePath
						});
					}
				}
			}

			await scan("");
			setGodotSceneFiles(scenes);
		} catch (error: unknown) {
			const message: string = error instanceof Error ? error.message : t("agentPage.summary.godot.errors.loadScenes");
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

	const runGodotScene = useCallback((scene: GodotSceneFile): void => {
		setIsGodotSceneModalOpen(false);
		void openWorkspaceLaunchTarget("godot", {
			godotRunMode: "scene",
			godotScenePath: scene.relativePath
		});
	}, [openWorkspaceLaunchTarget]);

	const summaryCollapseItems: NonNullable<CollapseProps["items"]> = useMemo((): NonNullable<CollapseProps["items"]> => {
		if (summaryOverview === null) {
			return [];
		}

		const items: NonNullable<CollapseProps["items"]> = [];
		for (const envInfo of summaryEnvInfos) {
			const hasDiff: boolean = envInfo.changedFiles > 0;
			const hasDiffStats: boolean = envInfo.additions > 0 || envInfo.deletions > 0;
			items.push({
				key: `env_info:${envInfo.sourceFolderId}`,
				label: <Tooltip title={envInfo.sourceFolderPath}>{envInfo.title}</Tooltip>,
				children: (
					<div className={styles.summarySection}>
						<Button
							type="text"
							block
							icon={<Icon name="git-diff" />}
							className={styles.summaryActionButton}
							onClick={(): void => requestSummaryGitAction(envInfo.sourceFolderId, "diff")}
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
								requestSummaryGitAction(envInfo.sourceFolderId, "branch");
							}}
						>
							{envInfo.branch ?? t("agentPage.summary.detachedHead")}
						</Button>
						<Button
							type="text"
							block
							disabled={!hasDiff}
							aria-busy={gitActions.isCommitMessageGenerating}
							icon={gitActions.isCommitMessageGenerating ? <Spin size="small" /> : <Icon name="git-commit" />}
							className={styles.summaryActionButton}
							onClick={(): void => {
								requestSummaryGitAction(envInfo.sourceFolderId, "commit");
							}}
						>
							{t("agentPage.summary.actions.commitOrPush")}
						</Button>
					</div>
				),
				showArrow: false
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
				showArrow: false
			});
		}

		if (summaryOverview.plans.total > 0) {
			items.push({
				key: "plans",
				label: t("agentPage.summary.sections.plans"),
				children: (
					<div className={styles.planList}>
						{summaryOverview.plans.items.slice(0, SUMMARY_PREVIEW_LIMIT).map((plan: SessionOverviewPlanItem): React.ReactNode => (
							<Button
								key={plan.planId}
								type="text"
								block
								className={styles.summaryActionButton}
								onClick={(): void => {
									setSummaryOpen(false);
									setPreviewPlan(plan);
								}}
							>
								{plan.title}
							</Button>
						))}
						{summaryOverview.plans.total > SUMMARY_PREVIEW_LIMIT ? (
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
				showArrow: false
			});
		}

		if (summaryOverview.sources.total > 0) {
			items.push({
				key: "source",
				label: t("agentPage.summary.sections.source"),
				children: (
					<div className={styles.sourceList}>
						{summaryOverview.sources.items.slice(0, SUMMARY_PREVIEW_LIMIT).map((source: SessionOverviewSourceItem): React.ReactNode => (
							<Button
								key={`${source.kind}:${source.id}`}
								type="text"
								block
								className={styles.sourceButton}
								icon={source.thumbnailDataUrl !== undefined ? (
									<img
										src={source.thumbnailDataUrl}
										alt=""
										className={styles.sourceThumbnail}
									/>
								) : <Icon name="txt" className={styles.sourceTextIcon} />}
								onClick={(): void => {
									setSummaryOpen(false);
									setPreviewSource(source);
								}}
							>
								<span className={styles.sourceText}>
									<span className={styles.summaryItemTitle}>{source.title}</span>
									<span className={styles.summaryMeta}>{formatSourceSubtitle(source, t)}</span>
								</span>
							</Button>
						))}
						{summaryOverview.sources.total > SUMMARY_PREVIEW_LIMIT ? (
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
				showArrow: false
			});
		}

		return items;
	}, [gitActions.isCommitMessageGenerating, openGodotSceneModal, requestSummaryGitAction, runGodotProject, showGodotSummaryActions, summaryEnvInfos, summaryOverview, t]);

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
					previewMarkdown: result.previewMarkdown || result.markdown || ""
				});
			})
			.catch((error: unknown): void => {
				if (requestId === planPreviewRequestIdRef.current) {
					console.error("[HomePage] failed to load plan preview", error);
					setPlanPreviewError(error instanceof Error ? error.message : t("agentPage.summary.errors.load"));
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
		options: { godotRunMode?: "editor" | "project" | "scene"; godotScenePath?: string } = {}
	): Promise<void> {
		if (workspaceForActions === null) {
			return;
		}

		setSelectedLaunchTargetId(targetId);
		setIsOpeningLaunchTarget(true);
		try {
			await window.electronAPI.workspaceFs.openLaunchTarget({
				workspaceRoot: workspaceForActions.rootPath,
				targetId,
				godotExecutablePath: targetId === "godot" ? effectiveGodotLaunchExecutablePath : undefined,
				godotRunMode: targetId === "godot" ? options.godotRunMode : undefined,
				godotScenePath: targetId === "godot" ? options.godotScenePath : undefined
			});
		} catch (error: unknown) {
			const message: string = error instanceof Error ? error.message : t("agentPage.workspaceLaunch.errors.open");
			console.error("[HomePage] failed to open workspace launch target", error);
			void messageApi.error(message);
		} finally {
			setIsOpeningLaunchTarget(false);
		}
	}

	const handleWorkspaceLaunchMenuClick: MenuProps["onClick"] = ({ key }): void => {
		const targetId: string = String(key);
		if (!isWorkspaceLaunchTargetId(targetId)) {
			return;
		}

		void openWorkspaceLaunchTarget(targetId);
	};

	const setScrollToBottomButtonVisible = useCallback((visible: boolean): void => {
		scrollToBottomButtonVisibleRef.current = visible;
		const button: HTMLButtonElement | null = scrollToBottomButtonRef.current;
		if (button === null) {
			return;
		}

		button.classList.toggle(styles.scrollToBottomButtonHidden, !visible);
		button.tabIndex = visible ? 0 : -1;
		button.setAttribute("aria-hidden", visible ? "false" : "true");
	}, []);

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
			kind
		});
	}, []);

	const openSideDock = useCallback((kind?: DockPanelKind): void => {
		scheduleSessionLayoutSave({
			...visualSessionLayoutRef.current,
			side: { ...visualSessionLayoutRef.current.side, open: true }
		});
		if (kind !== undefined) {
			requestSideDockKind(kind);
		}
	}, [requestSideDockKind, scheduleSessionLayoutSave]);

	const closeSideDock = useCallback((): void => {
		scheduleSessionLayoutSave({
			...visualSessionLayoutRef.current,
			side: { ...visualSessionLayoutRef.current.side, open: false }
		});
	}, [scheduleSessionLayoutSave]);

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
		scheduleSessionLayoutSave({
			...visualSessionLayoutRef.current,
			bottom: { ...visualSessionLayoutRef.current.bottom, open: true }
		});
	}, [scheduleSessionLayoutSave]);

	const closeBottomDock = useCallback((): void => {
		scheduleSessionLayoutSave({
			...visualSessionLayoutRef.current,
			bottom: { ...visualSessionLayoutRef.current.bottom, open: false }
		});
	}, [scheduleSessionLayoutSave]);

	const toggleBottomDock = useCallback((): void => {
		if (bottomDockOpen) {
			closeBottomDock();
			return;
		}
		openBottomDock();
	}, [bottomDockOpen, closeBottomDock, openBottomDock]);

	const toggleWorkspaceSidebar = useCallback((): void => {
		scheduleWorkspaceSidebarSave({
			...visualWorkspaceSidebarRef.current,
			open: !visualWorkspaceSidebarRef.current.open
		});
	}, [scheduleWorkspaceSidebarSave]);


	useEffect((): (() => void) => {
		const platform: ShortcutPlatform = detectShortcutPlatform();
		const handleGlobalShortcut = (event: KeyboardEvent): void => {
			if (event.defaultPrevented) {
				return;
			}
			if (event.key === "Escape" && conversationTimelinePaneRef.current?.closeSearch() === true) {
				event.preventDefault();
				return;
			}
			if (shouldIgnoreGlobalShortcut(event)) {
				return;
			}
			const commandId: ShortcutCommandId | null = findMatchingShortcutCommand(
				event,
				keyboardShortcuts,
				platform
			);
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
			if (activeSessionId === null || isHome) {
				return;
			}
			if (commandId === "conversation.find") {
				event.preventDefault();
				conversationTimelinePaneRef.current?.openSearch(getSelectedConversationSearchQuery(chatBodyRef.current));
				return;
			}
			if (timelineNavigationEntries.length === 0) {
				return;
			}
			event.preventDefault();
			conversationTimelinePaneRef.current?.navigateTurn(commandId === "conversation.previousTurn" ? "previous" : "next");
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
		toggleBottomDock,
		toggleSideDock,
		toggleWorkspaceSidebar
	]);

	function handleWorkspaceSidebarResize(sizes: number[]): void {
		const nextSize: number | undefined = sizes[0];
		if (nextSize === undefined || !Number.isFinite(nextSize)) {
			return;
		}

		const normalizedSize: number = Math.min(
			WORKSPACE_SIDEBAR_MAX_SIZE,
			Math.max(WORKSPACE_SIDEBAR_CLOSED_SIZE, Math.trunc(nextSize))
		);
		if (normalizedSize < WORKSPACE_SIDEBAR_CLOSE_THRESHOLD) {
			applyVisualWorkspaceSidebar({ ...visualWorkspaceSidebarRef.current, open: false });
			return;
		}

		applyVisualWorkspaceSidebar({
			open: true,
			size: normalizedSize
		});
	}

	function handleWorkspaceSidebarResizeEnd(sizes: number[]): void {
		const nextSize: number | undefined = sizes[0];
		if (nextSize === undefined || !Number.isFinite(nextSize)) {
			return;
		}
		if (nextSize < WORKSPACE_SIDEBAR_CLOSE_THRESHOLD) {
			commitWorkspaceSidebar({ ...visualWorkspaceSidebarRef.current, open: false });
			return;
		}

		commitWorkspaceSidebar({
			open: true,
			size: Math.min(
				WORKSPACE_SIDEBAR_MAX_SIZE,
				Math.max(WORKSPACE_SIDEBAR_CLOSE_THRESHOLD, Math.trunc(nextSize))
			)
		});
	}

	function handleSideDockResize(sizes: number[]): void {
		const nextSize: number | undefined = sizes[1];
		if (nextSize === undefined || !Number.isFinite(nextSize)) {
			return;
		}

		const normalizedSize: number = Math.min(SIDE_DOCK_MAX_SIZE, Math.max(SIDE_DOCK_CLOSED_SIZE, Math.trunc(nextSize)));
		if (normalizedSize < SIDE_DOCK_CLOSE_THRESHOLD) {
			applyVisualSessionLayout({
				...visualSessionLayoutRef.current,
				side: { ...visualSessionLayoutRef.current.side, open: false }
			});
			return;
		}

		applyVisualSessionLayout({
			...visualSessionLayoutRef.current,
			side: { ...visualSessionLayoutRef.current.side, open: true, size: normalizedSize }
		});
	}

	function handleSideDockResizeEnd(sizes: number[]): void {
		const nextSize: number | undefined = sizes[1];
		if (nextSize === undefined || !Number.isFinite(nextSize)) {
			return;
		}
		if (nextSize < SIDE_DOCK_CLOSE_THRESHOLD) {
			commitSessionLayout({
				...visualSessionLayoutRef.current,
				side: { ...visualSessionLayoutRef.current.side, open: false }
			});
			return;
		}

		const validSize: number = Math.min(SIDE_DOCK_MAX_SIZE, Math.max(SIDE_DOCK_CLOSE_THRESHOLD, Math.trunc(nextSize)));
		commitSessionLayout({
			...visualSessionLayoutRef.current,
			side: { ...visualSessionLayoutRef.current.side, open: true, size: validSize }
		});
	}

	function handleBottomDockResize(sizes: number[]): void {
		const nextSize: number | undefined = sizes[1];
		if (nextSize === undefined || !Number.isFinite(nextSize)) {
			return;
		}

		const normalizedSize: number = Math.min(BOTTOM_DOCK_MAX_SIZE, Math.max(BOTTOM_DOCK_CLOSED_SIZE, Math.trunc(nextSize)));
		if (normalizedSize < BOTTOM_DOCK_CLOSE_THRESHOLD) {
			applyVisualSessionLayout({
				...visualSessionLayoutRef.current,
				bottom: { ...visualSessionLayoutRef.current.bottom, open: false }
			});
			return;
		}

		applyVisualSessionLayout({
			...visualSessionLayoutRef.current,
			bottom: { ...visualSessionLayoutRef.current.bottom, open: true, size: normalizedSize }
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
				bottom: { ...visualSessionLayoutRef.current.bottom, open: false }
			});
			return;
		}

		const validSize: number = Math.min(BOTTOM_DOCK_MAX_SIZE, Math.max(BOTTOM_DOCK_CLOSE_THRESHOLD, Math.trunc(nextSize)));
		commitSessionLayout({
			...visualSessionLayoutRef.current,
			bottom: { ...visualSessionLayoutRef.current.bottom, open: true, size: validSize }
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

	const summaryPopoverContent: React.ReactNode = useMemo((): React.ReactNode => (
		<div className={styles.summaryPanel}>
			{isSummaryLoading && summaryOverview === null ? (
				<div className={styles.summaryLoading}>
					<Spin />
				</div>
			) : summaryError !== null ? (
				<div className={styles.summaryEmpty}>
					<Typography.Text type="danger">{summaryError}</Typography.Text>
					<Button
						type="text"
						icon={<Icon name="refresh" />}
						onClick={(): void => {
							void loadSummaryOverview();
						}}
					>
						{t("agentPage.summary.actions.retry")}
					</Button>
				</div>
			) : summaryCollapseItems.length > 0 ? (
				summaryCollapseItems.map((item, index): React.ReactNode => (
					<div key={String(item?.key ?? index)}>
						{index > 0 ? <Divider size="small" /> : null}
						<Collapse
							size="small"
							bordered={false}
							items={item === undefined ? [] : [item]}
							className={styles.summaryCollapse}
							defaultActiveKey={[String(item?.key ?? "")]}
							onChange={(activeKeys: string | string[]): void => {
								const key: string = String(item?.key ?? "");
								const expanded: boolean = Array.isArray(activeKeys)
									? activeKeys.includes(key)
									: activeKeys === key;
								if (expanded && key.startsWith("env_info:")) {
									void loadSummaryOverview(SUMMARY_PREVIEW_LIMIT, SUMMARY_PREVIEW_LIMIT, true);
								}
							}}
						/>
					</div>
				))
			) : (
				<Empty
					image={Empty.PRESENTED_IMAGE_SIMPLE}
					description={t("agentPage.summary.empty")}
					className={styles.summaryEmpty}
				/>
			)}
		</div>
	), [isSummaryLoading, loadSummaryOverview, summaryCollapseItems, summaryError, summaryOverview, t]);

	function renderSummaryButton(): React.ReactNode {
		return (
			<Popover
				trigger={["click"]}
				placement="bottom"
				open={summaryOpen}
				onOpenChange={handleSummaryOpenChange}
				fresh
				className={styles.summaryPopver}
				content={summaryPopoverContent}
			>
				<Tooltip title={t("agentPage.summary.tooltip")}>
					<Button
						type="text"
						shape="circle"
						aria-label={t("agentPage.summary.aria.open")}
						aria-pressed={summaryOpen}
						icon={<Icon name="list-check" />}
					/>
				</Tooltip>
			</Popover>
		);
	}

	return (
		<div
			className={styles.page}
			onDragOver={handlePageDragOver}
			onDrop={handlePageDrop}
		>
			{messageContextHolder}
			<Splitter
				className={styles.workspaceSplitter}
				classNames={SPLITTER_CLASS_NAMES}
				draggerIcon={null}
				collapsible={{ motion: true }}
				onResize={handleWorkspaceSidebarResize}
				onResizeEnd={handleWorkspaceSidebarResizeEnd}
			>
				<Splitter.Panel
					size={workspaceSidebarOpen ? workspaceSidebarSize : WORKSPACE_SIDEBAR_CLOSED_SIZE}
					min={WORKSPACE_SIDEBAR_CLOSED_SIZE}
					max={WORKSPACE_SIDEBAR_MAX_SIZE}
					collapsible={{ end: true, showCollapsibleIcon: false }}
				>
					<aside className={styles.workspaceSidebar} aria-hidden={!workspaceSidebarOpen}>
						<header className={styles.workspaceHeader}>
							<Button
								type="text"
								block
								icon={<Icon name="add" />}
								className={styles.createSessionButton}
								onClick={onNewSession}
							>
								{t("agentPage.actions.newSession")}
							</Button>
						</header>
						<WorkspaceTree
							refreshToken={workspaceRefreshToken}
							selectedSessionId={activeSessionId}
							selectedWorkspaceId={activeWorkspaceId}
							initialWorkspaces={initialWorkspaces}
							initialSessions={initialSessions}
							initialActiveWorkspaceId={initialActiveWorkspaceId}
							initialWorkspaceTreeOrder={initialWorkspaceTreeOrder}
							runningSessionIds={runningSessionIds}
							unreadSessionIds={unreadSessionIds}
							sessionUpdate={activeSessionMetadata}
							onNewSession={onNewUnboundSession}
							onSessionSelect={onSessionSelect}
							onSessionArchive={onSessionArchive}
							onSessionRename={onSessionRename}
							onSessionsChange={onSessionsChange}
							onNewWorkspaceSession={onNewWorkspaceSession}
							onWorkspaceDelete={onWorkspaceDelete}
							onWorkspaceUpdate={onWorkspaceUpdate}
							onWorkspaceProjectCreated={onWorkspaceProjectCreated}
						/>
						<footer className={styles.workspaceFooter}>
							<Button
								icon={<Icon name="settings" />}
								type="text"
								block
								className={styles.openSettingsButton}
								aria-label={t("agentPage.actions.openSettings")}
								onClick={(): void => {
									void window.electronAPI.windowControl.openSettings();
								}}
							>
								{t("agentPage.actions.openSettings")}
							</Button>
						</footer>
					</aside>
				</Splitter.Panel>

				<Splitter.Panel min={360}>
					<div className={styles.agentMain}>
				{showWorkspaceLaunchControls || showSummaryButton || showBottomDockButton || showSideDockButton ? (
					<div className={styles.floatingActionSlot}>
						<div className={styles.floatingActions}>
							{showWorkspaceLaunchControls ? (
								<Space.Compact className={styles.workspaceLaunchControls}>
									<Button
										loading={isOpeningLaunchTarget}
										icon={getWorkspaceLaunchIcon(selectedLaunchTarget.id)}
										onClick={(): void => { void openWorkspaceLaunchTarget(selectedLaunchTarget.id); }}
									>
										{t("agentPage.workspaceLaunch.openIn", { target: selectedLaunchTarget.label })}
									</Button>
									<Dropdown
										menu={{
											items: workspaceLaunchMenuItems,
											selectedKeys: [selectedLaunchTarget.id],
											onClick: handleWorkspaceLaunchMenuClick
										}}
										trigger={["click"]}
									>
										<Button
											aria-label={t("agentPage.workspaceLaunch.aria.selectTarget")}
											icon={<Icon name="arrow-down" />}
										/>
									</Dropdown>
								</Space.Compact>
							) : null}
							{showSummaryButton ? renderSummaryButton() : null}
							{showBottomDockButton ? (
								<Tooltip title={bottomDockOpen ? t("agentPage.dock.closeBottom") : t("agentPage.dock.openBottom")}>
									<Button
										type="text"
										shape="circle"
										aria-pressed={bottomDockOpen}
										icon={<Icon name={bottomDockOpen ? "layout-bottom-toggled" : "layout-bottom"} />}
										onClick={toggleBottomDock}
									/>
								</Tooltip>
							) : null}
							{showSideDockButton ? (
								<Tooltip title={sideDockOpen ? t("agentPage.dock.closeSidebar") : t("agentPage.dock.openSidebar")}>
									<Button
										type="text"
										shape="circle"
										aria-pressed={sideDockOpen}
										icon={<Icon name={sideDockOpen ? "layout-right-toggled" : "layout-right"} />}
										onClick={toggleSideDock}
									/>
								</Tooltip>
							) : null}
						</div>
					</div>
				) : null}
				<Splitter
					className={styles.agentVerticalSplitter}
					classNames={SPLITTER_CLASS_NAMES}
					draggerIcon={null}
					orientation="vertical"
					collapsible={{ motion: true }}
					onResize={handleBottomDockResize}
					onResizeEnd={handleBottomDockResizeEnd}
				>
					<Splitter.Panel min={360}>
						<Splitter
							className={styles.agentSplitter}
							classNames={SPLITTER_CLASS_NAMES}
							draggerIcon={null}
							collapsible={{ motion: true }}
							onResize={handleSideDockResize}
							onResizeEnd={handleSideDockResizeEnd}
						>
							<Splitter.Panel min={360}>
								<section className={styles.chatPanel}>
									<header className={styles.chatHeader}>
										<Typography.Text className={styles.chatText} ellipsis={{ tooltip: chatTitle }}>
											{chatTitle}
										</Typography.Text>
									</header>

									<Divider size="small" />

									<div ref={chatBodyRef} className={styles.chatBody}>
										{isHome ? (
											<NewSessionHome workspace={homeWorkspace} errorMessage={sessionError} />
										) : activeSessionId !== null ? (
											<MarkdownResourceActionsProvider
												value={{
													workspaceRoot: workspaceForActions?.rootPath ?? null,
													godotExecutablePath: effectiveGodotLaunchExecutablePath,
													currentWorkspaceLaunch: workspaceForActions === null ? null : selectedLaunchTarget,
													launchTargets: workspaceLaunchTargets
												}}
											>
											<ConversationTimelinePane
												ref={conversationTimelinePaneRef}
												sessionId={activeSessionId}
												timelineStore={timelineStore}
												timelineNavigationEntries={timelineNavigationEntries}
												isLoading={isSessionLoading}
												errorMessage={sessionError}
												isLoadingMoreBefore={isLoadingMoreBefore}
												isLoadingMoreAfter={isLoadingMoreAfter}
												retryDisabled={retryDisabled}
												activeRetryRequestId={activeRetryRequestId}
												onLoadMoreBefore={onLoadMoreBefore}
												onLoadMoreAfter={onLoadMoreAfter}
												onTimelineNavigationLoadEntry={onTimelineNavigationLoadEntry}
												onTimelineSearchLoadOffset={onTimelineSearchLoadOffset}
												onRetryEditStart={onRetryEditStart}
												onRetryEditCancel={onRetryEditCancel}
												onRetryFromUserMessage={onRetryFromUserMessage}
												onInlineDiffReview={openReviewPanel}
												onAwayFromBottomChange={setScrollToBottomButtonVisible}
												contextItems={selectionMarkerContextItems}
												onAddContext={onAddContext}
												initialSelectionAskThreads={selectionAskThreads}
												goal={currentGoal}
											/>
											</MarkdownResourceActionsProvider>
										) : null}
									</div>

									<footer className={styles.composer}>
										{!isHome ? (
											<Button
												ref={scrollToBottomButtonRef}
												shape="circle"
												title={t("agentPage.actions.scrollToBottom")}
												icon={<Icon name="arrow-bottom" />}
												tabIndex={-1}
											className={[
												styles.scrollToBottomButton,
												showExecutionStatusPanel ? styles.scrollToBottomButtonAboveExecutionStatus : "",
												styles.scrollToBottomButtonHidden
												].filter(Boolean).join(" ")}
												onClick={scrollMessageListToBottom}
											/>
										) : null}
										{!isHome && pendingApproval !== null ? (
											<ApprovalDialog
												pendingApproval={pendingApproval}
												isApproving={isApproving}
												isRejecting={isRejecting}
												errorMessage={approvalError}
												onApprove={onApprovalApprove}
												onReject={onApprovalReject}
											/>
										) : !isHome && pendingToolBudget !== null ? (
											<ToolBudgetDialog
												pendingToolBudget={pendingToolBudget}
												isContinuing={isToolBudgetContinuing}
												isStopping={isToolBudgetStopping}
												errorMessage={toolBudgetError}
												onContinue={onToolBudgetContinue}
												onStop={onToolBudgetStop}
											/>
										) : !isHome && pendingPlanClarification !== null ? (
											<ClarificationDialog
												planId={pendingPlanClarification.planId}
												title={pendingPlanClarification.title}
												question={pendingPlanClarification.question}
												recommendedReplies={pendingPlanClarification.recommendedReplies}
												isSubmitting={isPlanClarificationSubmitting}
												errorMessage={planClarificationError}
												onSubmit={onPlanClarificationSubmit}
												onSkip={onPlanClarificationSkip}
											/>
										) : !isHome && pendingPlanApproval !== null ? (
											<PlanApprovalDialog
												plan={pendingPlanApproval}
												isApproving={isPlanApproving}
												isRevising={isPlanRevising}
												errorMessage={planApprovalError}
												onApprove={onPlanApprove}
												onRevise={onPlanRevise}
											/>
										) : (
											<>
											{showExecutionStatusPanel ? (
													<TimelineWorkflowTodoPanel
														timelineStore={timelineStore}
														sessionId={activeSessionId!}
														snapshot={workflowTodoSnapshot}
														goal={currentGoal}
														onDismiss={onWorkflowTodoDismiss}
														onGoalChange={onGoalChange}
														onGoalDismiss={onGoalDismiss}
													/>
												) : null}
												{!isHome ? (
													<MessageQueuePanel
														messageQueue={messageQueue}
														pendingGuides={pendingGuides}
														activeQueueItemId={activeQueueItemId}
														onQueueRemove={onQueueMessageRemove}
														onQueueEdit={onQueueMessageEdit}
														onQueueReorder={onQueueMessageReorder}
														onGuideDelete={onGuideDelete}
														onGuideReorder={onGuideReorder}
													/>
												) : null}
											<Composer
												key={composerInstanceKey}
												providerModelSelection={providerModelSelection}
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
											showContextUsage={!isHome}
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
								onWorkspaceSelect={isHome ? onHomeWorkspaceSelect : undefined}
								onWorkspaceAdd={isHome ? onHomeWorkspaceAdd : undefined}
								onWorkspaceClear={isHome ? onHomeWorkspaceClear : undefined}
													onRemoveContext={onRemoveContext}
													onPinContext={onPinContext}
													onClearUnpinnedContext={onClearUnpinnedContext}
													onCancel={onCancel}
													onSubmit={onSubmit}
													onGuideSubmit={onGuideSubmit}
													onCompletionOpen={onCompletionOpen}
												/>
											</>
										)}
									</footer>
								</section>
							</Splitter.Panel>
							{showSideDockButton ? (
								<Splitter.Panel
									size={sideDockOpen ? sideDockSize : SIDE_DOCK_CLOSED_SIZE}
									min={SIDE_DOCK_CLOSED_SIZE}
									max={SIDE_DOCK_MAX_SIZE}
									collapsible={{ start: true, showCollapsibleIcon: false }}
								>
									<div className={styles.sideDockSlot} aria-hidden={!sideDockOpen}>
										<DockPanelTabs
											dockId="side"
											placement="side"
											sessionId={activeSessionId}
											workspaceId={workspaceForActions?.id ?? null}
											sourceFolderId={summaryGitSourceFolderId}
											cwd={workspaceForActions?.rootPath ?? null}
											contextItems={contextItems}
											onAddContext={onAddContext}
										onRemoveContext={onRemoveContext}
										gitStateRevision={gitStateRevision}
										onGitStateChange={handleDockGitStateChange}
											isOpen={sideDockOpen}
											waitForCwd={terminalWaitForCwd}
											defaultKind="review"
											layout={visualSessionLayout.side}
											activationRequest={sideDockActivationRequest}
											onLayoutChange={updateSideDock}
										/>
									</div>
								</Splitter.Panel>
							) : null}
						</Splitter>
					</Splitter.Panel>
					{showBottomDockButton ? (
						<Splitter.Panel
							size={bottomDockOpen ? bottomDockSize : BOTTOM_DOCK_CLOSED_SIZE}
							min={BOTTOM_DOCK_CLOSED_SIZE}
							max={BOTTOM_DOCK_MAX_SIZE}
							collapsible={{ start: true, showCollapsibleIcon: false }}
						>
							<div className={styles.bottomDockSlot} aria-hidden={!bottomDockOpen}>
								<DockPanelTabs
									dockId="bottom"
									placement="bottom"
									sessionId={activeSessionId}
									workspaceId={workspaceForActions?.id ?? null}
									sourceFolderId={summaryGitSourceFolderId}
									cwd={workspaceForActions?.rootPath ?? null}
									contextItems={contextItems}
									onAddContext={onAddContext}
									onRemoveContext={onRemoveContext}
									gitStateRevision={gitStateRevision}
									onGitStateChange={handleDockGitStateChange}
									isOpen={bottomDockOpen}
									waitForCwd={terminalWaitForCwd}
									defaultKind="terminal"
									layout={visualSessionLayout.bottom}
									onLayoutChange={updateBottomDock}
								/>
							</div>
						</Splitter.Panel>
					) : null}
				</Splitter>
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
						placeholder={t("agentPage.summary.godot.sceneModal.searchPlaceholder")}
						onChange={(event: React.ChangeEvent<HTMLInputElement>): void => {
							setGodotSceneSearch(event.target.value);
						}}
					/>
					{isGodotSceneLoading ? (
						<div className={styles.godotSceneLoading}>
							<Spin />
						</div>
					) : filteredGodotSceneFiles.length > 0 ? (
						<div className={styles.godotSceneList}>
							{filteredGodotSceneFiles.map((scene: GodotSceneFile): React.ReactNode => (
								<Button
									key={scene.relativePath}
									type="text"
									block
									className={styles.godotSceneButton}
									onClick={(): void => runGodotScene(scene)}
								>
									<span className={styles.godotSceneText}>
										<span className={styles.summaryItemTitle}>{scene.name}</span>
										<span className={styles.summaryMeta}>{scene.resourcePath}</span>
									</span>
								</Button>
							))}
						</div>
					) : (
						<Empty
							image={Empty.PRESENTED_IMAGE_SIMPLE}
							description={t("agentPage.summary.godot.sceneModal.empty")}
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

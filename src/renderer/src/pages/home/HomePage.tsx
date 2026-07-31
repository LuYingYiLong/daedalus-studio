import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Button, Divider, Dropdown, Empty, Input, message as antdMessage, Modal, Space, Spin, Splitter, Typography, Popover, Collapse, Tooltip } from "antd";
import type { CollapseProps, InputRef, MenuProps, SplitterProps } from "antd";
import { useTranslation } from "react-i18next";
import type { AdditionalContextItem, MessageQueueItem, PendingGuide, PendingToolBudget, PlanApprovalState, PlanClarificationState, SessionMetadata, SessionTimelineNavigationEntry, TimelineBlock, WorkflowTodoSnapshot, WorkspaceConfig } from "@/api/types";
import type { ChatMode } from "@/api/chat-api";
import type { ApprovalMode, PendingApproval } from "@/api/approval-api";
import type { SlashCommandDefinition } from "@/api/command-api";
import type { ProviderModelSelection } from "@/api/provider-api";
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
import { fetchSessionOverview, type SessionOverviewPlanItem, type SessionOverviewResult, type SessionOverviewSourceItem } from "@/api/session-overview-api";
import WorkspaceTree from "@/features/workspace/WorkspaceTree";
import MessageList, { type MessageListHandle } from "@/features/chat/MessageList";
import ConversationAnchorNavigator from "@/features/chat/ConversationAnchorNavigator";
import ConversationSearchPanel from "@/features/chat/ConversationSearchPanel";
import { useConversationSearch } from "@/features/chat/useConversationSearch";
import Composer from "@/features/composer/Composer";
import FloatingWorkflowTodoPanel, { type WorkflowFileChangeSummary } from "@/features/composer/FloatingWorkflowTodoPanel";
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

function aggregateTimelineFileChanges(blocks: TimelineBlock[]): WorkflowFileChangeSummary {
	const countedBatchIds: Set<string> = new Set();
	let additions: number = 0;
	let deletions: number = 0;
	let changedFiles: number = 0;

	function addFileChangeRecord(record: Record<string, unknown>): void {
		const batchId: string = getRecordString(record, "batchId");
		if (batchId.length > 0) {
			if (countedBatchIds.has(batchId)) {
				return;
			}
			countedBatchIds.add(batchId);
		}

		additions += getRecordNumber(record, "additions");
		deletions += getRecordNumber(record, "deletions");
		changedFiles += getRecordNumber(record, "editedFileCount");
	}

	for (const block of blocks) {
		if (block.type !== "assistant") {
			continue;
		}

		for (const part of block.bodyParts) {
			if (part.type === "inline_diff") {
				const batchIds: string[] = part.batchIds.filter((batchId: string): boolean => batchId.length > 0);
				if (batchIds.length > 0 && batchIds.every((batchId: string): boolean => countedBatchIds.has(batchId))) {
					continue;
				}
				additions += part.additions;
				deletions += part.deletions;
				changedFiles += part.editedFileCount;
				for (const batchId of batchIds) {
					countedBatchIds.add(batchId);
				}
				continue;
			}

			if (part.type !== "tool") {
				continue;
			}

			for (const event of part.events) {
				const fileEditBatch: unknown = event.fileEditBatch;
				if (isRecord(fileEditBatch)) {
					addFileChangeRecord(fileEditBatch);
				}
			}
		}
	}

	return { additions, deletions, changedFiles };
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
	timelineBlocks: TimelineBlock[];
	timelineBlockOffset: number;
	timelineNavigationEntries: SessionTimelineNavigationEntry[];
	isSessionLoading: boolean;
	sessionError: string | null;
	hasMoreBefore: boolean;
	hasMoreAfter: boolean;
	isLoadingMoreBefore: boolean;
	isLoadingMoreAfter: boolean;
	initialScrollToBottomKey: string;
	retryDisabled: boolean;
	activeRetryRequestId: string | null;
	providerModelSelection: ProviderModelSelection | null;
	selectedProviderId: string | null;
	selectedModelId: string | null;
	reasoningEffort: string | null;
	message: string;
	contextItems: AdditionalContextItem[];
	messageQueue: MessageQueueItem[];
	pendingGuides: PendingGuide[];
	workflowTodoSnapshot: WorkflowTodoSnapshot | null;
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
	onSessionArchive: (session: SessionMetadata) => void;
	onSessionRename: (session: SessionMetadata) => void;
	onSessionsChange: (sessions: SessionMetadata[]) => void;
	onWorkspaceDelete: (result: DeleteWorkspaceResult) => void;
	onWorkspaceUpdate: (workspace: WorkspaceConfig) => void;
	onLoadMoreBefore: () => void;
	onLoadMoreAfter: () => void;
	onTimelineNavigationLoadEntry: (entry: SessionTimelineNavigationEntry) => Promise<void>;
	onTimelineSearchLoadOffset: (blockOffset: number) => Promise<void>;
	onRetryEditStart: (requestId: string) => void;
	onRetryEditCancel: (requestId: string) => void;
	onRetryFromUserMessage: (payload: RetryUserMessagePayload) => Promise<boolean>;
	onMessageChange: (message: string) => void;
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
	onSubmit: (message: string) => void;
	onGuideSubmit: (message: string) => void;
	activeQueueItemId: number | null;
	onQueueMessageRemove: (queueId: number) => void;
	onQueueMessageEdit: (item: MessageQueueItem) => void;
	onQueueMessageReorder: (queueIds: number[]) => void;
	onGuideDelete: (guideId: string) => void;
	onGuideReorder: (guideIds: string[]) => void;
	onWorkflowTodoDismiss: (snapshot: WorkflowTodoSnapshot) => void;
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
	timelineBlocks,
	timelineBlockOffset,
	timelineNavigationEntries,
	isSessionLoading,
	sessionError,
	hasMoreBefore,
	hasMoreAfter,
	isLoadingMoreBefore,
	isLoadingMoreAfter,
	initialScrollToBottomKey,
	retryDisabled,
	activeRetryRequestId,
	providerModelSelection,
	selectedProviderId,
	selectedModelId,
	reasoningEffort,
	message,
	contextItems,
	messageQueue,
	pendingGuides,
	workflowTodoSnapshot,
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
	onLoadMoreBefore,
	onLoadMoreAfter,
	onTimelineNavigationLoadEntry,
	onTimelineSearchLoadOffset,
	onRetryEditStart,
	onRetryEditCancel,
	onRetryFromUserMessage,
	onMessageChange,
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
	const [plansModalOpen, setPlansModalOpen] = useState<boolean>(false);
	const [sourcesModalOpen, setSourcesModalOpen] = useState<boolean>(false);
	const [previewSource, setPreviewSource] = useState<SessionOverviewSourceItem | null>(null);
	const [previewPlan, setPreviewPlan] = useState<SessionOverviewPlanItem | null>(null);
	const [isGodotProject, setIsGodotProject] = useState<boolean>(false);
	const [isGodotSceneModalOpen, setIsGodotSceneModalOpen] = useState<boolean>(false);
	const [godotSceneFiles, setGodotSceneFiles] = useState<GodotSceneFile[]>([]);
	const [isGodotSceneLoading, setIsGodotSceneLoading] = useState<boolean>(false);
	const [godotSceneSearch, setGodotSceneSearch] = useState<string>("");
	const dockActivationRequestIdRef = useRef<number>(0);
	const [sideDockActivationRequest, setSideDockActivationRequest] = useState<DockPanelActivationRequest | null>(null);
	const previousSessionLayoutRef = useRef<{
		sessionId: string | null;
		layout: SessionLayoutPreferences;
	}>({
		sessionId: activeSessionId,
		layout: sessionLayout
	});
	const messageListRef = useRef<MessageListHandle | null>(null);
	const conversationSearchInputRef = useRef<InputRef | null>(null);
	const chatBodyRef = useRef<HTMLDivElement | null>(null);
	const [messageScrollContainer, setMessageScrollContainer] = useState<HTMLElement | null>(null);
	const [activeTimelineEntryId, setActiveTimelineEntryId] = useState<string | null>(null);
	const [pendingTimelineEntryId, setPendingTimelineEntryId] = useState<string | null>(null);
	const scrollToBottomButtonRef = useRef<HTMLButtonElement | null>(null);
	const scrollToBottomButtonVisibleRef = useRef<boolean>(false);
	const workspaceForActions: WorkspaceConfig | null = activeWorkspace ?? (isHome ? homeWorkspace : null);
	const showDockControls: boolean = !isHome || workspaceForActions !== null;
	const showWorkspaceLaunchControls: boolean = workspaceForActions !== null;
	const showSummaryButton: boolean = activeSessionId !== null;
	const showSideDockButton: boolean = showDockControls;
	const showBottomDockButton: boolean = showDockControls;
	const terminalWaitForCwd: boolean = !isHome && isSessionLoading && workspaceForActions === null;
	const showWorkflowTodoPanel: boolean = !workflowTodoCollapsed && workflowTodoSnapshot !== null;
	const effectiveGodotLaunchExecutablePath: string | null = godotLaunchExecutablePath?.trim()
		? godotLaunchExecutablePath.trim()
		: null;
	const showGodotSummaryActions: boolean = workspaceForActions !== null && effectiveGodotLaunchExecutablePath !== null && isGodotProject;
	const workspaceSidebarOpen: boolean = workspaceSidebar.open;
	const workspaceSidebarSize: number = workspaceSidebar.size;
	const sideDockOpen: boolean = sessionLayout.side.open;
	const sideDockSize: number = sessionLayout.side.size;
	const bottomDockOpen: boolean = sessionLayout.bottom.open;
	const bottomDockSize: number = sessionLayout.bottom.size;
	const handleConversationSearchLoadError = useCallback((error: unknown): void => {
		console.warn("[HomePage] conversation search degraded to loaded messages", error);
	}, []);
	const conversationSearch = useConversationSearch({
		sessionId: isHome ? null : activeSessionId,
		timelineBlocks,
		timelineBlockOffset,
		activeRetryRequestId,
		onLoadBlockOffset: onTimelineSearchLoadOffset,
		onLoadError: handleConversationSearchLoadError
	});
	const focusConversationSearchInput = useCallback((): void => {
		window.requestAnimationFrame((): void => {
			conversationSearchInputRef.current?.focus();
			conversationSearchInputRef.current?.select();
		});
	}, []);

	useEffect((): (() => void) | void => {
		if (!conversationSearch.open) {
			return;
		}
		focusConversationSearchInput();
	}, [conversationSearch.open, focusConversationSearchInput]);

	const updateSideDock = useCallback((
		nextSideLayout: DockLayoutPreferences,
		persist: boolean = true
	): void => {
		onSessionLayoutChange({
			...sessionLayout,
			side: nextSideLayout
		}, { persist });
	}, [onSessionLayoutChange, sessionLayout]);

	const updateBottomDock = useCallback((
		nextBottomLayout: DockLayoutPreferences,
		persist: boolean = true
	): void => {
		onSessionLayoutChange({
			...sessionLayout,
			bottom: nextBottomLayout
		}, { persist });
	}, [onSessionLayoutChange, sessionLayout]);

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

	useEffect((): void => {
		setActiveTimelineEntryId(null);
		setPendingTimelineEntryId(null);
	}, [activeSessionId]);

	useEffect((): void => {
		if (pendingTimelineEntryId === null || !timelineBlocks.some((block: TimelineBlock): boolean => block.id === pendingTimelineEntryId)) {
			return;
		}
		window.requestAnimationFrame((): void => {
			if (messageListRef.current?.scrollToEntry(pendingTimelineEntryId, "smooth") === true) {
				setPendingTimelineEntryId(null);
			}
		});
	}, [pendingTimelineEntryId, timelineBlocks]);
	const filteredGodotSceneFiles: GodotSceneFile[] = useMemo((): GodotSceneFile[] => {
		const query: string = godotSceneSearch.trim().toLowerCase();
		if (query.length === 0) {
			return godotSceneFiles;
		}
		return godotSceneFiles.filter((scene: GodotSceneFile): boolean => {
			return scene.relativePath.toLowerCase().includes(query) || scene.name.toLowerCase().includes(query);
		});
	}, [godotSceneFiles, godotSceneSearch]);
	const workflowFileChangeSummary: WorkflowFileChangeSummary = useMemo((): WorkflowFileChangeSummary => {
		return aggregateTimelineFileChanges(timelineBlocks);
	}, [timelineBlocks]);
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
		updateSideDock({ ...sessionLayout.side, open: true });
	}, [sessionLayout.side, updateSideDock, workspaceForActions]);
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
		setSummaryOpen(false);
		setSummaryOverview(null);
		setSummaryError(null);
		setPlansModalOpen(false);
		setSourcesModalOpen(false);
		setIsGodotSceneModalOpen(false);
		setGodotSceneSearch("");
		setPreviewSource(null);
		setPreviewPlan(null);
	}, [activeSessionId]);

	const loadSummaryOverview = useCallback(async (planLimit: number = SUMMARY_PREVIEW_LIMIT, sourceLimit: number = SUMMARY_PREVIEW_LIMIT): Promise<SessionOverviewResult | null> => {
		if (activeSessionId === null) {
			return null;
		}

		setIsSummaryLoading(true);
		setSummaryError(null);
		try {
			const result: SessionOverviewResult = await fetchSessionOverview({
				sessionId: activeSessionId,
				planLimit,
				sourceLimit
			});
			setSummaryOverview(result);
			return result;
		} catch (error: unknown) {
			const message: string = error instanceof Error ? error.message : t("agentPage.summary.errors.load");
			console.error("[HomePage] failed to load session overview", error);
			setSummaryError(message);
			return null;
		} finally {
			setIsSummaryLoading(false);
		}
	}, [activeSessionId]);

	useEffect((): void => {
		setSummaryOverview(null);
		setSummaryError(null);
		setPlansModalOpen(false);
		setSourcesModalOpen(false);
		setIsGodotSceneModalOpen(false);
		setGodotSceneSearch("");
		setPreviewSource(null);
		setPreviewPlan(null);
		if (summaryOpen) {
			void loadSummaryOverview();
		}
	}, [activeWorkspace?.id, loadSummaryOverview]);

	const handleSummaryOpenChange = useCallback((open: boolean): void => {
		setSummaryOpen(open);
		if (open && !isSummaryLoading) {
			void loadSummaryOverview();
		}
	}, [isSummaryLoading, loadSummaryOverview]);

	const gitActions = useGitActionDialogController({
		workspaceId: workspaceForActions?.id ?? null,
		resetKey: activeSessionId,
		onBeforeCommitOpen: (): void => {
			setSummaryOpen(false);
		},
		onBeforeBranchOpen: (): void => {
			setSummaryOpen(false);
		},
		onCommitSuccess: async (): Promise<void> => {
			onWorkspaceRefresh();
			await loadSummaryOverview();
		},
		onBranchSuccess: async (): Promise<void> => {
			onWorkspaceRefresh();
			await loadSummaryOverview();
		}
	});

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
		if (summaryOverview.envInfo !== null && summaryOverview.envInfo.hasGitRepository) {
			items.push({
				key: "env_info",
				label: t("agentPage.summary.sections.envInfo"),
				children: (
					<div className={styles.summarySection}>
						<Button
							type="text"
							block
							icon={<Icon name="git-diff" />}
							className={styles.summaryActionButton}
							onClick={openSummaryDiffReview}
						>
							<span className={styles.diffRow}>
								<span className={styles.diffLabel}>
									{t("agentPage.summary.actions.diff")}
								</span>
								<span className={styles.additions}>
									{`+${summaryOverview.envInfo.additions}`}
								</span>
								<span className={styles.deletions}>
									{`-${summaryOverview.envInfo.deletions}`}
								</span>
							</span>
						</Button>
						<Button
							type="text"
							block
							icon={<Icon name="git-branch" />}
							className={styles.summaryActionButton}
							onClick={(): void => {
								gitActions.openBranchDialog();
							}}
						>
							{summaryOverview.envInfo.branch ?? t("agentPage.summary.detachedHead")}
						</Button>
						<Button
							type="text"
							block
							aria-busy={gitActions.isCommitMessageGenerating}
							icon={gitActions.isCommitMessageGenerating ? <Spin size="small" /> : <Icon name="git-commit" />}
							className={styles.summaryActionButton}
							onClick={(): void => {
								gitActions.openCommitDialog();
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
	}, [gitActions.openBranchDialog, gitActions.openCommitDialog, openGodotSceneModal, openSummaryDiffReview, runGodotProject, showGodotSummaryActions, summaryOverview, t]);

	async function openPlansModal(): Promise<void> {
		const result: SessionOverviewResult | null = await loadSummaryOverview(SUMMARY_SEE_MORE_LIMIT, SUMMARY_PREVIEW_LIMIT);
		if (result !== null) {
			setPlansModalOpen(true);
		}
	}

	async function openSourcesModal(): Promise<void> {
		const result: SessionOverviewResult | null = await loadSummaryOverview(SUMMARY_PREVIEW_LIMIT, SUMMARY_SEE_MORE_LIMIT);
		if (result !== null) {
			setSourcesModalOpen(true);
		}
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
		messageListRef.current?.scrollToBottom("smooth");
		setScrollToBottomButtonVisible(false);
	}, [setScrollToBottomButtonVisible]);

	const handleTimelineNavigate = useCallback((entry: SessionTimelineNavigationEntry): void => {
		if (messageListRef.current?.scrollToEntry(entry.entryId, "smooth") === true) {
			return;
		}
		setPendingTimelineEntryId(entry.entryId);
		void onTimelineNavigationLoadEntry(entry);
	}, [onTimelineNavigationLoadEntry]);

	const requestSideDockKind = useCallback((kind: DockPanelKind): void => {
		dockActivationRequestIdRef.current += 1;
		setSideDockActivationRequest({
			id: dockActivationRequestIdRef.current,
			kind
		});
	}, []);

	const openSideDock = useCallback((kind?: DockPanelKind): void => {
		updateSideDock({ ...sessionLayout.side, open: true });
		if (kind !== undefined) {
			requestSideDockKind(kind);
		}
	}, [requestSideDockKind, sessionLayout.side, updateSideDock]);

	const closeSideDock = useCallback((): void => {
		updateSideDock({ ...sessionLayout.side, open: false });
	}, [sessionLayout.side, updateSideDock]);

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
		updateBottomDock({ ...sessionLayout.bottom, open: true });
	}, [sessionLayout.bottom, updateBottomDock]);

	const closeBottomDock = useCallback((): void => {
		updateBottomDock({ ...sessionLayout.bottom, open: false });
	}, [sessionLayout.bottom, updateBottomDock]);

	const toggleBottomDock = useCallback((): void => {
		if (bottomDockOpen) {
			closeBottomDock();
			return;
		}
		openBottomDock();
	}, [bottomDockOpen, closeBottomDock, openBottomDock]);

	const toggleWorkspaceSidebar = useCallback((): void => {
		onWorkspaceSidebarChange({
			...workspaceSidebar,
			open: !workspaceSidebarOpen
		});
	}, [onWorkspaceSidebarChange, workspaceSidebar, workspaceSidebarOpen]);

	const navigateConversationTurn = useCallback((direction: "previous" | "next"): void => {
		if (timelineNavigationEntries.length === 0) {
			return;
		}
		const activeIndex: number = timelineNavigationEntries.findIndex(
			(entry: SessionTimelineNavigationEntry): boolean => entry.entryId === activeTimelineEntryId
		);
		const targetIndex: number = activeIndex < 0
			? direction === "previous" ? timelineNavigationEntries.length - 1 : 0
			: direction === "previous" ? activeIndex - 1 : activeIndex + 1;
		const target: SessionTimelineNavigationEntry | undefined = timelineNavigationEntries[targetIndex];
		if (target !== undefined) {
			handleTimelineNavigate(target);
		}
	}, [activeTimelineEntryId, handleTimelineNavigate, timelineNavigationEntries]);

	useEffect((): (() => void) => {
		const platform: ShortcutPlatform = detectShortcutPlatform();
		const handleGlobalShortcut = (event: KeyboardEvent): void => {
			if (event.defaultPrevented) {
				return;
			}
			if (event.key === "Escape" && conversationSearch.open) {
				event.preventDefault();
				conversationSearch.closeSearch();
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
				conversationSearch.openSearch(getSelectedConversationSearchQuery(chatBodyRef.current));
				focusConversationSearchInput();
				return;
			}
			if (timelineNavigationEntries.length === 0) {
				return;
			}
			event.preventDefault();
			navigateConversationTurn(commandId === "conversation.previousTurn" ? "previous" : "next");
		};
		window.addEventListener("keydown", handleGlobalShortcut);
		return (): void => {
			window.removeEventListener("keydown", handleGlobalShortcut);
		};
	}, [
		activeSessionId,
		conversationSearch,
		focusConversationSearchInput,
		isHome,
		keyboardShortcuts,
		navigateConversationTurn,
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
			onWorkspaceSidebarChange({ ...workspaceSidebar, open: false }, { persist: false });
			return;
		}

		onWorkspaceSidebarChange({
			open: true,
			size: normalizedSize
		}, { persist: false });
	}

	function handleWorkspaceSidebarResizeEnd(sizes: number[]): void {
		const nextSize: number | undefined = sizes[0];
		if (nextSize === undefined || !Number.isFinite(nextSize)) {
			return;
		}
		if (nextSize < WORKSPACE_SIDEBAR_CLOSE_THRESHOLD) {
			onWorkspaceSidebarChange({ ...workspaceSidebar, open: false });
			return;
		}

		onWorkspaceSidebarChange({
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
			updateSideDock({ ...sessionLayout.side, open: false }, false);
			return;
		}

		updateSideDock({
			...sessionLayout.side,
			open: true,
			size: normalizedSize
		}, false);
	}

	function handleSideDockResizeEnd(sizes: number[]): void {
		const nextSize: number | undefined = sizes[1];
		if (nextSize === undefined || !Number.isFinite(nextSize)) {
			return;
		}
		if (nextSize < SIDE_DOCK_CLOSE_THRESHOLD) {
			updateSideDock({ ...sessionLayout.side, open: false });
			return;
		}

		const validSize: number = Math.min(SIDE_DOCK_MAX_SIZE, Math.max(SIDE_DOCK_CLOSE_THRESHOLD, Math.trunc(nextSize)));
		updateSideDock({
			...sessionLayout.side,
			open: true,
			size: validSize
		});
	}

	function handleBottomDockResize(sizes: number[]): void {
		const nextSize: number | undefined = sizes[1];
		if (nextSize === undefined || !Number.isFinite(nextSize)) {
			return;
		}

		const normalizedSize: number = Math.min(BOTTOM_DOCK_MAX_SIZE, Math.max(BOTTOM_DOCK_CLOSED_SIZE, Math.trunc(nextSize)));
		if (normalizedSize < BOTTOM_DOCK_CLOSE_THRESHOLD) {
			updateBottomDock({ ...sessionLayout.bottom, open: false }, false);
			return;
		}

		updateBottomDock({
			...sessionLayout.bottom,
			open: true,
			size: normalizedSize
		}, false);
	}

	function handleBottomDockResizeEnd(sizes: number[]): void {
		const nextSize: number | undefined = sizes[1];
		if (nextSize === undefined || !Number.isFinite(nextSize)) {
			return;
		}
		if (nextSize < BOTTOM_DOCK_CLOSE_THRESHOLD) {
			updateBottomDock({ ...sessionLayout.bottom, open: false });
			return;
		}

		const validSize: number = Math.min(BOTTOM_DOCK_MAX_SIZE, Math.max(BOTTOM_DOCK_CLOSE_THRESHOLD, Math.trunc(nextSize)));
		updateBottomDock({
			...sessionLayout.bottom,
			open: true,
			size: validSize
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
					<Spin size="small" />
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
										) : (
											<>
												<ConversationSearchPanel
													open={conversationSearch.open}
													query={conversationSearch.query}
													current={conversationSearch.current}
													total={conversationSearch.total}
													loading={conversationSearch.loading}
													inputRef={conversationSearchInputRef}
													onQueryChange={conversationSearch.setQuery}
													onPrevious={conversationSearch.goPrevious}
													onNext={conversationSearch.goNext}
													onClose={conversationSearch.closeSearch}
												/>
												<MessageList
													ref={messageListRef}
													blocks={timelineBlocks}
													blockOffset={timelineBlockOffset}
													searchOpen={conversationSearch.open}
													searchQuery={conversationSearch.query}
													activeSearchMatch={conversationSearch.activeMatch}
													isLoading={isSessionLoading}
													errorMessage={sessionError}
													hasMoreBefore={hasMoreBefore}
													hasMoreAfter={hasMoreAfter}
													isLoadingMoreBefore={isLoadingMoreBefore}
													isLoadingMoreAfter={isLoadingMoreAfter}
													initialScrollToBottomKey={initialScrollToBottomKey}
													onLoadMoreBefore={onLoadMoreBefore}
													onLoadMoreAfter={onLoadMoreAfter}
													retryDisabled={retryDisabled}
													activeRetryRequestId={activeRetryRequestId}
													onRetryEditStart={onRetryEditStart}
													onRetryEditCancel={onRetryEditCancel}
													onRetryFromUserMessage={onRetryFromUserMessage}
													onInlineDiffReview={openReviewPanel}
													onAwayFromBottomChange={setScrollToBottomButtonVisible}
													onActiveUserEntryChange={setActiveTimelineEntryId}
													onScrollContainerReady={setMessageScrollContainer}
												/>
												<ConversationAnchorNavigator
													entries={timelineNavigationEntries}
													activeEntryId={activeTimelineEntryId}
													scrollContainer={messageScrollContainer}
													onNavigate={handleTimelineNavigate}
												/>
											</>
										)}
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
													showWorkflowTodoPanel ? styles.scrollToBottomButtonAboveTodo : "",
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
												{showWorkflowTodoPanel ? (
													<FloatingWorkflowTodoPanel
														snapshot={workflowTodoSnapshot}
														fileChangeSummary={workflowFileChangeSummary}
														onDismiss={onWorkflowTodoDismiss}
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
													providerModelSelection={providerModelSelection}
											selectedProviderId={selectedProviderId}
											selectedModelId={selectedModelId}
											reasoningEffort={reasoningEffort}
													message={message}
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
													onMessageChange={onMessageChange}
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
											cwd={workspaceForActions?.rootPath ?? null}
											contextItems={contextItems}
											onAddContext={onAddContext}
											onRemoveContext={onRemoveContext}
											isOpen={sideDockOpen}
											waitForCwd={terminalWaitForCwd}
											defaultKind="review"
											layout={sessionLayout.side}
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
									cwd={workspaceForActions?.rootPath ?? null}
									contextItems={contextItems}
									onAddContext={onAddContext}
									onRemoveContext={onRemoveContext}
									isOpen={bottomDockOpen}
									waitForCwd={terminalWaitForCwd}
									defaultKind="terminal"
									layout={sessionLayout.bottom}
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
				overview={summaryOverview}
				open={plansModalOpen}
				onClose={(): void => setPlansModalOpen(false)}
				onPlanSelect={setPreviewPlan}
			/>
			<SessionPlanPreviewDialog
				plan={previewPlan}
				onClose={(): void => setPreviewPlan(null)}
			/>
			<SessionSourcesDialog
				overview={summaryOverview}
				open={sourcesModalOpen}
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

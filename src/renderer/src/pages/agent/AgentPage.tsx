import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Alert, Button, Divider, Dropdown, Empty, Modal, message as antdMessage, Space, Spin, Splitter, Typography, Popover, Collapse, Tooltip, Checkbox } from "antd";
import type { CollapseProps, MenuProps } from "antd";
import type { AdditionalContextItem, MessageQueueItem, PendingGuide, PendingToolBudget, PlanApprovalState, PlanClarificationState, SessionMetadata, TimelineBlock, WorkflowTodoSnapshot, WorkspaceConfig } from "@/api/types";
import type { ChatMode } from "@/api/chat-api";
import type { ApprovalMode, PendingApproval } from "@/api/approval-api";
import type { SlashCommandDefinition } from "@/api/command-api";
import type { ProviderModelSelection } from "@/api/provider-api";
import type { DeleteWorkspaceResult } from "@/api/workspace-api";
import type { SkillSummary } from "@/api/skill-api";
import { fetchSessionOverview, type SessionOverviewPlanItem, type SessionOverviewResult, type SessionOverviewSourceItem } from "@/api/session-overview-api";
import { commitOrPushGit, generateGitCommitMessage, type CommitOrPushAction, type CommitOrPushResult, type GenerateGitCommitMessageResult } from "@/api/workspace-git-api";
import WorkspaceTree from "@/features/workspace/WorkspaceTree";
import MessageList from "@/features/chat/MessageList";
import Composer from "@/features/composer/Composer";
import FloatingWorkflowTodoPanel, { type WorkflowFileChangeSummary } from "@/features/composer/FloatingWorkflowTodoPanel";
import MessageQueuePanel from "@/features/composer/MessageQueuePanel";
import NewSessionHome from "./NewSessionHome";
import ApprovalDialog from "@/features/approval/ApprovalDialog";
import ToolBudgetDialog from "@/features/approval/ToolBudgetDialog";
import type { ComposerCompletionTrigger } from "@/features/composer/composer-completion";
import type { RetryUserMessagePayload } from "@/features/bubble/UserBubble";
import styles from "./AgentPage.module.css";
import { Icon } from "@/assets/icons";
import ClarificationDialog from "@/features/clarification/ClarificationDialog";
import PlanApprovalDialog from "@/features/approval/PlanApprovalDialog";
import MarkdownContent from "@/features/markdown/MarkdownContent";
import DockPanelTabs, { type DockPanelActivationRequest, type DockPanelKind } from "@/features/dock/DockPanelTabs";
import TextArea from "antd/es/input/TextArea";

type WorkspaceLaunchTargetId = "file-explorer" | "terminal" | "vscode" | "visual-studio" | "github-desktop" | "git-bash";

type WorkspaceLaunchTarget = {
	id: WorkspaceLaunchTargetId;
	label: string;
};

const FALLBACK_WORKSPACE_LAUNCH_TARGETS: WorkspaceLaunchTarget[] = [
	{ id: "file-explorer", label: "File Explorer" },
	{ id: "terminal", label: "Terminal" }
];

const SUMMARY_PREVIEW_LIMIT: number = 3;
const SUMMARY_SEE_MORE_LIMIT: number = 100;
const SIDE_DOCK_CLOSED_SIZE: number = 0;
const SIDE_DOCK_DEFAULT_SIZE: number = 520;
const SIDE_DOCK_MAX_SIZE: number = 720;
const SIDE_DOCK_CLOSE_THRESHOLD: number = 150;
const BOTTOM_DOCK_CLOSED_SIZE: number = 0;
const BOTTOM_DOCK_DEFAULT_SIZE: number = 280;
const BOTTOM_DOCK_MAX_SIZE: number = 520;
const BOTTOM_DOCK_CLOSE_THRESHOLD: number = 120;

function getCommitActionLabel(action: CommitOrPushAction): string {
	if (action === "commit") {
		return "Commit";
	}
	if (action === "commit_and_push") {
		return "Commit & Push";
	}
	return "Push";
}

function formatCommitActionSuccess(result: CommitOrPushResult): string {
	if (result.committed && result.pushed) {
		return `Committed ${result.commitHash ?? "changes"} and pushed.`;
	}
	if (result.committed) {
		return `Committed ${result.commitHash ?? "changes"}.`;
	}
	return "Pushed changes.";
}

function isWorkspaceLaunchTargetId(value: string): value is WorkspaceLaunchTargetId {
	return value === "file-explorer"
		|| value === "terminal"
		|| value === "vscode"
		|| value === "visual-studio"
		|| value === "github-desktop"
		|| value === "git-bash";
}

function getWorkspaceLaunchIcon(targetId: WorkspaceLaunchTargetId): React.ReactNode {
	if (targetId === "file-explorer") {
		return <Icon name="folder" />;
	}
	if (targetId === "terminal" || targetId === "git-bash") {
		return <Icon name="terminal" />;
	}
	return <Icon name="external_link" />;
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

function formatSourceSubtitle(source: SessionOverviewSourceItem): string {
	const dimensions: string = source.width !== undefined && source.height !== undefined
		? `${source.width}x${source.height}`
		: "Unknown size";
	return `${source.mimeType} · ${dimensions}`;
}

function formatOverviewDate(value: string): string {
	if (value.trim().length === 0) {
		return "";
	}
	const date: Date = new Date(value);
	if (Number.isNaN(date.getTime())) {
		return value;
	}
	return date.toLocaleString();
}

type AgentPageProps = {
	workspaceRefreshToken: number;
	isHome: boolean;
	activeSessionId: string | null;
	activeSessionMetadata: SessionMetadata | null;
	activeWorkspaceId: string | null;
	chatTitle: string;
	timelineBlocks: TimelineBlock[];
	isSessionLoading: boolean;
	sessionError: string | null;
	hasMoreBefore: boolean;
	hasMoreAfter: boolean;
	initialScrollToBottomKey: string;
	retryDisabled: boolean;
	activeRetryRequestId: string | null;
	providerModelSelection: ProviderModelSelection | null;
	selectedProviderId: string | null;
	selectedModelId: string | null;
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
	isApprovalModeSaving: boolean;
	workspaceOptions: WorkspaceConfig[];
	initialWorkspaces: WorkspaceConfig[];
	initialSessions: SessionMetadata[];
	initialActiveWorkspaceId: string | null;
	homeWorkspace: WorkspaceConfig | null;
	workspaceFooterDisabled: boolean;
	isWorkspaceAdding: boolean;
	activeWorkspace: WorkspaceConfig | null;
	onNewSession: () => void;
	onNewWorkspaceSession: (workspace: WorkspaceConfig) => void;
	onWorkspaceRefresh: () => void;
	onWorkspaceSelect: (workspaceId: string) => void;
	onHomeWorkspaceSelect: (workspaceId: string) => void;
	onHomeWorkspaceAdd: () => void;
	onHomeWorkspaceClear: () => void;
	onSessionSelect: (session: SessionMetadata) => void;
	onSessionArchive: (session: SessionMetadata) => void;
	onSessionRename: (session: SessionMetadata) => void;
	onWorkspaceDelete: (result: DeleteWorkspaceResult) => void;
	onLoadMoreBefore: () => void;
	onLoadMoreAfter: () => void;
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
	onAddFiles: () => void;
	onAddFolder: () => void;
	onAddImages: (files: File[]) => void;
	onAddContextFiles: (files: File[]) => void;
	onRemoveContext: (contextId: string) => void;
	onPinContext: (contextId: string, pinned: boolean) => void;
	onClearUnpinnedContext: () => void;
	onCancel: () => void;
	onSubmit: (message: string) => void;
	onGuideSubmit: (message: string) => void;
	onQueueMessageRemove: (queueId: number) => void;
	onQueueMessageReorder: (queueIds: number[]) => void;
	onGuideDelete: (guideId: string) => void;
	onGuideReorder: (guideIds: string[]) => void;
	onWorkflowTodoDismiss: (snapshot: WorkflowTodoSnapshot) => void;
	onCompletionOpen: (trigger: ComposerCompletionTrigger) => void;
};

function AgentPage({
	workspaceRefreshToken,
	isHome,
	activeSessionId,
	activeSessionMetadata,
	activeWorkspaceId,
	chatTitle,
	timelineBlocks,
	isSessionLoading,
	sessionError,
	hasMoreBefore,
	hasMoreAfter,
	initialScrollToBottomKey,
	retryDisabled,
	activeRetryRequestId,
	providerModelSelection,
	selectedProviderId,
	selectedModelId,
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
	isApprovalModeSaving,
	workspaceOptions,
	initialWorkspaces,
	initialSessions,
	initialActiveWorkspaceId,
	homeWorkspace,
	workspaceFooterDisabled,
	isWorkspaceAdding,
	activeWorkspace,
	onNewSession,
	onNewWorkspaceSession,
	onWorkspaceRefresh,
	onWorkspaceSelect,
	onHomeWorkspaceSelect,
	onHomeWorkspaceAdd,
	onHomeWorkspaceClear,
	onSessionSelect,
	onSessionArchive,
	onSessionRename,
	onWorkspaceDelete,
	onLoadMoreBefore,
	onLoadMoreAfter,
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
	onAddFiles,
	onAddFolder,
	onAddImages,
	onAddContextFiles,
	onRemoveContext,
	onPinContext,
	onClearUnpinnedContext,
	onCancel,
	onSubmit,
	onGuideSubmit,
	onQueueMessageRemove,
	onQueueMessageReorder,
	onGuideDelete,
	onGuideReorder,
	onWorkflowTodoDismiss,
	onCompletionOpen
}: AgentPageProps): React.JSX.Element {
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
	const dockActivationRequestIdRef = useRef<number>(0);
	const [sideDockActivationRequest, setSideDockActivationRequest] = useState<DockPanelActivationRequest | null>(null);
	const [sideDockOpen, setSideDockOpen] = useState<boolean>(false);
	const [sideDockSize, setSideDockSize] = useState<number>(SIDE_DOCK_DEFAULT_SIZE);
	const [sideDockLastOpenSize, setSideDockLastOpenSize] = useState<number>(SIDE_DOCK_DEFAULT_SIZE);
	const [bottomDockOpen, setBottomDockOpen] = useState<boolean>(false);
	const [bottomDockSize, setBottomDockSize] = useState<number>(BOTTOM_DOCK_DEFAULT_SIZE);
	const [bottomDockLastOpenSize, setBottomDockLastOpenSize] = useState<number>(BOTTOM_DOCK_DEFAULT_SIZE);
	const [commitOrPushOpen, setCommitOrPushOpen] = useState<boolean>(false);
	const [commitMessage, setCommitMessage] = useState<string>("");
	const [includeUnstagedChanges, setIncludeUnstagedChanges] = useState<boolean>(true);
	const [commitOperation, setCommitOperation] = useState<CommitOrPushAction | null>(null);
	const [commitError, setCommitError] = useState<string | null>(null);
	const showDockControls: boolean = !isHome || activeWorkspace !== null;
	const showWorkspaceLaunchControls: boolean = activeWorkspace !== null;
	const showSummaryButton: boolean = !isHome && activeSessionId !== null;
	const showSideDockButton: boolean = showDockControls;
	const showBottomDockButton: boolean = showDockControls;
	const terminalWaitForCwd: boolean = !isHome && isSessionLoading && activeWorkspace === null;
	const isCommitOperationRunning: boolean = commitOperation !== null;
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
		if (activeWorkspace === null) {
			return;
		}

		dockActivationRequestIdRef.current += 1;
		setSideDockActivationRequest({
			id: dockActivationRequestIdRef.current,
			kind: "review"
		});
		setSideDockSize(sideDockLastOpenSize);
		setSideDockOpen(true);
	}, [activeWorkspace, sideDockLastOpenSize]);
	const summaryCollapseItems: NonNullable<CollapseProps["items"]> = useMemo((): NonNullable<CollapseProps["items"]> => {
		if (summaryOverview === null) {
			return [];
		}

		const items: NonNullable<CollapseProps["items"]> = [];
		if (summaryOverview.envInfo !== null && summaryOverview.envInfo.hasGitRepository) {
			items.push({
				key: "env_info",
				label: "Env info",
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
									Diff
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
						>
							{summaryOverview.envInfo.branch ?? "Detached HEAD"}
						</Button>
						<Button
							type="text"
							block
							icon={<Icon name="git-commit" />}
							className={styles.summaryActionButton}
							onClick={(): void => {
								openCommitOrPushDialog();
							}}
						>
							Commit or push
						</Button>
					</div>
				),
				showArrow: false
			});
		}

		if (summaryOverview.plans.total > 0) {
			items.push({
				key: "plans",
				label: "Plans",
				children: (
					<div className={styles.planList}>
						{summaryOverview.plans.items.slice(0, SUMMARY_PREVIEW_LIMIT).map((plan: SessionOverviewPlanItem): React.ReactNode => (
							<Button
								key={plan.planId}
								type="text"
								block
								className={styles.summaryActionButton}
								onClick={(): void => {
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
								See more
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
				label: "Source",
				children: (
					<div className={styles.sourceList}>
						{summaryOverview.sources.items.slice(0, SUMMARY_PREVIEW_LIMIT).map((source: SessionOverviewSourceItem): React.ReactNode => (
							<Button
								key={`${source.kind}:${source.id}`}
								type="text"
								block
								className={styles.sourceButton}
								icon={(
									<img
										src={source.thumbnailDataUrl}
										alt=""
										className={styles.sourceThumbnail}
									/>
								)}
								onClick={(): void => {
									setPreviewSource(source);
								}}
							>
								<span className={styles.sourceText}>
									<span className={styles.summaryItemTitle}>{source.title}</span>
									<span className={styles.summaryMeta}>{formatSourceSubtitle(source)}</span>
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
								See more
							</Button>
						) : null}
					</div>
				),
				showArrow: false
			});
		}

		return items;
	}, [onMessageChange, openSummaryDiffReview, summaryOverview]);

	useEffect((): (() => void) | void => {
		if (!showWorkspaceLaunchControls) {
			return;
		}

		let cancelled: boolean = false;
		window.electronAPI.workspaceFs.listLaunchTargets()
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
				console.error("[AgentPage] failed to list workspace launch targets", error);
				if (!cancelled) {
					setWorkspaceLaunchTargets(FALLBACK_WORKSPACE_LAUNCH_TARGETS);
					setSelectedLaunchTargetId("file-explorer");
				}
			});

		return (): void => {
			cancelled = true;
		};
	}, [showWorkspaceLaunchControls]);

	useEffect((): void => {
		setSummaryOpen(false);
		setSummaryOverview(null);
		setSummaryError(null);
		setPlansModalOpen(false);
		setSourcesModalOpen(false);
		setPreviewSource(null);
		setPreviewPlan(null);
		setSideDockOpen(false);
		setCommitOrPushOpen(false);
		setCommitMessage("");
		setCommitError(null);
		setCommitOperation(null);
	}, [activeSessionId, activeWorkspace?.id]);

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
			const message: string = error instanceof Error ? error.message : "Failed to load session summary.";
			console.error("[AgentPage] failed to load session overview", error);
			setSummaryError(message);
			return null;
		} finally {
			setIsSummaryLoading(false);
		}
	}, [activeSessionId]);

	const handleSummaryOpenChange = useCallback((open: boolean): void => {
		setSummaryOpen(open);
		if (open && !isSummaryLoading) {
			void loadSummaryOverview();
		}
	}, [isSummaryLoading, loadSummaryOverview]);

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

	function openCommitOrPushDialog(): void {
		setSummaryOpen(false);
		setCommitError(null);
		setCommitOrPushOpen(true);
	}

	function handleCommitDialogCancel(): void {
		if (isCommitOperationRunning) {
			return;
		}
		setCommitOrPushOpen(false);
		setCommitError(null);
	}

	async function generateMessageForCommitAction(): Promise<string> {
		if (activeWorkspace === null) {
			throw new Error("Please select a workspace before committing.");
		}

		const generated: GenerateGitCommitMessageResult = await generateGitCommitMessage({
			workspaceId: activeWorkspace.id,
			includeUnstagedChanges
		});
		setCommitMessage(generated.message);
		return generated.message;
	}

	async function handleCommitOrPushAction(action: CommitOrPushAction): Promise<void> {
		if (activeWorkspace === null) {
			setCommitError("Please select a workspace before committing.");
			return;
		}

		setCommitOperation(action);
		setCommitError(null);
		try {
			let nextMessage: string | undefined = commitMessage.trim();
			if (action !== "push" && (nextMessage ?? "").length === 0) {
				nextMessage = await generateMessageForCommitAction();
			}

			const result: CommitOrPushResult = await commitOrPushGit({
				workspaceId: activeWorkspace.id,
				action,
				message: action === "push" ? undefined : nextMessage,
				includeUnstagedChanges
			});
			void messageApi.success(formatCommitActionSuccess(result));
			setCommitOrPushOpen(false);
			setCommitMessage("");
			onWorkspaceRefresh();
			await loadSummaryOverview();
		} catch (error: unknown) {
			setCommitError(error instanceof Error ? error.message : `Failed to ${getCommitActionLabel(action).toLowerCase()}.`);
		} finally {
			setCommitOperation(null);
		}
	}

	async function openWorkspaceLaunchTarget(targetId: WorkspaceLaunchTargetId): Promise<void> {
		if (activeWorkspace === null) {
			return;
		}

		setSelectedLaunchTargetId(targetId);
		setIsOpeningLaunchTarget(true);
		try {
			await window.electronAPI.workspaceFs.openLaunchTarget({
				workspaceRoot: activeWorkspace.rootPath,
				targetId
			});
		} catch (error: unknown) {
			const message: string = error instanceof Error ? error.message : "Failed to open workspace.";
			console.error("[AgentPage] failed to open workspace launch target", error);
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

	const requestSideDockKind = useCallback((kind: DockPanelKind): void => {
		dockActivationRequestIdRef.current += 1;
		setSideDockActivationRequest({
			id: dockActivationRequestIdRef.current,
			kind
		});
	}, []);

	const openSideDock = useCallback((kind?: DockPanelKind): void => {
		setSideDockSize(sideDockLastOpenSize);
		setSideDockOpen(true);
		if (kind !== undefined) {
			requestSideDockKind(kind);
		}
	}, [requestSideDockKind, sideDockLastOpenSize]);

	const closeSideDock = useCallback((): void => {
		setSideDockOpen(false);
	}, []);

	const toggleSideDock = useCallback((): void => {
		if (sideDockOpen) {
			closeSideDock();
			return;
		}
		openSideDock();
	}, [closeSideDock, openSideDock, sideDockOpen]);

	const openReviewPanel = useCallback((): void => {
		if (activeWorkspace === null) {
			return;
		}
		openSideDock("review");
	}, [activeWorkspace, openSideDock]);

	const openBottomDock = useCallback((): void => {
		setBottomDockSize(bottomDockLastOpenSize);
		setBottomDockOpen(true);
	}, [bottomDockLastOpenSize]);

	const closeBottomDock = useCallback((): void => {
		setBottomDockOpen(false);
	}, []);

	const toggleBottomDock = useCallback((): void => {
		if (bottomDockOpen) {
			closeBottomDock();
			return;
		}
		openBottomDock();
	}, [bottomDockOpen, closeBottomDock, openBottomDock]);

	function handleSideDockResize(sizes: number[]): void {
		const nextSize: number | undefined = sizes[1];
		if (nextSize === undefined || !Number.isFinite(nextSize)) {
			return;
		}

		const normalizedSize: number = Math.min(SIDE_DOCK_MAX_SIZE, Math.max(SIDE_DOCK_CLOSED_SIZE, Math.trunc(nextSize)));
		if (normalizedSize < SIDE_DOCK_CLOSE_THRESHOLD) {
			closeSideDock();
			setSideDockSize(sideDockLastOpenSize);
			return;
		}

		setSideDockSize(normalizedSize);
		setSideDockOpen(true);
		setSideDockLastOpenSize(normalizedSize);
	}

	function handleSideDockResizeEnd(sizes: number[]): void {
		const nextSize: number | undefined = sizes[1];
		if (nextSize === undefined || !Number.isFinite(nextSize)) {
			return;
		}
		if (nextSize < SIDE_DOCK_CLOSE_THRESHOLD) {
			closeSideDock();
			setSideDockSize(sideDockLastOpenSize);
			return;
		}

		const validSize: number = Math.min(SIDE_DOCK_MAX_SIZE, Math.max(SIDE_DOCK_CLOSE_THRESHOLD, Math.trunc(nextSize)));
		setSideDockOpen(true);
		setSideDockSize(validSize);
		setSideDockLastOpenSize(validSize);
	}

	function handleBottomDockResize(sizes: number[]): void {
		const nextSize: number | undefined = sizes[1];
		if (nextSize === undefined || !Number.isFinite(nextSize)) {
			return;
		}

		const normalizedSize: number = Math.min(BOTTOM_DOCK_MAX_SIZE, Math.max(BOTTOM_DOCK_CLOSED_SIZE, Math.trunc(nextSize)));
		if (normalizedSize < BOTTOM_DOCK_CLOSE_THRESHOLD) {
			closeBottomDock();
			setBottomDockSize(bottomDockLastOpenSize);
			return;
		}

		setBottomDockSize(normalizedSize);
		setBottomDockOpen(true);
		setBottomDockLastOpenSize(normalizedSize);
	}

	function handleBottomDockResizeEnd(sizes: number[]): void {
		const nextSize: number | undefined = sizes[1];
		if (nextSize === undefined || !Number.isFinite(nextSize)) {
			return;
		}
		if (nextSize < BOTTOM_DOCK_CLOSE_THRESHOLD) {
			closeBottomDock();
			setBottomDockSize(bottomDockLastOpenSize);
			return;
		}

		const validSize: number = Math.min(BOTTOM_DOCK_MAX_SIZE, Math.max(BOTTOM_DOCK_CLOSE_THRESHOLD, Math.trunc(nextSize)));
		setBottomDockOpen(true);
		setBottomDockSize(validSize);
		setBottomDockLastOpenSize(validSize);
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
						Retry
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
					description="No summary yet"
					className={styles.summaryEmpty}
				/>
			)}
		</div>
	), [isSummaryLoading, loadSummaryOverview, summaryCollapseItems, summaryError, summaryOverview]);

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
				<Button
					type={summaryOpen ? "primary" : "text"}
					shape="circle"
					aria-label="Open session summary"
					aria-pressed={summaryOpen}
					icon={<Icon name="list-check" />}
				/>
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
			<aside className={styles.workspaceSidebar}>
				<header className={styles.workspaceHeader}>
					<Button
						type="text"
						block
						icon={<Icon name="add" />}
						className={styles.createSessionButton}
						onClick={onNewSession}
					>
						New session
					</Button>
				</header>

				<WorkspaceTree
					refreshToken={workspaceRefreshToken}
					selectedSessionId={activeSessionId}
					selectedWorkspaceId={activeWorkspaceId}
					initialWorkspaces={initialWorkspaces}
					initialSessions={initialSessions}
					initialActiveWorkspaceId={initialActiveWorkspaceId}
					sessionUpdate={activeSessionMetadata}
					onWorkspaceSelect={onWorkspaceSelect}
					onSessionSelect={onSessionSelect}
					onSessionArchive={onSessionArchive}
					onSessionRename={onSessionRename}
					onNewWorkspaceSession={onNewWorkspaceSession}
					onWorkspaceDelete={onWorkspaceDelete}
				/>

			</aside>

			<Divider vertical size="small" />

			<div className={styles.agentMain}>
				{showWorkspaceLaunchControls || showSummaryButton || showBottomDockButton || showSideDockButton ? (
					<div className={styles.floatingActionSlot}>
						<div className={styles.floatingActions}>
							{showWorkspaceLaunchControls ? (
								<Space.Compact size="small" className={styles.workspaceLaunchControls}>
									<Button
										loading={isOpeningLaunchTarget}
										icon={getWorkspaceLaunchIcon(selectedLaunchTarget.id)}
										onClick={(): void => { void openWorkspaceLaunchTarget(selectedLaunchTarget.id); }}
									>
										Open in {selectedLaunchTarget.label}
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
											aria-label="Select workspace launch target"
											icon={<Icon name="arrow-down" />}
										/>
									</Dropdown>
								</Space.Compact>
							) : null}
							{showSummaryButton ? renderSummaryButton() : null}
							{showBottomDockButton ? (
								<Tooltip title={bottomDockOpen ? "Close bottom panel" : "Open bottom panel"}>
									<Button
										type={bottomDockOpen ? "primary" : "text"}
										shape="circle"
										aria-pressed={bottomDockOpen}
										icon={<Icon name="layout-bottom" />}
										onClick={toggleBottomDock}
									/>
								</Tooltip>
							) : null}
							{showSideDockButton ? (
								<Tooltip title={sideDockOpen ? "Close sidebar" : "Open sidebar"}>
									<Button
										type={sideDockOpen ? "primary" : "text"}
										shape="circle"
										aria-pressed={sideDockOpen}
										icon={<Icon name="layout-right" />}
										onClick={toggleSideDock}
									/>
								</Tooltip>
							) : null}
						</div>
					</div>
				) : null}
				<Splitter
					className={styles.agentVerticalSplitter}
					orientation="vertical"
					collapsible={{ motion: true }}
					onResize={handleBottomDockResize}
					onResizeEnd={handleBottomDockResizeEnd}
				>
					<Splitter.Panel min={360}>
						<Splitter
							className={styles.agentSplitter}
							collapsible={{ motion: true }}
							onResize={handleSideDockResize}
							onResizeEnd={handleSideDockResizeEnd}
						>
							<Splitter.Panel min={360}>
								<section className={styles.chatPanel}>
									<header className={styles.chatHeader}>
										<Typography.Title level={5} className={styles.chatTitle}>
											{chatTitle}
										</Typography.Title>
									</header>

									<Divider size="small" />

									{isHome ? (
										<NewSessionHome workspace={homeWorkspace} errorMessage={sessionError} />
									) : (
										<MessageList
											blocks={timelineBlocks}
											isLoading={isSessionLoading}
											errorMessage={sessionError}
											hasMoreBefore={hasMoreBefore}
											hasMoreAfter={hasMoreAfter}
											initialScrollToBottomKey={initialScrollToBottomKey}
											onLoadMoreBefore={onLoadMoreBefore}
											onLoadMoreAfter={onLoadMoreAfter}
											retryDisabled={retryDisabled}
											activeRetryRequestId={activeRetryRequestId}
											onRetryEditStart={onRetryEditStart}
											onRetryEditCancel={onRetryEditCancel}
											onRetryFromUserMessage={onRetryFromUserMessage}
											onInlineDiffReview={openReviewPanel}
										/>
									)}

									<footer className={styles.composer}>
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
												{!isHome && !workflowTodoCollapsed ? (
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
														onQueueRemove={onQueueMessageRemove}
														onQueueReorder={onQueueMessageReorder}
														onGuideDelete={onGuideDelete}
														onGuideReorder={onGuideReorder}
													/>
												) : null}
												<Composer
													providerModelSelection={providerModelSelection}
													selectedProviderId={selectedProviderId}
													selectedModelId={selectedModelId}
													message={message}
													contextItems={contextItems}
													mode={mode}
													approvalMode={approvalMode}
													slashCommands={slashCommands}
													skills={skills}
													isSending={isSending}
													isApprovalModeSaving={isApprovalModeSaving}
													workspaceOptions={workspaceOptions}
													selectedWorkspace={isHome ? homeWorkspace : activeWorkspace}
													workspaceFooterDisabled={workspaceFooterDisabled}
													isWorkspaceAdding={isWorkspaceAdding}
													showContextUsage={!isHome}
													onMessageChange={onMessageChange}
													onModeChange={onModeChange}
													onApprovalModeChange={onApprovalModeChange}
													onProviderModelChange={onProviderModelChange}
													onAddFiles={onAddFiles}
													onAddFolder={onAddFolder}
													onAddImages={onAddImages}
													onAddContextFiles={onAddContextFiles}
													onWorkspaceSelect={onHomeWorkspaceSelect}
													onWorkspaceAdd={onHomeWorkspaceAdd}
													onWorkspaceClear={onHomeWorkspaceClear}
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
											workspaceId={activeWorkspace?.id ?? null}
											cwd={activeWorkspace?.rootPath ?? null}
											isOpen={sideDockOpen}
											waitForCwd={terminalWaitForCwd}
											defaultKind="review"
											activationRequest={sideDockActivationRequest}
											onEmpty={closeSideDock}
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
									workspaceId={activeWorkspace?.id ?? null}
									cwd={activeWorkspace?.rootPath ?? null}
									isOpen={bottomDockOpen}
									waitForCwd={terminalWaitForCwd}
									defaultKind="terminal"
									onEmpty={closeBottomDock}
								/>
							</div>
						</Splitter.Panel>
					) : null}
				</Splitter>
			</div>
			<Modal
				title="Plans"
				open={plansModalOpen}
				footer={null}
				onCancel={(): void => setPlansModalOpen(false)}
				width={640}
			>
				<div className={styles.summaryModalList}>
					{summaryOverview?.plans.items.map((plan: SessionOverviewPlanItem): React.ReactNode => (
						<Button
							key={plan.planId}
							type="text"
							block
							className={styles.summaryPlanButton}
							onClick={(): void => {
								setPreviewPlan(plan);
							}}
						>
							<span className={styles.summaryPlanButtonContent}>
								<span className={styles.summaryItemTitle}>{plan.title}</span>
								<span className={styles.summaryMeta}>
									{plan.status} · {formatOverviewDate(plan.updatedAt)}
								</span>
								<span className={styles.summaryPath}>{plan.planPath}</span>
							</span>
						</Button>
					))}
				</div>
			</Modal>
			<Modal
				title={previewPlan?.title ?? "Plan"}
				open={previewPlan !== null}
				footer={null}
				onCancel={(): void => setPreviewPlan(null)}
				width={800}
			>
				{previewPlan !== null ? (
					<div className={`${styles.planPreviewMarkdown} markdown-body`}>
						<MarkdownContent>{previewPlan.previewMarkdown}</MarkdownContent>
					</div>
				) : null}
			</Modal>
			<Modal
				title="Source"
				open={sourcesModalOpen}
				footer={null}
				onCancel={(): void => setSourcesModalOpen(false)}
				width={640}
			>
				<div className={styles.summarySourceGrid}>
					{summaryOverview?.sources.items.map((source: SessionOverviewSourceItem): React.ReactNode => (
						<Button
							key={`${source.kind}:${source.id}`}
							type="text"
							className={styles.sourceGridButton}
							onClick={(): void => setPreviewSource(source)}
						>
							<img src={source.thumbnailDataUrl} alt="" className={styles.sourceGridThumbnail} />
							<span className={styles.sourceGridText}>
								<span className={styles.summaryItemTitle}>{source.title}</span>
								<span className={styles.summaryMeta}>{formatSourceSubtitle(source)}</span>
							</span>
						</Button>
					))}
				</div>
			</Modal>
			<Modal
				title={previewSource?.title ?? "Image source"}
				open={previewSource !== null}
				footer={null}
				onCancel={(): void => setPreviewSource(null)}
				width={720}
			>
				{previewSource !== null ? (
					<img
						src={previewSource.thumbnailDataUrl}
						alt={previewSource.title}
						className={styles.sourcePreviewImage}
					/>
				) : null}
			</Modal>
			<Modal
				title="Commit or push"
				open={commitOrPushOpen}
				onCancel={handleCommitDialogCancel}
				footer={(
					<Space>
						<Button
							disabled={isCommitOperationRunning || activeWorkspace === null}
							loading={commitOperation === "push"}
							onClick={(): void => {
								void handleCommitOrPushAction("push");
							}}
						>
							Push
						</Button>
						<Button
							disabled={isCommitOperationRunning || activeWorkspace === null}
							loading={commitOperation === "commit_and_push"}
							onClick={(): void => {
								void handleCommitOrPushAction("commit_and_push");
							}}
						>
							Commit & Push
						</Button>
						<Button
							type="primary"
							disabled={isCommitOperationRunning || activeWorkspace === null}
							loading={commitOperation === "commit"}
							onClick={(): void => {
								void handleCommitOrPushAction("commit");
							}}
						>
							Commit
						</Button>
					</Space>
				)}
			>
				<div className={styles.commitDialogBody}>
					{commitError !== null ? (
						<Alert type="error" showIcon={true} description={commitError} />
					) : null}
					<TextArea
						value={commitMessage}
						disabled={isCommitOperationRunning}
						autoSize={{ minRows: 3, maxRows: 6 }}
						placeholder="Leaving it blank will automatically generate the information"
						onChange={(event: React.ChangeEvent<HTMLTextAreaElement>): void => {
							setCommitMessage(event.target.value);
						}}
					/>
					<Checkbox
						checked={includeUnstagedChanges}
						disabled={isCommitOperationRunning}
						onChange={(event): void => {
							setIncludeUnstagedChanges(event.target.checked);
						}}
					>
						Includes unstaged changes
					</Checkbox>
				</div>
			</Modal>
		</div>
	);
}

export default AgentPage;

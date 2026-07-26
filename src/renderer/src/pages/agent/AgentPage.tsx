import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Button, Divider, Dropdown, Empty, Input, message as antdMessage, Modal, Space, Spin, Splitter, Typography, Popover, Collapse, Tooltip } from "antd";
import type { CollapseProps, MenuProps } from "antd";
import { useTranslation } from "react-i18next";
import type { AdditionalContextItem, MessageQueueItem, PendingGuide, PendingToolBudget, PlanApprovalState, PlanClarificationState, SessionMetadata, TimelineBlock, WorkflowTodoSnapshot, WorkspaceConfig } from "@/api/types";
import type { ChatMode } from "@/api/chat-api";
import type { ApprovalMode, PendingApproval } from "@/api/approval-api";
import type { SlashCommandDefinition } from "@/api/command-api";
import type { ProviderModelSelection } from "@/api/provider-api";
import type { DeleteWorkspaceResult } from "@/api/workspace-api";
import type { SkillSummary } from "@/api/skill-api";
import { fetchSessionOverview, type SessionOverviewPlanItem, type SessionOverviewResult, type SessionOverviewSourceItem } from "@/api/session-overview-api";
import WorkspaceTree from "@/features/workspace/WorkspaceTree";
import MessageList, { type MessageListHandle } from "@/features/chat/MessageList";
import Composer from "@/features/composer/Composer";
import FloatingWorkflowTodoPanel, { type WorkflowFileChangeSummary } from "@/features/composer/FloatingWorkflowTodoPanel";
import MessageQueuePanel from "@/features/composer/MessageQueuePanel";
import NewSessionHome from "./NewSessionHome";
import ApprovalDialog from "@/features/approval/ApprovalDialog";
import ToolBudgetDialog from "@/features/approval/ToolBudgetDialog";
import type { ComposerCompletionTrigger } from "@/features/composer/composer-completion";
import type { RetryUserMessagePayload } from "@/features/chat/UserBubble";
import styles from "./AgentPage.module.css";
import { Icon } from "@/assets/icons";
import ClarificationDialog from "@/features/clarification/ClarificationDialog";
import PlanApprovalDialog from "@/features/approval/PlanApprovalDialog";
import DockPanelTabs, { type DockPanelActivationRequest, type DockPanelKind } from "@/features/dock/DockPanelTabs";
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
const SIDE_DOCK_CLOSED_SIZE: number = 0;
const SIDE_DOCK_DEFAULT_SIZE: number = 520;
const SIDE_DOCK_MAX_SIZE: number = 720;
const SIDE_DOCK_CLOSE_THRESHOLD: number = 150;
const BOTTOM_DOCK_CLOSED_SIZE: number = 0;
const BOTTOM_DOCK_DEFAULT_SIZE: number = 280;
const BOTTOM_DOCK_MAX_SIZE: number = 520;
const BOTTOM_DOCK_CLOSE_THRESHOLD: number = 120;

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
	isLoadingMoreBefore: boolean;
	isLoadingMoreAfter: boolean;
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
	isCancelling: boolean;
	isAddingTextAttachment: boolean;
	isApprovalModeSaving: boolean;
	workspaceOptions: WorkspaceConfig[];
	initialWorkspaces: WorkspaceConfig[];
	initialSessions: SessionMetadata[];
	initialActiveWorkspaceId: string | null;
	runningSessionIds: readonly string[];
	homeWorkspace: WorkspaceConfig | null;
	workspaceFooterDisabled: boolean;
	isWorkspaceAdding: boolean;
	activeWorkspace: WorkspaceConfig | null;
	godotLaunchExecutablePath: string | null;
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
	onSessionsChange: (sessions: SessionMetadata[]) => void;
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
	isLoadingMoreBefore,
	isLoadingMoreAfter,
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
	isCancelling,
	isAddingTextAttachment,
	isApprovalModeSaving,
	workspaceOptions,
	initialWorkspaces,
	initialSessions,
	initialActiveWorkspaceId,
	runningSessionIds,
	homeWorkspace,
	workspaceFooterDisabled,
	isWorkspaceAdding,
	activeWorkspace,
	godotLaunchExecutablePath,
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
	onSessionsChange,
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
}: AgentPageProps): React.JSX.Element {
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
	const [sideDockOpen, setSideDockOpen] = useState<boolean>(false);
	const [sideDockSize, setSideDockSize] = useState<number>(SIDE_DOCK_DEFAULT_SIZE);
	const [sideDockLastOpenSize, setSideDockLastOpenSize] = useState<number>(SIDE_DOCK_DEFAULT_SIZE);
	const [bottomDockOpen, setBottomDockOpen] = useState<boolean>(false);
	const [bottomDockSize, setBottomDockSize] = useState<number>(BOTTOM_DOCK_DEFAULT_SIZE);
	const [bottomDockLastOpenSize, setBottomDockLastOpenSize] = useState<number>(BOTTOM_DOCK_DEFAULT_SIZE);
	const messageListRef = useRef<MessageListHandle | null>(null);
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
		setSideDockSize(sideDockLastOpenSize);
		setSideDockOpen(true);
	}, [sideDockLastOpenSize, workspaceForActions]);
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
				console.error("[AgentPage] failed to list workspace launch targets", error);
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
			console.error("[AgentPage] failed to detect Godot project", error);
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
		setSideDockOpen(false);
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
			console.error("[AgentPage] failed to load session overview", error);
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
			console.error("[AgentPage] failed to load Godot scenes", error);
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
							icon={<Icon name="git-commit" />}
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
		if (workspaceForActions === null) {
			return;
		}
		openSideDock("review");
	}, [openSideDock, workspaceForActions]);

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
						type={summaryOpen ? "primary" : "text"}
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
			<aside className={styles.workspaceSidebar}>
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
					runningSessionIds={runningSessionIds}
					sessionUpdate={activeSessionMetadata}
					onWorkspaceSelect={onWorkspaceSelect}
					onSessionSelect={onSessionSelect}
					onSessionArchive={onSessionArchive}
					onSessionRename={onSessionRename}
					onSessionsChange={onSessionsChange}
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
										type={bottomDockOpen ? "primary" : "text"}
										shape="circle"
										aria-pressed={bottomDockOpen}
										icon={<Icon name="layout-bottom" />}
										onClick={toggleBottomDock}
									/>
								</Tooltip>
							) : null}
							{showSideDockButton ? (
								<Tooltip title={sideDockOpen ? t("agentPage.dock.closeSidebar") : t("agentPage.dock.openSidebar")}>
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
										<Typography.Text className={styles.chatText} ellipsis={{ tooltip: chatTitle }}>
											{chatTitle}
										</Typography.Text>
									</header>

									<Divider size="small" />

									{isHome ? (
										<NewSessionHome workspace={homeWorkspace} errorMessage={sessionError} />
									) : (
										<MessageList
											ref={messageListRef}
											blocks={timelineBlocks}
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
										/>
									)}

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
													isWorkspaceAdding={isWorkspaceAdding}
													showContextUsage={!isHome}
													onMessageChange={onMessageChange}
													onModeChange={onModeChange}
													onApprovalModeChange={onApprovalModeChange}
													onProviderModelChange={onProviderModelChange}
													onAddFiles={onAddFiles}
													onAddFolder={onAddFolder}
											onAddImages={onAddImages}
											onAddPastedTextAttachment={onAddPastedTextAttachment}
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
											workspaceId={workspaceForActions?.id ?? null}
											cwd={workspaceForActions?.rootPath ?? null}
											contextItems={contextItems}
											onAddContext={onAddContext}
											onRemoveContext={onRemoveContext}
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
									workspaceId={workspaceForActions?.id ?? null}
									cwd={workspaceForActions?.rootPath ?? null}
									contextItems={contextItems}
									onAddContext={onAddContext}
									onRemoveContext={onRemoveContext}
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

export default AgentPage;

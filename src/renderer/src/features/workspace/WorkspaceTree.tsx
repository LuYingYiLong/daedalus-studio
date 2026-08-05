import { useEffect, useMemo, useRef, useState } from "react";
import type { Key, MouseEvent, ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { archiveSession, exportSession, fetchSessions, renameSession, setSessionPinned } from "@/api/session-api";
import type { ExportSessionResult } from "@/api/session-api";
import {
	deleteWorkspace,
	fetchWorkspaces,
	fetchWorkspaceTreeOrder,
	updateWorkspaceTreeOrder
} from "@/api/workspace-api";
import type {
	DeleteWorkspaceResult,
	WorkspaceTreeOrderPreferences,
	WorkspaceTreeSectionKey
} from "@/api/workspace-api";
import { Alert, Badge, Button, Collapse, Dropdown, Input, message, Modal, Spin, Tooltip, Tree, Typography } from "antd";
import type { CollapseProps, MenuProps, TreeDataNode, TreeProps } from "antd";
import type { SessionMetadata, WorkspaceConfig } from "@/api/types";
import { Icon } from "@/assets/icons";
import { copyTextToClipboard } from "@/shared/lib/clipboard";
import DeleteWorkspaceDialog from "./DeleteWorkspaceDialog";
import WorkspaceProjectDialog from "./WorkspaceProjectDialog";
import { getWorkspaceIconStyle, WORKSPACE_ICON_NAMES } from "./workspace-appearance";
import {
	areWorkspaceTreeOrdersEqual,
	canDropWorkspaceTreeNode,
	createEmptyWorkspaceTreeOrder,
	moveSectionSessionInTreeOrder,
	moveSessionInTreeOrder,
	moveWorkspaceInTreeOrder,
	reconcileWorkspaceTreeOrder,
	sortSessionsByTreeOrder,
	sortWorkspacesByTreeOrder,
	sortWorkspaceSessionsByTreeOrder,
	type WorkspaceTreeDropPlacement
} from "./workspace-tree-order";
import styles from "./WorkspaceTree.module.css";

export type WorkspaceTreeProps = {
	refreshToken?: number;
	selectedSessionId?: string | null;
	selectedWorkspaceId?: string | null;
	initialWorkspaces?: WorkspaceConfig[];
	initialSessions?: SessionMetadata[];
	initialActiveWorkspaceId?: string | null;
	initialWorkspaceTreeOrder?: WorkspaceTreeOrderPreferences;
	sessionUpdate?: SessionMetadata | null;
	runningSessionIds?: readonly string[];
	unreadSessionIds?: readonly string[];
	onSessionSelect?: (session: SessionMetadata) => void;
	onSessionArchive?: (session: SessionMetadata, context: SessionArchiveContext) => void;
	onSessionRename?: (session: SessionMetadata) => void;
	onSessionsChange?: (sessions: SessionMetadata[]) => void;
	onNewSession?: () => void;
	onNewWorkspaceSession?: (workspace: WorkspaceConfig) => void;
	onWorkspaceDelete?: (result: DeleteWorkspaceResult) => void;
	onWorkspaceUpdate?: (workspace: WorkspaceConfig) => void;
	onWorkspaceProjectCreated?: (workspace: WorkspaceConfig) => void;
};

export type SessionArchiveContext = {
	wasActive: boolean;
};

type ProjectTreeNode = TreeDataNode & {
	kind: "workspace" | "session" | "empty";
	sectionKey?: WorkspaceTreeSectionKey;
	workspace?: WorkspaceConfig;
	workspaceId?: string;
	sessionId?: string;
	children?: ProjectTreeNode[];
};

type SessionTreePresentation = {
	key: Key;
	label?: ReactNode;
};

type WorkspaceTreeLabels = {
	archiveSession: string;
	copySessionId: string;
	exportDialogButton: string;
	exportDialogTitle: string;
	exportSession: string;
	exportingSession: string;
	delete: string;
	editProject: string;
	deleteWorkspaceBody: string;
	deleteWorkspaceTitle: string;
	failedArchiveSession: string;
	failedCopySessionId: string;
	failedExportSession: string;
	failedDeleteWorkspace: string;
	failedLoadWorkspace: string;
	failedOpenSessionDirectory: string;
	failedOpenWorkspaceDirectory: string;
	failedPinSession: string;
	failedRenameSession: string;
	failedSaveOrder: string;
	newSession: string;
	newSessionInWorkspace: string;
	newProject: string;
	noPinnedSessions: string;
	noProjects: string;
	noRecentSessions: string;
	noSessions: string;
	noWorkspace: string;
	openInExplorer: string;
	pinSession: string;
	pinned: string;
	projects: string;
	recent: string;
	rename: string;
	renameSession: string;
	sessionIdCopied: string;
	sessionExported: string;
	sessionExportedWithMissingFiles: (count: number) => string;
	sessionTitleCannotBeEmpty: string;
	sessionTitlePlaceholder: string;
	unpinSession: string;
	assistantRunning: string;
	unreadResponse: string;
	archiveSessionAria: (sessionTitle: string) => string;
	pinSessionAria: (sessionTitle: string, pinned: boolean) => string;
	newSessionInWorkspaceAria: (workspaceName: string) => string;
	workspaceActionsAria: (workspaceName: string) => string;
};

function getWorkspaceTreeSwitcherIcon(workspace: WorkspaceConfig, expanded: boolean | undefined): React.JSX.Element {
	const configuredIconName: string = WORKSPACE_ICON_NAMES[workspace.icon] ?? "folder";
	const iconName: string = configuredIconName === "folder" && expanded === true
		? "folder-open"
		: configuredIconName;
	return <Icon name={iconName} style={getWorkspaceIconStyle(workspace.color)} />;
}

function filterVisibleSessions(sessions: SessionMetadata[]): SessionMetadata[] {
	return sessions.filter((session: SessionMetadata): boolean => session.temporary !== true);
}

type CreateSessionMenuItemOptions = {
	archivingSessionId: string | null;
	exportingSessionId: string | null;
	pinningSessionId: string | null;
	runningSessionIds: ReadonlySet<string>;
	unreadSessionIds: ReadonlySet<string>;
	labels: WorkspaceTreeLabels;
	onArchiveButton: (session: SessionMetadata, event: MouseEvent<HTMLElement>) => void;
	onPinButton: (session: SessionMetadata, event: MouseEvent<HTMLElement>) => void;
	onPin: (session: SessionMetadata) => void;
	onRename: (session: SessionMetadata) => void;
	onArchive: (session: SessionMetadata) => void;
	onOpenSessionInExplorer: (session: SessionMetadata) => void;
	onCopySessionId: (session: SessionMetadata) => void;
	onExportSession: (session: SessionMetadata) => void;
};

type CreateWorkspaceMenuItemOptions = CreateSessionMenuItemOptions & {
	deletingWorkspaceId: string | null;
	onNewWorkspaceSession: (workspace: WorkspaceConfig, event: MouseEvent<HTMLElement>) => void;
	onOpenWorkspaceInExplorer: (workspace: WorkspaceConfig) => void;
	onEditWorkspace: (workspace: WorkspaceConfig) => void;
	onDeleteWorkspace: (workspace: WorkspaceConfig) => void;
};

function createSessionTreePresentation(
	session: SessionMetadata,
	options: CreateSessionMenuItemOptions
): SessionTreePresentation {
	const isArchiving: boolean = options.archivingSessionId === session.id;
	const isPinning: boolean = options.pinningSessionId === session.id;
	const isExporting: boolean = options.exportingSessionId === session.id;
	const isRunning: boolean = options.runningSessionIds.has(session.id);
	const isUnread: boolean = options.unreadSessionIds.has(session.id);
	const isPinned: boolean = session.pinned === true;
	const labels: WorkspaceTreeLabels = options.labels;
	const actionMenu: MenuProps = {
		items: [
			{
				key: "pin",
				label: isPinned ? labels.unpinSession : labels.pinSession,
				icon: <Icon name={isPinned ? "pinned" : "pin"} />,
				disabled: isPinning || options.pinningSessionId !== null
			},
			{
				key: "rename",
				label: labels.renameSession,
				icon: <Icon name="pencil" />,
			},
			{
				key: "archive",
				label: labels.archiveSession,
				icon: <Icon name="archive" />,
				disabled: options.archivingSessionId !== null,
			},
			{
				key: "open",
				label: labels.openInExplorer,
				icon: <Icon name="folder-open" />,
			},
			{
				key: "copy",
				label: labels.copySessionId,
				icon: <Icon name="copy" />,
			},
			{
				key: "export",
				label: isExporting ? labels.exportingSession : labels.exportSession,
				icon: isExporting ? <Spin size="small" /> : <Icon name="export" />,
				disabled: options.exportingSessionId !== null
			}
		],
		onClick: ({ key, domEvent }): void => {
			domEvent.preventDefault();
			domEvent.stopPropagation();

			if (key === "pin") {
				options.onPin(session);
				return;
			}
			if (key === "rename") {
				options.onRename(session);
				return;
			}
			if (key === "archive") {
				options.onArchive(session);
				return;
			}
			if (key === "open") {
				options.onOpenSessionInExplorer(session);
				return;
			}
			if (key === "copy") {
				options.onCopySessionId(session);
				return;
			}
			if (key === "export") {
				options.onExportSession(session);
			}
		}
	};

	return {
		key: `session:${session.id}`,
		label: (
			<Dropdown menu={actionMenu} trigger={["contextMenu"]}>
				<span className={styles.sessionMenuItem}>
					<Badge
						dot={isUnread}
						color="var(--ant-color-primary)"
						offset={[-2, 4]}
						title={isUnread ? labels.unreadResponse : undefined}
						className={styles.sessionTitleBadge}
					>
						<span
							className={styles.sessionTitle}
							aria-label={isUnread ? `${session.title}, ${labels.unreadResponse}` : undefined}
						>
							{session.title}
						</span>
					</Badge>
					<Tooltip title={isPinned ? labels.unpinSession : labels.pinSession}>
						<Button
							type="text"
							shape="circle"
							size="small"
							aria-label={labels.pinSessionAria(session.title, isPinned)}
							className={styles.pinButton}
							icon={<Icon name={isPinned ? "pinned" : "pin"} />}
							loading={isPinning}
							draggable={false}
							onMouseDown={(event): void => event.stopPropagation()}
							onDragStart={(event): void => {
								event.preventDefault();
								event.stopPropagation();
							}}
							onClick={(event: MouseEvent<HTMLElement>): void => options.onPinButton(session, event)}
						/>
					</Tooltip>
					{isRunning ? (
						<Tooltip title={labels.assistantRunning}>
							<span className={styles.sessionRunIndicator} aria-label={labels.assistantRunning}>
								<Spin size="small" />
							</span>
						</Tooltip>
					) : (
						<Tooltip title={labels.archiveSession}>
							<Button
								type="text"
								shape="circle"
								size="small"
								aria-label={labels.archiveSessionAria(session.title)}
								className={styles.archiveButton}
								icon={<Icon name="archive" />}
								loading={isArchiving}
								draggable={false}
								onMouseDown={(event): void => event.stopPropagation()}
								onDragStart={(event): void => {
									event.preventDefault();
									event.stopPropagation();
								}}
								onClick={(event: MouseEvent<HTMLElement>): void => options.onArchiveButton(session, event)}
							/>
						</Tooltip>
					)}
				</span>
			</Dropdown>
		)
	};
}

function createSessionTreeNode(
	session: SessionMetadata,
	sectionKey: WorkspaceTreeSectionKey,
	workspaceId: string | undefined,
	options: CreateSessionMenuItemOptions
): ProjectTreeNode {
	const presentation: SessionTreePresentation = createSessionTreePresentation(session, options);
	return {
		key: presentation.key,
		title: presentation.label,
		kind: "session",
		sectionKey,
		workspaceId,
		sessionId: session.id,
		isLeaf: true
	};
}

function createSessionTreeData(
	sessions: SessionMetadata[],
	sectionKey: Exclude<WorkspaceTreeSectionKey, "projects">,
	emptyKey: string,
	emptyLabel: string,
	options: CreateSessionMenuItemOptions
): ProjectTreeNode[] {
	return sessions.length > 0
		? sessions.map((session: SessionMetadata): ProjectTreeNode => {
			return createSessionTreeNode(session, sectionKey, undefined, options);
		})
		: [{
			key: emptyKey,
			title: emptyLabel,
			disabled: true,
			selectable: false,
			kind: "empty",
			sectionKey,
			isLeaf: true
		}];
}

function createProjectTreeData(workspaces: WorkspaceConfig[], sessions: SessionMetadata[], options: CreateWorkspaceMenuItemOptions): ProjectTreeNode[] {
	const labels: WorkspaceTreeLabels = options.labels;
	if (workspaces.length === 0) {
		return [{
			key: "projects:empty",
			title: labels.noProjects,
			disabled: true,
			selectable: false,
			kind: "empty",
			isLeaf: true
		}];
	}

	return workspaces.map((workspace: WorkspaceConfig): ProjectTreeNode => {
		const workspaceSessions: SessionMetadata[] = sessions.filter((session: SessionMetadata): boolean => {
			return session.workspaceId === workspace.id;
		});
		const isDeleting: boolean = options.deletingWorkspaceId === workspace.id;
		const actionMenu: MenuProps = {
			items: [
				{
					key: "edit",
					label: labels.editProject,
					icon: <Icon name="folder-edit" />,
				},
				{
					key: "open",
					label: labels.openInExplorer,
					icon: <Icon name="folder-open" />,
				},
				{
					key: "delete",
					label: labels.delete,
					icon: <Icon name="remove" />,
					danger: true,
					disabled: options.deletingWorkspaceId !== null
				}
			],
			onClick: ({ key, domEvent }): void => {
				domEvent.preventDefault();
				domEvent.stopPropagation();

				if (key === "edit") {
					options.onEditWorkspace(workspace);
					return;
				}
				if (key === "open") {
					options.onOpenWorkspaceInExplorer(workspace);
					return;
				}
				if (key === "delete") {
					options.onDeleteWorkspace(workspace);
				}
			}
		};

		return {
			key: `workspace:${workspace.id}`,
			title: (
				<Dropdown menu={actionMenu} trigger={["contextMenu"]}>
					<span className={styles.workspaceMenuItem}>
						<span className={styles.workspaceTitle}>{workspace.name}</span>
						<span
							className={styles.workspaceActions}
							draggable={false}
							onMouseDown={(event: MouseEvent<HTMLElement>): void => {
								event.stopPropagation();
							}}
							onPointerDown={(event): void => {
								event.stopPropagation();
							}}
							onDragStart={(event): void => {
								event.preventDefault();
								event.stopPropagation();
							}}
						>
							<Dropdown menu={actionMenu} trigger={["click"]}>
								<Button
									type="text"
									shape="circle"
									size="small"
									aria-label={labels.workspaceActionsAria(workspace.name)}
									className={styles.workspaceActionButton}
									icon={<Icon name="more-v" width={16} height={16} />}
									loading={isDeleting}
									onClick={(event: MouseEvent<HTMLElement>): void => {
										event.preventDefault();
										event.stopPropagation();
									}}
								/>
							</Dropdown>
							<Tooltip title={labels.newSessionInWorkspace}>
								<Button
									type="text"
									shape="circle"
									size="small"
									aria-label={labels.newSessionInWorkspaceAria(workspace.name)}
									className={styles.workspaceActionButton}
									icon={<Icon name="add" width={16} height={16} />}
									onClick={(event: MouseEvent<HTMLElement>): void => options.onNewWorkspaceSession(workspace, event)}
								/>
							</Tooltip>
						</span>
					</span>
				</Dropdown>
			),
			kind: "workspace",
			workspace,
			workspaceId: workspace.id,
			children: workspaceSessions.length > 0
				? workspaceSessions.map((session: SessionMetadata): ProjectTreeNode => {
					return createSessionTreeNode(session, "projects", workspace.id, options);
				})
				: [
					{
						key: `workspace:${workspace.id}:empty`,
						title: labels.noSessions,
						disabled: true,
						selectable: false,
						kind: "empty",
						sectionKey: "projects",
						workspaceId: workspace.id,
						isLeaf: true
					}
				]
		};
	});
}

function getSelectedMenuKeys(selectedSessionId: string | null, selectedWorkspaceId: string | null, fallbackKeys: string[]): string[] {
	if (selectedSessionId !== null) {
		return [`session:${selectedSessionId}`];
	}

	if (selectedWorkspaceId !== null) {
		return [`workspace:${selectedWorkspaceId}`];
	}

	return fallbackKeys;
}

function areStringListsEqual(left: readonly string[], right: readonly string[]): boolean {
	return left.length === right.length && left.every((value: string, index: number): boolean => value === right[index]);
}

function WorkspaceTree({
	refreshToken = 0,
	selectedSessionId = null,
	selectedWorkspaceId = null,
	initialWorkspaces = [],
	initialSessions = [],
	initialActiveWorkspaceId = null,
	initialWorkspaceTreeOrder = createEmptyWorkspaceTreeOrder(),
	sessionUpdate = null,
	runningSessionIds = [],
	unreadSessionIds = [],
	onSessionSelect,
	onSessionArchive,
	onSessionRename,
	onSessionsChange,
	onNewSession,
	onNewWorkspaceSession,
	onWorkspaceDelete,
	onWorkspaceUpdate,
	onWorkspaceProjectCreated
}: WorkspaceTreeProps): React.JSX.Element {
	const [messageApi, messageContextHolder] = message.useMessage();
	const { t } = useTranslation();
	const [workspaces, setWorkspaces] = useState<WorkspaceConfig[]>(() => initialWorkspaces);
	const [sessions, setSessions] = useState<SessionMetadata[]>(() => filterVisibleSessions(initialSessions));
	const [workspaceTreeOrder, setWorkspaceTreeOrder] = useState<WorkspaceTreeOrderPreferences>(() => {
		return reconcileWorkspaceTreeOrder(initialWorkspaceTreeOrder, initialWorkspaces, filterVisibleSessions(initialSessions));
	});
	const [expandedWorkspaceIds, setExpandedWorkspaceIds] = useState<string[]>(() => {
		return reconcileWorkspaceTreeOrder(initialWorkspaceTreeOrder, initialWorkspaces, filterVisibleSessions(initialSessions))
			.expandedWorkspaceIds;
	});
	const [activeWorkspaceId, setActiveWorkspaceId] = useState<string | null>(initialActiveWorkspaceId);
	const [selectedMenuKeys, setSelectedMenuKeys] = useState<string[]>([]);
	const [isWorkspaceLoading, setIsWorkspaceLoading] = useState<boolean>(true);
	const [workspaceError, setWorkspaceError] = useState<string | null>(null);
	const [reloadIndex, setReloadIndex] = useState<number>(0);
	const [archivingSessionId, setArchivingSessionId] = useState<string | null>(null);
	const [pinningSessionId, setPinningSessionId] = useState<string | null>(null);
	const [exportingSessionId, setExportingSessionId] = useState<string | null>(null);
	const [isCreateProjectOpen, setIsCreateProjectOpen] = useState<boolean>(false);
	const [deleteTargetWorkspace, setDeleteTargetWorkspace] = useState<WorkspaceConfig | null>(null);
	const [editTargetWorkspace, setEditTargetWorkspace] = useState<WorkspaceConfig | null>(null);
	const [deletingWorkspaceId, setDeletingWorkspaceId] = useState<string | null>(null);
	const [renameTargetSession, setRenameTargetSession] = useState<SessionMetadata | null>(null);
	const [renameDraftTitle, setRenameDraftTitle] = useState<string>("");
	const [renameError, setRenameError] = useState<string | null>(null);
	const [renamingSessionId, setRenamingSessionId] = useState<string | null>(null);
	const workspaceTreeOrderRef = useRef<WorkspaceTreeOrderPreferences>(workspaceTreeOrder);
	const expandedWorkspaceIdsRef = useRef<string[]>(expandedWorkspaceIds);
	const workspacesRef = useRef<WorkspaceConfig[]>(workspaces);
	const sessionsRef = useRef<SessionMetadata[]>(sessions);
	const orderSaveQueueRef = useRef<Promise<void>>(Promise.resolve());
	const orderSaveRevisionRef = useRef<number>(0);
	const expansionSaveTimerRef = useRef<number | null>(null);
	const isMountedRef = useRef<boolean>(true);
	const runningSessionIdSet: ReadonlySet<string> = useMemo((): ReadonlySet<string> => new Set(runningSessionIds), [runningSessionIds]);
	const unreadSessionIdSet: ReadonlySet<string> = useMemo((): ReadonlySet<string> => new Set(unreadSessionIds), [unreadSessionIds]);
	const labels: WorkspaceTreeLabels = useMemo((): WorkspaceTreeLabels => {
		return {
			archiveSession: t("workspaceTree.actions.archiveSession"),
			copySessionId: t("workspaceTree.actions.copySessionId"),
			exportDialogButton: t("workspaceTree.exportDialog.button"),
			exportDialogTitle: t("workspaceTree.exportDialog.title"),
			exportSession: t("workspaceTree.actions.exportSession"),
			exportingSession: t("workspaceTree.status.exportingSession"),
			delete: t("workspaceTree.actions.delete"),
			editProject: t("workspaceTree.actions.editProject", { defaultValue: "Edit project" }),
			deleteWorkspaceBody: t("workspaceTree.modals.deleteWorkspace.body"),
			deleteWorkspaceTitle: t("workspaceTree.modals.deleteWorkspace.title"),
			failedArchiveSession: t("workspaceTree.errors.archiveSession"),
			failedCopySessionId: t("workspaceTree.errors.copySessionId"),
			failedExportSession: t("workspaceTree.errors.exportSession"),
			failedDeleteWorkspace: t("workspaceTree.errors.deleteWorkspace"),
			failedLoadWorkspace: t("workspaceTree.errors.loadWorkspace"),
			failedOpenSessionDirectory: t("workspaceTree.errors.openSessionDirectory"),
			failedOpenWorkspaceDirectory: t("workspaceTree.errors.openWorkspaceDirectory"),
			failedPinSession: t("workspaceTree.errors.pinSession"),
			failedRenameSession: t("workspaceTree.errors.renameSession"),
			failedSaveOrder: t("workspaceTree.errors.saveOrder", { defaultValue: "Failed to save workspace order" }),
			newSession: t("agentPage.actions.newSession"),
			newSessionInWorkspace: t("workspaceTree.actions.newSessionInWorkspace"),
			newProject: t("workspaceTree.actions.newProject"),
			noPinnedSessions: t("workspaceTree.empty.noPinnedSessions"),
			noProjects: t("workspaceTree.empty.noProjects"),
			noRecentSessions: t("workspaceTree.empty.noRecentSessions"),
			noSessions: t("workspaceTree.empty.noSessions"),
			noWorkspace: t("workspaceTree.empty.noWorkspace"),
			openInExplorer: t("workspaceTree.actions.openInExplorer"),
			pinSession: t("workspaceTree.actions.pinSession"),
			pinned: t("workspaceTree.groups.pinned"),
			projects: t("workspaceTree.groups.projects"),
			recent: t("workspaceTree.groups.recent"),
			rename: t("workspaceTree.actions.rename"),
			renameSession: t("workspaceTree.actions.renameSession"),
			sessionIdCopied: t("workspaceTree.messages.sessionIdCopied"),
			sessionExported: t("workspaceTree.messages.sessionExported"),
			sessionExportedWithMissingFiles: (count: number): string => t(
				"workspaceTree.messages.sessionExportedWithMissingFiles",
				{ count }
			),
			sessionTitleCannotBeEmpty: t("workspaceTree.errors.sessionTitleCannotBeEmpty"),
			sessionTitlePlaceholder: t("workspaceTree.modals.renameSession.placeholder"),
			unpinSession: t("workspaceTree.actions.unpinSession"),
			archiveSessionAria: (sessionTitle: string): string => t("workspaceTree.aria.archiveSession", { sessionTitle }),
			pinSessionAria: (sessionTitle: string, pinned: boolean): string => t(
				pinned ? "workspaceTree.aria.unpinSession" : "workspaceTree.aria.pinSession",
				{ sessionTitle }
			),
			newSessionInWorkspaceAria: (workspaceName: string): string => t("workspaceTree.aria.newSessionInWorkspace", { workspaceName }),
			assistantRunning: t("workspaceTree.status.assistantRunning", { defaultValue: "Assistant is responding" }),
			unreadResponse: t("workspaceTree.status.unreadResponse", { defaultValue: "Unread assistant response" }),
			workspaceActionsAria: (workspaceName: string): string => t("workspaceTree.aria.workspaceActions", { workspaceName })
		};
	}, [t]);

	workspaceTreeOrderRef.current = {
		...workspaceTreeOrder,
		expandedWorkspaceIds: expandedWorkspaceIdsRef.current
	};
	workspacesRef.current = workspaces;
	sessionsRef.current = sessions;

	function showWorkspaceOperationError(error: unknown, fallbackMessage: string): void {
		const errorMessage: string = error instanceof Error ? error.message : fallbackMessage;
		console.error(`[WorkspaceTree] ${fallbackMessage}`, error);
		void messageApi.error(errorMessage);
	}

	function setCanonicalWorkspaceTreeOrder(nextOrder: WorkspaceTreeOrderPreferences): void {
		workspaceTreeOrderRef.current = nextOrder;
		expandedWorkspaceIdsRef.current = nextOrder.expandedWorkspaceIds;
		setExpandedWorkspaceIds(nextOrder.expandedWorkspaceIds);
		setWorkspaceTreeOrder(nextOrder);
	}

	function clearScheduledExpansionSave(): void {
		if (expansionSaveTimerRef.current !== null) {
			window.clearTimeout(expansionSaveTimerRef.current);
			expansionSaveTimerRef.current = null;
		}
	}

	function enqueueWorkspaceTreeOrderSave(nextOrder: WorkspaceTreeOrderPreferences): void {
		const revision: number = orderSaveRevisionRef.current + 1;
		orderSaveRevisionRef.current = revision;
		const payload = {
			workspaceIds: [...nextOrder.workspaceIds],
			sessionIdsByWorkspace: Object.fromEntries(
				Object.entries(nextOrder.sessionIdsByWorkspace).map(
					([workspaceId, sessionIds]): [string, string[]] => [workspaceId, [...sessionIds]]
				)
			),
			pinnedSessionIds: [...nextOrder.pinnedSessionIds],
			recentSessionIds: [...nextOrder.recentSessionIds],
			expandedSectionKeys: [...nextOrder.expandedSectionKeys],
			expandedWorkspaceIds: [...nextOrder.expandedWorkspaceIds]
		};

		orderSaveQueueRef.current = orderSaveQueueRef.current.then(async (): Promise<void> => {
			try {
				const savedOrder: WorkspaceTreeOrderPreferences = await updateWorkspaceTreeOrder(payload);
				if (!isMountedRef.current || revision !== orderSaveRevisionRef.current) {
					return;
				}
				const reconciledOrder: WorkspaceTreeOrderPreferences = reconcileWorkspaceTreeOrder(
					savedOrder,
					workspacesRef.current,
					sessionsRef.current
				);
				if (!areWorkspaceTreeOrdersEqual(workspaceTreeOrderRef.current, reconciledOrder)) {
					setCanonicalWorkspaceTreeOrder(reconciledOrder);
				}
			} catch (error: unknown) {
				if (!isMountedRef.current || revision !== orderSaveRevisionRef.current) {
					return;
				}
				try {
					const storedOrder: WorkspaceTreeOrderPreferences = await fetchWorkspaceTreeOrder();
					if (isMountedRef.current && revision === orderSaveRevisionRef.current) {
						setCanonicalWorkspaceTreeOrder(reconcileWorkspaceTreeOrder(
							storedOrder,
							workspacesRef.current,
							sessionsRef.current
						));
					}
				} catch (reloadError: unknown) {
					console.error("[WorkspaceTree] reload workspace order failed", reloadError);
				}
				showWorkspaceOperationError(error, labels.failedSaveOrder);
			}
		});
	}

	function persistWorkspaceTreeOrder(nextOrder: WorkspaceTreeOrderPreferences): void {
		if (areWorkspaceTreeOrdersEqual(workspaceTreeOrderRef.current, nextOrder)) {
			return;
		}
		clearScheduledExpansionSave();
		setCanonicalWorkspaceTreeOrder(nextOrder);
		enqueueWorkspaceTreeOrderSave(nextOrder);
	}

	function persistExpandedWorkspaceIds(nextExpandedWorkspaceIds: string[]): void {
		if (areStringListsEqual(expandedWorkspaceIdsRef.current, nextExpandedWorkspaceIds)) {
			return;
		}
		const nextOrder: WorkspaceTreeOrderPreferences = {
			...workspaceTreeOrderRef.current,
			expandedWorkspaceIds: nextExpandedWorkspaceIds
		};
		workspaceTreeOrderRef.current = nextOrder;
		expandedWorkspaceIdsRef.current = nextExpandedWorkspaceIds;
		setExpandedWorkspaceIds(nextExpandedWorkspaceIds);
		clearScheduledExpansionSave();
		expansionSaveTimerRef.current = window.setTimeout((): void => {
			expansionSaveTimerRef.current = null;
			enqueueWorkspaceTreeOrderSave(workspaceTreeOrderRef.current);
		}, 300);
	}

	const handleSectionChange: NonNullable<CollapseProps["onChange"]> = (keys): void => {
		const candidateKeys: string[] = (Array.isArray(keys) ? keys : [keys]).map(String);
		const expandedSectionKeys: WorkspaceTreeSectionKey[] = candidateKeys.filter(
			(key: string): key is WorkspaceTreeSectionKey => {
				return key === "pinned" || key === "projects" || key === "recent";
			}
		);
		persistWorkspaceTreeOrder({
			...workspaceTreeOrderRef.current,
			expandedSectionKeys
		});
	};

	function ensureSectionOpen(sectionKey: WorkspaceTreeSectionKey): void {
		const currentOrder: WorkspaceTreeOrderPreferences = workspaceTreeOrderRef.current;
		if (currentOrder.expandedSectionKeys.includes(sectionKey)) {
			return;
		}
		persistWorkspaceTreeOrder({
			...currentOrder,
			expandedSectionKeys: [...currentOrder.expandedSectionKeys, sectionKey]
		});
	}

	async function handleArchiveSessionAction(session: SessionMetadata): Promise<void> {
		if (archivingSessionId !== null) {
			return;
		}
		const wasActive: boolean = selectedSessionId === session.id;

		try {
			setArchivingSessionId(session.id);
			await archiveSession(session.id);
			window.electronAPI.sessionCatalog.notifyChanged();
			setSessions((currentSessions: SessionMetadata[]): SessionMetadata[] => {
				return currentSessions.filter((currentSession: SessionMetadata): boolean => currentSession.id !== session.id);
			});
			setSelectedMenuKeys((currentKeys: string[]): string[] => {
				return currentKeys.filter((key: string): boolean => key !== `session:${session.id}`);
			});
			onSessionArchive?.(session, { wasActive });
		} catch (error: unknown) {
			showWorkspaceOperationError(error, labels.failedArchiveSession);
		} finally {
			setArchivingSessionId(null);
		}
	}

	async function handleArchiveSession(session: SessionMetadata, event: MouseEvent<HTMLElement>): Promise<void> {
		event.preventDefault();
		event.stopPropagation();
		await handleArchiveSessionAction(session);
	}

	async function handlePinSessionAction(session: SessionMetadata): Promise<void> {
		if (pinningSessionId !== null) {
			return;
		}

		const pinned: boolean = session.pinned !== true;
		try {
			setPinningSessionId(session.id);
			const metadata: SessionMetadata = await setSessionPinned(session.id, pinned);
			setSessions((currentSessions: SessionMetadata[]): SessionMetadata[] => currentSessions.map(
				(currentSession: SessionMetadata): SessionMetadata => currentSession.id === metadata.id ? metadata : currentSession
			));
			const targetSection: WorkspaceTreeSectionKey = metadata.pinned === true
				? "pinned"
				: metadata.workspaceId !== undefined && workspaces.some((workspace: WorkspaceConfig): boolean => workspace.id === metadata.workspaceId)
					? "projects"
					: "recent";
			ensureSectionOpen(targetSection);
		} catch (error: unknown) {
			showWorkspaceOperationError(error, labels.failedPinSession);
		} finally {
			setPinningSessionId(null);
		}
	}

	async function handlePinSession(session: SessionMetadata, event: MouseEvent<HTMLElement>): Promise<void> {
		event.preventDefault();
		event.stopPropagation();
		await handlePinSessionAction(session);
	}

	function handleNewWorkspaceSession(workspace: WorkspaceConfig, event: MouseEvent<HTMLElement>): void {
		event.preventDefault();
		event.stopPropagation();
		onNewWorkspaceSession?.(workspace);
	}

	function handleRenameSessionStart(session: SessionMetadata): void {
		setRenameTargetSession(session);
		setRenameDraftTitle(session.title);
		setRenameError(null);
	}

	async function handleConfirmRenameSession(): Promise<void> {
		if (renameTargetSession === null || renamingSessionId !== null) {
			return;
		}

		const nextTitle: string = renameDraftTitle.trim();
		if (nextTitle.length === 0) {
			setRenameError(labels.sessionTitleCannotBeEmpty);
			return;
		}

		if (nextTitle === renameTargetSession.title) {
			setRenameTargetSession(null);
			setRenameDraftTitle("");
			return;
		}

		try {
			setWorkspaceError(null);
			setRenameError(null);
			setRenamingSessionId(renameTargetSession.id);
			const metadata: SessionMetadata = await renameSession(renameTargetSession.id, nextTitle);
			setSessions((currentSessions: SessionMetadata[]): SessionMetadata[] => {
				return currentSessions.map((session: SessionMetadata): SessionMetadata => {
					return session.id === metadata.id ? metadata : session;
				});
			});
			onSessionRename?.(metadata);
			setRenameTargetSession(null);
			setRenameDraftTitle("");
		} catch (error: unknown) {
			const errorMessage: string = error instanceof Error ? error.message : labels.failedRenameSession;
			setRenameError(errorMessage);
			void messageApi.error(errorMessage);
		} finally {
			setRenamingSessionId(null);
		}
	}

	async function handleOpenSessionInExplorer(session: SessionMetadata): Promise<void> {
		try {
			setWorkspaceError(null);
			await window.electronAPI.sessionFs.openSessionDirectory(session.id);
		} catch (error: unknown) {
			showWorkspaceOperationError(error, labels.failedOpenSessionDirectory);
		}
	}

	async function handleCopySessionId(session: SessionMetadata): Promise<void> {
		try {
			await copyTextToClipboard(session.id);
			void messageApi.success(labels.sessionIdCopied);
		} catch (error: unknown) {
			showWorkspaceOperationError(error, labels.failedCopySessionId);
		}
	}

	async function handleExportSession(session: SessionMetadata): Promise<void> {
		if (exportingSessionId !== null) {
			return;
		}
		try {
			const destinationPath: string | null = await window.electronAPI.sessionFs.pickExportDestination({
				sessionId: session.id,
				title: session.title,
				dialogTitle: labels.exportDialogTitle,
				buttonLabel: labels.exportDialogButton
			});
			if (destinationPath === null) {
				return;
			}
			setExportingSessionId(session.id);
			const result: ExportSessionResult = await exportSession(session.id, destinationPath);
			if (result.missingFileCount > 0) {
				void messageApi.warning(labels.sessionExportedWithMissingFiles(result.missingFileCount));
			} else {
				void messageApi.success(labels.sessionExported);
			}
		} catch (error: unknown) {
			showWorkspaceOperationError(error, labels.failedExportSession);
		} finally {
			setExportingSessionId(null);
		}
	}

	async function handleOpenWorkspaceInExplorer(workspace: WorkspaceConfig): Promise<void> {
		try {
			setWorkspaceError(null);
			await window.electronAPI.workspaceFs.openWorkspaceDirectory(workspace.rootPath);
		} catch (error: unknown) {
			showWorkspaceOperationError(error, labels.failedOpenWorkspaceDirectory);
		}
	}

	async function handleConfirmDeleteWorkspace(): Promise<void> {
		if (deleteTargetWorkspace === null || deletingWorkspaceId !== null) {
			return;
		}

		const workspace: WorkspaceConfig = deleteTargetWorkspace;

		try {
			setDeletingWorkspaceId(workspace.id);
			setWorkspaceError(null);
			const result: DeleteWorkspaceResult = await deleteWorkspace(workspace.id);
			const deletedSessionIds: Set<string> = new Set(result.deletedSessionIds);
			const movedBySessionId: Map<string, string> = new Map(
				result.movedSessions.map((move): [string, string] => [move.sessionId, move.workspaceId])
			);

			setWorkspaces((currentWorkspaces: WorkspaceConfig[]): WorkspaceConfig[] => {
				return currentWorkspaces.filter((currentWorkspace: WorkspaceConfig): boolean => currentWorkspace.id !== workspace.id);
			});
			setSessions((currentSessions: SessionMetadata[]): SessionMetadata[] => {
				return currentSessions
					.filter((session: SessionMetadata): boolean => !deletedSessionIds.has(session.id))
					.map((session: SessionMetadata): SessionMetadata => {
						const destinationId: string | undefined = movedBySessionId.get(session.id);
						const destination: WorkspaceConfig | undefined = destinationId === undefined
							? undefined
							: workspaces.find((candidate): boolean => candidate.id === destinationId);
						return destination === undefined
							? session
							: {
								...session,
								workspaceId: destination.id,
								workspaceName: destination.name,
								workspaceRoot: destination.rootPath
							};
					});
			});
			setSelectedMenuKeys((currentKeys: string[]): string[] => {
				return currentKeys.filter((key: string): boolean => {
					if (key === `workspace:${workspace.id}`) {
						return false;
					}
					if (!key.startsWith("session:")) {
						return true;
					}

					return !deletedSessionIds.has(key.slice("session:".length));
				});
			});
			setActiveWorkspaceId((currentWorkspaceId: string | null): string | null => {
				return currentWorkspaceId === workspace.id ? null : currentWorkspaceId;
			});
			setDeleteTargetWorkspace(null);
			setEditTargetWorkspace(null);
			onWorkspaceDelete?.(result);
		} catch (error: unknown) {
			showWorkspaceOperationError(error, labels.failedDeleteWorkspace);
		} finally {
			setDeletingWorkspaceId(null);
		}
	}

	useEffect((): (() => void) => {
		isMountedRef.current = true;
		return (): void => {
			const pendingOrder: WorkspaceTreeOrderPreferences | null = expansionSaveTimerRef.current === null
				? null
				: workspaceTreeOrderRef.current;
			clearScheduledExpansionSave();
			isMountedRef.current = false;
			if (pendingOrder !== null) {
				enqueueWorkspaceTreeOrderSave(pendingOrder);
			}
		};
	}, []);

	useEffect((): (() => void) => {
		let cancelled: boolean = false;
		let retryTimer: number | null = null;

		async function loadWorkspaceTree(): Promise<void> {
			try {
				setIsWorkspaceLoading(true);
				setWorkspaceError(null);

				const [workspaceList, sessionList, storedOrder] = await Promise.all([
					fetchWorkspaces(),
					fetchSessions(),
					fetchWorkspaceTreeOrder()
				]);

				if (cancelled) {
					return;
				}

				console.info("[WorkspaceTree] loaded", {
					workspaceCount: workspaceList.workspaces.length,
					sessionCount: sessionList.sessions.length,
					activeWorkspaceId: workspaceList.active,
					workspaces: workspaceList.workspaces,
					sessions: sessionList.sessions
				});

				const visibleSessions: SessionMetadata[] = filterVisibleSessions(sessionList.sessions);
				const reconciledOrder: WorkspaceTreeOrderPreferences = reconcileWorkspaceTreeOrder(
					storedOrder,
					workspaceList.workspaces,
					visibleSessions
				);
				workspacesRef.current = workspaceList.workspaces;
				sessionsRef.current = visibleSessions;
				workspaceTreeOrderRef.current = reconciledOrder;
				expandedWorkspaceIdsRef.current = reconciledOrder.expandedWorkspaceIds;
				setWorkspaces(workspaceList.workspaces);
				setSessions(visibleSessions);
				setExpandedWorkspaceIds(reconciledOrder.expandedWorkspaceIds);
				setWorkspaceTreeOrder(reconciledOrder);
				setActiveWorkspaceId(workspaceList.active);

				if (workspaceList.workspaces.length === 0 && sessionList.sessions.length === 0 && reloadIndex < 5) {
					retryTimer = window.setTimeout((): void => {
						setReloadIndex((currentReloadIndex: number): number => currentReloadIndex + 1);
					}, 1200);
				}
			} catch (error: unknown) {
				if (!cancelled) {
					setWorkspaceError(error instanceof Error ? error.message : labels.failedLoadWorkspace);
				}
			} finally {
				if (!cancelled) {
					setIsWorkspaceLoading(false);
				}
			}
		}

		void loadWorkspaceTree();

		return (): void => {
			cancelled = true;

			if (retryTimer !== null) {
				window.clearTimeout(retryTimer);
			}
		};
	}, [labels.failedLoadWorkspace, refreshToken, reloadIndex]);

	useEffect((): void => {
		const reconciledOrder: WorkspaceTreeOrderPreferences = reconcileWorkspaceTreeOrder(
			workspaceTreeOrderRef.current,
			workspaces,
			sessions
		);
		if (!areWorkspaceTreeOrdersEqual(workspaceTreeOrderRef.current, reconciledOrder)) {
			persistWorkspaceTreeOrder(reconciledOrder);
		}
	}, [sessions, workspaces]);

	const sessionMenuOptions: CreateSessionMenuItemOptions = useMemo((): CreateSessionMenuItemOptions => {
		return {
			archivingSessionId,
			exportingSessionId,
			pinningSessionId,
			runningSessionIds: runningSessionIdSet,
			unreadSessionIds: unreadSessionIdSet,
			labels,
			onArchiveButton: (session: SessionMetadata, event: MouseEvent<HTMLElement>): void => {
				void handleArchiveSession(session, event);
			},
			onPin: (session: SessionMetadata): void => {
				void handlePinSessionAction(session);
			},
			onPinButton: (session: SessionMetadata, event: MouseEvent<HTMLElement>): void => {
				void handlePinSession(session, event);
			},
			onRename: (session: SessionMetadata): void => {
				handleRenameSessionStart(session);
			},
			onArchive: (session: SessionMetadata): void => {
				void handleArchiveSessionAction(session);
			},
			onOpenSessionInExplorer: (session: SessionMetadata): void => {
				void handleOpenSessionInExplorer(session);
			},
			onCopySessionId: (session: SessionMetadata): void => {
				void handleCopySessionId(session);
			},
			onExportSession: (session: SessionMetadata): void => {
				void handleExportSession(session);
			}
		};
	}, [archivingSessionId, exportingSessionId, labels, pinningSessionId, runningSessionIdSet, unreadSessionIdSet]);
	const sessionGroups = useMemo((): {
		pinnedSessions: SessionMetadata[];
		projectSessions: SessionMetadata[];
		recentSessions: SessionMetadata[];
	} => {
		const workspaceIds: ReadonlySet<string> = new Set(workspaces.map((workspace: WorkspaceConfig): string => workspace.id));
		return sessions.reduce<{
			pinnedSessions: SessionMetadata[];
			projectSessions: SessionMetadata[];
			recentSessions: SessionMetadata[];
		}>((groups, session) => {
			if (session.pinned === true) {
				groups.pinnedSessions.push(session);
			} else if (session.workspaceId !== undefined && workspaceIds.has(session.workspaceId)) {
				groups.projectSessions.push(session);
			} else {
				groups.recentSessions.push(session);
			}
			return groups;
		}, {
			pinnedSessions: [],
			projectSessions: [],
			recentSessions: []
		} as {
			pinnedSessions: SessionMetadata[];
			projectSessions: SessionMetadata[];
			recentSessions: SessionMetadata[];
		});
	}, [sessions, workspaces]);
	const effectiveWorkspaceTreeOrder: WorkspaceTreeOrderPreferences = useMemo(
		(): WorkspaceTreeOrderPreferences => reconcileWorkspaceTreeOrder(workspaceTreeOrder, workspaces, sessions),
		[sessions, workspaceTreeOrder, workspaces]
	);
	const orderedWorkspaces: WorkspaceConfig[] = useMemo((): WorkspaceConfig[] => {
		return sortWorkspacesByTreeOrder(workspaces, effectiveWorkspaceTreeOrder);
	}, [effectiveWorkspaceTreeOrder, workspaces]);
	const orderedPinnedSessions: SessionMetadata[] = useMemo((): SessionMetadata[] => {
		return sortSessionsByTreeOrder(
			sessionGroups.pinnedSessions,
			effectiveWorkspaceTreeOrder.pinnedSessionIds
		);
	}, [effectiveWorkspaceTreeOrder.pinnedSessionIds, sessionGroups.pinnedSessions]);
	const orderedProjectSessions: SessionMetadata[] = useMemo((): SessionMetadata[] => {
		return orderedWorkspaces.flatMap((workspace: WorkspaceConfig): SessionMetadata[] => {
			return sortWorkspaceSessionsByTreeOrder(
				sessionGroups.projectSessions,
				workspace.id,
				effectiveWorkspaceTreeOrder
			);
		});
	}, [effectiveWorkspaceTreeOrder, orderedWorkspaces, sessionGroups.projectSessions]);
	const orderedRecentSessions: SessionMetadata[] = useMemo((): SessionMetadata[] => {
		return sortSessionsByTreeOrder(
			sessionGroups.recentSessions,
			effectiveWorkspaceTreeOrder.recentSessionIds
		);
	}, [effectiveWorkspaceTreeOrder.recentSessionIds, sessionGroups.recentSessions]);
	const pinnedTreeData: ProjectTreeNode[] = useMemo((): ProjectTreeNode[] => {
		return createSessionTreeData(
			orderedPinnedSessions,
			"pinned",
			"pinned:empty",
			labels.noPinnedSessions,
			sessionMenuOptions
		);
	}, [labels.noPinnedSessions, orderedPinnedSessions, sessionMenuOptions]);
	const projectTreeData: ProjectTreeNode[] = useMemo((): ProjectTreeNode[] => {
		return createProjectTreeData(orderedWorkspaces, orderedProjectSessions, {
			...sessionMenuOptions,
			deletingWorkspaceId,
			onNewWorkspaceSession: handleNewWorkspaceSession,
			onOpenWorkspaceInExplorer: (workspace: WorkspaceConfig): void => {
				void handleOpenWorkspaceInExplorer(workspace);
			},
			onEditWorkspace: (workspace: WorkspaceConfig): void => {
				setEditTargetWorkspace(workspace);
			},
			onDeleteWorkspace: (workspace: WorkspaceConfig): void => {
				setDeleteTargetWorkspace(workspace);
			}
		});
	}, [deletingWorkspaceId, orderedProjectSessions, orderedWorkspaces, sessionMenuOptions]);
	const recentTreeData: ProjectTreeNode[] = useMemo((): ProjectTreeNode[] => {
		return createSessionTreeData(
			orderedRecentSessions,
			"recent",
			"recent:empty",
			labels.noRecentSessions,
			sessionMenuOptions
		);
	}, [labels.noRecentSessions, orderedRecentSessions, sessionMenuOptions]);
	const effectiveSelectedMenuKeys: string[] = getSelectedMenuKeys(selectedSessionId, selectedWorkspaceId, selectedMenuKeys);
	const openSectionKeys: WorkspaceTreeSectionKey[] = effectiveWorkspaceTreeOrder.expandedSectionKeys;
	const openWorkspaceKeys: string[] = expandedWorkspaceIds.map(
		(workspaceId: string): string => `workspace:${workspaceId}`
	);
	const handleProjectTreeExpand: NonNullable<TreeProps<ProjectTreeNode>["onExpand"]> = (expandedKeys): void => {
		const expandedWorkspaceIds: string[] = expandedKeys.flatMap((key: Key): string[] => {
			const normalizedKey: string = String(key);
			return normalizedKey.startsWith("workspace:") ? [normalizedKey.slice("workspace:".length)] : [];
		});
		persistExpandedWorkspaceIds(expandedWorkspaceIds);
	};
	const handleProjectTreeSelect: NonNullable<TreeProps<ProjectTreeNode>["onSelect"]> = (_selectedKeys, info): void => {
		const node: ProjectTreeNode = info.node;
		const selectedKey: string = String(node.key);
		if (node.kind === "empty") {
			return;
		}
		setSelectedMenuKeys([selectedKey]);
		if (node.kind === "workspace") {
			const workspaceId: string = node.workspaceId ?? selectedKey.slice("workspace:".length);
			const currentOrder: WorkspaceTreeOrderPreferences = workspaceTreeOrderRef.current;
			persistExpandedWorkspaceIds(
				currentOrder.expandedWorkspaceIds.includes(workspaceId)
					? currentOrder.expandedWorkspaceIds.filter((id: string): boolean => id !== workspaceId)
					: [...currentOrder.expandedWorkspaceIds, workspaceId]
			);
			return;
		}
		if (node.sessionId !== undefined) {
			const selectedSession: SessionMetadata | undefined = sessions.find(
				(session: SessionMetadata): boolean => session.id === node.sessionId
			);
			if (selectedSession !== undefined) {
				onSessionSelect?.(selectedSession);
			}
		}
	};
	const canDropTreeNode = (
		dragNode: ProjectTreeNode,
		dropNode: ProjectTreeNode,
		dropToGap: boolean
	): boolean => canDropWorkspaceTreeNode(
		dragNode,
		dropNode,
		dropToGap,
		effectiveWorkspaceTreeOrder
	);
	const allowTreeDrop: NonNullable<TreeProps<ProjectTreeNode>["allowDrop"]> = ({
		dragNode,
		dropNode,
		dropPosition
	}): boolean => canDropTreeNode(dragNode, dropNode, dropPosition !== 0);
	const handleTreeDrop: NonNullable<TreeProps<ProjectTreeNode>["onDrop"]> = (info): void => {
		const dragNode: ProjectTreeNode = info.dragNode;
		const dropNode: ProjectTreeNode = info.node;
		if (!canDropTreeNode(dragNode, dropNode, info.dropToGap === true)) {
			return;
		}
		const targetPosition: number = Number.parseInt(
			(info.node as ProjectTreeNode & { pos: string }).pos.split("-").at(-1) ?? "0",
			10
		);
		const relativeDropPosition: number = info.dropPosition - targetPosition;
		const placement: WorkspaceTreeDropPlacement = relativeDropPosition < 0 ? "before" : "after";
		if (
			dragNode.kind === "workspace"
			&& dropNode.kind === "workspace"
			&& dragNode.workspaceId !== undefined
			&& dropNode.workspaceId !== undefined
		) {
			persistWorkspaceTreeOrder(moveWorkspaceInTreeOrder(
				workspaceTreeOrderRef.current,
				dragNode.workspaceId,
				dropNode.workspaceId,
				placement
			));
			return;
		}
		if (
			dragNode.kind === "session"
			&& dropNode.kind === "session"
			&& dragNode.sectionKey === "projects"
			&& dropNode.sectionKey === "projects"
			&& dragNode.workspaceId !== undefined
			&& dragNode.workspaceId === dropNode.workspaceId
			&& dragNode.sessionId !== undefined
			&& dropNode.sessionId !== undefined
		) {
			persistWorkspaceTreeOrder(moveSessionInTreeOrder(
				workspaceTreeOrderRef.current,
				dragNode.workspaceId,
				dragNode.sessionId,
				dropNode.sessionId,
				placement
			));
			return;
		}
		if (
			dragNode.kind === "session"
			&& dropNode.kind === "session"
			&& dragNode.sectionKey !== undefined
			&& dragNode.sectionKey !== "projects"
			&& dragNode.sectionKey === dropNode.sectionKey
			&& dragNode.sessionId !== undefined
			&& dropNode.sessionId !== undefined
		) {
			persistWorkspaceTreeOrder(moveSectionSessionInTreeOrder(
				workspaceTreeOrderRef.current,
				dragNode.sectionKey,
				dragNode.sessionId,
				dropNode.sessionId,
				placement
			));
		}
	};
	const isTreeNodeDraggable = (node: TreeDataNode): boolean => {
		const treeNode: ProjectTreeNode = node as ProjectTreeNode;
		if (treeNode.kind === "workspace") {
			return effectiveWorkspaceTreeOrder.workspaceIds.length > 1;
		}
		if (treeNode.kind !== "session" || treeNode.sectionKey === undefined) {
			return false;
		}
		if (treeNode.sectionKey === "pinned") {
			return effectiveWorkspaceTreeOrder.pinnedSessionIds.length > 1;
		}
		if (treeNode.sectionKey === "recent") {
			return effectiveWorkspaceTreeOrder.recentSessionIds.length > 1;
		}
		return treeNode.workspaceId !== undefined
			&& (effectiveWorkspaceTreeOrder.sessionIdsByWorkspace[treeNode.workspaceId]?.length ?? 0) > 1;
	};
	const sectionItems: CollapseProps["items"] = [
		{
			key: "pinned",
			label: labels.pinned,
			children: <Tree<ProjectTreeNode>
				blockNode
				virtual={false}
				classNames={{
					root: styles.projectTree,
					item: `${styles.projectTreeItem} ${styles.treeItemPaddingLeft}`,
					itemTitle: styles.projectTreeTitle,
					itemSwitcher: styles.projectTreeSwitcher
				}}
				treeData={pinnedTreeData}
				selectedKeys={effectiveSelectedMenuKeys}
				draggable={{
					icon: false,
					nodeDraggable: isTreeNodeDraggable
				}}
				allowDrop={allowTreeDrop}
				onSelect={handleProjectTreeSelect}
				onDrop={handleTreeDrop}
			/>
		},
		{
			key: "projects",
			label: labels.projects,
			extra: (
				<Tooltip title={labels.newProject}>
					<Button
						type="text"
						shape="circle"
						size="small"
						className={styles.sectionAddButton}
						icon={<Icon name="add" />}
						aria-label={labels.newProject}
						onClick={(event: MouseEvent<HTMLElement>): void => {
							event.preventDefault();
							event.stopPropagation();
							setIsCreateProjectOpen(true);
						}}
					/>
				</Tooltip>
			),
			children: (
				<Tree<ProjectTreeNode>
					blockNode
					virtual={false}
					classNames={{
						root: styles.projectTree,
						item: styles.projectTreeItem,
						itemTitle: styles.projectTreeTitle,
						itemSwitcher: styles.projectTreeSwitcher
					}}
					treeData={projectTreeData}
					expandedKeys={openWorkspaceKeys}
						selectedKeys={effectiveSelectedMenuKeys}
						draggable={{
							icon: false,
							nodeDraggable: isTreeNodeDraggable
						}}
						allowDrop={allowTreeDrop}
						onExpand={handleProjectTreeExpand}
						onSelect={handleProjectTreeSelect}
						onDrop={handleTreeDrop}
					switcherIcon={(nodeProps) => {
						const workspace: WorkspaceConfig | undefined = (
							nodeProps as { workspace?: WorkspaceConfig }
						).workspace;
						return workspace === undefined
							? null
							: getWorkspaceTreeSwitcherIcon(workspace, nodeProps.expanded);
					}}
				/>
			)
		},
		{
			key: "recent",
			label: labels.recent,
			extra: (
				<Tooltip title={labels.newSession}>
					<Button
						type="text"
						shape="circle"
						size="small"
						className={styles.sectionAddButton}
						icon={<Icon name="add" />}
						aria-label={labels.newSession}
						onClick={(event: MouseEvent<HTMLElement>): void => {
							event.preventDefault();
							event.stopPropagation();
							ensureSectionOpen("recent");
							onNewSession?.();
						}}
					/>
				</Tooltip>
			),
			children: <Tree<ProjectTreeNode>
				blockNode
				virtual={false}
				classNames={{
					root: styles.projectTree,
					item: `${styles.projectTreeItem} ${styles.treeItemPaddingLeft}`,
					itemTitle: styles.projectTreeTitle,
					itemSwitcher: styles.projectTreeSwitcher
				}}
				treeData={recentTreeData}
				selectedKeys={effectiveSelectedMenuKeys}
				draggable={{
					icon: false,
					nodeDraggable: isTreeNodeDraggable
				}}
				allowDrop={allowTreeDrop}
				onSelect={handleProjectTreeSelect}
				onDrop={handleTreeDrop}
			/>
		}
	];

	useEffect((): void => {
		onSessionsChange?.(sessions);
	}, [onSessionsChange, sessions]);

	useEffect((): void => {
		if (sessionUpdate === null) {
			return;
		}

		setSessions((currentSessions: SessionMetadata[]): SessionMetadata[] => {
			if (sessionUpdate.temporary === true) {
				return currentSessions.filter((session: SessionMetadata): boolean => session.id !== sessionUpdate.id);
			}
			const existingIndex: number = currentSessions.findIndex((session: SessionMetadata): boolean => session.id === sessionUpdate.id);
			if (existingIndex < 0) {
				return [sessionUpdate, ...currentSessions];
			}

			const nextSessions: SessionMetadata[] = [...currentSessions];
			nextSessions[existingIndex] = sessionUpdate;
			return nextSessions;
		});
	}, [sessionUpdate]);

	useEffect((): void => {
		if (selectedSessionId === null && selectedWorkspaceId === null) {
			setSelectedMenuKeys([]);
		}
	}, [selectedSessionId, selectedWorkspaceId]);

	return (
		<div className={styles.workspaceTreeRegion}>
			{messageContextHolder}

			{workspaceError !== null ? (
				<Alert
					type="error"
					showIcon={true}
					description={workspaceError}
					closable={{
						onClose: (): void => setWorkspaceError(null)
					}}
					className={styles.workspaceErrorAlert}
				/>
			) : null}

			<div className={styles.workspaceMenuScroller}>
				<Collapse
					className={styles.workspaceTreeCollapse}
					ghost
					activeKey={openSectionKeys}
					items={sectionItems}
					onChange={handleSectionChange}
					expandIcon={({ isActive }) => (
						<span className={`collapseExpandIcon ${isActive ? "collapseExpandIconActive" : ""}`}>
							<Icon name="arrow-down" />
						</span>
					)}
				/>
			</div>

			<WorkspaceProjectDialog
				open={editTargetWorkspace !== null}
				workspace={editTargetWorkspace}
				onCancel={(): void => setEditTargetWorkspace(null)}
				onSaved={(updatedWorkspace: WorkspaceConfig): void => {
					setWorkspaces((currentWorkspaces): WorkspaceConfig[] => currentWorkspaces.map(
						(currentWorkspace): WorkspaceConfig => currentWorkspace.id === updatedWorkspace.id
							? updatedWorkspace
							: currentWorkspace
					));
					setSessions((currentSessions): SessionMetadata[] => currentSessions.map(
						(currentSession): SessionMetadata => currentSession.workspaceId === updatedWorkspace.id
							? {
								...currentSession,
								workspaceName: updatedWorkspace.name,
								workspaceRoot: updatedWorkspace.rootPath
							}
							: currentSession
					));
					setEditTargetWorkspace(null);
					onWorkspaceUpdate?.(updatedWorkspace);
				}}
				onRequestDelete={(workspace: WorkspaceConfig): void => setDeleteTargetWorkspace(workspace)}
			/>

			<WorkspaceProjectDialog
				open={isCreateProjectOpen}
				workspace={null}
				onCancel={(): void => setIsCreateProjectOpen(false)}
				onSaved={(createdWorkspace: WorkspaceConfig): void => {
					setWorkspaces((currentWorkspaces): WorkspaceConfig[] => currentWorkspaces.some(
						(workspace: WorkspaceConfig): boolean => workspace.id === createdWorkspace.id
					)
						? currentWorkspaces.map((workspace: WorkspaceConfig): WorkspaceConfig => workspace.id === createdWorkspace.id ? createdWorkspace : workspace)
						: [...currentWorkspaces, createdWorkspace]);
					const currentOrder: WorkspaceTreeOrderPreferences = workspaceTreeOrderRef.current;
					if (!currentOrder.expandedWorkspaceIds.includes(createdWorkspace.id)) {
						persistExpandedWorkspaceIds([...currentOrder.expandedWorkspaceIds, createdWorkspace.id]);
					}
					ensureSectionOpen("projects");
					setIsCreateProjectOpen(false);
					onWorkspaceUpdate?.(createdWorkspace);
					onWorkspaceProjectCreated?.(createdWorkspace);
				}}
			/>

			<DeleteWorkspaceDialog
				open={deleteTargetWorkspace !== null}
				workspace={deleteTargetWorkspace}
				loading={deletingWorkspaceId !== null}
				onConfirm={(): void => {
					void handleConfirmDeleteWorkspace();
				}}
				onCancel={(): void => {
					if (deletingWorkspaceId === null) {
						setDeleteTargetWorkspace(null);
					}
				}}
			/>

			<Modal
				title={labels.renameSession}
				open={renameTargetSession !== null}
				okText={labels.rename}
				confirmLoading={renamingSessionId !== null}
				onOk={(): void => {
					void handleConfirmRenameSession();
				}}
				onCancel={(): void => {
					if (renamingSessionId === null) {
						setRenameTargetSession(null);
						setRenameDraftTitle("");
						setRenameError(null);
					}
				}}
			>
				<Input
					value={renameDraftTitle}
					placeholder={labels.sessionTitlePlaceholder}
					autoFocus={true}
					maxLength={120}
					status={renameError === null ? undefined : "error"}
					onChange={(event): void => {
						setRenameDraftTitle(event.target.value);
						setRenameError(null);
					}}
					onPressEnter={(): void => {
						void handleConfirmRenameSession();
					}}
				/>
				{renameError !== null ? (
					<Typography.Text type="danger" className={styles.renameErrorText}>
						{renameError}
					</Typography.Text>
				) : null}
			</Modal>
		</div>
	);
}

export default WorkspaceTree;

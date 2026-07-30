import { useEffect, useMemo, useRef, useState } from "react";
import type { Key, MouseEvent, ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { archiveSession, fetchSessions, renameSession, setSessionPinned } from "@/api/session-api";
import {
	deleteWorkspace,
	fetchWorkspaces,
	fetchWorkspaceTreeOrder,
	updateWorkspaceTreeOrder
} from "@/api/workspace-api";
import type { DeleteWorkspaceResult, WorkspaceTreeOrderPreferences } from "@/api/workspace-api";
import { Alert, Badge, Button, Collapse, ConfigProvider, Dropdown, Input, Menu, message, Modal, Spin, Tooltip, Tree, Typography } from "antd";
import type { CollapseProps, MenuProps, TreeDataNode, TreeProps } from "antd";
import type { SessionMetadata, WorkspaceConfig } from "@/api/types";
import { Icon } from "@/assets/icons";
import { copyTextToClipboard } from "@/shared/lib/clipboard";
import DeleteWorkspaceDialog from "./DeleteWorkspaceDialog";
import WorkspaceProjectDialog from "./WorkspaceProjectDialog";
import { WorkspaceIconView } from "./workspace-appearance";
import {
	areWorkspaceTreeOrdersEqual,
	canDropWorkspaceTreeNode,
	createEmptyWorkspaceTreeOrder,
	moveSessionInTreeOrder,
	moveWorkspaceInTreeOrder,
	reconcileWorkspaceTreeOrder,
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
	onSessionArchive?: (session: SessionMetadata) => void;
	onSessionRename?: (session: SessionMetadata) => void;
	onSessionsChange?: (sessions: SessionMetadata[]) => void;
	onNewSession?: () => void;
	onNewWorkspaceSession?: (workspace: WorkspaceConfig) => void;
	onWorkspaceDelete?: (result: DeleteWorkspaceResult) => void;
	onWorkspaceUpdate?: (workspace: WorkspaceConfig) => void;
};

type WorkspaceMenuItem = NonNullable<MenuProps["items"]>[number];
type WorkspaceMenuItems = NonNullable<MenuProps["items"]>;
type ProjectTreeNode = TreeDataNode & {
	kind: "workspace" | "session" | "empty";
	workspace?: WorkspaceConfig;
	workspaceId?: string;
	sessionId?: string;
	children?: ProjectTreeNode[];
};

type RenderableWorkspaceMenuItem = {
	key: Key;
	label?: ReactNode;
	className?: string;
};

type WorkspaceTreeLabels = {
	archiveSession: string;
	copySessionId: string;
	delete: string;
	editProject: string;
	deleteWorkspaceBody: string;
	deleteWorkspaceTitle: string;
	failedArchiveSession: string;
	failedCopySessionId: string;
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

function filterVisibleSessions(sessions: SessionMetadata[]): SessionMetadata[] {
	return sessions.filter((session: SessionMetadata): boolean => session.temporary !== true);
}

type CreateSessionMenuItemOptions = {
	archivingSessionId: string | null;
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
};

type CreateWorkspaceMenuItemOptions = CreateSessionMenuItemOptions & {
	deletingWorkspaceId: string | null;
	onNewWorkspaceSession: (workspace: WorkspaceConfig, event: MouseEvent<HTMLElement>) => void;
	onOpenWorkspaceInExplorer: (workspace: WorkspaceConfig) => void;
	onEditWorkspace: (workspace: WorkspaceConfig) => void;
	onDeleteWorkspace: (workspace: WorkspaceConfig) => void;
};

function createSessionMenuItem(session: SessionMetadata, options: CreateSessionMenuItemOptions): WorkspaceMenuItem {
	const isArchiving: boolean = options.archivingSessionId === session.id;
	const isPinning: boolean = options.pinningSessionId === session.id;
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
			}
		}
	};

	return {
		key: `session:${session.id}`,
		className: styles.sessionMenuEntry,
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

function createSessionMenuItems(
	sessions: SessionMetadata[],
	emptyKey: string,
	emptyLabel: string,
	options: CreateSessionMenuItemOptions
): WorkspaceMenuItems {
	return sessions.length > 0
		? sessions.map((session: SessionMetadata): WorkspaceMenuItem => createSessionMenuItem(session, options))
		: [{ key: emptyKey, label: emptyLabel, disabled: true }];
}

function createSessionTreeNode(
	session: SessionMetadata,
	workspaceId: string,
	options: CreateSessionMenuItemOptions
): ProjectTreeNode {
	const menuItem: RenderableWorkspaceMenuItem = createSessionMenuItem(session, options) as RenderableWorkspaceMenuItem;
	return {
		key: menuItem.key,
		title: menuItem.label,
		className: menuItem.className,
		kind: "session",
		workspaceId,
		sessionId: session.id,
		isLeaf: true
	};
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
				? workspaceSessions.map((session: SessionMetadata): ProjectTreeNode => createSessionTreeNode(session, workspace.id, options))
				: [
					{
						key: `workspace:${workspace.id}:empty`,
						title: labels.noSessions,
						disabled: true,
						selectable: false,
						kind: "empty",
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
	onWorkspaceUpdate
}: WorkspaceTreeProps): React.JSX.Element {
	const [messageApi, messageContextHolder] = message.useMessage();
	const { t } = useTranslation();
	const [workspaces, setWorkspaces] = useState<WorkspaceConfig[]>(() => initialWorkspaces);
	const [sessions, setSessions] = useState<SessionMetadata[]>(() => filterVisibleSessions(initialSessions));
	const [workspaceTreeOrder, setWorkspaceTreeOrder] = useState<WorkspaceTreeOrderPreferences>(() => {
		return reconcileWorkspaceTreeOrder(initialWorkspaceTreeOrder, initialWorkspaces, filterVisibleSessions(initialSessions));
	});
	const [activeWorkspaceId, setActiveWorkspaceId] = useState<string | null>(initialActiveWorkspaceId);
	const [openWorkspaceKeys, setOpenWorkspaceKeys] = useState<string[]>(() => initialWorkspaces.map((workspace: WorkspaceConfig): string => `workspace:${workspace.id}`));
	const [selectedMenuKeys, setSelectedMenuKeys] = useState<string[]>([]);
	const [isWorkspaceLoading, setIsWorkspaceLoading] = useState<boolean>(true);
	const [workspaceError, setWorkspaceError] = useState<string | null>(null);
	const [reloadIndex, setReloadIndex] = useState<number>(0);
	const [archivingSessionId, setArchivingSessionId] = useState<string | null>(null);
	const [pinningSessionId, setPinningSessionId] = useState<string | null>(null);
	const [openSectionKeys, setOpenSectionKeys] = useState<string[]>(["pinned", "projects", "recent"]);
	const [isCreateProjectOpen, setIsCreateProjectOpen] = useState<boolean>(false);
	const [deleteTargetWorkspace, setDeleteTargetWorkspace] = useState<WorkspaceConfig | null>(null);
	const [editTargetWorkspace, setEditTargetWorkspace] = useState<WorkspaceConfig | null>(null);
	const [deletingWorkspaceId, setDeletingWorkspaceId] = useState<string | null>(null);
	const [renameTargetSession, setRenameTargetSession] = useState<SessionMetadata | null>(null);
	const [renameDraftTitle, setRenameDraftTitle] = useState<string>("");
	const [renameError, setRenameError] = useState<string | null>(null);
	const [renamingSessionId, setRenamingSessionId] = useState<string | null>(null);
	const workspaceTreeOrderRef = useRef<WorkspaceTreeOrderPreferences>(workspaceTreeOrder);
	const workspacesRef = useRef<WorkspaceConfig[]>(workspaces);
	const sessionsRef = useRef<SessionMetadata[]>(sessions);
	const orderSaveQueueRef = useRef<Promise<void>>(Promise.resolve());
	const orderSaveRevisionRef = useRef<number>(0);
	const isMountedRef = useRef<boolean>(true);
	const runningSessionIdSet: ReadonlySet<string> = useMemo((): ReadonlySet<string> => new Set(runningSessionIds), [runningSessionIds]);
	const unreadSessionIdSet: ReadonlySet<string> = useMemo((): ReadonlySet<string> => new Set(unreadSessionIds), [unreadSessionIds]);
	const labels: WorkspaceTreeLabels = useMemo((): WorkspaceTreeLabels => {
		return {
			archiveSession: t("workspaceTree.actions.archiveSession"),
			copySessionId: t("workspaceTree.actions.copySessionId"),
			delete: t("workspaceTree.actions.delete"),
			editProject: t("workspaceTree.actions.editProject", { defaultValue: "Edit project" }),
			deleteWorkspaceBody: t("workspaceTree.modals.deleteWorkspace.body"),
			deleteWorkspaceTitle: t("workspaceTree.modals.deleteWorkspace.title"),
			failedArchiveSession: t("workspaceTree.errors.archiveSession"),
			failedCopySessionId: t("workspaceTree.errors.copySessionId"),
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

	workspaceTreeOrderRef.current = workspaceTreeOrder;
	workspacesRef.current = workspaces;
	sessionsRef.current = sessions;

	function showWorkspaceOperationError(error: unknown, fallbackMessage: string): void {
		const errorMessage: string = error instanceof Error ? error.message : fallbackMessage;
		console.error(`[WorkspaceTree] ${fallbackMessage}`, error);
		void messageApi.error(errorMessage);
	}

	function setCanonicalWorkspaceTreeOrder(nextOrder: WorkspaceTreeOrderPreferences): void {
		workspaceTreeOrderRef.current = nextOrder;
		setWorkspaceTreeOrder(nextOrder);
	}

	function persistWorkspaceTreeOrder(nextOrder: WorkspaceTreeOrderPreferences): void {
		if (areWorkspaceTreeOrdersEqual(workspaceTreeOrderRef.current, nextOrder)) {
			return;
		}
		setCanonicalWorkspaceTreeOrder(nextOrder);
		const revision: number = orderSaveRevisionRef.current + 1;
		orderSaveRevisionRef.current = revision;
		const payload = {
			workspaceIds: [...nextOrder.workspaceIds],
			sessionIdsByWorkspace: Object.fromEntries(
				Object.entries(nextOrder.sessionIdsByWorkspace).map(
					([workspaceId, sessionIds]): [string, string[]] => [workspaceId, [...sessionIds]]
				)
			)
		};

		orderSaveQueueRef.current = orderSaveQueueRef.current.then(async (): Promise<void> => {
			try {
				const savedOrder: WorkspaceTreeOrderPreferences = await updateWorkspaceTreeOrder(payload);
				if (!isMountedRef.current || revision !== orderSaveRevisionRef.current) {
					return;
				}
				setCanonicalWorkspaceTreeOrder(reconcileWorkspaceTreeOrder(
					savedOrder,
					workspacesRef.current,
					sessionsRef.current
				));
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

	const handleMenuClick: MenuProps["onClick"] = ({ key }): void => {
		const selectedKey: string = String(key);

		setSelectedMenuKeys([selectedKey]);

		if (selectedKey.startsWith("workspace:")) {
			return;
		}

		if (selectedKey.startsWith("session:")) {
			const sessionId: string = selectedKey.slice("session:".length);
			const session: SessionMetadata | undefined = sessions.find((item: SessionMetadata): boolean => item.id === sessionId);

			if (session !== undefined) {
				onSessionSelect?.(session);
			}
		}
	};

	const handleSectionChange: NonNullable<CollapseProps["onChange"]> = (keys): void => {
		setOpenSectionKeys(Array.isArray(keys) ? keys : [keys]);
	};

	async function handleArchiveSessionAction(session: SessionMetadata): Promise<void> {
		if (archivingSessionId !== null) {
			return;
		}

		try {
			setArchivingSessionId(session.id);
			await archiveSession(session.id);
			setSessions((currentSessions: SessionMetadata[]): SessionMetadata[] => {
				return currentSessions.filter((currentSession: SessionMetadata): boolean => currentSession.id !== session.id);
			});
			setSelectedMenuKeys((currentKeys: string[]): string[] => {
				return currentKeys.filter((key: string): boolean => key !== `session:${session.id}`);
			});
			onSessionArchive?.(session);
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
			const targetSection: string = metadata.pinned === true
				? "pinned"
				: metadata.workspaceId !== undefined && workspaces.some((workspace: WorkspaceConfig): boolean => workspace.id === metadata.workspaceId)
					? "projects"
					: "recent";
			setOpenSectionKeys((currentKeys: string[]): string[] => currentKeys.includes(targetSection) ? currentKeys : [...currentKeys, targetSection]);
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
			setOpenWorkspaceKeys((currentKeys: string[]): string[] => {
				return currentKeys.filter((key: string): boolean => key !== `workspace:${workspace.id}`);
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
			isMountedRef.current = false;
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
				setWorkspaces(workspaceList.workspaces);
				setSessions(visibleSessions);
				setWorkspaceTreeOrder(reconciledOrder);
				setActiveWorkspaceId(workspaceList.active);
				setOpenWorkspaceKeys(workspaceList.workspaces.map((workspace: WorkspaceConfig): string => {
					return `workspace:${workspace.id}`;
				}));

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
			}
		};
	}, [archivingSessionId, labels, pinningSessionId, runningSessionIdSet, unreadSessionIdSet]);
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
	const orderedProjectSessions: SessionMetadata[] = useMemo((): SessionMetadata[] => {
		return orderedWorkspaces.flatMap((workspace: WorkspaceConfig): SessionMetadata[] => {
			return sortWorkspaceSessionsByTreeOrder(
				sessionGroups.projectSessions,
				workspace.id,
				effectiveWorkspaceTreeOrder
			);
		});
	}, [effectiveWorkspaceTreeOrder, orderedWorkspaces, sessionGroups.projectSessions]);
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
	const pinnedMenuItems: WorkspaceMenuItems = useMemo((): WorkspaceMenuItems => {
		return createSessionMenuItems(sessionGroups.pinnedSessions, "pinned:empty", labels.noPinnedSessions, sessionMenuOptions);
	}, [labels.noPinnedSessions, sessionGroups.pinnedSessions, sessionMenuOptions]);
	const recentMenuItems: WorkspaceMenuItems = useMemo((): WorkspaceMenuItems => {
		return createSessionMenuItems(sessionGroups.recentSessions, "recent:empty", labels.noRecentSessions, sessionMenuOptions);
	}, [labels.noRecentSessions, sessionGroups.recentSessions, sessionMenuOptions]);
	const effectiveSelectedMenuKeys: string[] = getSelectedMenuKeys(selectedSessionId, selectedWorkspaceId, selectedMenuKeys);
	const handleProjectTreeExpand: NonNullable<TreeProps<ProjectTreeNode>["onExpand"]> = (expandedKeys): void => {
		setOpenWorkspaceKeys(expandedKeys.map((key: Key): string => String(key)));
	};
	const handleProjectTreeSelect: NonNullable<TreeProps<ProjectTreeNode>["onSelect"]> = (_selectedKeys, info): void => {
		const node: ProjectTreeNode = info.node;
		const selectedKey: string = String(node.key);
		if (node.kind === "empty") {
			return;
		}
		setSelectedMenuKeys([selectedKey]);
		if (node.kind === "workspace") {
			setOpenWorkspaceKeys((currentKeys: string[]): string[] => {
				return currentKeys.includes(selectedKey)
					? currentKeys.filter((key: string): boolean => key !== selectedKey)
					: [...currentKeys, selectedKey];
			});
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
	const canDropProjectNode = (
		dragNode: ProjectTreeNode,
		dropNode: ProjectTreeNode,
		dropToGap: boolean
	): boolean => canDropWorkspaceTreeNode(
		dragNode,
		dropNode,
		dropToGap,
		effectiveWorkspaceTreeOrder
	);
	const allowProjectDrop: NonNullable<TreeProps<ProjectTreeNode>["allowDrop"]> = ({
		dragNode,
		dropNode,
		dropPosition
	}): boolean => canDropProjectNode(dragNode, dropNode, dropPosition !== 0);
	const handleProjectDrop: NonNullable<TreeProps<ProjectTreeNode>["onDrop"]> = (info): void => {
		const dragNode: ProjectTreeNode = info.dragNode;
		const dropNode: ProjectTreeNode = info.node;
		if (!canDropProjectNode(dragNode, dropNode, info.dropToGap === true)) {
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
		}
	};
	const sectionItems: CollapseProps["items"] = [
		{
			key: "pinned",
			label: labels.pinned,
			children: <Menu
				className={styles.workspaceMenu}
				mode="inline" items={pinnedMenuItems}
				selectedKeys={effectiveSelectedMenuKeys}
				onClick={handleMenuClick}
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
						nodeDraggable: (node: TreeDataNode): boolean => {
							const projectNode: ProjectTreeNode = node as ProjectTreeNode;
							if (projectNode.kind === "workspace") {
								return effectiveWorkspaceTreeOrder.workspaceIds.length > 1;
							}
							if (projectNode.kind === "session" && projectNode.workspaceId !== undefined) {
								return (effectiveWorkspaceTreeOrder.sessionIdsByWorkspace[projectNode.workspaceId]?.length ?? 0) > 1;
							}
							return false;
						}
					}}
					allowDrop={allowProjectDrop}
					onExpand={handleProjectTreeExpand}
					onSelect={handleProjectTreeSelect}
					onDrop={handleProjectDrop}
					switcherIcon={(nodeProps) => {
						const workspace: WorkspaceConfig | undefined = (
							nodeProps as { workspace?: WorkspaceConfig }
						).workspace;
						return workspace === undefined ? null : <WorkspaceIconView workspace={workspace} />;
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
							onNewSession?.();
						}}
					/>
				</Tooltip>
			),
			children: <Menu
				className={styles.workspaceMenu}
				mode="inline" items={recentMenuItems}
				selectedKeys={effectiveSelectedMenuKeys}
				onClick={handleMenuClick}
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

	useEffect((): void => {
		if (selectedSessionId === null) {
			return;
		}

		const selectedSession: SessionMetadata | undefined = sessions.find((session: SessionMetadata): boolean => {
			return session.id === selectedSessionId;
		});

		if (selectedSession?.workspaceId === undefined) {
			return;
		}

		const workspaceKey: string = `workspace:${selectedSession.workspaceId}`;
		setOpenWorkspaceKeys((currentKeys: string[]): string[] => {
			return currentKeys.includes(workspaceKey) ? currentKeys : [...currentKeys, workspaceKey];
		});
	}, [selectedSessionId, sessions]);

	useEffect((): void => {
		if (selectedSessionId === null) {
			return;
		}

		const selectedSession: SessionMetadata | undefined = sessions.find((session: SessionMetadata): boolean => session.id === selectedSessionId);
		const sectionKey: string = selectedSession?.pinned === true
			? "pinned"
			: selectedSession?.workspaceId !== undefined && workspaces.some((workspace: WorkspaceConfig): boolean => workspace.id === selectedSession.workspaceId)
				? "projects"
				: "recent";
		setOpenSectionKeys((currentKeys: string[]): string[] => currentKeys.includes(sectionKey) ? currentKeys : [...currentKeys, sectionKey]);
	}, [selectedSessionId, sessions, workspaces]);

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
						<span
							className={`${styles.collapseExpandIcon} ${isActive ? styles.collapseExpandIconActive : ""
								}`}
						>
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
					setOpenWorkspaceKeys((currentKeys: string[]): string[] => currentKeys.includes(`workspace:${createdWorkspace.id}`)
						? currentKeys
						: [...currentKeys, `workspace:${createdWorkspace.id}`]);
					setOpenSectionKeys((currentKeys: string[]): string[] => currentKeys.includes("projects") ? currentKeys : [...currentKeys, "projects"]);
					setIsCreateProjectOpen(false);
					onWorkspaceUpdate?.(createdWorkspace);
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

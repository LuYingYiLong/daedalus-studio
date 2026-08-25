import { useEffect, useMemo, useRef, useState } from "react";
import type { DragEvent, Key, MouseEvent, ReactNode } from "react";
import { useTranslation } from "react-i18next";
import {
	archiveSession,
	exportSession,
	fetchSessions,
	renameSession,
	setSessionPinned,
} from "@/platform/rpc/session-api";
import type {
	ExportSessionResult,
	MoveSessionWorkspaceResult,
} from "@/platform/rpc/session-api";
import {
	deleteWorkspace,
	fetchWorkspaces,
	fetchWorkspaceTreeOrder,
	updateWorkspaceTreeOrder,
} from "@/platform/rpc/workspace-api";
import type {
	DeleteWorkspaceResult,
	WorkspaceTreeOrderPreferences,
	WorkspaceTreeSectionKey,
} from "@/platform/rpc/workspace-api";
import {
	Alert,
	Badge,
	Button,
	Collapse,
	Dropdown,
	Input,
	message,
	Modal,
	Spin,
	Tooltip,
	Tree,
	Typography,
} from "antd";
import type { CollapseProps, MenuProps, TreeDataNode, TreeProps } from "antd";
import type { SessionMetadata, WorkspaceConfig } from "@/platform/rpc/types";
import { Icon } from "@/assets/icons";
import { createPermanentWorktree } from "@/platform/rpc/environment-api";
import WorktreeCreationOptions, {
	type WorktreeSourceOptions,
} from "@/widgets/composer/WorktreeCreationOptions";
import { copyTextToClipboard } from "@/platform/electron/clipboard";
import DeleteWorkspaceDialog from "./DeleteWorkspaceDialog";
import WorkspaceProjectDialog from "./WorkspaceProjectDialog";
import {
	getWorkspaceIconStyle,
	WORKSPACE_ICON_NAMES,
} from "./workspace-appearance";
import {
	areWorkspaceTreeOrdersEqual,
	canDropWorkspaceTreeNode,
	createEmptyWorkspaceTreeOrder,
	moveSectionSessionInTreeOrder,
	moveSessionInTreeOrder,
	moveSessionToWorkspaceInTreeOrder,
	moveWorkspaceInTreeOrder,
	reconcileWorkspaceTreeOrder,
	sortSessionsByTreeOrder,
	sortWorkspacesByTreeOrder,
	sortWorkspaceSessionsByTreeOrder,
	type WorkspaceTreeDropPlacement,
} from "@/domain/workspace/workspace-tree-order";
import {
	areStringListsEqual,
	filterVisibleSessions,
	getSelectedMenuKeys,
	getSessionOriginKind,
	getSessionProjectWorkspaceId,
	type SessionOriginKind,
} from "./workspace-tree-model";
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
	forkingSessionId?: string | null;
	onSessionSelect?: (session: SessionMetadata) => void;
	onSessionFork?: (session: SessionMetadata) => void;
	onSessionArchive?: (
		session: SessionMetadata,
		context: SessionArchiveContext,
	) => void;
	onSessionRename?: (session: SessionMetadata) => void;
	onSessionWorkspaceMove?: (
		session: SessionMetadata,
		workspace: WorkspaceConfig,
	) => Promise<MoveSessionWorkspaceResult>;
	onSessionWorktreeDelete?: (
		session: SessionMetadata,
	) => Promise<SessionMetadata>;
	onSessionsChange?: (sessions: SessionMetadata[]) => void;
	onNewSession?: () => void;
	onNewWorkspaceSession?: (
		workspace: WorkspaceConfig,
		environment?: "local" | "worktree",
	) => void;
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
	forkSession: string;
	deleteWorktree: string;
	deleteWorktreeTitle: string;
	deleteWorktreeBody: string;
	failedDeleteWorkspace: string;
	failedDeleteWorktree: string;
	failedLoadWorkspace: string;
	failedOpenWorkspaceDirectory: string;
	failedPinSession: string;
	failedRenameSession: string;
	failedMoveSession: string;
	failedSaveOrder: string;
	newSession: string;
	newSessionInWorkspace: string;
	newWorktreeSession: string;
	createPermanentWorktree: string;
	newProject: string;
	noPinnedSessions: string;
	noProjects: string;
	noRecentSessions: string;
	noSessions: string;
	noWorkspace: string;
	openInExplorer: string;
	openWorkspaceDirectory: string;
	pinSession: string;
	pinned: string;
	projects: string;
	recent: string;
	rename: string;
	renameSession: string;
	moveSession: string;
	movingSession: string;
	moveSessionRunningBlocked: string;
	moveSessionWorktreeBlocked: string;
	moveSessionNoTargets: string;
	sessionIdCopied: string;
	sessionExported: string;
	sessionExportedWithMissingFiles: (count: number) => string;
	sessionTitleCannotBeEmpty: string;
	sessionTitlePlaceholder: string;
	unpinSession: string;
	assistantRunning: string;
	unreadResponse: string;
	forkedSession: string;
	worktreeSession: string;
	permanentWorktreeSession: string;
	archiveSessionAria: (sessionTitle: string) => string;
	pinSessionAria: (sessionTitle: string, pinned: boolean) => string;
	newSessionInWorkspaceAria: (workspaceName: string) => string;
	workspaceActionsAria: (workspaceName: string) => string;
	moveSessionToWorkspaceAria: (workspaceName: string) => string;
};

function getWorkspaceTreeSwitcherIcon(
	workspace: WorkspaceConfig,
	expanded: boolean | undefined,
): React.JSX.Element {
	const configuredIconName: string =
		WORKSPACE_ICON_NAMES[workspace.icon] ?? "folder";
	const iconName: string =
		configuredIconName === "folder" && expanded === true
			? "folder-open"
			: configuredIconName;
	return (
		<Icon name={iconName} style={getWorkspaceIconStyle(workspace.color)} />
	);
}

type CreateSessionMenuItemOptions = {
	archivingSessionId: string | null;
	deletingWorktreeSessionId: string | null;
	exportingSessionId: string | null;
	forkingSessionId: string | null;
	pinningSessionId: string | null;
	movingSessionId: string | null;
	moveWorkspaces: WorkspaceConfig[];
	workspaceById: ReadonlyMap<string, WorkspaceConfig>;
	runningSessionIds: ReadonlySet<string>;
	unreadSessionIds: ReadonlySet<string>;
	labels: WorkspaceTreeLabels;
	onArchiveButton: (
		session: SessionMetadata,
		event: MouseEvent<HTMLElement>,
	) => void;
	onPinButton: (
		session: SessionMetadata,
		event: MouseEvent<HTMLElement>,
	) => void;
	onPin: (session: SessionMetadata) => void;
	onRename: (session: SessionMetadata) => void;
	onMove: (session: SessionMetadata, workspace: WorkspaceConfig) => void;
	onArchive: (session: SessionMetadata) => void;
	canOpenSessionWorkspace: (session: SessionMetadata) => boolean;
	onOpenSessionWorkspaceInExplorer: (session: SessionMetadata) => void;
	onCopySessionId: (session: SessionMetadata) => void;
	onExportSession: (session: SessionMetadata) => void;
	onFork: (session: SessionMetadata) => void;
	onDeleteWorktree: (session: SessionMetadata) => void;
};

type CreateWorkspaceMenuItemOptions = CreateSessionMenuItemOptions & {
	deletingWorkspaceId: string | null;
	onNewWorkspaceSession: (
		workspace: WorkspaceConfig,
		event: MouseEvent<HTMLElement>,
		environment?: "local" | "worktree",
	) => void;
	onOpenWorkspaceInExplorer: (workspace: WorkspaceConfig) => void;
	onEditWorkspace: (workspace: WorkspaceConfig) => void;
	onDeleteWorkspace: (workspace: WorkspaceConfig) => void;
	onCreatePermanentWorktree: (workspace: WorkspaceConfig) => void;
	draggingSessionId: string | null;
	dropTargetWorkspaceId: string | null;
	canDropSessionOnWorkspace: (
		sessionId: string,
		workspace: WorkspaceConfig,
	) => boolean;
	onWorkspaceDragEnter: (
		sessionId: string,
		workspace: WorkspaceConfig,
	) => void;
	onWorkspaceDragLeave: (workspaceId: string) => void;
	onWorkspaceDrop: (sessionId: string, workspace: WorkspaceConfig) => void;
};

function createSessionTreePresentation(
	session: SessionMetadata,
	options: CreateSessionMenuItemOptions,
): SessionTreePresentation {
	const isArchiving: boolean = options.archivingSessionId === session.id;
	const isPinning: boolean = options.pinningSessionId === session.id;
	const isExporting: boolean = options.exportingSessionId === session.id;
	const isRunning: boolean = options.runningSessionIds.has(session.id);
	const isMoving: boolean = options.movingSessionId === session.id;
	const isUnread: boolean = options.unreadSessionIds.has(session.id);
	const isDeletingWorktree: boolean =
		options.deletingWorktreeSessionId === session.id;
	const isPinned: boolean = session.pinned === true;
	const labels: WorkspaceTreeLabels = options.labels;
	const originKind: SessionOriginKind | null = getSessionOriginKind(
		session,
		options.workspaceById.get(session.workspaceId ?? ""),
	);
	const originPresentation: {
		iconName: string;
		label: string;
	} | null =
		originKind === "fork"
			? { iconName: "fork", label: labels.forkedSession }
			: originKind === "permanent-worktree"
				? {
						iconName: "permanent-worktree",
						label: labels.permanentWorktreeSession,
					}
				: originKind === "worktree"
					? { iconName: "worktree", label: labels.worktreeSession }
					: null;
	const currentWorkspaceId: string | undefined =
		getSessionProjectWorkspaceId(session);
	const canMove: boolean =
		session.worktree === undefined &&
		!isRunning &&
		options.movingSessionId === null &&
		options.moveWorkspaces.some(
			(workspace: WorkspaceConfig): boolean =>
				workspace.id !== currentWorkspaceId,
		);
	const moveDisabledReason: string | null =
		session.worktree !== undefined
			? labels.moveSessionWorktreeBlocked
			: isRunning
				? labels.moveSessionRunningBlocked
				: options.movingSessionId !== null
					? labels.movingSession
					: options.moveWorkspaces.every(
								(workspace: WorkspaceConfig): boolean =>
									workspace.id === currentWorkspaceId,
						  )
						? labels.moveSessionNoTargets
						: null;
	const actionMenu: MenuProps = {
		expandIcon: <Icon name="arrow-forward" />,
		items: [
			{
				key: "pin",
				label: isPinned ? labels.unpinSession : labels.pinSession,
				icon: <Icon name={isPinned ? "pinned" : "pin"} />,
				disabled: isPinning || options.pinningSessionId !== null,
			},
			{
				key: "rename",
				label: labels.renameSession,
				icon: <Icon name="pencil" />,
			},
			{
				key: "move",
				label:
					moveDisabledReason === null ? (
						labels.moveSession
					) : (
						<Tooltip title={moveDisabledReason}>
							{labels.moveSession}
						</Tooltip>
					),
				icon: <Icon name="move-session" />,
				disabled: !canMove,
				children: options.moveWorkspaces.map(
					(workspace: WorkspaceConfig) => ({
						key: `move:${workspace.id}`,
						label: workspace.name,
						icon: getWorkspaceTreeSwitcherIcon(workspace, false),
						disabled:
							workspace.id === currentWorkspaceId ||
							options.movingSessionId !== null,
					}),
				),
			},
			{
				key: "fork",
				label: labels.forkSession,
				icon: <Icon name="fork" />,
				disabled: isRunning || options.forkingSessionId !== null,
			},
			{
				key: "archive",
				label: labels.archiveSession,
				icon: <Icon name="archive" />,
				disabled: options.archivingSessionId !== null,
			},
			...(session.worktree === undefined
				? []
				: [
						{
							key: "delete-worktree",
							label: labels.deleteWorktree,
							icon: isDeletingWorktree ? (
								<Spin size="small" />
							) : (
								<Icon name="remove" />
							),
							danger: true,
							disabled:
								options.deletingWorktreeSessionId !== null ||
								isRunning,
						},
					]),
			{
				key: "open",
				label: labels.openWorkspaceDirectory,
				icon: <Icon name="folder-open" />,
				disabled: !options.canOpenSessionWorkspace(session),
			},
			{
				key: "copy",
				label: labels.copySessionId,
				icon: <Icon name="copy" />,
			},
			{
				key: "export",
				label: isExporting
					? labels.exportingSession
					: labels.exportSession,
				icon: isExporting ? (
					<Spin size="small" />
				) : (
					<Icon name="export" />
				),
				disabled: options.exportingSessionId !== null,
			},
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
			if (key.startsWith("move:")) {
				const workspace: WorkspaceConfig | undefined =
					options.moveWorkspaces.find(
						(candidate: WorkspaceConfig): boolean =>
							candidate.id === key.slice("move:".length),
					);
				if (workspace !== undefined) {
					options.onMove(session, workspace);
				}
				return;
			}
			if (key === "fork") {
				options.onFork(session);
				return;
			}
			if (key === "archive") {
				options.onArchive(session);
				return;
			}
			if (key === "delete-worktree") {
				options.onDeleteWorktree(session);
				return;
			}
			if (key === "open") {
				options.onOpenSessionWorkspaceInExplorer(session);
				return;
			}
			if (key === "copy") {
				options.onCopySessionId(session);
				return;
			}
			if (key === "export") {
				options.onExportSession(session);
			}
		},
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
							aria-label={
								isUnread
									? `${session.title}, ${labels.unreadResponse}`
									: undefined
							}
						>
							{session.title}
						</span>
					</Badge>
					<Tooltip
						title={
							isPinned ? labels.unpinSession : labels.pinSession
						}
					>
						<Button
							type="text"
							shape="circle"
							size="small"
							aria-label={labels.pinSessionAria(
								session.title,
								isPinned,
							)}
							className={styles.pinButton}
							icon={<Icon name={isPinned ? "pinned" : "pin"} />}
							loading={isPinning}
							draggable={false}
							onMouseDown={(event): void =>
								event.stopPropagation()
							}
							onDragStart={(event): void => {
								event.preventDefault();
								event.stopPropagation();
							}}
							onClick={(event: MouseEvent<HTMLElement>): void =>
								options.onPinButton(session, event)
							}
						/>
					</Tooltip>
					<span
						className={`${styles.sessionEndSlot} ${
							isRunning || isMoving
								? styles.sessionEndSlotRunning
								: ""
						}`}
					>
						{originPresentation === null ? null : (
							<Tooltip title={originPresentation.label}>
								<span
									className={styles.sessionOriginIndicator}
									aria-label={originPresentation.label}
								>
									<Icon name={originPresentation.iconName} />
								</span>
							</Tooltip>
						)}
						{isRunning || isMoving ? (
							<Tooltip
								title={
									isMoving
										? labels.movingSession
										: labels.assistantRunning
									}
							>
								<span
									className={styles.sessionRunIndicator}
									aria-label={
										isMoving
											? labels.movingSession
											: labels.assistantRunning
									}
								>
									<Spin size="small" />
								</span>
							</Tooltip>
						) : (
							<Tooltip title={labels.archiveSession}>
								<Button
									type="text"
									shape="circle"
									size="small"
									aria-label={labels.archiveSessionAria(
										session.title,
									)}
									className={styles.archiveButton}
									icon={<Icon name="archive" />}
									loading={isArchiving}
									draggable={false}
									onMouseDown={(event): void =>
										event.stopPropagation()
									}
									onDragStart={(event): void => {
										event.preventDefault();
										event.stopPropagation();
									}}
									onClick={(
										event: MouseEvent<HTMLElement>,
									): void =>
										options.onArchiveButton(session, event)
									}
								/>
							</Tooltip>
						)}
					</span>
				</span>
			</Dropdown>
		),
	};
}

function createSessionTreeNode(
	session: SessionMetadata,
	sectionKey: WorkspaceTreeSectionKey,
	workspaceId: string | undefined,
	options: CreateSessionMenuItemOptions,
): ProjectTreeNode {
	const presentation: SessionTreePresentation = createSessionTreePresentation(
		session,
		options,
	);
	return {
		key: presentation.key,
		title: presentation.label,
		kind: "session",
		sectionKey,
		workspaceId,
		sessionId: session.id,
		isLeaf: true,
	};
}

function createSessionTreeData(
	sessions: SessionMetadata[],
	sectionKey: Exclude<WorkspaceTreeSectionKey, "projects">,
	emptyKey: string,
	emptyLabel: string,
	options: CreateSessionMenuItemOptions,
): ProjectTreeNode[] {
	return sessions.length > 0
		? sessions.map((session: SessionMetadata): ProjectTreeNode => {
				return createSessionTreeNode(
					session,
					sectionKey,
					undefined,
					options,
				);
			})
		: [
				{
					key: emptyKey,
					title: emptyLabel,
					disabled: true,
					selectable: false,
					kind: "empty",
					sectionKey,
					isLeaf: true,
				},
			];
}

function createProjectTreeData(
	workspaces: WorkspaceConfig[],
	sessions: SessionMetadata[],
	options: CreateWorkspaceMenuItemOptions,
): ProjectTreeNode[] {
	const labels: WorkspaceTreeLabels = options.labels;
	if (workspaces.length === 0) {
		return [
			{
				key: "projects:empty",
				title: labels.noProjects,
				className: styles.treeItemPaddingLeft,
				disabled: true,
				selectable: false,
				kind: "empty",
				isLeaf: true,
			},
		];
	}

	return workspaces.map((workspace: WorkspaceConfig): ProjectTreeNode => {
		const workspaceSessions: SessionMetadata[] = sessions.filter(
			(session: SessionMetadata): boolean => {
				return getSessionProjectWorkspaceId(session) === workspace.id;
			},
		);
		const isDeleting: boolean =
			options.deletingWorkspaceId === workspace.id;
		const isSessionDropTarget: boolean =
			options.draggingSessionId !== null &&
			options.dropTargetWorkspaceId === workspace.id &&
			options.canDropSessionOnWorkspace(
				options.draggingSessionId,
				workspace,
			);
		const actionMenu: MenuProps = {
			items: [
				{
					key: "edit",
					label: labels.editProject,
					icon: <Icon name="folder-edit" />,
				},
				{
					key: "new-worktree-session",
					label: labels.newWorktreeSession,
					icon: <Icon name="worktree" />,
				},
				{
					key: "create-permanent-worktree",
					label: labels.createPermanentWorktree,
					icon: <Icon name="permanent-worktree" />,
					disabled: workspace.permanentWorktree !== undefined,
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
					disabled: options.deletingWorkspaceId !== null,
				},
			],
			onClick: ({ key, domEvent }): void => {
				domEvent.preventDefault();
				domEvent.stopPropagation();

				if (key === "new-worktree-session") {
					options.onNewWorkspaceSession(
						workspace,
						domEvent as unknown as MouseEvent<HTMLElement>,
						"worktree",
					);
					return;
				}
				if (key === "create-permanent-worktree") {
					options.onCreatePermanentWorktree(workspace);
					return;
				}
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
			},
		};

		return {
			key: `workspace:${workspace.id}`,
			title: (
				<Dropdown menu={actionMenu} trigger={["contextMenu"]}>
					<span
						className={`${styles.workspaceMenuItem} ${isSessionDropTarget ? styles.workspaceSessionDropTarget : ""}`}
						aria-label={
							options.draggingSessionId === null
								? undefined
								: labels.moveSessionToWorkspaceAria(
										workspace.name,
									)
						}
						onDragEnter={(
							event: DragEvent<HTMLSpanElement>,
						): void => {
							const sessionId: string =
								event.dataTransfer.getData(
									"application/x-daedalus-session-id",
								) ||
								options.draggingSessionId ||
								"";
							if (
								sessionId.length === 0 ||
								!options.canDropSessionOnWorkspace(
									sessionId,
									workspace,
								)
							)
								return;
							event.preventDefault();
							options.onWorkspaceDragEnter(sessionId, workspace);
						}}
						onDragOver={(
							event: DragEvent<HTMLSpanElement>,
						): void => {
							const sessionId: string =
								event.dataTransfer.getData(
									"application/x-daedalus-session-id",
								) ||
								options.draggingSessionId ||
								"";
							if (
								sessionId.length === 0 ||
								!options.canDropSessionOnWorkspace(
									sessionId,
									workspace,
								)
							)
								return;
							event.preventDefault();
							event.dataTransfer.dropEffect = "move";
						}}
						onDragLeave={(
							event: DragEvent<HTMLSpanElement>,
						): void => {
							if (
								event.relatedTarget instanceof Node &&
								event.currentTarget.contains(
									event.relatedTarget,
								)
							)
								return;
							options.onWorkspaceDragLeave(workspace.id);
						}}
						onDrop={(event: DragEvent<HTMLSpanElement>): void => {
							const sessionId: string =
								event.dataTransfer.getData(
									"application/x-daedalus-session-id",
								) ||
								options.draggingSessionId ||
								"";
							if (
								sessionId.length === 0 ||
								!options.canDropSessionOnWorkspace(
									sessionId,
									workspace,
								)
							)
								return;
							event.preventDefault();
							event.stopPropagation();
							options.onWorkspaceDrop(sessionId, workspace);
						}}
					>
						<span className={styles.workspaceTitle}>
							{workspace.name}
						</span>
						<span
							className={styles.workspaceActions}
							draggable={false}
							onMouseDown={(
								event: MouseEvent<HTMLElement>,
							): void => {
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
									aria-label={labels.workspaceActionsAria(
										workspace.name,
									)}
									className={styles.workspaceActionButton}
									icon={
										<Icon
											name="more-v"
											width={16}
											height={16}
										/>
									}
									loading={isDeleting}
									onClick={(
										event: MouseEvent<HTMLElement>,
									): void => {
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
									aria-label={labels.newSessionInWorkspaceAria(
										workspace.name,
									)}
									className={styles.workspaceActionButton}
									icon={
										<Icon
											name="add"
											width={16}
											height={16}
										/>
									}
									onClick={(
										event: MouseEvent<HTMLElement>,
									): void =>
										options.onNewWorkspaceSession(
											workspace,
											event,
										)
									}
								/>
							</Tooltip>
						</span>
					</span>
				</Dropdown>
			),
			kind: "workspace",
			workspace,
			workspaceId: workspace.id,
			children:
				workspaceSessions.length > 0
					? workspaceSessions.map(
							(session: SessionMetadata): ProjectTreeNode => {
								return createSessionTreeNode(
									session,
									"projects",
									workspace.id,
									options,
								);
							},
						)
					: [
							{
								key: `workspace:${workspace.id}:empty`,
								title: labels.noSessions,
								disabled: true,
								selectable: false,
								kind: "empty",
								sectionKey: "projects",
								workspaceId: workspace.id,
								isLeaf: true,
							},
						],
		};
	});
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
	forkingSessionId = null,
	onSessionSelect,
	onSessionFork,
	onSessionArchive,
	onSessionRename,
	onSessionWorkspaceMove,
	onSessionWorktreeDelete,
	onSessionsChange,
	onNewSession,
	onNewWorkspaceSession,
	onWorkspaceDelete,
	onWorkspaceUpdate,
	onWorkspaceProjectCreated,
}: WorkspaceTreeProps): React.JSX.Element {
	const [messageApi, messageContextHolder] = message.useMessage();
	const { t } = useTranslation();
	const [workspaces, setWorkspaces] = useState<WorkspaceConfig[]>(
		() => initialWorkspaces,
	);
	const [sessions, setSessions] = useState<SessionMetadata[]>(() =>
		filterVisibleSessions(initialSessions),
	);
	const [workspaceTreeOrder, setWorkspaceTreeOrder] =
		useState<WorkspaceTreeOrderPreferences>(() => {
			return reconcileWorkspaceTreeOrder(
				initialWorkspaceTreeOrder,
				initialWorkspaces,
				filterVisibleSessions(initialSessions),
			);
		});
	const [expandedWorkspaceIds, setExpandedWorkspaceIds] = useState<string[]>(
		() => {
			return reconcileWorkspaceTreeOrder(
				initialWorkspaceTreeOrder,
				initialWorkspaces,
				filterVisibleSessions(initialSessions),
			).expandedWorkspaceIds;
		},
	);
	const [activeWorkspaceId, setActiveWorkspaceId] = useState<string | null>(
		initialActiveWorkspaceId,
	);
	const [selectedMenuKeys, setSelectedMenuKeys] = useState<string[]>([]);
	const [isWorkspaceLoading, setIsWorkspaceLoading] = useState<boolean>(true);
	const [workspaceError, setWorkspaceError] = useState<string | null>(null);
	const [reloadIndex, setReloadIndex] = useState<number>(0);
	const [archivingSessionId, setArchivingSessionId] = useState<string | null>(
		null,
	);
	const [pinningSessionId, setPinningSessionId] = useState<string | null>(
		null,
	);
	const [exportingSessionId, setExportingSessionId] = useState<string | null>(
		null,
	);
	const [isCreateProjectOpen, setIsCreateProjectOpen] =
		useState<boolean>(false);
	const [deleteTargetWorkspace, setDeleteTargetWorkspace] =
		useState<WorkspaceConfig | null>(null);
	const [editTargetWorkspace, setEditTargetWorkspace] =
		useState<WorkspaceConfig | null>(null);
	const [permanentWorktreeTarget, setPermanentWorktreeTarget] =
		useState<WorkspaceConfig | null>(null);
	const [permanentWorktreeName, setPermanentWorktreeName] =
		useState<string>("");
	const [permanentWorktreeSources, setPermanentWorktreeSources] = useState<
		Record<string, WorktreeSourceOptions>
	>({});
	const [isCreatingPermanentWorktree, setIsCreatingPermanentWorktree] =
		useState<boolean>(false);
	const [deletingWorkspaceId, setDeletingWorkspaceId] = useState<
		string | null
	>(null);
	const [renameTargetSession, setRenameTargetSession] =
		useState<SessionMetadata | null>(null);
	const [deleteWorktreeTarget, setDeleteWorktreeTarget] =
		useState<SessionMetadata | null>(null);
	const [deletingWorktreeSessionId, setDeletingWorktreeSessionId] = useState<
		string | null
	>(null);
	const [renameDraftTitle, setRenameDraftTitle] = useState<string>("");
	const [renameError, setRenameError] = useState<string | null>(null);
	const [renamingSessionId, setRenamingSessionId] = useState<string | null>(
		null,
	);
	const [movingSessionId, setMovingSessionId] = useState<string | null>(null);
	const [draggingSessionId, setDraggingSessionId] = useState<string | null>(
		null,
	);
	const [dropTargetWorkspaceId, setDropTargetWorkspaceId] = useState<
		string | null
	>(null);
	const workspaceTreeOrderRef =
		useRef<WorkspaceTreeOrderPreferences>(workspaceTreeOrder);
	const expandedWorkspaceIdsRef = useRef<string[]>(expandedWorkspaceIds);
	const workspacesRef = useRef<WorkspaceConfig[]>(workspaces);
	const sessionsRef = useRef<SessionMetadata[]>(sessions);
	const orderSaveQueueRef = useRef<Promise<void>>(Promise.resolve());
	const orderSaveRevisionRef = useRef<number>(0);
	const expansionSaveTimerRef = useRef<number | null>(null);
	const isMountedRef = useRef<boolean>(true);
	const draggingSessionIdRef = useRef<string | null>(null);
	const movingSessionIdRef = useRef<string | null>(null);
	const runningSessionIdSet: ReadonlySet<string> = useMemo(
		(): ReadonlySet<string> => new Set(runningSessionIds),
		[runningSessionIds],
	);
	const unreadSessionIdSet: ReadonlySet<string> = useMemo(
		(): ReadonlySet<string> => new Set(unreadSessionIds),
		[unreadSessionIds],
	);
	const workspaceById: ReadonlyMap<string, WorkspaceConfig> =
		useMemo((): ReadonlyMap<string, WorkspaceConfig> => {
			return new Map(
				workspaces.map(
					(workspace: WorkspaceConfig): [string, WorkspaceConfig] => [
						workspace.id,
						workspace,
					],
				),
			);
		}, [workspaces]);
	const labels: WorkspaceTreeLabels = useMemo((): WorkspaceTreeLabels => {
		return {
			archiveSession: t("workspaceTree.actions.archiveSession"),
			copySessionId: t("workspaceTree.actions.copySessionId"),
			exportDialogButton: t("workspaceTree.exportDialog.button"),
			exportDialogTitle: t("workspaceTree.exportDialog.title"),
			exportSession: t("workspaceTree.actions.exportSession"),
			exportingSession: t("workspaceTree.status.exportingSession"),
			delete: t("workspaceTree.actions.delete"),
			editProject: t("workspaceTree.actions.editProject", {
				defaultValue: "Edit project",
			}),
			deleteWorkspaceBody: t("workspaceTree.modals.deleteWorkspace.body"),
			deleteWorkspaceTitle: t(
				"workspaceTree.modals.deleteWorkspace.title",
			),
			failedArchiveSession: t("workspaceTree.errors.archiveSession"),
			failedCopySessionId: t("workspaceTree.errors.copySessionId"),
			failedExportSession: t("workspaceTree.errors.exportSession"),
			forkSession: t("workspaceTree.actions.forkSession"),
			deleteWorktree: t("workspaceTree.actions.deleteWorktree"),
			deleteWorktreeTitle: t("workspaceTree.modals.deleteWorktree.title"),
			deleteWorktreeBody: t("workspaceTree.modals.deleteWorktree.body"),
			failedDeleteWorkspace: t("workspaceTree.errors.deleteWorkspace"),
			failedDeleteWorktree: t("workspaceTree.errors.deleteWorktree"),
			failedLoadWorkspace: t("workspaceTree.errors.loadWorkspace"),
			failedOpenWorkspaceDirectory: t(
				"workspaceTree.errors.openWorkspaceDirectory",
			),
			failedPinSession: t("workspaceTree.errors.pinSession"),
			failedRenameSession: t("workspaceTree.errors.renameSession"),
			failedMoveSession: t("workspaceTree.errors.moveSession"),
			failedSaveOrder: t("workspaceTree.errors.saveOrder", {
				defaultValue: "Failed to save workspace order",
			}),
			newSession: t("agentPage.actions.newSession"),
			newSessionInWorkspace: t(
				"workspaceTree.actions.newSessionInWorkspace",
			),
			newWorktreeSession: t("workspaceTree.actions.newWorktreeSession"),
			createPermanentWorktree: t(
				"workspaceTree.actions.createPermanentWorktree",
			),
			newProject: t("workspaceTree.actions.newProject"),
			noPinnedSessions: t("workspaceTree.empty.noPinnedSessions"),
			noProjects: t("workspaceTree.empty.noProjects"),
			noRecentSessions: t("workspaceTree.empty.noRecentSessions"),
			noSessions: t("workspaceTree.empty.noSessions"),
			noWorkspace: t("workspaceTree.empty.noWorkspace"),
			openInExplorer: t("workspaceTree.actions.openInExplorer"),
			openWorkspaceDirectory: t(
				"workspaceTree.actions.openWorkspaceDirectory",
			),
			pinSession: t("workspaceTree.actions.pinSession"),
			pinned: t("workspaceTree.groups.pinned"),
			projects: t("workspaceTree.groups.projects"),
			recent: t("workspaceTree.groups.recent"),
			rename: t("workspaceTree.actions.rename"),
			renameSession: t("workspaceTree.actions.renameSession"),
			moveSession: t("workspaceTree.actions.moveSession"),
			movingSession: t("workspaceTree.status.movingSession"),
			moveSessionRunningBlocked: t(
				"workspaceTree.status.moveSessionRunningBlocked",
			),
			moveSessionWorktreeBlocked: t(
				"workspaceTree.status.moveSessionWorktreeBlocked",
			),
			moveSessionNoTargets: t(
				"workspaceTree.status.moveSessionNoTargets",
			),
			sessionIdCopied: t("workspaceTree.messages.sessionIdCopied"),
			sessionExported: t("workspaceTree.messages.sessionExported"),
			sessionExportedWithMissingFiles: (count: number): string =>
				t("workspaceTree.messages.sessionExportedWithMissingFiles", {
					count,
				}),
			sessionTitleCannotBeEmpty: t(
				"workspaceTree.errors.sessionTitleCannotBeEmpty",
			),
			sessionTitlePlaceholder: t(
				"workspaceTree.modals.renameSession.placeholder",
			),
			unpinSession: t("workspaceTree.actions.unpinSession"),
			archiveSessionAria: (sessionTitle: string): string =>
				t("workspaceTree.aria.archiveSession", { sessionTitle }),
			pinSessionAria: (sessionTitle: string, pinned: boolean): string =>
				t(
					pinned
						? "workspaceTree.aria.unpinSession"
						: "workspaceTree.aria.pinSession",
					{ sessionTitle },
				),
			newSessionInWorkspaceAria: (workspaceName: string): string =>
				t("workspaceTree.aria.newSessionInWorkspace", {
					workspaceName,
				}),
			assistantRunning: t("workspaceTree.status.assistantRunning", {
				defaultValue: "Assistant is responding",
			}),
			unreadResponse: t("workspaceTree.status.unreadResponse", {
				defaultValue: "Unread assistant response",
			}),
			forkedSession: t("workspaceTree.status.forkedSession"),
			worktreeSession: t("workspaceTree.status.worktreeSession"),
			permanentWorktreeSession: t(
				"workspaceTree.status.permanentWorktreeSession",
			),
			workspaceActionsAria: (workspaceName: string): string =>
				t("workspaceTree.aria.workspaceActions", { workspaceName }),
			moveSessionToWorkspaceAria: (workspaceName: string): string =>
				t("workspaceTree.aria.moveSessionToWorkspace", {
					workspaceName,
				}),
		};
	}, [t]);

	workspaceTreeOrderRef.current = {
		...workspaceTreeOrder,
		expandedWorkspaceIds: expandedWorkspaceIdsRef.current,
	};
	workspacesRef.current = workspaces;
	sessionsRef.current = sessions;

	function showWorkspaceOperationError(
		error: unknown,
		fallbackMessage: string,
	): void {
		const errorMessage: string =
			error instanceof Error ? error.message : fallbackMessage;
		console.error(`[WorkspaceTree] ${fallbackMessage}`, error);
		void messageApi.error(errorMessage);
	}

	function setCanonicalWorkspaceTreeOrder(
		nextOrder: WorkspaceTreeOrderPreferences,
	): void {
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

	function enqueueWorkspaceTreeOrderSave(
		nextOrder: WorkspaceTreeOrderPreferences,
	): void {
		const revision: number = orderSaveRevisionRef.current + 1;
		orderSaveRevisionRef.current = revision;
		const payload = {
			workspaceIds: [...nextOrder.workspaceIds],
			sessionIdsByWorkspace: Object.fromEntries(
				Object.entries(nextOrder.sessionIdsByWorkspace).map(
					([workspaceId, sessionIds]): [string, string[]] => [
						workspaceId,
						[...sessionIds],
					],
				),
			),
			pinnedSessionIds: [...nextOrder.pinnedSessionIds],
			recentSessionIds: [...nextOrder.recentSessionIds],
			expandedSectionKeys: [...nextOrder.expandedSectionKeys],
			expandedWorkspaceIds: [...nextOrder.expandedWorkspaceIds],
		};

		orderSaveQueueRef.current = orderSaveQueueRef.current.then(
			async (): Promise<void> => {
				try {
					const savedOrder: WorkspaceTreeOrderPreferences =
						await updateWorkspaceTreeOrder(payload);
					if (
						!isMountedRef.current ||
						revision !== orderSaveRevisionRef.current
					) {
						return;
					}
					const reconciledOrder: WorkspaceTreeOrderPreferences =
						reconcileWorkspaceTreeOrder(
							savedOrder,
							workspacesRef.current,
							sessionsRef.current,
						);
					if (
						!areWorkspaceTreeOrdersEqual(
							workspaceTreeOrderRef.current,
							reconciledOrder,
						)
					) {
						setCanonicalWorkspaceTreeOrder(reconciledOrder);
					}
				} catch (error: unknown) {
					if (
						!isMountedRef.current ||
						revision !== orderSaveRevisionRef.current
					) {
						return;
					}
					try {
						const storedOrder: WorkspaceTreeOrderPreferences =
							await fetchWorkspaceTreeOrder();
						if (
							isMountedRef.current &&
							revision === orderSaveRevisionRef.current
						) {
							setCanonicalWorkspaceTreeOrder(
								reconcileWorkspaceTreeOrder(
									storedOrder,
									workspacesRef.current,
									sessionsRef.current,
								),
							);
						}
					} catch (reloadError: unknown) {
						console.error(
							"[WorkspaceTree] reload workspace order failed",
							reloadError,
						);
					}
					showWorkspaceOperationError(error, labels.failedSaveOrder);
				}
			},
		);
	}

	function persistWorkspaceTreeOrder(
		nextOrder: WorkspaceTreeOrderPreferences,
	): void {
		if (
			areWorkspaceTreeOrdersEqual(
				workspaceTreeOrderRef.current,
				nextOrder,
			)
		) {
			return;
		}
		clearScheduledExpansionSave();
		setCanonicalWorkspaceTreeOrder(nextOrder);
		enqueueWorkspaceTreeOrderSave(nextOrder);
	}

	function persistExpandedWorkspaceIds(
		nextExpandedWorkspaceIds: string[],
	): void {
		if (
			areStringListsEqual(
				expandedWorkspaceIdsRef.current,
				nextExpandedWorkspaceIds,
			)
		) {
			return;
		}
		const nextOrder: WorkspaceTreeOrderPreferences = {
			...workspaceTreeOrderRef.current,
			expandedWorkspaceIds: nextExpandedWorkspaceIds,
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

	const handleSectionChange: NonNullable<CollapseProps["onChange"]> = (
		keys,
	): void => {
		const candidateKeys: string[] = (
			Array.isArray(keys) ? keys : [keys]
		).map(String);
		const expandedSectionKeys: WorkspaceTreeSectionKey[] =
			candidateKeys.filter(
				(key: string): key is WorkspaceTreeSectionKey => {
					return (
						key === "pinned" ||
						key === "projects" ||
						key === "recent"
					);
				},
			);
		persistWorkspaceTreeOrder({
			...workspaceTreeOrderRef.current,
			expandedSectionKeys,
		});
	};

	function ensureSectionOpen(sectionKey: WorkspaceTreeSectionKey): void {
		const currentOrder: WorkspaceTreeOrderPreferences =
			workspaceTreeOrderRef.current;
		if (currentOrder.expandedSectionKeys.includes(sectionKey)) {
			return;
		}
		persistWorkspaceTreeOrder({
			...currentOrder,
			expandedSectionKeys: [
				...currentOrder.expandedSectionKeys,
				sectionKey,
			],
		});
	}

	async function handleArchiveSessionAction(
		session: SessionMetadata,
	): Promise<void> {
		if (archivingSessionId !== null) {
			return;
		}
		const wasActive: boolean = selectedSessionId === session.id;

		try {
			setArchivingSessionId(session.id);
			await archiveSession(session.id);
			window.electronAPI.sessionCatalog.notifyChanged();
			setSessions(
				(currentSessions: SessionMetadata[]): SessionMetadata[] => {
					return currentSessions.filter(
						(currentSession: SessionMetadata): boolean =>
							currentSession.id !== session.id,
					);
				},
			);
			setSelectedMenuKeys((currentKeys: string[]): string[] => {
				return currentKeys.filter(
					(key: string): boolean => key !== `session:${session.id}`,
				);
			});
			onSessionArchive?.(session, { wasActive });
		} catch (error: unknown) {
			showWorkspaceOperationError(error, labels.failedArchiveSession);
		} finally {
			setArchivingSessionId(null);
		}
	}

	async function handleArchiveSession(
		session: SessionMetadata,
		event: MouseEvent<HTMLElement>,
	): Promise<void> {
		event.preventDefault();
		event.stopPropagation();
		await handleArchiveSessionAction(session);
	}

	async function handlePinSessionAction(
		session: SessionMetadata,
	): Promise<void> {
		if (pinningSessionId !== null) {
			return;
		}

		const pinned: boolean = session.pinned !== true;
		try {
			setPinningSessionId(session.id);
			const metadata: SessionMetadata = await setSessionPinned(
				session.id,
				pinned,
			);
			setSessions(
				(currentSessions: SessionMetadata[]): SessionMetadata[] =>
					currentSessions.map(
						(currentSession: SessionMetadata): SessionMetadata =>
							currentSession.id === metadata.id
								? metadata
								: currentSession,
					),
			);
			const targetSection: WorkspaceTreeSectionKey =
				metadata.pinned === true
					? "pinned"
					: getSessionProjectWorkspaceId(metadata) !== undefined &&
						  workspaces.some(
								(workspace: WorkspaceConfig): boolean =>
									workspace.id ===
									getSessionProjectWorkspaceId(metadata),
						  )
						? "projects"
						: "recent";
			ensureSectionOpen(targetSection);
		} catch (error: unknown) {
			showWorkspaceOperationError(error, labels.failedPinSession);
		} finally {
			setPinningSessionId(null);
		}
	}

	async function handlePinSession(
		session: SessionMetadata,
		event: MouseEvent<HTMLElement>,
	): Promise<void> {
		event.preventDefault();
		event.stopPropagation();
		await handlePinSessionAction(session);
	}

	function handleNewWorkspaceSession(
		workspace: WorkspaceConfig,
		event: MouseEvent<HTMLElement>,
		environment: "local" | "worktree" = "local",
	): void {
		event.preventDefault();
		event.stopPropagation();
		onNewWorkspaceSession?.(workspace, environment);
	}

	function handleRenameSessionStart(session: SessionMetadata): void {
		setRenameTargetSession(session);
		setRenameDraftTitle(session.title);
		setRenameError(null);
	}

	async function handleConfirmDeleteWorktree(): Promise<void> {
		if (
			deleteWorktreeTarget === null ||
			deletingWorktreeSessionId !== null ||
			onSessionWorktreeDelete === undefined
		) {
			return;
		}
		try {
			setDeletingWorktreeSessionId(deleteWorktreeTarget.id);
			const metadata: SessionMetadata =
				await onSessionWorktreeDelete(deleteWorktreeTarget);
			setSessions((currentSessions): SessionMetadata[] =>
				currentSessions.map(
					(session): SessionMetadata =>
						session.id === metadata.id ? metadata : session,
				),
			);
			setDeleteWorktreeTarget(null);
		} catch (error: unknown) {
			showWorkspaceOperationError(error, labels.failedDeleteWorktree);
		} finally {
			setDeletingWorktreeSessionId(null);
		}
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
			const metadata: SessionMetadata = await renameSession(
				renameTargetSession.id,
				nextTitle,
			);
			setSessions(
				(currentSessions: SessionMetadata[]): SessionMetadata[] => {
					return currentSessions.map(
						(session: SessionMetadata): SessionMetadata => {
							return session.id === metadata.id
								? metadata
								: session;
						},
					);
				},
			);
			onSessionRename?.(metadata);
			setRenameTargetSession(null);
			setRenameDraftTitle("");
		} catch (error: unknown) {
			const errorMessage: string =
				error instanceof Error
					? error.message
					: labels.failedRenameSession;
			setRenameError(errorMessage);
			void messageApi.error(errorMessage);
		} finally {
			setRenamingSessionId(null);
		}
	}

	function canMoveSessionToWorkspace(
		sessionId: string,
		workspace: WorkspaceConfig,
	): boolean {
		const targetSession: SessionMetadata | undefined =
			sessionsRef.current.find(
				(candidate: SessionMetadata): boolean =>
					candidate.id === sessionId,
			);
		return (
			targetSession !== undefined &&
			targetSession.worktree === undefined &&
			!runningSessionIdSet.has(sessionId) &&
			movingSessionIdRef.current === null &&
			getSessionProjectWorkspaceId(targetSession) !== workspace.id
		);
	}

	async function handleMoveSessionToWorkspace(
		targetSession: SessionMetadata,
		workspace: WorkspaceConfig,
	): Promise<void> {
		if (
			movingSessionIdRef.current !== null ||
			onSessionWorkspaceMove === undefined ||
			!canMoveSessionToWorkspace(targetSession.id, workspace)
		) {
			return;
		}
		try {
			movingSessionIdRef.current = targetSession.id;
			setMovingSessionId(targetSession.id);
			const result: MoveSessionWorkspaceResult =
				await onSessionWorkspaceMove(targetSession, workspace);
			const nextSessions: SessionMetadata[] = sessionsRef.current.map(
				(session: SessionMetadata): SessionMetadata =>
					session.id === result.metadata.id
						? result.metadata
						: session,
			);
			sessionsRef.current = nextSessions;
			setSessions(nextSessions);
			const reconciledOrder: WorkspaceTreeOrderPreferences =
				reconcileWorkspaceTreeOrder(
					workspaceTreeOrderRef.current,
					workspacesRef.current,
					nextSessions,
				);
			persistWorkspaceTreeOrder(
				moveSessionToWorkspaceInTreeOrder(
					reconciledOrder,
					result.metadata.id,
					workspace.id,
					result.metadata.pinned === true,
				),
			);
		} catch (error: unknown) {
			showWorkspaceOperationError(error, labels.failedMoveSession);
		} finally {
			movingSessionIdRef.current = null;
			setMovingSessionId(null);
			draggingSessionIdRef.current = null;
			setDraggingSessionId(null);
			setDropTargetWorkspaceId(null);
		}
	}

	async function handleOpenSessionWorkspaceInExplorer(
		session: SessionMetadata,
	): Promise<void> {
		const rootPath: string | undefined = session.workspaceRoot;
		if (rootPath === undefined) {
			void messageApi.warning(labels.noWorkspace);
			return;
		}
		try {
			setWorkspaceError(null);
			await window.electronAPI.workspaceFs.openWorkspaceDirectory(
				rootPath,
			);
		} catch (error: unknown) {
			showWorkspaceOperationError(
				error,
				labels.failedOpenWorkspaceDirectory,
			);
		}
	}

	async function handleCopySessionId(
		session: SessionMetadata,
	): Promise<void> {
		try {
			await copyTextToClipboard(session.id);
			void messageApi.success(labels.sessionIdCopied);
		} catch (error: unknown) {
			showWorkspaceOperationError(error, labels.failedCopySessionId);
		}
	}

	async function handleExportSession(
		session: SessionMetadata,
	): Promise<void> {
		if (exportingSessionId !== null) {
			return;
		}
		try {
			const destinationPath: string | null =
				await window.electronAPI.sessionFs.pickExportDestination({
					sessionId: session.id,
					title: session.title,
					dialogTitle: labels.exportDialogTitle,
					buttonLabel: labels.exportDialogButton,
				});
			if (destinationPath === null) {
				return;
			}
			setExportingSessionId(session.id);
			const result: ExportSessionResult = await exportSession(
				session.id,
				destinationPath,
			);
			if (result.missingFileCount > 0) {
				void messageApi.warning(
					labels.sessionExportedWithMissingFiles(
						result.missingFileCount,
					),
				);
			} else {
				void messageApi.success(labels.sessionExported);
			}
		} catch (error: unknown) {
			showWorkspaceOperationError(error, labels.failedExportSession);
		} finally {
			setExportingSessionId(null);
		}
	}

	async function handleOpenWorkspaceInExplorer(
		workspace: WorkspaceConfig,
	): Promise<void> {
		try {
			setWorkspaceError(null);
			await window.electronAPI.workspaceFs.openWorkspaceDirectory(
				workspace.rootPath,
			);
		} catch (error: unknown) {
			showWorkspaceOperationError(
				error,
				labels.failedOpenWorkspaceDirectory,
			);
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
			const result: DeleteWorkspaceResult = await deleteWorkspace(
				workspace.id,
			);
			const deletedSessionIds: Set<string> = new Set(
				result.deletedSessionIds,
			);
			const movedBySessionId: Map<string, string> = new Map(
				result.movedSessions.map((move): [string, string] => [
					move.sessionId,
					move.workspaceId,
				]),
			);

			setWorkspaces(
				(currentWorkspaces: WorkspaceConfig[]): WorkspaceConfig[] => {
					return currentWorkspaces.filter(
						(currentWorkspace: WorkspaceConfig): boolean =>
							currentWorkspace.id !== workspace.id,
					);
				},
			);
			setSessions(
				(currentSessions: SessionMetadata[]): SessionMetadata[] => {
					return currentSessions
						.filter(
							(session: SessionMetadata): boolean =>
								!deletedSessionIds.has(session.id),
						)
						.map((session: SessionMetadata): SessionMetadata => {
							const destinationId: string | undefined =
								movedBySessionId.get(session.id);
							const destination: WorkspaceConfig | undefined =
								destinationId === undefined
									? undefined
									: workspaces.find(
											(candidate): boolean =>
												candidate.id === destinationId,
										);
							return destination === undefined
								? session
								: {
										...session,
										workspaceId: destination.id,
										workspaceName: destination.name,
										workspaceRoot: destination.rootPath,
									};
						});
				},
			);
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
			setActiveWorkspaceId(
				(currentWorkspaceId: string | null): string | null => {
					return currentWorkspaceId === workspace.id
						? null
						: currentWorkspaceId;
				},
			);
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
			const pendingOrder: WorkspaceTreeOrderPreferences | null =
				expansionSaveTimerRef.current === null
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

				const [workspaceList, sessionList, storedOrder] =
					await Promise.all([
						fetchWorkspaces(),
						fetchSessions(),
						fetchWorkspaceTreeOrder(),
					]);

				if (cancelled) {
					return;
				}

				console.info("[WorkspaceTree] loaded", {
					workspaceCount: workspaceList.workspaces.length,
					sessionCount: sessionList.sessions.length,
					activeWorkspaceId: workspaceList.active,
					workspaces: workspaceList.workspaces,
					sessions: sessionList.sessions,
				});

				const visibleSessions: SessionMetadata[] =
					filterVisibleSessions(sessionList.sessions);
				const reconciledOrder: WorkspaceTreeOrderPreferences =
					reconcileWorkspaceTreeOrder(
						storedOrder,
						workspaceList.workspaces,
						visibleSessions,
					);
				workspacesRef.current = workspaceList.workspaces;
				sessionsRef.current = visibleSessions;
				workspaceTreeOrderRef.current = reconciledOrder;
				expandedWorkspaceIdsRef.current =
					reconciledOrder.expandedWorkspaceIds;
				setWorkspaces(workspaceList.workspaces);
				setSessions(visibleSessions);
				setExpandedWorkspaceIds(reconciledOrder.expandedWorkspaceIds);
				setWorkspaceTreeOrder(reconciledOrder);
				setActiveWorkspaceId(workspaceList.active);

				if (
					workspaceList.workspaces.length === 0 &&
					sessionList.sessions.length === 0 &&
					reloadIndex < 5
				) {
					retryTimer = window.setTimeout((): void => {
						setReloadIndex(
							(currentReloadIndex: number): number =>
								currentReloadIndex + 1,
						);
					}, 1200);
				}
			} catch (error: unknown) {
				if (!cancelled) {
					setWorkspaceError(
						error instanceof Error
							? error.message
							: labels.failedLoadWorkspace,
					);
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
		const reconciledOrder: WorkspaceTreeOrderPreferences =
			reconcileWorkspaceTreeOrder(
				workspaceTreeOrderRef.current,
				workspaces,
				sessions,
			);
		if (
			!areWorkspaceTreeOrdersEqual(
				workspaceTreeOrderRef.current,
				reconciledOrder,
			)
		) {
			persistWorkspaceTreeOrder(reconciledOrder);
		}
	}, [sessions, workspaces]);

	const sessionMenuOptions: CreateSessionMenuItemOptions =
		useMemo((): CreateSessionMenuItemOptions => {
			return {
				archivingSessionId,
				deletingWorktreeSessionId,
				exportingSessionId,
				forkingSessionId,
				pinningSessionId,
				movingSessionId,
				moveWorkspaces: sortWorkspacesByTreeOrder(
					workspaces,
					reconcileWorkspaceTreeOrder(
						workspaceTreeOrder,
						workspaces,
						sessions,
					),
				),
				workspaceById,
				runningSessionIds: runningSessionIdSet,
				unreadSessionIds: unreadSessionIdSet,
				labels,
				onArchiveButton: (
					session: SessionMetadata,
					event: MouseEvent<HTMLElement>,
				): void => {
					void handleArchiveSession(session, event);
				},
				onPin: (session: SessionMetadata): void => {
					void handlePinSessionAction(session);
				},
				onPinButton: (
					session: SessionMetadata,
					event: MouseEvent<HTMLElement>,
				): void => {
					void handlePinSession(session, event);
				},
				onRename: (session: SessionMetadata): void => {
					handleRenameSessionStart(session);
				},
				onMove: (
					session: SessionMetadata,
					workspace: WorkspaceConfig,
				): void => {
					void handleMoveSessionToWorkspace(session, workspace);
				},
				onFork: (session: SessionMetadata): void => {
					onSessionFork?.(session);
				},
				onDeleteWorktree: (session: SessionMetadata): void => {
					setDeleteWorktreeTarget(session);
				},
				onArchive: (session: SessionMetadata): void => {
					void handleArchiveSessionAction(session);
				},
				canOpenSessionWorkspace: (
					session: SessionMetadata,
				): boolean => {
					return session.workspaceRoot !== undefined;
				},
				onOpenSessionWorkspaceInExplorer: (
					session: SessionMetadata,
				): void => {
					void handleOpenSessionWorkspaceInExplorer(session);
				},
				onCopySessionId: (session: SessionMetadata): void => {
					void handleCopySessionId(session);
				},
				onExportSession: (session: SessionMetadata): void => {
					void handleExportSession(session);
				},
			};
		}, [
			archivingSessionId,
			deletingWorktreeSessionId,
			exportingSessionId,
			forkingSessionId,
			labels,
			movingSessionId,
			onSessionFork,
			pinningSessionId,
			runningSessionIdSet,
			sessions,
			unreadSessionIdSet,
			workspaceById,
			workspaceTreeOrder,
			workspaces,
		]);
	const sessionGroups = useMemo((): {
		pinnedSessions: SessionMetadata[];
		projectSessions: SessionMetadata[];
		recentSessions: SessionMetadata[];
	} => {
		const workspaceIds: ReadonlySet<string> = new Set(
			workspaces.map(
				(workspace: WorkspaceConfig): string => workspace.id,
			),
		);
		return sessions.reduce<{
			pinnedSessions: SessionMetadata[];
			projectSessions: SessionMetadata[];
			recentSessions: SessionMetadata[];
		}>(
			(groups, session) => {
				if (session.pinned === true) {
					groups.pinnedSessions.push(session);
				} else if (
					getSessionProjectWorkspaceId(session) !== undefined &&
					workspaceIds.has(getSessionProjectWorkspaceId(session)!)
				) {
					groups.projectSessions.push(session);
				} else {
					groups.recentSessions.push(session);
				}
				return groups;
			},
			{
				pinnedSessions: [],
				projectSessions: [],
				recentSessions: [],
			} as {
				pinnedSessions: SessionMetadata[];
				projectSessions: SessionMetadata[];
				recentSessions: SessionMetadata[];
			},
		);
	}, [sessions, workspaces]);
	const effectiveWorkspaceTreeOrder: WorkspaceTreeOrderPreferences = useMemo(
		(): WorkspaceTreeOrderPreferences =>
			reconcileWorkspaceTreeOrder(
				workspaceTreeOrder,
				workspaces,
				sessions,
			),
		[sessions, workspaceTreeOrder, workspaces],
	);
	const orderedWorkspaces: WorkspaceConfig[] =
		useMemo((): WorkspaceConfig[] => {
			return sortWorkspacesByTreeOrder(
				workspaces,
				effectiveWorkspaceTreeOrder,
			);
		}, [effectiveWorkspaceTreeOrder, workspaces]);
	const orderedPinnedSessions: SessionMetadata[] =
		useMemo((): SessionMetadata[] => {
			return sortSessionsByTreeOrder(
				sessionGroups.pinnedSessions,
				effectiveWorkspaceTreeOrder.pinnedSessionIds,
			);
		}, [
			effectiveWorkspaceTreeOrder.pinnedSessionIds,
			sessionGroups.pinnedSessions,
		]);
	const orderedProjectSessions: SessionMetadata[] =
		useMemo((): SessionMetadata[] => {
			return orderedWorkspaces.flatMap(
				(workspace: WorkspaceConfig): SessionMetadata[] => {
					return sortWorkspaceSessionsByTreeOrder(
						sessionGroups.projectSessions,
						workspace.id,
						effectiveWorkspaceTreeOrder,
					);
				},
			);
		}, [
			effectiveWorkspaceTreeOrder,
			orderedWorkspaces,
			sessionGroups.projectSessions,
		]);
	const orderedRecentSessions: SessionMetadata[] =
		useMemo((): SessionMetadata[] => {
			return sortSessionsByTreeOrder(
				sessionGroups.recentSessions,
				effectiveWorkspaceTreeOrder.recentSessionIds,
			);
		}, [
			effectiveWorkspaceTreeOrder.recentSessionIds,
			sessionGroups.recentSessions,
		]);
	const pinnedTreeData: ProjectTreeNode[] = useMemo((): ProjectTreeNode[] => {
		return createSessionTreeData(
			orderedPinnedSessions,
			"pinned",
			"pinned:empty",
			labels.noPinnedSessions,
			sessionMenuOptions,
		);
	}, [labels.noPinnedSessions, orderedPinnedSessions, sessionMenuOptions]);
	const projectTreeData: ProjectTreeNode[] =
		useMemo((): ProjectTreeNode[] => {
			return createProjectTreeData(
				orderedWorkspaces,
				orderedProjectSessions,
				{
					...sessionMenuOptions,
					deletingWorkspaceId,
					draggingSessionId,
					dropTargetWorkspaceId,
					canDropSessionOnWorkspace: canMoveSessionToWorkspace,
					onWorkspaceDragEnter: (
						sessionId: string,
						workspace: WorkspaceConfig,
					): void => {
						if (canMoveSessionToWorkspace(sessionId, workspace)) {
							setDropTargetWorkspaceId(workspace.id);
						}
					},
					onWorkspaceDragLeave: (workspaceId: string): void => {
						setDropTargetWorkspaceId(
							(currentId: string | null): string | null =>
								currentId === workspaceId ? null : currentId,
						);
					},
					onWorkspaceDrop: (
						sessionId: string,
						workspace: WorkspaceConfig,
					): void => {
						const targetSession: SessionMetadata | undefined =
							sessionsRef.current.find(
								(candidate: SessionMetadata): boolean =>
									candidate.id === sessionId,
							);
						if (targetSession !== undefined) {
							void handleMoveSessionToWorkspace(
								targetSession,
								workspace,
							);
						}
					},
					onNewWorkspaceSession: handleNewWorkspaceSession,
					onOpenWorkspaceInExplorer: (
						workspace: WorkspaceConfig,
					): void => {
						void handleOpenWorkspaceInExplorer(workspace);
					},
					onEditWorkspace: (workspace: WorkspaceConfig): void => {
						setEditTargetWorkspace(workspace);
					},
					onDeleteWorkspace: (workspace: WorkspaceConfig): void => {
						setDeleteTargetWorkspace(workspace);
					},
					onCreatePermanentWorktree: (
						workspace: WorkspaceConfig,
					): void => {
						setPermanentWorktreeTarget(workspace);
						setPermanentWorktreeName(`${workspace.name} Worktree`);
						setPermanentWorktreeSources({});
					},
				},
			);
		}, [
			deletingWorkspaceId,
			draggingSessionId,
			dropTargetWorkspaceId,
			orderedProjectSessions,
			orderedWorkspaces,
			sessionMenuOptions,
		]);
	const recentTreeData: ProjectTreeNode[] = useMemo((): ProjectTreeNode[] => {
		return createSessionTreeData(
			orderedRecentSessions,
			"recent",
			"recent:empty",
			labels.noRecentSessions,
			sessionMenuOptions,
		);
	}, [labels.noRecentSessions, orderedRecentSessions, sessionMenuOptions]);
	const effectiveSelectedMenuKeys: string[] = getSelectedMenuKeys(
		selectedSessionId,
		selectedWorkspaceId,
		selectedMenuKeys,
	);
	const openSectionKeys: WorkspaceTreeSectionKey[] =
		effectiveWorkspaceTreeOrder.expandedSectionKeys;
	const openWorkspaceKeys: string[] = expandedWorkspaceIds.map(
		(workspaceId: string): string => `workspace:${workspaceId}`,
	);
	const handleProjectTreeExpand: NonNullable<
		TreeProps<ProjectTreeNode>["onExpand"]
	> = (expandedKeys): void => {
		const expandedWorkspaceIds: string[] = expandedKeys.flatMap(
			(key: Key): string[] => {
				const normalizedKey: string = String(key);
				return normalizedKey.startsWith("workspace:")
					? [normalizedKey.slice("workspace:".length)]
					: [];
			},
		);
		persistExpandedWorkspaceIds(expandedWorkspaceIds);
	};
	const handleProjectTreeSelect: NonNullable<
		TreeProps<ProjectTreeNode>["onSelect"]
	> = (_selectedKeys, info): void => {
		const node: ProjectTreeNode = info.node;
		const selectedKey: string = String(node.key);
		if (node.kind === "empty") {
			return;
		}
		setSelectedMenuKeys([selectedKey]);
		if (node.kind === "workspace") {
			const workspaceId: string =
				node.workspaceId ?? selectedKey.slice("workspace:".length);
			const currentOrder: WorkspaceTreeOrderPreferences =
				workspaceTreeOrderRef.current;
			persistExpandedWorkspaceIds(
				currentOrder.expandedWorkspaceIds.includes(workspaceId)
					? currentOrder.expandedWorkspaceIds.filter(
							(id: string): boolean => id !== workspaceId,
						)
					: [...currentOrder.expandedWorkspaceIds, workspaceId],
			);
			return;
		}
		if (node.sessionId !== undefined) {
			const selectedSession: SessionMetadata | undefined = sessions.find(
				(session: SessionMetadata): boolean =>
					session.id === node.sessionId,
			);
			if (selectedSession !== undefined) {
				onSessionSelect?.(selectedSession);
			}
		}
	};
	const canDropTreeNode = (
		dragNode: ProjectTreeNode,
		dropNode: ProjectTreeNode,
		dropToGap: boolean,
	): boolean =>
		canDropWorkspaceTreeNode(
			dragNode,
			dropNode,
			dropToGap,
			effectiveWorkspaceTreeOrder,
		);
	const allowTreeDrop: NonNullable<
		TreeProps<ProjectTreeNode>["allowDrop"]
	> = ({ dragNode, dropNode, dropPosition }): boolean =>
		canDropTreeNode(dragNode, dropNode, dropPosition !== 0);
	const handleTreeDrop: NonNullable<TreeProps<ProjectTreeNode>["onDrop"]> = (
		info,
	): void => {
		const dragNode: ProjectTreeNode = info.dragNode;
		const dropNode: ProjectTreeNode = info.node;
		if (!canDropTreeNode(dragNode, dropNode, info.dropToGap === true)) {
			return;
		}
		const targetPosition: number = Number.parseInt(
			(info.node as ProjectTreeNode & { pos: string }).pos
				.split("-")
				.at(-1) ?? "0",
			10,
		);
		const relativeDropPosition: number = info.dropPosition - targetPosition;
		const placement: WorkspaceTreeDropPlacement =
			relativeDropPosition < 0 ? "before" : "after";
		if (
			dragNode.kind === "workspace" &&
			dropNode.kind === "workspace" &&
			dragNode.workspaceId !== undefined &&
			dropNode.workspaceId !== undefined
		) {
			persistWorkspaceTreeOrder(
				moveWorkspaceInTreeOrder(
					workspaceTreeOrderRef.current,
					dragNode.workspaceId,
					dropNode.workspaceId,
					placement,
				),
			);
			return;
		}
		if (
			dragNode.kind === "session" &&
			dropNode.kind === "session" &&
			dragNode.sectionKey === "projects" &&
			dropNode.sectionKey === "projects" &&
			dragNode.workspaceId !== undefined &&
			dragNode.workspaceId === dropNode.workspaceId &&
			dragNode.sessionId !== undefined &&
			dropNode.sessionId !== undefined
		) {
			persistWorkspaceTreeOrder(
				moveSessionInTreeOrder(
					workspaceTreeOrderRef.current,
					dragNode.workspaceId,
					dragNode.sessionId,
					dropNode.sessionId,
					placement,
				),
			);
			return;
		}
		if (
			dragNode.kind === "session" &&
			dropNode.kind === "session" &&
			dragNode.sectionKey !== undefined &&
			dragNode.sectionKey !== "projects" &&
			dragNode.sectionKey === dropNode.sectionKey &&
			dragNode.sessionId !== undefined &&
			dropNode.sessionId !== undefined
		) {
			persistWorkspaceTreeOrder(
				moveSectionSessionInTreeOrder(
					workspaceTreeOrderRef.current,
					dragNode.sectionKey,
					dragNode.sessionId,
					dropNode.sessionId,
					placement,
				),
			);
		}
	};
	const handleTreeDragStart: NonNullable<
		TreeProps<ProjectTreeNode>["onDragStart"]
	> = ({ event, node }): void => {
		const treeNode: ProjectTreeNode = node;
		if (treeNode.kind !== "session" || treeNode.sessionId === undefined) {
			return;
		}
		draggingSessionIdRef.current = treeNode.sessionId;
		setDraggingSessionId(treeNode.sessionId);
		event.dataTransfer.setData(
			"application/x-daedalus-session-id",
			treeNode.sessionId,
		);
		event.dataTransfer.effectAllowed = "move";
	};
	const handleTreeDragEnd: NonNullable<
		TreeProps<ProjectTreeNode>["onDragEnd"]
	> = (): void => {
		draggingSessionIdRef.current = null;
		setDraggingSessionId(null);
		setDropTargetWorkspaceId(null);
	};
	const isTreeNodeDraggable = (node: TreeDataNode): boolean => {
		const treeNode: ProjectTreeNode = node as ProjectTreeNode;
		if (treeNode.kind === "workspace") {
			return effectiveWorkspaceTreeOrder.workspaceIds.length > 1;
		}
		if (treeNode.kind !== "session" || treeNode.sectionKey === undefined) {
			return false;
		}
		const targetSession: SessionMetadata | undefined = sessions.find(
			(candidate: SessionMetadata): boolean =>
				candidate.id === treeNode.sessionId,
		);
		const movableToAnotherWorkspace: boolean =
			targetSession !== undefined &&
			targetSession.worktree === undefined &&
			!runningSessionIdSet.has(targetSession.id) &&
			movingSessionId === null &&
			orderedWorkspaces.some(
				(workspace: WorkspaceConfig): boolean =>
					workspace.id !==
					getSessionProjectWorkspaceId(targetSession),
			);
		if (treeNode.sectionKey === "pinned") {
			return (
				movableToAnotherWorkspace ||
				effectiveWorkspaceTreeOrder.pinnedSessionIds.length > 1
			);
		}
		if (treeNode.sectionKey === "recent") {
			return (
				movableToAnotherWorkspace ||
				effectiveWorkspaceTreeOrder.recentSessionIds.length > 1
			);
		}
		return (
			movableToAnotherWorkspace ||
			(treeNode.workspaceId !== undefined &&
				(effectiveWorkspaceTreeOrder.sessionIdsByWorkspace[
					treeNode.workspaceId
				]?.length ?? 0) > 1)
		);
	};
	const sectionItems: CollapseProps["items"] = [
		{
			key: "pinned",
			label: labels.pinned,
			children: (
				<Tree<ProjectTreeNode>
					blockNode
					virtual={false}
					classNames={{
						root: styles.projectTree,
						item: `${styles.projectTreeItem} ${styles.treeItemPaddingLeft}`,
						itemTitle: styles.projectTreeTitle,
						itemSwitcher: styles.projectTreeSwitcher,
					}}
					treeData={pinnedTreeData}
					selectedKeys={effectiveSelectedMenuKeys}
					draggable={{
						icon: false,
						nodeDraggable: isTreeNodeDraggable,
					}}
					allowDrop={allowTreeDrop}
					onSelect={handleProjectTreeSelect}
					onDrop={handleTreeDrop}
					onDragStart={handleTreeDragStart}
					onDragEnd={handleTreeDragEnd}
				/>
			),
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
						data-studio-new-project="true"
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
						itemSwitcher: styles.projectTreeSwitcher,
					}}
					treeData={projectTreeData}
					expandedKeys={openWorkspaceKeys}
					selectedKeys={effectiveSelectedMenuKeys}
					draggable={{
						icon: false,
						nodeDraggable: isTreeNodeDraggable,
					}}
					allowDrop={allowTreeDrop}
					onExpand={handleProjectTreeExpand}
					onSelect={handleProjectTreeSelect}
					onDrop={handleTreeDrop}
					onDragStart={handleTreeDragStart}
					onDragEnd={handleTreeDragEnd}
					switcherIcon={(nodeProps) => {
						const workspace: WorkspaceConfig | undefined = (
							nodeProps as { workspace?: WorkspaceConfig }
						).workspace;
						return workspace === undefined
							? null
							: getWorkspaceTreeSwitcherIcon(
									workspace,
									nodeProps.expanded,
								);
					}}
				/>
			),
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
			children: (
				<Tree<ProjectTreeNode>
					blockNode
					virtual={false}
					classNames={{
						root: styles.projectTree,
						item: `${styles.projectTreeItem} ${styles.treeItemPaddingLeft}`,
						itemTitle: styles.projectTreeTitle,
						itemSwitcher: styles.projectTreeSwitcher,
					}}
					treeData={recentTreeData}
					selectedKeys={effectiveSelectedMenuKeys}
					draggable={{
						icon: false,
						nodeDraggable: isTreeNodeDraggable,
					}}
					allowDrop={allowTreeDrop}
					onSelect={handleProjectTreeSelect}
					onDrop={handleTreeDrop}
					onDragStart={handleTreeDragStart}
					onDragEnd={handleTreeDragEnd}
				/>
			),
		},
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
				return currentSessions.filter(
					(session: SessionMetadata): boolean =>
						session.id !== sessionUpdate.id,
				);
			}
			const existingIndex: number = currentSessions.findIndex(
				(session: SessionMetadata): boolean =>
					session.id === sessionUpdate.id,
			);
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
		<div className={styles.workspaceTreeRegion} data-studio-workspace-tree="true">
			{messageContextHolder}

			{workspaceError !== null ? (
				<Alert
					type="error"
					showIcon={true}
					description={workspaceError}
					closable={{
						onClose: (): void => setWorkspaceError(null),
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
							className={`collapseExpandIcon ${isActive ? "collapseExpandIconActive" : ""}`}
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
					setWorkspaces((currentWorkspaces): WorkspaceConfig[] =>
						currentWorkspaces.map(
							(currentWorkspace): WorkspaceConfig =>
								currentWorkspace.id === updatedWorkspace.id
									? updatedWorkspace
									: currentWorkspace,
						),
					);
					setSessions((currentSessions): SessionMetadata[] =>
						currentSessions.map(
							(currentSession): SessionMetadata =>
								getSessionProjectWorkspaceId(currentSession) ===
								updatedWorkspace.id
									? {
											...currentSession,
											workspaceName:
												updatedWorkspace.name,
											workspaceRoot:
												updatedWorkspace.rootPath,
										}
									: currentSession,
						),
					);
					setEditTargetWorkspace(null);
					onWorkspaceUpdate?.(updatedWorkspace);
				}}
				onRequestDelete={(workspace: WorkspaceConfig): void =>
					setDeleteTargetWorkspace(workspace)
				}
			/>

			<Modal
				open={permanentWorktreeTarget !== null}
				title={t("workspaceTree.modals.createPermanentWorktree.title")}
				okText={t(
					"workspaceTree.modals.createPermanentWorktree.create",
				)}
				cancelText={t("workspaceTree.common.cancel")}
				confirmLoading={isCreatingPermanentWorktree}
				okButtonProps={{
					disabled: permanentWorktreeName.trim().length === 0,
				}}
				onCancel={(): void => {
					if (!isCreatingPermanentWorktree)
						setPermanentWorktreeTarget(null);
				}}
				onOk={(): void => {
					if (
						permanentWorktreeTarget === null ||
						permanentWorktreeName.trim().length === 0
					)
						return;
					setIsCreatingPermanentWorktree(true);
					void createPermanentWorktree({
						workspaceId: permanentWorktreeTarget.id,
						name: permanentWorktreeName.trim(),
						sources: permanentWorktreeSources,
					})
						.then(({ workspace }): void => {
							setWorkspaces((current): WorkspaceConfig[] => [
								...current,
								workspace,
							]);
							setPermanentWorktreeTarget(null);
							onWorkspaceProjectCreated?.(workspace);
						})
						.catch((error: unknown): void => {
							showWorkspaceOperationError(
								error,
								t(
									"workspaceTree.errors.createPermanentWorktree",
								),
							);
						})
						.finally((): void =>
							setIsCreatingPermanentWorktree(false),
						);
				}}
			>
				<Input
					value={permanentWorktreeName}
					placeholder={t(
						"workspaceTree.modals.createPermanentWorktree.placeholder",
					)}
					disabled={isCreatingPermanentWorktree}
					onChange={(event): void =>
						setPermanentWorktreeName(event.target.value)
					}
					onPressEnter={(): void => {
						const footerButton =
							document.querySelector<HTMLButtonElement>(
								".ant-modal-footer .ant-btn-primary",
							);
						footerButton?.click();
					}}
				/>
				{permanentWorktreeTarget === null ? null : (
					<WorktreeCreationOptions
						workspace={permanentWorktreeTarget}
						value={permanentWorktreeSources}
						disabled={isCreatingPermanentWorktree}
						onChange={setPermanentWorktreeSources}
					/>
				)}
			</Modal>

			<WorkspaceProjectDialog
				open={isCreateProjectOpen}
				workspace={null}
				onCancel={(): void => setIsCreateProjectOpen(false)}
				onSaved={(createdWorkspace: WorkspaceConfig): void => {
					setWorkspaces((currentWorkspaces): WorkspaceConfig[] =>
						currentWorkspaces.some(
							(workspace: WorkspaceConfig): boolean =>
								workspace.id === createdWorkspace.id,
						)
							? currentWorkspaces.map(
									(
										workspace: WorkspaceConfig,
									): WorkspaceConfig =>
										workspace.id === createdWorkspace.id
											? createdWorkspace
											: workspace,
								)
							: [...currentWorkspaces, createdWorkspace],
					);
					const currentOrder: WorkspaceTreeOrderPreferences =
						workspaceTreeOrderRef.current;
					if (
						!currentOrder.expandedWorkspaceIds.includes(
							createdWorkspace.id,
						)
					) {
						persistExpandedWorkspaceIds([
							...currentOrder.expandedWorkspaceIds,
							createdWorkspace.id,
						]);
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
				title={labels.deleteWorktreeTitle}
				open={deleteWorktreeTarget !== null}
				okText={labels.deleteWorktree}
				okButtonProps={{ danger: true }}
				confirmLoading={deletingWorktreeSessionId !== null}
				cancelButtonProps={{
					disabled: deletingWorktreeSessionId !== null,
				}}
				onOk={(): void => {
					void handleConfirmDeleteWorktree();
				}}
				onCancel={(): void => {
					if (deletingWorktreeSessionId === null)
						setDeleteWorktreeTarget(null);
				}}
			>
				<Typography.Paragraph>
					{labels.deleteWorktreeBody}
				</Typography.Paragraph>
			</Modal>

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
					<Typography.Text
						type="danger"
						className={styles.renameErrorText}
					>
						{renameError}
					</Typography.Text>
				) : null}
			</Modal>
		</div>
	);
}

export default WorkspaceTree;

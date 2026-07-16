import { useEffect, useMemo, useState } from "react";
import type { MouseEvent } from "react";
import { archiveSession, fetchSessions } from "@/api/session-api";
import { deleteWorkspace, fetchWorkspaces } from "@/api/workspace-api";
import type { DeleteWorkspaceResult } from "@/api/workspace-api";
import { Button, Dropdown, Menu, Modal, Tooltip, Typography } from "antd";
import type { MenuProps } from "antd";
import type { SessionMetadata, WorkspaceConfig } from "@/api/types";
import { Icon } from "@/assets/icons";
import styles from "./WorkspaceTree.module.css";

export type WorkspaceTreeProps = {
	refreshToken?: number;
	selectedSessionId?: string | null;
	selectedWorkspaceId?: string | null;
	onWorkspaceSelect?: (workspaceId: string) => void;
	onSessionSelect?: (session: SessionMetadata) => void;
	onSessionArchive?: (session: SessionMetadata) => void;
	onWorkspaceDelete?: (result: DeleteWorkspaceResult) => void;
};

type WorkspaceMenuItem = NonNullable<MenuProps["items"]>[number];
type WorkspaceMenuItems = NonNullable<MenuProps["items"]>;

type CreateSessionMenuItemOptions = {
	archivingSessionId: string | null;
	onArchive: (session: SessionMetadata, event: MouseEvent<HTMLElement>) => void;
};

type CreateWorkspaceMenuItemOptions = CreateSessionMenuItemOptions & {
	deletingWorkspaceId: string | null;
	onOpenInExplorer: (workspace: WorkspaceConfig) => void;
	onDeleteWorkspace: (workspace: WorkspaceConfig) => void;
};

function createSessionMenuItem(session: SessionMetadata, options: CreateSessionMenuItemOptions): WorkspaceMenuItem {
	const isArchiving: boolean = options.archivingSessionId === session.id;

	return {
		key: `session:${session.id}`,
		label: (
			<span className={styles.sessionMenuItem}>
				<span className={styles.sessionTitle}>{session.title}</span>
				<Tooltip title="Archive session" placement="right">
					<Button
						type="text"
						size="small"
						aria-label={`Archive ${session.title}`}
						className={styles.archiveButton}
						icon={<Icon name="archive" />}
						loading={isArchiving}
						onClick={(event: MouseEvent<HTMLElement>): void => options.onArchive(session, event)}
					/>
				</Tooltip>
			</span>
		)
	};
}

function createWorkspaceMenuItems(workspaces: WorkspaceConfig[], sessions: SessionMetadata[], options: CreateWorkspaceMenuItemOptions): WorkspaceMenuItems {
	const workspaceIds: Set<string> = new Set(workspaces.map((workspace: WorkspaceConfig): string => workspace.id));
	const workspaceItems: WorkspaceMenuItems = workspaces.map((workspace: WorkspaceConfig): WorkspaceMenuItem => {
		const workspaceSessions: SessionMetadata[] = sessions.filter((session: SessionMetadata): boolean => {
			return session.workspaceId === workspace.id;
		});
		const isDeleting: boolean = options.deletingWorkspaceId === workspace.id;
		const actionMenu: MenuProps = {
			items: [
				{
					key: "open",
					label: "Open in Explorer"
				},
				{
					key: "delete",
					label: "Delete",
					danger: true,
					disabled: options.deletingWorkspaceId !== null
				}
			],
			onClick: ({ key, domEvent }): void => {
				domEvent.preventDefault();
				domEvent.stopPropagation();

				if (key === "open") {
					options.onOpenInExplorer(workspace);
					return;
				}
				if (key === "delete") {
					options.onDeleteWorkspace(workspace);
				}
			}
		};

		return {
			key: `workspace:${workspace.id}`,
			label: (
				<span className={styles.workspaceMenuItem}>
					<span className={styles.workspaceTitle}>{workspace.name}</span>
					<Dropdown menu={actionMenu} trigger={["click"]} placement="bottomRight">
						<Button
							type="text"
							size="small"
							aria-label={`Workspace actions for ${workspace.name}`}
							icon={<Icon name="more" width={16} height={16} />}
							loading={isDeleting}
							onClick={(event: MouseEvent<HTMLElement>): void => {
								event.preventDefault();
								event.stopPropagation();
							}}
						/>
					</Dropdown>
				</span>
			),
			icon: <Icon name="folder" />,
			children: workspaceSessions.length > 0
				? workspaceSessions.map((session: SessionMetadata): WorkspaceMenuItem => createSessionMenuItem(session, options))
				: [
					{
						key: `workspace:${workspace.id}:empty`,
						label: "No sessions",
						disabled: true
					}
				]
		};
	});
	const unmatchedSessions: SessionMetadata[] = sessions.filter((session: SessionMetadata): boolean => {
		return session.workspaceId === undefined || !workspaceIds.has(session.workspaceId);
	});

	if (unmatchedSessions.length === 0) {
		return workspaceItems;
	}

	return [
		...workspaceItems,
		{
			key: "session-group:unmatched",
			label: workspaces.length === 0 ? "Sessions" : "Other sessions",
			type: "group",
			children: unmatchedSessions.map((session: SessionMetadata): WorkspaceMenuItem => createSessionMenuItem(session, options))
		}
	];
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
	onWorkspaceSelect,
	onSessionSelect,
	onSessionArchive,
	onWorkspaceDelete
}: WorkspaceTreeProps): React.JSX.Element {
	const [workspaces, setWorkspaces] = useState<WorkspaceConfig[]>([]);
	const [sessions, setSessions] = useState<SessionMetadata[]>([]);
	const [activeWorkspaceId, setActiveWorkspaceId] = useState<string | null>(null);
	const [openWorkspaceKeys, setOpenWorkspaceKeys] = useState<string[]>([]);
	const [selectedMenuKeys, setSelectedMenuKeys] = useState<string[]>([]);
	const [isWorkspaceLoading, setIsWorkspaceLoading] = useState<boolean>(true);
	const [workspaceError, setWorkspaceError] = useState<string | null>(null);
	const [reloadIndex, setReloadIndex] = useState<number>(0);
	const [archivingSessionId, setArchivingSessionId] = useState<string | null>(null);
	const [deleteTargetWorkspace, setDeleteTargetWorkspace] = useState<WorkspaceConfig | null>(null);
	const [deletingWorkspaceId, setDeletingWorkspaceId] = useState<string | null>(null);

	const handleMenuClick: MenuProps["onClick"] = ({ key }): void => {
		const selectedKey: string = String(key);

		setSelectedMenuKeys([selectedKey]);

		if (selectedKey.startsWith("workspace:")) {
			const workspaceId: string = selectedKey.slice("workspace:".length);

			setActiveWorkspaceId(workspaceId);
			onWorkspaceSelect?.(workspaceId);
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

	const handleOpenChange: MenuProps["onOpenChange"] = (keys: string[]): void => {
		setOpenWorkspaceKeys(keys);

		const latestWorkspaceKey: string | undefined = keys.find((key: string): boolean => {
			return !openWorkspaceKeys.includes(key) && key.startsWith("workspace:");
		});

		if (latestWorkspaceKey === undefined) {
			return;
		}

		const workspaceId: string = latestWorkspaceKey.slice("workspace:".length);

		setActiveWorkspaceId(workspaceId);
		onWorkspaceSelect?.(workspaceId);
	};

	async function handleArchiveSession(session: SessionMetadata, event: MouseEvent<HTMLElement>): Promise<void> {
		event.preventDefault();
		event.stopPropagation();

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
			setWorkspaceError(error instanceof Error ? error.message : "归档会话失败");
		} finally {
			setArchivingSessionId(null);
		}
	}

	async function handleOpenWorkspaceInExplorer(workspace: WorkspaceConfig): Promise<void> {
		try {
			setWorkspaceError(null);
			await window.electronAPI.workspaceFs.openWorkspaceDirectory(workspace.rootPath);
		} catch (error: unknown) {
			setWorkspaceError(error instanceof Error ? error.message : "Failed to open workspace directory");
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

			setWorkspaces((currentWorkspaces: WorkspaceConfig[]): WorkspaceConfig[] => {
				return currentWorkspaces.filter((currentWorkspace: WorkspaceConfig): boolean => currentWorkspace.id !== workspace.id);
			});
			setSessions((currentSessions: SessionMetadata[]): SessionMetadata[] => {
				return currentSessions.filter((session: SessionMetadata): boolean => !deletedSessionIds.has(session.id));
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
			onWorkspaceDelete?.(result);
		} catch (error: unknown) {
			setWorkspaceError(error instanceof Error ? error.message : "Failed to delete workspace");
		} finally {
			setDeletingWorkspaceId(null);
		}
	}

	useEffect((): (() => void) => {
		let cancelled: boolean = false;
		let retryTimer: number | null = null;

		async function loadWorkspaceTree(): Promise<void> {
			try {
				setIsWorkspaceLoading(true);
				setWorkspaceError(null);

				const [workspaceList, sessionList] = await Promise.all([
					fetchWorkspaces(),
					fetchSessions()
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

				setWorkspaces(workspaceList.workspaces);
				setSessions(sessionList.sessions);
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
					setWorkspaceError(error instanceof Error ? error.message : "加载工作区失败");
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
	}, [refreshToken, reloadIndex]);

	const workspaceMenuItems: WorkspaceMenuItems = useMemo((): WorkspaceMenuItems => {
		return createWorkspaceMenuItems(workspaces, sessions, {
			archivingSessionId,
			deletingWorkspaceId,
			onArchive: (session: SessionMetadata, event: MouseEvent<HTMLElement>): void => {
				void handleArchiveSession(session, event);
			},
			onOpenInExplorer: (workspace: WorkspaceConfig): void => {
				void handleOpenWorkspaceInExplorer(workspace);
			},
			onDeleteWorkspace: (workspace: WorkspaceConfig): void => {
				setDeleteTargetWorkspace(workspace);
			}
		});
	}, [archivingSessionId, deletingWorkspaceId, sessions, workspaces]);
	const effectiveSelectedMenuKeys: string[] = getSelectedMenuKeys(selectedSessionId, selectedWorkspaceId, selectedMenuKeys);

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

	return (
		<div className={styles.workspaceTreeRegion}>
			{isWorkspaceLoading ? (
				<div className={styles.workspaceStatusRow}>
					<Typography.Text type="secondary" className={styles.workspaceStatusText}>
						Loading...
					</Typography.Text>
				</div>
			) : null}

			{workspaceError ? (
				<Typography.Text type="danger" className={styles.workspaceErrorText}>
					{workspaceError}
				</Typography.Text>
			) : null}

			<div className={styles.workspaceMenuScroller}>
				{!isWorkspaceLoading && !workspaceError && workspaceMenuItems.length === 0 ? (
					<Typography.Text type="secondary" className={styles.workspaceEmptyText}>
						No workspaces
					</Typography.Text>
				) : (
					<Menu
						className={styles.workspaceMenu}
						inlineIndent={8}
						mode="inline"
						expandIcon={(): null => null}
						items={workspaceMenuItems}
						openKeys={openWorkspaceKeys}
						selectedKeys={effectiveSelectedMenuKeys}
						onOpenChange={handleOpenChange}
						onClick={handleMenuClick}
					/>
				)}
			</div>

			<Modal
				title="Delete workspace?"
				open={deleteTargetWorkspace !== null}
				okText="Delete"
				okButtonProps={{ danger: true }}
				confirmLoading={deletingWorkspaceId !== null}
				onOk={(): void => {
					void handleConfirmDeleteWorkspace();
				}}
				onCancel={(): void => {
					if (deletingWorkspaceId === null) {
						setDeleteTargetWorkspace(null);
					}
				}}
			>
				This will delete the workspace from Daedalus and permanently delete its sessions. It will not delete files from your Godot project folder.
			</Modal>
		</div>
	);
}

export default WorkspaceTree;

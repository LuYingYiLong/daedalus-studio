import { useEffect, useMemo, useState } from "react";
import type { MouseEvent } from "react";
import { archiveSession, fetchSessions } from "@/api/session-api";
import { fetchWorkspaces } from "@/api/workspace-api";
import { Button, Menu, Tooltip, Typography } from "antd";
import type { MenuProps } from "antd";
import type { SessionMetadata, WorkspaceConfig } from "@/api/types";
import { Icon } from "@/assets/icons";
import styles from "./WorkspaceTree.module.css";

export type WorkspaceTreeProps = {
	refreshToken?: number;
	onWorkspaceSelect?: (workspaceId: string) => void;
	onSessionSelect?: (session: SessionMetadata) => void;
	onSessionArchive?: (session: SessionMetadata) => void;
};

type WorkspaceMenuItem = NonNullable<MenuProps["items"]>[number];
type WorkspaceMenuItems = NonNullable<MenuProps["items"]>;

type CreateSessionMenuItemOptions = {
	archivingSessionId: string | null;
	onArchive: (session: SessionMetadata, event: MouseEvent<HTMLElement>) => void;
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

function createWorkspaceMenuItems(workspaces: WorkspaceConfig[], sessions: SessionMetadata[], options: CreateSessionMenuItemOptions): WorkspaceMenuItems {
	const workspaceIds: Set<string> = new Set(workspaces.map((workspace: WorkspaceConfig): string => workspace.id));
	const workspaceItems: WorkspaceMenuItems = workspaces.map((workspace: WorkspaceConfig): WorkspaceMenuItem => {
		const workspaceSessions: SessionMetadata[] = sessions.filter((session: SessionMetadata): boolean => {
			return session.workspaceId === workspace.id;
		});

		return {
			key: `workspace:${workspace.id}`,
			label: workspace.name,
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

function WorkspaceTree({ refreshToken = 0, onWorkspaceSelect, onSessionSelect, onSessionArchive }: WorkspaceTreeProps): React.JSX.Element {
	const [workspaces, setWorkspaces] = useState<WorkspaceConfig[]>([]);
	const [sessions, setSessions] = useState<SessionMetadata[]>([]);
	const [activeWorkspaceId, setActiveWorkspaceId] = useState<string | null>(null);
	const [openWorkspaceKeys, setOpenWorkspaceKeys] = useState<string[]>([]);
	const [selectedMenuKeys, setSelectedMenuKeys] = useState<string[]>([]);
	const [isWorkspaceLoading, setIsWorkspaceLoading] = useState<boolean>(true);
	const [workspaceError, setWorkspaceError] = useState<string | null>(null);
	const [reloadIndex, setReloadIndex] = useState<number>(0);
	const [archivingSessionId, setArchivingSessionId] = useState<string | null>(null);

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
				setSelectedMenuKeys([]);
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
			onArchive: (session: SessionMetadata, event: MouseEvent<HTMLElement>): void => {
				void handleArchiveSession(session, event);
			}
		});
	}, [archivingSessionId, sessions, workspaces]);

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

			{!isWorkspaceLoading && !workspaceError && workspaceMenuItems.length === 0 ? (
				<Typography.Text type="secondary" className={styles.workspaceEmptyText}>
					No workspaces
				</Typography.Text>
			) : (
				<Menu
					className={`daedalus-compact-menu ${styles.menu}`}
					inlineIndent={8}
					mode="inline"
					items={workspaceMenuItems}
					openKeys={openWorkspaceKeys}
					selectedKeys={selectedMenuKeys}
					onOpenChange={handleOpenChange}
					onClick={handleMenuClick}
				/>
			)}
		</div>
	);
}

export default WorkspaceTree;

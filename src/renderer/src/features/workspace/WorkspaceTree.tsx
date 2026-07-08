import { useEffect, useMemo, useState } from "react";
import type { Key } from "react";
import type { DataNode } from "antd/es/tree";
import { fetchSessions } from "@/api/session-api";
import { fetchWorkspaces } from "@/api/workspace-api";
import { Button, Tree, Typography } from "antd";
import type { SessionMetadata, WorkspaceConfig } from "@/api/types";
import { Icon } from "@/assets/icons";
import styles from "./WorkspaceTree.module.css";

export type WorkspaceTreeProps = {
	onWorkspaceSelect?: (workspaceId: string) => void;
	onSessionSelect?: (sessionId: string) => void;
};

function createWorkspaceTreeData(workspaces: WorkspaceConfig[], sessions: SessionMetadata[]): DataNode[] {
	return workspaces.map((workspace: WorkspaceConfig): DataNode => {
		const workspaceSessions: SessionMetadata[] = sessions.filter((session: SessionMetadata): boolean => {
			return session.workspaceId === workspace.id;
		});

		return {
			key: `workspace:${workspace.id}`,
			title: workspace.name,
			children: workspaceSessions.length > 0
				? workspaceSessions.map((session: SessionMetadata): DataNode => ({
					key: `session:${session.id}`,
					title: session.title
				}))
				: [
					{
						key: `workspace:${workspace.id}:empty`,
						title: "No sessions",
						disabled: true
					}
				]
		};
	});
}

function WorkspaceTree({ onWorkspaceSelect, onSessionSelect }: WorkspaceTreeProps): React.JSX.Element {
	const [workspaces, setWorkspaces] = useState<WorkspaceConfig[]>([]);
	const [sessions, setSessions] = useState<SessionMetadata[]>([]);
	const [activeWorkspaceId, setActiveWorkspaceId] = useState<string | null>(null);
	const [expandedWorkspaceKeys, setExpandedWorkspaceKeys] = useState<Key[]>([]);
	const [selectedTreeKeys, setSelectedTreeKeys] = useState<Key[]>([]);
	const [isWorkspaceLoading, setIsWorkspaceLoading] = useState<boolean>(true);
	const [workspaceError, setWorkspaceError] = useState<string | null>(null);
	const [reloadIndex, setReloadIndex] = useState<number>(0);

	function handleTreeSelect(selectedKeys: Key[]): void {
		const selectedKey: string = String(selectedKeys[0] ?? "");

		if (!selectedKey) {
			setSelectedTreeKeys([]);
			return;
		}

		setSelectedTreeKeys(selectedKeys);

		if (selectedKey.startsWith("workspace:")) {
			const workspaceId: string = selectedKey.slice("workspace:".length);

			setActiveWorkspaceId(workspaceId);
			onWorkspaceSelect?.(workspaceId);
			return;
		}

		if (selectedKey.startsWith("session:")) {
			const sessionId: string = selectedKey.slice("session:".length);

			onSessionSelect?.(sessionId);
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
				setSelectedTreeKeys(workspaceList.active ? [`workspace:${workspaceList.active}`] : []);
				setExpandedWorkspaceKeys(workspaceList.workspaces.map((workspace: WorkspaceConfig): string => {
					return `workspace:${workspace.id}`;
				}));

				if (workspaceList.workspaces.length === 0 && reloadIndex < 5) {
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
	}, [reloadIndex]);

	const workspaceTreeData: DataNode[] = useMemo((): DataNode[] => {
		return createWorkspaceTreeData(workspaces, sessions);
	}, [sessions, workspaces]);

	return (
		<div className={styles.workspaceTreeRegion}>
			<div className={styles.workspaceTitleRow}>
				<Typography.Title level={5} className={styles.workspaceTitle}>
					Workspace
				</Typography.Title>
				{isWorkspaceLoading ? (
					<Typography.Text type="secondary" className={styles.workspaceStatusText}>
						Loading...
					</Typography.Text>
				) : (
					<Button
						size="small"
						type="text"
						className={styles.workspaceRefreshButton}
						onClick={(): void => {
							setReloadIndex((currentReloadIndex: number): number => currentReloadIndex + 1);
						}}
					>
						Refresh
					</Button>
				)}
			</div>

			{workspaceError ? (
				<Typography.Text type="danger" className={styles.workspaceErrorText}>
					{workspaceError}
				</Typography.Text>
			) : null}

			{!isWorkspaceLoading && !workspaceError && workspaceTreeData.length === 0 ? (
				<Typography.Text type="secondary" className={styles.workspaceEmptyText}>
					No workspaces
				</Typography.Text>
			) : (
				<Tree
					className={styles.workspaceTree}
					blockNode={true}
					expandedKeys={expandedWorkspaceKeys}
					selectedKeys={selectedTreeKeys}
					treeData={workspaceTreeData}
					onExpand={(keys: Key[]): void => {
						setExpandedWorkspaceKeys(keys);
					}}
					switcherIcon={<Icon name="folder" />}

					onSelect={handleTreeSelect}
				/>
			)}
		</div>
	)
}

export default WorkspaceTree;

import { useEffect, useMemo, useState } from "react";
import type { MouseEvent } from "react";
import { Button, Empty, Input, Menu, Modal, Popconfirm, Select, Space, Tag, Tooltip, Typography } from "antd";
import type { MenuProps } from "antd";
import { deleteArchivedSession, fetchArchivedSessions, restoreArchivedSession } from "@/api/session-api";
import { fetchWorkspaces } from "@/api/workspace-api";
import type { SessionMetadata, WorkspaceConfig } from "@/api/types";
import { Icon } from "@/assets/icons";
import styles from "./ArchivedSessionSettingsPage.module.css";

const ALL_WORKSPACES_KEY = "__all__";
const UNKNOWN_WORKSPACE_KEY = "__unknown__";

type ArchivedSessionMenuItem = NonNullable<MenuProps["items"]>[number];
type ArchivedSessionMenuItems = NonNullable<MenuProps["items"]>;
type SessionAction = "restore" | "delete";

function getWorkspaceFilterKey(session: SessionMetadata): string {
	return session.workspaceId ?? UNKNOWN_WORKSPACE_KEY;
}

function getWorkspaceLabel(session: SessionMetadata, workspacesById: Map<string, WorkspaceConfig>): string {
	if (session.workspaceId === undefined) {
		return "No workspace";
	}

	return session.workspaceName ?? workspacesById.get(session.workspaceId)?.name ?? session.workspaceId;
}

function formatArchivedAt(session: SessionMetadata): string {
	return session.archivedAt ?? session.updatedAt;
}

type CreateArchivedSessionMenuItemOptions = {
	workspacesById: Map<string, WorkspaceConfig>;
	busySessionId: string | null;
	busyAction: SessionAction | null;
	onRestore: (session: SessionMetadata, event: MouseEvent<HTMLElement>) => void;
	onDelete: (session: SessionMetadata, event?: MouseEvent<HTMLElement>) => void;
};

function createArchivedSessionMenuItem(session: SessionMetadata, options: CreateArchivedSessionMenuItemOptions): ArchivedSessionMenuItem {
	const isRestoring: boolean = options.busySessionId === session.id && options.busyAction === "restore";
	const isDeleting: boolean = options.busySessionId === session.id && options.busyAction === "delete";

	return {
		key: `archived:${session.id}`,
		label: (
			<span className={styles.sessionMenuItem}>
				<span className={styles.sessionText}>
					<span className={styles.sessionTitle}>{session.title}</span>
					<span className={styles.sessionMeta}>
						{getWorkspaceLabel(session, options.workspacesById)} · {formatArchivedAt(session)}
					</span>
				</span>
				<span className={styles.sessionActions}>
					<Tooltip title="Unarchive session" placement="top">
						<Button
							type="text"
							size="small"
							shape="circle"
							aria-label={`Unarchive ${session.title}`}
							icon={<Icon name="unarchive" width={16} height={16} />}
							loading={isRestoring}
							disabled={options.busySessionId !== null && !isRestoring}
							onClick={(event: MouseEvent<HTMLElement>): void => options.onRestore(session, event)}
						/>
					</Tooltip>
					<Popconfirm
						title="Delete archived session?"
						description="This permanently deletes this archived session."
						okText="Delete"
						okButtonProps={{ danger: true, loading: isDeleting }}
						onConfirm={(): void => options.onDelete(session)}
					>
						<Tooltip title="Delete session" placement="top">
							<Button
								type="text"
								size="small"
								shape="circle"
								danger={true}
								aria-label={`Delete ${session.title}`}
								icon={<Icon name="remove" width={16} height={16}/>}
								loading={isDeleting}
								disabled={options.busySessionId !== null && !isDeleting}
								onClick={(event: MouseEvent<HTMLElement>): void => {
									event.preventDefault();
									event.stopPropagation();
								}}
							/>
						</Tooltip>
					</Popconfirm>
				</span>
			</span>
		)
	};
}

function ArchivedSessionSettingsPage(): React.JSX.Element {
	const [workspaces, setWorkspaces] = useState<WorkspaceConfig[]>([]);
	const [archivedSessions, setArchivedSessions] = useState<SessionMetadata[]>([]);
	const [workspaceFilter, setWorkspaceFilter] = useState<string>(ALL_WORKSPACES_KEY);
	const [searchText, setSearchText] = useState<string>("");
	const [isLoading, setIsLoading] = useState<boolean>(true);
	const [errorMessage, setErrorMessage] = useState<string | null>(null);
	const [busySessionId, setBusySessionId] = useState<string | null>(null);
	const [busyAction, setBusyAction] = useState<SessionAction | null>(null);
	const [deleteAllOpen, setDeleteAllOpen] = useState<boolean>(false);
	const [isDeletingAll, setIsDeletingAll] = useState<boolean>(false);

	useEffect((): (() => void) => {
		let cancelled: boolean = false;

		async function loadArchivedSessions(): Promise<void> {
			try {
				setIsLoading(true);
				setErrorMessage(null);

				const [workspaceList, archivedList] = await Promise.all([
					fetchWorkspaces(),
					fetchArchivedSessions()
				]);

				if (cancelled) {
					return;
				}

				setWorkspaces(workspaceList.workspaces);
				setArchivedSessions(archivedList.archivedSessions);
			} catch (error: unknown) {
				if (!cancelled) {
					setErrorMessage(error instanceof Error ? error.message : "Failed to load archived sessions");
				}
			} finally {
				if (!cancelled) {
					setIsLoading(false);
				}
			}
		}

		void loadArchivedSessions();

		return (): void => {
			cancelled = true;
		};
	}, []);

	const workspacesById: Map<string, WorkspaceConfig> = useMemo((): Map<string, WorkspaceConfig> => {
		return new Map(workspaces.map((workspace: WorkspaceConfig): [string, WorkspaceConfig] => [workspace.id, workspace]));
	}, [workspaces]);

	const workspaceOptions = useMemo((): Array<{ label: string; value: string }> => {
		const options: Array<{ label: string; value: string }> = [
			{ label: "All", value: ALL_WORKSPACES_KEY }
		];
		const seenWorkspaceIds: Set<string> = new Set<string>();

		for (const session of archivedSessions) {
			if (session.workspaceId === undefined) {
				continue;
			}
			seenWorkspaceIds.add(session.workspaceId);
		}

		for (const workspaceId of seenWorkspaceIds) {
			options.push({
				label: workspacesById.get(workspaceId)?.name ?? archivedSessions.find((session: SessionMetadata): boolean => session.workspaceId === workspaceId)?.workspaceName ?? workspaceId,
				value: workspaceId
			});
		}

		if (archivedSessions.some((session: SessionMetadata): boolean => session.workspaceId === undefined)) {
			options.push({ label: "No workspace", value: UNKNOWN_WORKSPACE_KEY });
		}

		return options;
	}, [archivedSessions, workspacesById]);

	const filteredSessions: SessionMetadata[] = useMemo((): SessionMetadata[] => {
		const normalizedSearch: string = searchText.trim().toLowerCase();

		return archivedSessions.filter((session: SessionMetadata): boolean => {
			if (workspaceFilter !== ALL_WORKSPACES_KEY && getWorkspaceFilterKey(session) !== workspaceFilter) {
				return false;
			}
			if (normalizedSearch.length === 0) {
				return true;
			}

			return session.title.toLowerCase().includes(normalizedSearch);
		});
	}, [archivedSessions, searchText, workspaceFilter]);

	const menuItems: ArchivedSessionMenuItems = useMemo((): ArchivedSessionMenuItems => {
		return filteredSessions.map((session: SessionMetadata): ArchivedSessionMenuItem => {
			return createArchivedSessionMenuItem(session, {
				workspacesById,
				busySessionId,
				busyAction,
				onRestore: (targetSession: SessionMetadata, event: MouseEvent<HTMLElement>): void => {
					void handleRestoreSession(targetSession, event);
				},
				onDelete: (targetSession: SessionMetadata, event?: MouseEvent<HTMLElement>): void => {
					void handleDeleteSession(targetSession, event);
				}
			});
		});
	}, [busyAction, busySessionId, filteredSessions, workspacesById]);

	async function handleRestoreSession(session: SessionMetadata, event: MouseEvent<HTMLElement>): Promise<void> {
		event.preventDefault();
		event.stopPropagation();

		if (busySessionId !== null || isDeletingAll) {
			return;
		}

		try {
			setBusySessionId(session.id);
			setBusyAction("restore");
			setErrorMessage(null);
			await restoreArchivedSession(session.id);
			setArchivedSessions((currentSessions: SessionMetadata[]): SessionMetadata[] => {
				return currentSessions.filter((currentSession: SessionMetadata): boolean => currentSession.id !== session.id);
			});
		} catch (error: unknown) {
			setErrorMessage(error instanceof Error ? error.message : "Failed to unarchive session");
		} finally {
			setBusySessionId(null);
			setBusyAction(null);
		}
	}

	async function handleDeleteSession(session: SessionMetadata, event?: MouseEvent<HTMLElement>): Promise<void> {
		event?.preventDefault();
		event?.stopPropagation();

		if (busySessionId !== null || isDeletingAll) {
			return;
		}

		try {
			setBusySessionId(session.id);
			setBusyAction("delete");
			setErrorMessage(null);
			await deleteArchivedSession(session.id);
			setArchivedSessions((currentSessions: SessionMetadata[]): SessionMetadata[] => {
				return currentSessions.filter((currentSession: SessionMetadata): boolean => currentSession.id !== session.id);
			});
		} catch (error: unknown) {
			setErrorMessage(error instanceof Error ? error.message : "Failed to delete archived session");
		} finally {
			setBusySessionId(null);
			setBusyAction(null);
		}
	}

	async function handleDeleteAll(): Promise<void> {
		if (filteredSessions.length === 0) {
			setDeleteAllOpen(false);
			return;
		}

		const sessionIds: string[] = filteredSessions.map((session: SessionMetadata): string => session.id);

		try {
			setIsDeletingAll(true);
			setErrorMessage(null);
			await Promise.all(sessionIds.map((sessionId: string): Promise<unknown> => deleteArchivedSession(sessionId)));
			setArchivedSessions((currentSessions: SessionMetadata[]): SessionMetadata[] => {
				const deletedIds: Set<string> = new Set(sessionIds);

				return currentSessions.filter((session: SessionMetadata): boolean => !deletedIds.has(session.id));
			});
			setDeleteAllOpen(false);
		} catch (error: unknown) {
			setErrorMessage(error instanceof Error ? error.message : "Failed to delete archived sessions");
		} finally {
			setIsDeletingAll(false);
		}
	}

	return (
		<section className={styles.page}>
			<header className={styles.header}>
				<div className={styles.titleRow}>
					<Typography.Title level={3} className={styles.title}>
						Archived sessions
					</Typography.Title>
					<Tag>{archivedSessions.length}</Tag>
				</div>
				<Space.Compact className={styles.spaceCompact}>
					<Input
						allowClear={true}
						prefix={<Icon name="search" />}
						placeholder="Search session..."
						value={searchText}
						className={styles.searchBox}
						onChange={(event: React.ChangeEvent<HTMLInputElement>): void => setSearchText(event.target.value)}
					/>
					<Select
						className={styles.workspaceSelect}
						value={workspaceFilter}
						options={workspaceOptions}
						onChange={(value: string): void => setWorkspaceFilter(value)}
					/>
					<Button
						color="danger"
						variant="solid"
						icon={<Icon name="remove" />}
						disabled={filteredSessions.length === 0 || isLoading || busySessionId !== null}
						onClick={(): void => setDeleteAllOpen(true)}
					>
						Delete all
					</Button>
				</Space.Compact>
			</header>

			{errorMessage !== null ? (
				<Typography.Text type="danger" className={styles.errorText}>
					{errorMessage}
				</Typography.Text>
			) : null}

			<div className={styles.menuScroller}>
				{isLoading ? (
					<Typography.Text type="secondary" className={styles.emptyText}>
						Loading archived sessions...
					</Typography.Text>
				) : filteredSessions.length === 0 ? (
					<Empty
						image={<Icon name="empty" />}
						description={archivedSessions.length === 0 ? "No archived sessions" : "No matching archived sessions"}
					/>
				) : (
					<Menu
						className={styles.archivedMenu}
						inlineIndent={8}
						mode="inline"
						selectable={false}
						items={menuItems}
					/>
				)}
			</div>

			<Modal
				title="Delete archived sessions?"
				open={deleteAllOpen}
				okText="Delete all"
				okButtonProps={{ danger: true }}
				confirmLoading={isDeletingAll}
				onOk={(): void => {
					void handleDeleteAll();
				}}
				onCancel={(): void => setDeleteAllOpen(false)}
			>
				This will permanently delete {filteredSessions.length} archived session{filteredSessions.length === 1 ? "" : "s"} matching the current filter.
			</Modal>
		</section>
	);
}

export default ArchivedSessionSettingsPage;

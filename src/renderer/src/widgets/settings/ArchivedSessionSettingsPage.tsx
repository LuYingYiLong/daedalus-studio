import { useEffect, useMemo, useState } from "react";
import type { MouseEvent } from "react";
import { useTranslation } from "react-i18next";
import {
	Button,
	Empty,
	Flex,
	Input,
	Menu,
	Modal,
	Popconfirm,
	Select,
	Space,
	Tag,
	Tooltip,
	Typography,
} from "antd";
import type { MenuProps } from "antd";
import {
	deleteArchivedSession,
	deleteSessionWorktree,
	fetchArchivedSessions,
	restoreArchivedSession,
} from "@/platform/rpc/session-api";
import { fetchWorkspaces } from "@/platform/rpc/workspace-api";
import type { SessionMetadata, WorkspaceConfig } from "@/platform/rpc/types";
import {
	createDefaultSessionLayout,
	listTerminalRuntimeIds,
} from "@/domain/session/session-layout";
import { Icon } from "@/assets/icons";
import styles from "./ArchivedSessionSettingsPage.module.css";

const ALL_WORKSPACES_KEY = "__all__";
const UNKNOWN_WORKSPACE_KEY = "__unknown__";

type ArchivedSessionMenuItem = NonNullable<MenuProps["items"]>[number];
type ArchivedSessionMenuItems = NonNullable<MenuProps["items"]>;
type SessionAction = "restore" | "delete" | "delete-worktree";

type ArchivedSessionLabels = {
	all: string;
	delete: string;
	deleteAll: string;
	deleteConfirmDescription: string;
	deleteConfirmTitle: string;
	failedDeleteAll: string;
	failedDeleteSession: string;
	failedLoad: string;
	failedRestore: string;
	deleteWorktree: string;
	failedDeleteWorktree: string;
	noWorkspace: string;
	restore: string;
	deleteAria: (sessionTitle: string) => string;
	restoreAria: (sessionTitle: string) => string;
};

function getWorkspaceFilterKey(session: SessionMetadata): string {
	return (
		session.worktree?.sourceWorkspaceId ??
		session.workspaceId ??
		UNKNOWN_WORKSPACE_KEY
	);
}

function getWorkspaceLabel(
	session: SessionMetadata,
	workspacesById: Map<string, WorkspaceConfig>,
	noWorkspaceLabel: string,
): string {
	const workspaceId: string | undefined =
		session.worktree?.sourceWorkspaceId ?? session.workspaceId;
	if (workspaceId === undefined) {
		return noWorkspaceLabel;
	}

	return (
		session.worktree?.sourceWorkspaceName ??
		session.workspaceName ??
		workspacesById.get(workspaceId)?.name ??
		workspaceId
	);
}

function formatArchivedAt(session: SessionMetadata): string {
	return session.archivedAt ?? session.updatedAt;
}

type CreateArchivedSessionMenuItemOptions = {
	workspacesById: Map<string, WorkspaceConfig>;
	busySessionId: string | null;
	busyAction: SessionAction | null;
	labels: ArchivedSessionLabels;
	onRestore: (
		session: SessionMetadata,
		event: MouseEvent<HTMLElement>,
	) => void;
	onDelete: (
		session: SessionMetadata,
		event?: MouseEvent<HTMLElement>,
	) => void;
	onDeleteWorktree: (
		session: SessionMetadata,
		event?: MouseEvent<HTMLElement>,
	) => void;
};

function createArchivedSessionMenuItem(
	session: SessionMetadata,
	options: CreateArchivedSessionMenuItemOptions,
): ArchivedSessionMenuItem {
	const isRestoring: boolean =
		options.busySessionId === session.id &&
		options.busyAction === "restore";
	const isDeleting: boolean =
		options.busySessionId === session.id && options.busyAction === "delete";
	const isDeletingWorktree: boolean =
		options.busySessionId === session.id &&
		options.busyAction === "delete-worktree";

	return {
		key: `archived:${session.id}`,
		label: (
			<span className={styles.sessionMenuItem}>
				<span className={styles.sessionText}>
					<span className={styles.sessionTitle}>{session.title}</span>
					<span className={styles.sessionMeta}>
						{getWorkspaceLabel(
							session,
							options.workspacesById,
							options.labels.noWorkspace,
						)}{" "}
						- {formatArchivedAt(session)}
					</span>
				</span>
				<span className={styles.sessionActions}>
					{session.worktree !== undefined ? (
						<Popconfirm
							title={options.labels.deleteWorktree}
							description={
								options.labels.deleteConfirmDescription
							}
							okText={options.labels.deleteWorktree}
							okButtonProps={{
								danger: true,
								loading: isDeletingWorktree,
							}}
							onConfirm={(): void =>
								options.onDeleteWorktree(session)
							}
						>
							<Button
								type="text"
								size="small"
								danger={true}
								loading={isDeletingWorktree}
								disabled={
									options.busySessionId !== null &&
									!isDeletingWorktree
								}
							>
								{options.labels.deleteWorktree}
							</Button>
						</Popconfirm>
					) : null}
					<Tooltip title={options.labels.restore} placement="top">
						<Button
							type="text"
							size="small"
							aria-label={options.labels.restoreAria(
								session.title,
							)}
							loading={isRestoring}
							disabled={
								options.busySessionId !== null && !isRestoring
							}
							onClick={(event: MouseEvent<HTMLElement>): void =>
								options.onRestore(session, event)
							}
						>
							{options.labels.restore}
						</Button>
					</Tooltip>
					<Popconfirm
						title={options.labels.deleteConfirmTitle}
						description={options.labels.deleteConfirmDescription}
						okText={options.labels.delete}
						okButtonProps={{ danger: true, loading: isDeleting }}
						onConfirm={(): void => options.onDelete(session)}
					>
						<Button
							type="text"
							size="small"
							shape="circle"
							danger={true}
							aria-label={options.labels.deleteAria(
								session.title,
							)}
							icon={<Icon name="remove" width={16} height={16} />}
							loading={isDeleting}
							disabled={
								(options.busySessionId !== null &&
									!isDeleting) ||
								session.worktree !== undefined
							}
							onClick={(event: MouseEvent<HTMLElement>): void => {
								event.preventDefault();
								event.stopPropagation();
							}}
						/>
					</Popconfirm>
				</span>
			</span>
		),
	};
}

function createArchivedSessionMenuGroups(
	sessions: SessionMetadata[],
	options: CreateArchivedSessionMenuItemOptions,
): ArchivedSessionMenuItems {
	const groups: Map<string, { label: string; sessions: SessionMetadata[] }> =
		new Map();

	for (const session of sessions) {
		const workspaceKey: string = getWorkspaceFilterKey(session);
		const existingGroup = groups.get(workspaceKey);
		if (existingGroup !== undefined) {
			existingGroup.sessions.push(session);
			continue;
		}

		groups.set(workspaceKey, {
			label: getWorkspaceLabel(
				session,
				options.workspacesById,
				options.labels.noWorkspace,
			),
			sessions: [session],
		});
	}

	return Array.from(groups.entries()).map(
		([workspaceKey, group]): ArchivedSessionMenuItem => ({
			type: "group",
			key: `archived-workspace:${workspaceKey}`,
			label: group.label,
			children: group.sessions.map(
				(session: SessionMetadata): ArchivedSessionMenuItem =>
					createArchivedSessionMenuItem(session, options),
			),
		}),
	);
}

function ArchivedSessionSettingsPage(): React.JSX.Element | null {
	const { t } = useTranslation();
	const [workspaces, setWorkspaces] = useState<WorkspaceConfig[]>([]);
	const [archivedSessions, setArchivedSessions] = useState<SessionMetadata[]>(
		[],
	);
	const [workspaceFilter, setWorkspaceFilter] =
		useState<string>(ALL_WORKSPACES_KEY);
	const [searchText, setSearchText] = useState<string>("");
	const [isLoading, setIsLoading] = useState<boolean>(true);
	const [errorMessage, setErrorMessage] = useState<string | null>(null);
	const [busySessionId, setBusySessionId] = useState<string | null>(null);
	const [busyAction, setBusyAction] = useState<SessionAction | null>(null);
	const [deleteAllOpen, setDeleteAllOpen] = useState<boolean>(false);
	const [isDeletingAll, setIsDeletingAll] = useState<boolean>(false);
	const [catalogRevision, setCatalogRevision] = useState<number>(0);
	const labels: ArchivedSessionLabels = useMemo((): ArchivedSessionLabels => {
		return {
			all: t("settings.archivedSessions.filters.all"),
			delete: t("settings.archivedSessions.actions.delete"),
			deleteAll: t("settings.archivedSessions.actions.deleteAll"),
			deleteConfirmDescription: t(
				"settings.archivedSessions.confirm.deleteSession.description",
			),
			deleteConfirmTitle: t(
				"settings.archivedSessions.confirm.deleteSession.title",
			),
			failedDeleteAll: t("settings.archivedSessions.errors.deleteAll"),
			failedDeleteSession: t(
				"settings.archivedSessions.errors.deleteSession",
			),
			failedLoad: t("settings.archivedSessions.errors.load"),
			failedRestore: t("settings.archivedSessions.errors.restore"),
			deleteWorktree: t("workspaceTree.actions.deleteWorktree"),
			failedDeleteWorktree: t("workspaceTree.errors.deleteWorktree"),
			noWorkspace: t("settings.archivedSessions.filters.noWorkspace"),
			restore: t("settings.archivedSessions.actions.restore"),
			deleteAria: (sessionTitle: string): string =>
				t("settings.archivedSessions.aria.delete", { sessionTitle }),
			restoreAria: (sessionTitle: string): string =>
				t("settings.archivedSessions.aria.restore", { sessionTitle }),
		};
	}, [t]);

	useEffect((): (() => void) => {
		return window.electronAPI.sessionCatalog.onChanged((): void => {
			setCatalogRevision(
				(currentRevision: number): number => currentRevision + 1,
			);
		});
	}, []);

	useEffect((): (() => void) => {
		let cancelled: boolean = false;

		async function loadArchivedSessions(): Promise<void> {
			try {
				setIsLoading(true);
				setErrorMessage(null);

				const [workspaceList, archivedList] = await Promise.all([
					fetchWorkspaces(),
					fetchArchivedSessions(),
				]);

				if (cancelled) {
					return;
				}

				setWorkspaces(workspaceList.workspaces);
				setArchivedSessions(archivedList.archivedSessions);
			} catch (error: unknown) {
				if (!cancelled) {
					setErrorMessage(
						error instanceof Error
							? error.message
							: labels.failedLoad,
					);
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
	}, [catalogRevision, labels.failedLoad]);

	const workspacesById: Map<string, WorkspaceConfig> = useMemo((): Map<
		string,
		WorkspaceConfig
	> => {
		return new Map(
			workspaces.map(
				(workspace: WorkspaceConfig): [string, WorkspaceConfig] => [
					workspace.id,
					workspace,
				],
			),
		);
	}, [workspaces]);

	const workspaceOptions = useMemo((): Array<{
		label: string;
		value: string;
	}> => {
		const options: Array<{ label: string; value: string }> = [
			{ label: labels.all, value: ALL_WORKSPACES_KEY },
		];
		const seenWorkspaceIds: Set<string> = new Set<string>();

		for (const session of archivedSessions) {
			const workspaceId: string | undefined =
				session.worktree?.sourceWorkspaceId ?? session.workspaceId;
			if (workspaceId === undefined) {
				continue;
			}
			seenWorkspaceIds.add(workspaceId);
		}

		for (const workspaceId of seenWorkspaceIds) {
			options.push({
				label:
					workspacesById.get(workspaceId)?.name ??
					archivedSessions.find(
						(session: SessionMetadata): boolean =>
							getWorkspaceFilterKey(session) === workspaceId,
					)?.worktree?.sourceWorkspaceName ??
					archivedSessions.find(
						(session: SessionMetadata): boolean =>
							getWorkspaceFilterKey(session) === workspaceId,
					)?.workspaceName ??
					workspaceId,
				value: workspaceId,
			});
		}

		if (
			archivedSessions.some(
				(session: SessionMetadata): boolean =>
					getWorkspaceFilterKey(session) === UNKNOWN_WORKSPACE_KEY,
			)
		) {
			options.push({
				label: labels.noWorkspace,
				value: UNKNOWN_WORKSPACE_KEY,
			});
		}

		return options;
	}, [archivedSessions, labels.all, labels.noWorkspace, workspacesById]);

	const filteredSessions: SessionMetadata[] =
		useMemo((): SessionMetadata[] => {
			const normalizedSearch: string = searchText.trim().toLowerCase();

			return archivedSessions.filter(
				(session: SessionMetadata): boolean => {
					if (
						workspaceFilter !== ALL_WORKSPACES_KEY &&
						getWorkspaceFilterKey(session) !== workspaceFilter
					) {
						return false;
					}
					if (normalizedSearch.length === 0) {
						return true;
					}

					return session.title
						.toLowerCase()
						.includes(normalizedSearch);
				},
			);
		}, [archivedSessions, searchText, workspaceFilter]);

	const menuItems: ArchivedSessionMenuItems =
		useMemo((): ArchivedSessionMenuItems => {
			return createArchivedSessionMenuGroups(filteredSessions, {
				workspacesById,
				busySessionId,
				busyAction,
				labels,
				onRestore: (
					targetSession: SessionMetadata,
					event: MouseEvent<HTMLElement>,
				): void => {
					void handleRestoreSession(targetSession, event);
				},
				onDelete: (
					targetSession: SessionMetadata,
					event?: MouseEvent<HTMLElement>,
				): void => {
					void handleDeleteSession(targetSession, event);
				},
				onDeleteWorktree: (
					targetSession: SessionMetadata,
					event?: MouseEvent<HTMLElement>,
				): void => {
					void handleDeleteWorktree(targetSession, event);
				},
			});
		}, [
			busyAction,
			busySessionId,
			filteredSessions,
			labels,
			workspacesById,
		]);

	async function handleRestoreSession(
		session: SessionMetadata,
		event: MouseEvent<HTMLElement>,
	): Promise<void> {
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
			window.electronAPI.sessionCatalog.notifyChanged();
			setArchivedSessions(
				(currentSessions: SessionMetadata[]): SessionMetadata[] => {
					return currentSessions.filter(
						(currentSession: SessionMetadata): boolean =>
							currentSession.id !== session.id,
					);
				},
			);
		} catch (error: unknown) {
			setErrorMessage(
				error instanceof Error ? error.message : labels.failedRestore,
			);
		} finally {
			setBusySessionId(null);
			setBusyAction(null);
		}
	}

	async function handleDeleteSession(
		session: SessionMetadata,
		event?: MouseEvent<HTMLElement>,
	): Promise<void> {
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
			void window.electronAPI.sessionLayout
				.remove({ sessionIds: [session.id] })
				.catch((error: unknown): void => {
					console.error(
						"[ArchivedSessionSettingsPage] remove session layout failed",
						error,
					);
				});
			setArchivedSessions(
				(currentSessions: SessionMetadata[]): SessionMetadata[] => {
					return currentSessions.filter(
						(currentSession: SessionMetadata): boolean =>
							currentSession.id !== session.id,
					);
				},
			);
		} catch (error: unknown) {
			setErrorMessage(
				error instanceof Error
					? error.message
					: labels.failedDeleteSession,
			);
		} finally {
			setBusySessionId(null);
			setBusyAction(null);
		}
	}

	async function handleDeleteWorktree(
		session: SessionMetadata,
		event?: MouseEvent<HTMLElement>,
	): Promise<void> {
		event?.preventDefault();
		event?.stopPropagation();
		if (busySessionId !== null || isDeletingAll) {
			return;
		}
		try {
			setBusySessionId(session.id);
			setBusyAction("delete-worktree");
			setErrorMessage(null);
			const layouts = await window.electronAPI.sessionLayout.getAll();
			const layout = layouts[session.id] ?? createDefaultSessionLayout();
			for (const terminalId of listTerminalRuntimeIds(
				session.id,
				layout,
			)) {
				const terminalState =
					await window.electronAPI.terminal.getState({
						terminalId,
					});
				if (terminalState?.running === true) {
					throw new Error(
						t("workspaceTree.errors.worktreeTerminalActive"),
					);
				}
			}
			const result = await deleteSessionWorktree(session.id);
			setArchivedSessions((currentSessions): SessionMetadata[] =>
				currentSessions.map(
					(currentSession): SessionMetadata =>
						currentSession.id === result.metadata.id
							? result.metadata
							: currentSession,
				),
			);
		} catch (error: unknown) {
			setErrorMessage(
				error instanceof Error
					? error.message
					: labels.failedDeleteWorktree,
			);
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
		if (
			filteredSessions.some(
				(session: SessionMetadata): boolean =>
					session.worktree !== undefined,
			)
		) {
			setErrorMessage(labels.failedDeleteAll);
			setDeleteAllOpen(false);
			return;
		}

		const sessionIds: string[] = filteredSessions.map(
			(session: SessionMetadata): string => session.id,
		);

		try {
			setIsDeletingAll(true);
			setErrorMessage(null);
			await Promise.all(
				sessionIds.map(
					(sessionId: string): Promise<unknown> =>
						deleteArchivedSession(sessionId),
				),
			);
			void window.electronAPI.sessionLayout
				.remove({ sessionIds })
				.catch((error: unknown): void => {
					console.error(
						"[ArchivedSessionSettingsPage] remove session layouts failed",
						error,
					);
				});
			setArchivedSessions(
				(currentSessions: SessionMetadata[]): SessionMetadata[] => {
					const deletedIds: Set<string> = new Set(sessionIds);

					return currentSessions.filter(
						(session: SessionMetadata): boolean =>
							!deletedIds.has(session.id),
					);
				},
			);
			setDeleteAllOpen(false);
		} catch (error: unknown) {
			setErrorMessage(
				error instanceof Error ? error.message : labels.failedDeleteAll,
			);
		} finally {
			setIsDeletingAll(false);
		}
	}

	if (isLoading) {
		return null;
	}

	return (
		<section className={styles.page}>
			<header className={styles.header}>
				<Space>
					<Typography.Title level={3} className={styles.title}>
						{t("settings.archivedSessions.title")}
					</Typography.Title>
					<Tag>{archivedSessions.length}</Tag>
				</Space>
				<Flex className={styles.toolbar} gap="small" wrap={false}>
					<Input
						allowClear={true}
						prefix={<Icon name="search" />}
						placeholder={t(
							"settings.archivedSessions.searchPlaceholder",
						)}
						value={searchText}
						className={styles.searchBox}
						onChange={(
							event: React.ChangeEvent<HTMLInputElement>,
						): void => setSearchText(event.target.value)}
					/>
					<Select
						className={styles.selectBox}
						value={workspaceFilter}
						options={workspaceOptions}
						onChange={(value: string): void =>
							setWorkspaceFilter(value)
						}
					/>
					<Button
						color="danger"
						variant="solid"
						icon={<Icon name="remove" />}
						disabled={
							filteredSessions.length === 0 ||
							filteredSessions.some(
								(session: SessionMetadata): boolean =>
									session.worktree !== undefined,
							) ||
							isLoading ||
							busySessionId !== null
						}
						onClick={(): void => setDeleteAllOpen(true)}
					>
						{labels.deleteAll}
					</Button>
				</Flex>
			</header>

			{errorMessage !== null ? (
				<Typography.Text type="danger" className={styles.errorText}>
					{errorMessage}
				</Typography.Text>
			) : null}

			<div className={styles.menuScroller}>
				{filteredSessions.length === 0 ? (
					<Empty
						description={
							archivedSessions.length === 0
								? t("settings.archivedSessions.empty.none")
								: t("settings.archivedSessions.empty.noMatches")
						}
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
				title={t("settings.archivedSessions.confirm.deleteAll.title")}
				open={deleteAllOpen}
				okText={labels.deleteAll}
				okButtonProps={{ danger: true }}
				confirmLoading={isDeletingAll}
				onOk={(): void => {
					void handleDeleteAll();
				}}
				onCancel={(): void => setDeleteAllOpen(false)}
			>
				{t("settings.archivedSessions.confirm.deleteAll.description", {
					count: filteredSessions.length,
				})}
			</Modal>
		</section>
	);
}

export default ArchivedSessionSettingsPage;

import type { MouseEvent } from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
	App,
	Button,
	Empty,
	Input,
	InputNumber,
	Menu,
	Modal,
	Popconfirm,
	Space,
	Spin,
	Switch,
	Tag,
	Tooltip,
	Typography,
} from "antd";
import type { MenuProps } from "antd";
import { useTranslation } from "react-i18next";
import { Icon } from "@/assets/icons";
import {
	createPermanentWorktree,
	deletePermanentWorktree,
	getWorktreeSettings,
	listWorktreeStatuses,
	updateWorktreeSettings,
	type WorktreeHealthSnapshot,
	type WorktreeSettings,
} from "@/platform/rpc/environment-api";
import { deleteSessionWorktree } from "@/platform/rpc/session-api";
import type { SessionMetadata, WorkspaceConfig } from "@/platform/rpc/types";
import SettingsItem from "@/ui/SettingsItem";
import SettingsList from "@/ui/SettingsList";
import pageMotionStyles from "@/widgets/settings/components/SettingsPageMotion.module.css";
import styles from "./WorktreeSettings.module.css";

type StatusResult = Awaited<ReturnType<typeof listWorktreeStatuses>>;
type WorktreeMenuItem = {
	key: string;
	kind: "session" | "permanent";
	title: string;
	sourceWorkspaceId: string;
	health: WorktreeHealthSnapshot;
	session?: SessionMetadata;
	workspace?: WorkspaceConfig;
};

function healthColor(
	status: WorktreeHealthSnapshot["status"],
): "success" | "warning" | "error" {
	return status === "healthy"
		? "success"
		: status === "unavailable"
			? "warning"
			: "error";
}
function description(health: WorktreeHealthSnapshot): string {
	return (
		health.issues[0]?.message ??
		`${(health.diskBytes / 1024 / 1024).toFixed(1)} MiB`
	);
}

function WorktreeSettingsPage(): React.JSX.Element {
	const { t } = useTranslation();
	const { message } = App.useApp();
	const [result, setResult] = useState<StatusResult | null>(null);
	const [settings, setSettings] = useState<WorktreeSettings | null>(null);
	const [loading, setLoading] = useState(true);
	const [busyKey, setBusyKey] = useState<string | null>(null);
	const [createTarget, setCreateTarget] = useState<WorktreeMenuItem | null>(
		null,
	);
	const [newName, setNewName] = useState("");
	const load = useCallback(async (): Promise<void> => {
		setLoading(true);
		try {
			const [nextStatus, nextSettings] = await Promise.all([
				listWorktreeStatuses(),
				getWorktreeSettings(),
			]);
			setResult(nextStatus);
			setSettings(nextSettings);
		} catch (error: unknown) {
			void message.error(
				error instanceof Error
					? error.message
					: t("settings.worktrees.errors.load"),
			);
		} finally {
			setLoading(false);
		}
	}, [message, t]);
	useEffect((): void => {
		void load();
	}, [load]);
	const items = useMemo(
		(): WorktreeMenuItem[] =>
			result === null
				? []
				: [
						...result.sessions.map(
							(item): WorktreeMenuItem => ({
								key: `session:${item.session.id}`,
								kind: "session",
								title: item.session.title,
								sourceWorkspaceId:
									(
										item.session.worktree as
											| { sourceWorkspaceId?: string }
											| undefined
									)?.sourceWorkspaceId ?? "",
								health: item.health,
								session: item.session as SessionMetadata,
							}),
						),
						...result.permanent.map(
							(item): WorktreeMenuItem => ({
								key: `permanent:${item.workspace.id}`,
								kind: "permanent",
								title: item.workspace.name,
								sourceWorkspaceId:
									item.workspace.permanentWorktree
										?.sourceWorkspaceId ?? "",
								health: item.health,
								workspace: item.workspace,
							}),
						),
					],
		[result],
	);
	async function updateSettings(
		patch: Omit<Partial<WorktreeSettings>, "rootDirectory"> & {
			rootDirectory?: string | null;
		},
	): Promise<void> {
		if (settings === null) return;
		const previous = settings;
		const { rootDirectory, ...otherPatch } = patch;
		if (rootDirectory === null) {
			setSettings(previous);
		} else {
			setSettings({
				...previous,
				...otherPatch,
				...(rootDirectory === undefined ? {} : { rootDirectory }),
			});
		}
		try {
			setSettings(await updateWorktreeSettings(patch));
		} catch (error: unknown) {
			setSettings(previous);
			void message.error(
				error instanceof Error
					? error.message
					: t("settings.worktrees.errors.save"),
			);
		}
	}
	async function remove(item: WorktreeMenuItem): Promise<void> {
		setBusyKey(item.key);
		try {
			if (item.kind === "session" && item.session !== undefined)
				await deleteSessionWorktree(item.session.id);
			else if (item.workspace !== undefined)
				await deletePermanentWorktree(item.workspace.id);
			await load();
		} catch (error: unknown) {
			void message.error(
				error instanceof Error
					? error.message
					: t("settings.worktrees.errors.delete"),
			);
		} finally {
			setBusyKey(null);
		}
	}
	async function create(): Promise<void> {
		if (
			createTarget === null ||
			createTarget.sourceWorkspaceId === "" ||
			newName.trim() === ""
		)
			return;
		setBusyKey(createTarget.key);
		try {
			await createPermanentWorktree({
				workspaceId: createTarget.sourceWorkspaceId,
				name: newName.trim(),
			});
			setCreateTarget(null);
			setNewName("");
			await load();
		} catch (error: unknown) {
			void message.error(
				error instanceof Error
					? error.message
					: t("settings.worktrees.errors.create"),
			);
		} finally {
			setBusyKey(null);
		}
	}
	const menuItems: MenuProps["items"] = items.map((item) => ({
		key: item.key,
		label: (
			<span className={styles.worktreeMenuItem}>
				<span className={styles.worktreeText}>
					<span className={styles.worktreeTitle}>{item.title}</span>
					<span className={styles.worktreeMeta}>
						{description(item.health)}
					</span>
				</span>
				<span className={styles.worktreeActions}>
					<Tag color={item.kind === "permanent" ? "blue" : "default"}>
						{t(`settings.worktrees.kind.${item.kind}`)}
					</Tag>
					<Tag color={healthColor(item.health.status)}>
						{item.health.status}
					</Tag>
					<Tooltip title={t("settings.worktrees.create")}>
						<Button
							type="text"
							size="small"
							icon={<Icon name="add" />}
							onClick={(event: MouseEvent<HTMLElement>): void => {
								event.preventDefault();
								event.stopPropagation();
								setCreateTarget(item);
								setNewName(`${item.title} worktree`);
							}}
						/>
					</Tooltip>
					<Popconfirm
						title={t("settings.worktrees.deleteTitle")}
						description={t("settings.worktrees.deleteDescription")}
						onConfirm={(): Promise<void> => remove(item)}
					>
						<Button
							danger
							type="text"
							size="small"
							loading={busyKey === item.key}
							icon={<Icon name="remove" />}
							onClick={(event: MouseEvent<HTMLElement>): void => {
								event.preventDefault();
								event.stopPropagation();
							}}
						/>
					</Popconfirm>
				</span>
			</span>
		),
	}));
	return (
		<section className={`${styles.page} ${pageMotionStyles.enter}`}>
			<header className={styles.header}>
				<Typography.Title level={3} className={styles.title}>
					{t("settings.worktrees.title")}
				</Typography.Title>
			</header>
			<div className={styles.content}>
				{settings === null ? null : (
					<SettingsList title={t("settings.worktrees.preferences")}>
						<SettingsItem
							searchKey="item:worktrees.rootDirectory"
							title={t("settings.worktrees.rootDirectory")}
							description={settings.rootDirectory}
						>
							<Space.Compact>
								<Button
									icon={<Icon name="folder-open" />}
									onClick={(): void => {
										void window.electronAPI.workspaceFs
											.pickWorkspaceDirectory()
											.then((directory: string | null): void => {
												if (directory !== null) {
													void updateSettings({
														rootDirectory: directory,
													});
												}
											});
									}}
								>
									{t("settings.worktrees.browseRootDirectory")}
								</Button>
								<Tooltip title={t("settings.worktrees.resetRootDirectory")}>
									<Button
										aria-label={t(
											"settings.worktrees.resetRootDirectory",
										)}
										icon={<Icon name="reload" />}
										onClick={(): void => {
											void updateSettings({ rootDirectory: null });
										}}
									/>
								</Tooltip>
							</Space.Compact>
						</SettingsItem>
						<SettingsItem
							searchKey="item:worktrees.fetchBeforeCreate"
							title={t("settings.worktrees.fetchBeforeCreate")}
							description={t(
								"settings.worktrees.fetchBeforeCreateDescription",
							)}
						>
							<Switch
								checked={settings.fetchBeforeCreate}
								onChange={(value): void => {
									void updateSettings({
										fetchBeforeCreate: value,
									});
								}}
							/>
						</SettingsItem>
						<SettingsItem
							searchKey="item:worktrees.autoDelete"
							title={t("settings.worktrees.autoDelete")}
							description={t(
								"settings.worktrees.autoDeleteDescription",
							)}
						>
							<Switch
								checked={settings.autoDeleteManaged}
								onChange={(value): void => {
									void updateSettings({
										autoDeleteManaged: value,
									});
								}}
							/>
						</SettingsItem>
						<SettingsItem
							searchKey="item:worktrees.autoDeleteLimit"
							title={t("settings.worktrees.autoDeleteLimit")}
							description={t(
								"settings.worktrees.autoDeleteLimitDescription",
							)}
						>
							<InputNumber
								min={1}
								max={100}
								value={settings.autoDeleteLimit}
								disabled={!settings.autoDeleteManaged}
								onChange={(value): void => {
									if (typeof value === "number")
										void updateSettings({
											autoDeleteLimit: value,
										});
								}}
							/>
						</SettingsItem>
					</SettingsList>
				)}
				{loading ? (
					<div className={styles.loading}>
						<Spin />
					</div>
				) : items.length === 0 ? (
					<Empty description={t("settings.worktrees.empty")} />
				) : (
					<Menu
						className={styles.worktreeMenu}
						inlineIndent={8}
						mode="inline"
						selectable={false}
						items={menuItems}
					/>
				)}
			</div>
			<Modal
				title={t("settings.worktrees.createTitle")}
				open={createTarget !== null}
				confirmLoading={busyKey === createTarget?.key}
				onCancel={(): void => setCreateTarget(null)}
				onOk={(): void => {
					void create();
				}}
				mask={{ closable: false }}
			>
				<Input
					value={newName}
					onChange={(event): void => setNewName(event.target.value)}
					placeholder={t("settings.worktrees.createPlaceholder")}
				/>
			</Modal>
		</section>
	);
}

export default WorktreeSettingsPage;

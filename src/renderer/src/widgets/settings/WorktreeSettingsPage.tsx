import {
	App,
	Button,
	Empty,
	Popconfirm,
	Space,
	Spin,
	Tag,
	Typography,
} from "antd";
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Icon } from "@/assets/icons";
import {
	deletePermanentWorktree,
	listWorktreeStatuses,
	repairWorktree,
	type WorktreeHealthSnapshot,
} from "@/platform/rpc/environment-api";
import SettingsItem from "@/ui/SettingsItem";
import SettingsList from "@/ui/SettingsList";
import pageMotionStyles from "./SettingsPageMotion.module.css";
import styles from "./WorktreeSettings.module.css";

type StatusResult = Awaited<ReturnType<typeof listWorktreeStatuses>>;

function formatBytes(bytes: number): string {
	if (bytes < 1024) return `${bytes} B`;
	if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KiB`;
	if (bytes < 1024 * 1024 * 1024)
		return `${(bytes / 1024 / 1024).toFixed(1)} MiB`;
	return `${(bytes / 1024 / 1024 / 1024).toFixed(1)} GiB`;
}

function getHealthColor(
	status: WorktreeHealthSnapshot["status"],
): "success" | "warning" | "error" {
	return status === "healthy"
		? "success"
		: status === "unavailable"
			? "warning"
			: "error";
}

function getHealthDescription(health: WorktreeHealthSnapshot): string {
	const issue: string | undefined = health.issues[0]?.message;
	return issue === undefined
		? formatBytes(health.diskBytes)
		: `${formatBytes(health.diskBytes)} · ${issue}`;
}

function WorktreeSettingsPage(): React.JSX.Element {
	const { t } = useTranslation();
	const { message } = App.useApp();
	const [result, setResult] = useState<StatusResult | null>(null);
	const [loading, setLoading] = useState<boolean>(true);
	const [repairing, setRepairing] = useState<string | null>(null);
	const [deletingPermanent, setDeletingPermanent] = useState<string | null>(
		null,
	);
	const load = useCallback(async (): Promise<void> => {
		setLoading(true);
		try {
			setResult(await listWorktreeStatuses());
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

	async function repair(sessionId: string): Promise<void> {
		setRepairing(sessionId);
		try {
			await repairWorktree(sessionId);
			await load();
		} catch (error: unknown) {
			void message.error(
				error instanceof Error
					? error.message
					: t("settings.worktrees.errors.repair"),
			);
		} finally {
			setRepairing(null);
		}
	}

	async function deletePermanent(workspaceId: string): Promise<void> {
		setDeletingPermanent(workspaceId);
		try {
			await deletePermanentWorktree(workspaceId);
			await load();
		} catch (error: unknown) {
			void message.error(
				error instanceof Error
					? error.message
					: t("settings.worktrees.errors.delete"),
			);
		} finally {
			setDeletingPermanent(null);
		}
	}

	return (
		<section className={`${styles.page} ${pageMotionStyles.enter}`}>
			<header className={styles.header}>
				<Typography.Title level={3} className={styles.title}>
					{t("settings.worktrees.title")}
				</Typography.Title>
			</header>
			<div className={styles.content}>
				{loading ? (
					<div className={styles.loading}>
						<Spin />
					</div>
				) : result === null ? (
					<Empty />
				) : (
					<>
						<SettingsList title={t("settings.worktrees.sessions")}>
							{result.sessions.length === 0 ? (
								<div className={styles.emptyState}>
									<Empty
										image={Empty.PRESENTED_IMAGE_SIMPLE}
										description={t(
											"settings.worktrees.empty",
										)}
									/>
								</div>
							) : (
								result.sessions.map((item) => (
									<SettingsItem
										key={item.session.id}
										title={item.session.title}
										description={getHealthDescription(
											item.health,
										)}
									>
										<Space.Compact>
											<Tag
												color={getHealthColor(
													item.health.status,
												)}
											>
												{item.health.status}
											</Tag>
											<Button
												icon={<Icon name="reload" />}
												loading={
													repairing ===
													item.session.id
												}
												onClick={(): void => {
													void repair(
														item.session.id,
													);
												}}
											>
												{t("settings.worktrees.repair")}
											</Button>
										</Space.Compact>
									</SettingsItem>
								))
							)}
						</SettingsList>

						{result.operations.length > 0 ? (
							<SettingsList
								title={t("settings.worktrees.operations")}
							>
								{result.operations.map((operation) => (
									<SettingsItem
										key={operation.id}
										title={`${operation.type} · ${operation.stage}`}
										description={
											operation.error?.message ??
											operation.message ??
											`${Math.round(operation.progress * 100)}%`
										}
									>
										<Tag
											color={
												operation.status === "succeeded"
													? "success"
													: operation.status ===
														  "running"
														? "processing"
														: operation.status ===
															  "failed"
															? "error"
															: "default"
											}
										>
											{operation.status}
										</Tag>
									</SettingsItem>
								))}
							</SettingsList>
						) : null}

						<SettingsList title={t("settings.worktrees.permanent")}>
							{result.permanent.length === 0 ? (
								<div className={styles.emptyState}>
									<Empty
										image={Empty.PRESENTED_IMAGE_SIMPLE}
										description={t(
											"settings.worktrees.emptyPermanent",
										)}
									/>
								</div>
							) : (
								result.permanent.map((item) => (
									<SettingsItem
										key={item.workspace.id}
										title={item.workspace.name}
										description={getHealthDescription(
											item.health,
										)}
									>
										<Space.Compact>
											<Tag
												color={getHealthColor(
													item.health.status,
												)}
											>
												{item.health.status}
											</Tag>
											<Popconfirm
												title={t(
													"settings.worktrees.deletePermanentTitle",
												)}
												description={t(
													"settings.worktrees.deletePermanentDescription",
												)}
												onConfirm={(): Promise<void> =>
													deletePermanent(
														item.workspace.id,
													)
												}
											>
												<Button
													danger
													icon={
														<Icon name="remove" />
													}
													loading={
														deletingPermanent ===
														item.workspace.id
													}
												>
													{t(
														"settings.common.delete",
													)}
												</Button>
											</Popconfirm>
										</Space.Compact>
									</SettingsItem>
								))
							)}
						</SettingsList>

						{result.orphans.length > 0 ? (
							<SettingsList
								title={t("settings.worktrees.orphans")}
							>
								{result.orphans.map((path) => (
									<SettingsItem
										key={path}
										title={path}
										description={path}
									>
										<Typography.Text
											copyable={{ text: path }}
										>
											{t("filePanel.editorMenu.copy")}
										</Typography.Text>
									</SettingsItem>
								))}
							</SettingsList>
						) : null}
					</>
				)}
			</div>
		</section>
	);
}

export default WorktreeSettingsPage;

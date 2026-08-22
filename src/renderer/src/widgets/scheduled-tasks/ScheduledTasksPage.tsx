import { useCallback, useEffect, useMemo, useState } from "react";
import {
	App,
	Button,
	Drawer,
	Dropdown,
	Empty,
	Flex,
	Input,
	Popconfirm,
	Select,
	Space,
	Tag,
	Tooltip,
	Typography,
} from "antd";
import { useTranslation } from "react-i18next";
import type { MenuProps } from "antd";
import { Icon } from "@/assets/icons";
import type {
	ScheduledTask,
	ScheduledTaskRun,
} from "../../../../contracts/scheduled-tasks";
import styles from "./ScheduledTasksPage.module.css";
import ManualScheduledTaskModal from "./ManualScheduledTaskModal";

type Props = {
	onCreate: () => void;
	onOpenSession: (sessionId: string) => void;
	defaultWorkspaceId: string | null;
	defaultProviderId: string | null;
	defaultModelId: string | null;
	defaultReasoningEffort: string | null;
};

function formatDate(value: string | null, locale: string): string {
	return value === null
		? "—"
		: new Intl.DateTimeFormat(locale, {
				dateStyle: "medium",
				timeStyle: "short",
			}).format(new Date(value));
}

export default function ScheduledTasksPage({
	onCreate,
	onOpenSession,
	defaultWorkspaceId,
	defaultProviderId,
	defaultModelId,
	defaultReasoningEffort,
}: Props): React.JSX.Element {
	const { t, i18n } = useTranslation();
	const { message } = App.useApp();
	const [tasks, setTasks] = useState<ScheduledTask[]>([]);
	const [runs, setRuns] = useState<ScheduledTaskRun[]>([]);
	const [selected, setSelected] = useState<ScheduledTask | null>(null);
	const [query, setQuery] = useState("");
	const [filter, setFilter] = useState<
		"all" | "enabled" | "paused" | "attention"
	>("all");
	const [loadingId, setLoadingId] = useState<string | null>(null);
	const [platformSupported, setPlatformSupported] = useState(true);
	const [manualCreateOpen, setManualCreateOpen] = useState(false);

	const load = useCallback(async (): Promise<void> => {
		const [result, nextRuns] = await Promise.all([
			window.electronAPI.scheduledTasks.list(),
			window.electronAPI.scheduledTasks.listRuns(),
		]);
		setTasks(result.tasks);
		setRuns(nextRuns);
		setPlatformSupported(result.platformSupported);
	}, []);

	useEffect((): (() => void) => {
		void load();
		const offChanged = window.electronAPI.scheduledTasks.onChanged(
			(): void => {
				void load();
			},
		);
		const offRun = window.electronAPI.scheduledTasks.onRunUpdated(
			(): void => {
				void load();
			},
		);
		return (): void => {
			offChanged();
			offRun();
		};
	}, [load, selected]);

	const selectedRuns = useMemo(
		(): ScheduledTaskRun[] =>
			selected === null
				? []
				: runs.filter((run): boolean => run.taskId === selected.id),
		[runs, selected],
	);
	const latestRunByTask = useMemo((): Map<string, ScheduledTaskRun> => {
		const result = new Map<string, ScheduledTaskRun>();
		for (const run of runs)
			if (!result.has(run.taskId)) result.set(run.taskId, run);
		return result;
	}, [runs]);
	useEffect((): void => {
		if (selected === null) return;
		setSelected(
			tasks.find((task): boolean => task.id === selected.id) ?? null,
		);
	}, [tasks, selected?.id]);

	const visible = useMemo(
		(): ScheduledTask[] =>
			tasks.filter((task): boolean => {
				const matchesText =
					`${task.title}\n${task.prompt}\n${task.scheduleDescription}`
						.toLocaleLowerCase()
						.includes(query.trim().toLocaleLowerCase());
				if (!matchesText) return false;
				if (filter === "enabled") return task.enabled;
				if (filter === "paused") return !task.enabled;
				if (filter === "attention")
					return runs.some(
						(run): boolean =>
							run.taskId === task.id &&
							(run.status === "failed" ||
								run.status === "awaiting_approval"),
					);
				return true;
			}),
		[filter, query, runs, tasks],
	);
	const createMenuItems: MenuProps["items"] = [
		{ key: "ai", label: t("scheduledTasks.createWithAi") },
		{ key: "manual", label: t("scheduledTasks.createManually") },
	];
	const handleCreateMenu: MenuProps["onClick"] = ({ key }): void => {
		if (key === "ai") onCreate();
		else if (key === "manual") setManualCreateOpen(true);
	};

	const action = async (
		task: ScheduledTask,
		operation: "pause" | "resume" | "run" | "delete",
	): Promise<void> => {
		setLoadingId(task.id);
		try {
			if (operation === "pause")
				await window.electronAPI.scheduledTasks.pause(task.id);
			else if (operation === "resume")
				await window.electronAPI.scheduledTasks.resume(task.id);
			else if (operation === "run")
				await window.electronAPI.scheduledTasks.runNow(task.id);
			else await window.electronAPI.scheduledTasks.delete(task.id);
			if (operation === "delete") setSelected(null);
			await load();
		} catch (error: unknown) {
			void message.error(
				error instanceof Error ? error.message : String(error),
			);
		} finally {
			setLoadingId(null);
		}
	};

	return (
		<section className={styles.page}>
			<header className={styles.header}>
				<Flex gap="small" align="center">
					<Typography.Title level={3} style={{ margin: 0 }}>
						{t("scheduledTasks.title")}
					</Typography.Title>
					<Tag>
						{tasks.filter((task): boolean => task.enabled).length}
					</Tag>
				</Flex>
				<Space>
					<Input
						allowClear
						prefix={<Icon name="search" />}
						value={query}
						onChange={(event): void => setQuery(event.target.value)}
						placeholder={t("scheduledTasks.search")}
						style={{ width: 200 }}
					/>
					<Select
						value={filter}
						onChange={setFilter}
						options={["all", "enabled", "paused", "attention"].map(
							(value) => ({
								value,
								label: t(`scheduledTasks.filters.${value}`),
							}),
						)}
						style={{ width: 100 }}
					/>
					<Space.Compact>
						<Button
							type="primary"
							icon={<Icon name="add" />}
							disabled={!platformSupported}
							onClick={onCreate}
						>
							{t("scheduledTasks.createWithAi")}
						</Button>
						<Dropdown
							trigger={["click"]}
							menu={{
								items: createMenuItems,
								onClick: handleCreateMenu,
							}}
						>
							<Button
								type="primary"
								icon={<Icon name="arrow-down" />}
								disabled={!platformSupported}
							/>
						</Dropdown>
					</Space.Compact>
				</Space>
			</header>
			<div className={styles.content}>
				{!platformSupported ? (
					<Typography.Paragraph type="warning">
						{t("scheduledTasks.windowsOnly")}
					</Typography.Paragraph>
				) : null}
				{visible.length === 0 ? (
					<div className={styles.empty}>
						<Empty description={t("scheduledTasks.empty")}>
							<Button type="primary" onClick={onCreate}>
								{t("scheduledTasks.create")}
							</Button>
						</Empty>
					</div>
				) : (
					<div className={styles.list}>
						{visible.map(
							(task): React.JSX.Element => (
								<div
									key={task.id}
									className={styles.row}
									role="button"
									tabIndex={0}
									onClick={(): void => setSelected(task)}
									onKeyDown={(event): void => {
										if (event.key === "Enter")
											setSelected(task);
									}}
								>
									<div className={styles.rowMain}>
										<Typography.Text strong ellipsis>
											{task.title}
										</Typography.Text>
										<div className={styles.rowMeta}>
											<Tag>
												{t(
													`scheduledTasks.kind.${task.kind}`,
												)}
											</Tag>
											{latestRunByTask.has(task.id) ? (
												<Tag bordered={false}>
													{t(
														`scheduledTasks.status.${latestRunByTask.get(task.id)!.status}`,
													)}
												</Tag>
											) : null}
											<span>
												{task.scheduleDescription}
											</span>
											<span>
												{t("scheduledTasks.nextRun", {
													time: formatDate(
														task.nextRunAt,
														i18n.language,
													),
												})}
											</span>
										</div>
									</div>
									<div
										className={styles.actions}
										onClick={(event): void =>
											event.stopPropagation()
										}
									>
										<Tooltip
											title={t("scheduledTasks.runNow")}
										>
											<Button
												type="text"
												shape="circle"
												icon={<Icon name="play" />}
												disabled={!platformSupported}
												loading={loadingId === task.id}
												onClick={(): void => {
													void action(task, "run");
												}}
											/>
										</Tooltip>
										<Tooltip
											title={
												task.enabled
													? t("scheduledTasks.pause")
													: t("scheduledTasks.resume")
											}
										>
											<Button
												type="text"
												shape="circle"
												icon={
													<Icon
														name={
															task.enabled
																? "stop"
																: "play"
														}
													/>
												}
												disabled={
													!platformSupported &&
													!task.enabled
												}
												onClick={(): void => {
													void action(
														task,
														task.enabled
															? "pause"
															: "resume",
													);
												}}
											/>
										</Tooltip>
										<Popconfirm
											title={t(
												"scheduledTasks.deleteConfirm",
											)}
											onConfirm={(): void => {
												void action(task, "delete");
											}}
										>
											<Button
												danger
												type="text"
												shape="circle"
												icon={<Icon name="remove" />}
											/>
										</Popconfirm>
									</div>
								</div>
							),
						)}
					</div>
				)}
			</div>
			<Drawer
				open={selected !== null}
				onClose={(): void => setSelected(null)}
				title={selected?.title}
				size={520}
				styles={{ body: { padding: 20 } }}
			>
				{selected !== null ? (
					<div className={styles.drawerBody}>
						<Space wrap>
							<Tag>
								{t(`scheduledTasks.kind.${selected.kind}`)}
							</Tag>
							<Tag
								color={selected.enabled ? "success" : "default"}
							>
								{selected.enabled
									? t("scheduledTasks.enabled")
									: t("scheduledTasks.paused")}
							</Tag>
						</Space>
						<div>
							<Typography.Title level={5}>
								{t("scheduledTasks.prompt")}
							</Typography.Title>
							<div className={styles.prompt}>
								{selected.prompt}
							</div>
						</div>
						<div>
							<Typography.Title level={5}>
								{t("scheduledTasks.environment")}
							</Typography.Title>
							<Typography.Paragraph type="secondary">
								{selected.target?.kind === "existing_session"
									? t(
											"scheduledTasks.existingSessionTarget",
											{
												sessionId:
													selected.target.sessionId,
											},
										)
									: selected.context === null
										? t("scheduledTasks.noModel")
										: `${selected.context.workspaceId ?? t("scheduledTasks.noWorkspace")} · ${selected.context.provider}/${selected.context.model}${selected.context.reasoningEffort === null ? "" : ` · ${selected.context.reasoningEffort}`} · ${selected.context.executionPolicy === "auto_safe" ? t("scheduledTasks.autoSafe") : t("scheduledTasks.readOnly")}`}
							</Typography.Paragraph>
						</div>
						<div>
							<Typography.Title level={5}>
								{t("scheduledTasks.history")}
							</Typography.Title>
							{selectedRuns.length === 0 ? (
								<Empty
									image={Empty.PRESENTED_IMAGE_SIMPLE}
									description={t("scheduledTasks.noRuns")}
								/>
							) : (
								selectedRuns.map(
									(run): React.JSX.Element => (
										<div
											className={styles.run}
											key={run.id}
										>
											<Tag>
												{t(
													`scheduledTasks.status.${run.status}`,
												)}
											</Tag>
											<div>
												<Typography.Text>
													{run.summary ??
														run.error ??
														"—"}
												</Typography.Text>
												<br />
												<Typography.Text type="secondary">
													{formatDate(
														run.startedAt ??
															run.scheduledAt,
														i18n.language,
													)}
												</Typography.Text>
											</div>
											{run.sessionId !== undefined ? (
												<Button
													type="link"
													onClick={(): void =>
														onOpenSession(
															run.sessionId!,
														)
													}
												>
													{t(
														"scheduledTasks.openSession",
													)}
												</Button>
											) : null}
										</div>
									),
								)
							)}
						</div>
					</div>
				) : null}
			</Drawer>
			<ManualScheduledTaskModal
				open={manualCreateOpen}
				defaultWorkspaceId={defaultWorkspaceId}
				defaultProviderId={defaultProviderId}
				defaultModelId={defaultModelId}
				defaultReasoningEffort={defaultReasoningEffort}
				onCancel={(): void => setManualCreateOpen(false)}
				onCreated={async (): Promise<void> => {
					setManualCreateOpen(false);
					await load();
					void message.success(t("scheduledTasks.manual.created"));
				}}
			/>
		</section>
	);
}

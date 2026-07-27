import {
	Alert,
	App,
	Button,
	Empty,
	Flex,
	Popconfirm,
	Space,
	Table,
	Tag,
	Typography,
	type TableProps
} from "antd";
import { useInterval, useRequest } from "ahooks";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Icon } from "@/assets/icons";
import styles from "./GodotProjectsSettingsPage.module.css";

type ProjectAction =
	| "add"
	| "scan"
	| "upgrade-all"
	| "retry"
	| "install"
	| "repair"
	| "uninstall"
	| "enable"
	| "disable";

function statusColor(status: GodotProjectPluginStatus): string {
	switch (status) {
		case "current":
			return "success";
		case "outdated":
			return "processing";
		case "modified":
		case "pending":
		case "pending_restart":
			return "warning";
		case "failed":
			return "error";
		default:
			return "default";
	}
}

function GodotProjectsSettingsPage(): React.JSX.Element {
	const { t } = useTranslation();
	const { message } = App.useApp();
	const [result, setResult] = useState<GodotProjectScanResult | null>(null);
	const [activeAction, setActiveAction] = useState<string | null>(null);
	const {
		loading,
		error
	} = useRequest(
		async (): Promise<GodotProjectScanResult> => {
			const next: GodotProjectScanResult = await window.electronAPI.godotProjects.scan();
			setResult(next);
			return next;
		},
		{ onError: (): void => {} }
	);

	const runAction = async (
		action: ProjectAction,
		project: GodotProjectInfo | null = null
	): Promise<void> => {
		const actionKey: string = `${action}:${project?.id ?? "global"}`;
		setActiveAction(actionKey);
		try {
			let next: GodotProjectScanResult;
			switch (action) {
				case "add":
					next = await window.electronAPI.godotProjects.add();
					break;
				case "scan":
					next = await window.electronAPI.godotProjects.scan();
					break;
				case "upgrade-all":
					next = await window.electronAPI.godotProjects.upgradeAll();
					break;
				case "retry":
					next = await window.electronAPI.godotProjects.retryPending();
					break;
				case "install":
					next = await window.electronAPI.godotProjects.install(project!.path);
					break;
				case "repair":
					next = await window.electronAPI.godotProjects.repair(project!.path);
					break;
				case "uninstall":
					next = await window.electronAPI.godotProjects.uninstall(project!.path);
					break;
				case "enable":
					next = await window.electronAPI.godotProjects.setEnabled(project!.path, true);
					break;
				case "disable":
					next = await window.electronAPI.godotProjects.setEnabled(project!.path, false);
					break;
			}
			setResult(next);
			const operationQueued: boolean = next.projects.some((item: GodotProjectInfo): boolean =>
				item.status === "pending_restart" && (project === null || item.id === project.id)
			);
			void message.success(t(
				operationQueued ? "settings.godotProjects.operationQueued" : "settings.godotProjects.actionCompleted",
				{
					defaultValue: operationQueued
						? "Plugin change is staged. Close Godot and Studio will apply it automatically."
						: "Godot project updated."
				}
			));
		} catch (actionError: unknown) {
			void message.error(actionError instanceof Error ? actionError.message : String(actionError));
		} finally {
			setActiveAction(null);
		}
	};

	const actionLoading = (action: ProjectAction, project?: GodotProjectInfo): boolean =>
		activeAction === `${action}:${project?.id ?? "global"}`;

	const columns: TableProps<GodotProjectInfo>["columns"] = [
		{
			title: t("settings.godotProjects.columns.project", { defaultValue: "Project" }),
			key: "project",
			render: (_value, project): React.JSX.Element => (
				<div className={styles.projectCell}>
					<Typography.Text strong ellipsis={{ tooltip: project.name }}>
						{project.name}
					</Typography.Text>
					<Typography.Text type="secondary" ellipsis={{ tooltip: project.path }}>
						{project.path}
					</Typography.Text>
				</div>
			)
		},
		{
			title: t("settings.godotProjects.columns.godot", { defaultValue: "Godot" }),
			dataIndex: "godotVersion",
			width: 100,
			render: (value: string | null): React.ReactNode => value ?? "-"
		},
		{
			title: t("settings.godotProjects.columns.plugin", { defaultValue: "Plugin" }),
			key: "plugin",
			width: 128,
			render: (_value, project): React.ReactNode => project.pluginVersion ?? "-"
		},
		{
			title: t("settings.godotProjects.columns.status", { defaultValue: "Status" }),
			key: "status",
			width: 138,
			render: (_value, project): React.JSX.Element => (
				<Tag color={statusColor(project.status)}>
					{t(`settings.godotProjects.status.${project.status}`, {
						defaultValue: project.status.replaceAll("_", " ")
					})}
				</Tag>
			)
		},
		{
			title: t("settings.godotProjects.columns.actions", { defaultValue: "Actions" }),
			key: "actions",
			width: 280,
			render: (_value, project): React.JSX.Element => (
				<Space size="small" wrap>
					{project.status === "not_installed" ? (
						<Button size="small" type="primary" loading={actionLoading("install", project)} onClick={(): void => { void runAction("install", project); }}>
							{t("settings.godotProjects.actions.install", { defaultValue: "Install" })}
						</Button>
					) : null}
					{project.status === "outdated" || project.status === "pending" ? (
						<Button size="small" type="primary" loading={actionLoading("install", project)} onClick={(): void => { void runAction("install", project); }}>
							{t("settings.godotProjects.actions.upgrade", { defaultValue: "Upgrade" })}
						</Button>
					) : null}
					{project.status === "modified" || project.status === "failed" ? (
						<Popconfirm
							title={t("settings.godotProjects.confirmRepair", { defaultValue: "Replace the installed plugin with the bundled version?" })}
							onConfirm={(): void => { void runAction("repair", project); }}
						>
							<Button size="small" loading={actionLoading("repair", project)}>
								{t("settings.godotProjects.actions.repair", { defaultValue: "Repair" })}
							</Button>
						</Popconfirm>
					) : null}
					{project.pluginVersion !== null ? (
						<Button
							size="small"
							loading={actionLoading(project.enabled ? "disable" : "enable", project)}
							onClick={(): void => { void runAction(project.enabled ? "disable" : "enable", project); }}
						>
							{project.enabled ? t("settings.common.disable") : t("settings.common.enable")}
						</Button>
					) : null}
					{project.pluginVersion !== null ? (
						<Popconfirm
							title={t("settings.godotProjects.confirmUninstall", { defaultValue: "Uninstall Godot Daedalus from this project?" })}
							onConfirm={(): void => { void runAction("uninstall", project); }}
						>
							<Button danger size="small" loading={actionLoading("uninstall", project)}>
								{t("settings.godotProjects.actions.uninstall", { defaultValue: "Uninstall" })}
							</Button>
						</Popconfirm>
					) : null}
				</Space>
			)
		}
	];

	const hasPending: boolean = result?.projects.some((project: GodotProjectInfo): boolean =>
		project.status === "pending" || project.status === "pending_restart"
	) ?? false;
	const hasPendingRestart: boolean = result?.projects.some((project: GodotProjectInfo): boolean =>
		project.status === "pending_restart"
	) ?? false;

	useInterval((): void => {
		void window.electronAPI.godotProjects.scan().then(setResult).catch((): void => {});
	}, hasPendingRestart ? 5_000 : undefined);

	return (
		<section className={styles.page}>
			<Flex className={styles.header} align="center" justify="space-between" gap="small" wrap>
				<div>
					<Typography.Title level={3} className={styles.title}>
						{t("settings.godotProjects.title", { defaultValue: "Godot projects" })}
					</Typography.Title>
				</div>
				<Space wrap>
					{hasPending ? (
						<Button loading={actionLoading("retry")} onClick={(): void => { void runAction("retry"); }}>
							{t("settings.godotProjects.actions.retryPending", { defaultValue: "Retry pending" })}
						</Button>
					) : null}
					<Button loading={actionLoading("upgrade-all")} onClick={(): void => { void runAction("upgrade-all"); }}>
						{t("settings.godotProjects.actions.upgradeAll", { defaultValue: "Upgrade all" })}
					</Button>
					<Button icon={<Icon name="add" />} type="primary" loading={actionLoading("add")} onClick={(): void => { void runAction("add"); }}>
						{t("settings.godotProjects.actions.add", { defaultValue: "Add project" })}
					</Button>
					<Button loading={actionLoading("scan")} onClick={(): void => { void runAction("scan"); }}>
						{t("settings.godotProjects.actions.scan", { defaultValue: "Rescan" })}
					</Button>
				</Space>
			</Flex>

			{error !== undefined ? <Alert showIcon type="error" message={error.message} /> : null}
			{result?.plugin.errorMessage ? <Alert showIcon type="error" message={result.plugin.errorMessage} /> : null}
			{hasPendingRestart ? (
				<Alert
					showIcon
					type="warning"
					message={t("settings.godotProjects.pendingRestart", {
						defaultValue: "Plugin changes are waiting for Godot to close."
					})}
					description={t("settings.godotProjects.pendingRestartDescription", {
						defaultValue: "Studio has staged the plugin safely and will apply it automatically after all Godot editors have exited."
					})}
				/>
			) : null}
			{result?.plugin.available ? (
				<Alert
					showIcon
					type="info"
					message={t("settings.godotProjects.bundleReady", {
						defaultValue: "Bundled plugin {{version}} is bound to Studio {{studioVersion}}.",
						version: result.plugin.version,
						studioVersion: result.plugin.studioVersion
					})}
				/>
			) : null}

			<div className={styles.tableRegion}>
				<Table<GodotProjectInfo>
					rowKey="id"
					size="middle"
					columns={columns}
					dataSource={result?.projects ?? []}
					loading={loading}
					pagination={false}
					locale={{
						emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t("settings.godotProjects.empty", { defaultValue: "No Godot projects were found." })} />
					}}
				/>
			</div>
		</section>
	);
}

export default GodotProjectsSettingsPage;

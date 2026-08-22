import { Alert, Button, Space, Tag, Typography } from "antd";
import { useTranslation } from "react-i18next";
import { Icon } from "@/assets/icons";
import type { PluginRecord } from "@/platform/rpc/plugin-api";
import styles from "./plugins.module.css";

export function PluginRuntimeSection({
	plugin,
	busy,
	onRestart,
	onInstallDependencies,
}: {
	plugin: PluginRecord;
	busy: boolean;
	onRestart: () => void;
	onInstallDependencies: () => void;
}): React.JSX.Element {
	const { t } = useTranslation();
	const runtime = plugin.runtime;
	return (
		<div className={styles.runtimeSection}>
			<div className={styles.runtimeHeader}>
				<Typography.Text strong>
					{t("settings.plugins.runtime.title")}
				</Typography.Text>
				<Tag
					color={
						runtime?.status === "ready"
							? "success"
							: runtime?.status === "failed" || runtime?.status === "quarantined"
								? "error"
								: "default"
					}
				>
					{t(
						`settings.plugins.runtime.status.${runtime?.status ?? "stopped"}`,
					)}
				</Tag>
			</div>
			<Typography.Text type="secondary">
				{t("settings.plugins.runtime.capabilities", {
					tools: runtime?.registeredTools ?? 0,
					skills: runtime?.registeredSkills ?? 0,
					hooks: runtime?.registeredHooks ?? 0,
					mcp: runtime?.registeredMcpServers ?? 0,
				})}
			</Typography.Text>
			{runtime?.lastError ? (
				<Alert
					className={styles.runtimeAlert}
					type="error"
					showIcon
					message={runtime.lastError}
				/>
			) : null}
			<Space wrap className={styles.runtimeActions}>
				<Button
					icon={<Icon name="reload" />}
					loading={busy}
					onClick={onRestart}
				>
					{t("settings.plugins.runtime.restart")}
				</Button>
				{runtime?.dependencyStatus === "needs_network" ? (
					<Button
						type="primary"
						loading={busy}
						onClick={onInstallDependencies}
					>
						{t("settings.plugins.runtime.installDependencies")}
					</Button>
				) : null}
			</Space>
		</div>
	);
}

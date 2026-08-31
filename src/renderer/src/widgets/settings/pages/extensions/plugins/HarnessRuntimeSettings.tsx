import { Alert, Descriptions, Space, Tag, Typography } from "antd";
import { useTranslation } from "react-i18next";
import type { HarnessConfigResult } from "@/platform/rpc/plugin-api";

export function HarnessRuntimeSettings({ value }: { value: HarnessConfigResult | null }): React.JSX.Element {
	const { t } = useTranslation();
	if (value === null) return <></>;
	const { config, installation } = value;
	const statusColor = installation.status === "detected" ? "success" : installation.status === "needs_setup" ? "warning" : installation.status === "failed" ? "error" : "default";
	return (
		<Space orientation="vertical" size="small" style={{ width: "100%" }}>
			<Descriptions size="small" column={1} bordered>
				<Descriptions.Item label={t("settings.plugins.harness.status")}>
					<Tag color={statusColor}>{t(`settings.plugins.harness.statuses.${installation.status}`)}</Tag>
				</Descriptions.Item>
				<Descriptions.Item label={t("settings.plugins.harness.version")}>
					{installation.version ?? "—"}
				</Descriptions.Item>
				<Descriptions.Item label={t("settings.plugins.harness.bridgeVersion")}>
					{config.bridgeProtocolVersion}
				</Descriptions.Item>
				<Descriptions.Item label={t("settings.plugins.harness.network")}>
					<Typography.Text type="secondary">{t("settings.plugins.harness.networkDisabled")}</Typography.Text>
				</Descriptions.Item>
			</Descriptions>
			{installation.error && (config.enabled || installation.status !== "unconfigured") ? (
				<Alert type={installation.status === "needs_setup" ? "warning" : "error"} showIcon title={installation.error} />
			) : null}
		</Space>
	);
}

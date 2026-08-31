import { Alert, Descriptions, Space, Tag, Typography } from "antd";
import { useTranslation } from "react-i18next";
import type { PluginRecord } from "@/platform/rpc/plugin-api";

export function HarnessTrustSummary({ plugin }: { plugin: PluginRecord }): React.JSX.Element {
	const { t } = useTranslation();
	const summary = plugin.harnessBundle;
	return (
		<Space orientation="vertical" size="small" style={{ width: "100%", marginTop: 12 }}>
			<Alert type="warning" showIcon title={t("settings.plugins.harness.trustWarning")} />
			<Descriptions size="small" column={1} bordered>
				<Descriptions.Item label={t("settings.plugins.harness.capabilities")}><Space wrap>{["tools", "skills", "hooks", "mcp"].map((item) => <Tag key={item}>{item}</Tag>)}</Space></Descriptions.Item>
				<Descriptions.Item label={t("settings.plugins.harness.network")}><Typography.Text type="secondary">{t("settings.plugins.harness.networkDisabled")}</Typography.Text></Descriptions.Item>
				<Descriptions.Item label={t("settings.plugins.harness.rows")}>{summary === undefined ? "—" : `${summary.bridgeableRows} / ${summary.totalRows}`}</Descriptions.Item>
				<Descriptions.Item label={t("settings.plugins.harness.skippedRows")}>{summary?.skippedRows.length ?? 0}</Descriptions.Item>
			</Descriptions>
		</Space>
	);
}

import { Alert, Descriptions, Modal, Tag, Typography } from "antd";
import { useTranslation } from "react-i18next";
import type { PluginRecord } from "@/platform/rpc/plugin-api";

export function PluginTrustModal({ plugin, open, loading, onCancel, onConfirm }: { plugin?: PluginRecord; open: boolean; loading: boolean; onCancel: () => void; onConfirm: () => void }): React.JSX.Element {
	const { t } = useTranslation();
	if (plugin === undefined) return <></>;
	const capabilities = plugin.nativePlugin?.capabilities ?? [];
	return <Modal open={open} title={t("settings.plugins.trustReview.title")} okText={t("settings.plugins.trustReview.confirm")} cancelText={t("settings.common.cancel")} confirmLoading={loading} onCancel={onCancel} onOk={onConfirm}>
		<Typography.Paragraph type="secondary">{t("settings.plugins.trustReview.description", { name: plugin.packageName })}</Typography.Paragraph>
		<Descriptions column={1} size="small" bordered>
			<Descriptions.Item label={t("settings.plugins.trustReview.capabilities")}><Tag>{capabilities.length > 0 ? capabilities.join(", ") : t("settings.plugins.trustReview.none")}</Tag></Descriptions.Item>
			<Descriptions.Item label={t("settings.plugins.trustReview.workspace")}>{t("settings.plugins.trustReview.workspaceValue")}</Descriptions.Item>
			<Descriptions.Item label={t("settings.plugins.trustReview.network")}>{t("settings.plugins.trustReview.networkValue")}</Descriptions.Item>
			<Descriptions.Item label={t("settings.plugins.trustReview.dependencies")}>{plugin.dependencyLockHash ? t("settings.plugins.trustReview.locked") : t("settings.plugins.trustReview.none")}</Descriptions.Item>
		</Descriptions>
		{plugin.compatibility.harnessBundle || plugin.compatibility.harnessClient ? <Alert style={{ marginTop: 12 }} type="info" showIcon message={t("settings.plugins.trustReview.harnessNotice")} /> : null}
	</Modal>;
}

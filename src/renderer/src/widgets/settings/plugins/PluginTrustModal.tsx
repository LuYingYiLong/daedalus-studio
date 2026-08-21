import { Alert, Button, Descriptions, Modal, Tag, Typography } from "antd";
import { useTranslation } from "react-i18next";
import type { PluginRecord } from "@/platform/rpc/plugin-api";
import { HarnessTrustSummary } from "./HarnessTrustSummary";

export function PluginTrustModal({
	plugin,
	open,
	mode: trustMode = "trusted",
	loading,
	confirmDisabled = false,
	confirmDisabledReason,
	onConfigureHarness,
	onCancel,
	onConfirm,
}: {
	plugin?: PluginRecord;
	open: boolean;
	mode?: "trusted" | "disabled";
	loading: boolean;
	confirmDisabled?: boolean;
	confirmDisabledReason?: string;
	onConfigureHarness?: () => void;
	onCancel: () => void;
	onConfirm: () => void;
}): React.JSX.Element {
	const { t } = useTranslation();
	if (plugin === undefined) return <></>;
	const mode: "trusted" | "disabled" = trustMode;
	const capabilities = plugin.nativePlugin?.capabilities ?? [];
	return (
		<Modal
			open={open}
			title={t(
				mode === "trusted"
					? "settings.plugins.trustReview.title"
					: "settings.plugins.trustReview.revokeTitle",
			)}
			okText={t(
				mode === "trusted"
					? "settings.plugins.trustReview.confirm"
					: "settings.plugins.trustReview.revokeConfirm",
			)}
			okButtonProps={{
				...(mode === "disabled" ? { danger: true } : {}),
				...(confirmDisabled ? { disabled: true } : {}),
			}}
			cancelText={t("settings.common.cancel")}
			confirmLoading={loading}
			onCancel={onCancel}
			onOk={onConfirm}
		>
			<Typography.Paragraph type="secondary">
				{t(
					mode === "trusted"
						? "settings.plugins.trustReview.description"
						: "settings.plugins.trustReview.revokeDescription",
					{
						name: plugin.packageName,
					},
				)}
			</Typography.Paragraph>
			{mode === "trusted" ? (
				<Typography.Paragraph>
					<strong>{t("settings.plugins.trustReview.impactTitle")}</strong>
					<br />
					{t("settings.plugins.trustReview.impactDescription")}
				</Typography.Paragraph>
			) : null}
			<Descriptions column={1} size="small" bordered>
				<Descriptions.Item
					label={t("settings.plugins.trustReview.capabilities")}
				>
					<Tag>
						{capabilities.length > 0
							? capabilities.join(", ")
							: t("settings.plugins.trustReview.none")}
					</Tag>
				</Descriptions.Item>
				<Descriptions.Item
					label={t("settings.plugins.trustReview.workspace")}
				>
					{t("settings.plugins.trustReview.workspaceValue")}
				</Descriptions.Item>
				<Descriptions.Item
					label={t("settings.plugins.trustReview.network")}
				>
					{t("settings.plugins.trustReview.networkValue")}
				</Descriptions.Item>
				<Descriptions.Item
					label={t("settings.plugins.trustReview.dependencies")}
				>
					{plugin.dependencyLockHash
						? t("settings.plugins.trustReview.locked")
						: t("settings.plugins.trustReview.none")}
				</Descriptions.Item>
			</Descriptions>
			{mode === "trusted" && plugin.compatibility.harnessBundle ? <HarnessTrustSummary plugin={plugin} /> : plugin.compatibility.harnessClient ? (
				<Alert style={{ marginTop: 12 }} type="info" showIcon title={t("settings.plugins.trustReview.harnessNotice")} />
			) : null}
			{confirmDisabledReason !== undefined ? (
				<Alert
					style={{ marginTop: 12 }}
					type="warning"
					showIcon
					title={confirmDisabledReason}
					action={onConfigureHarness === undefined ? undefined : <Button size="small" onClick={onConfigureHarness}>{t("settings.import.plugin.configureHarness")}</Button>}
				/>
			) : null}
		</Modal>
	);
}

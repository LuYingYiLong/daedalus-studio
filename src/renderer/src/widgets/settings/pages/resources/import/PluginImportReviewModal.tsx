import { Alert, Descriptions, List, Modal, Space, Tag, Typography } from "antd";
import { useTranslation } from "react-i18next";
import type { PluginScanResult } from "@/platform/rpc/plugin-api";
import type { PluginSource } from "@/platform/rpc/plugin-api";
import { sourceLabel } from "@/widgets/settings/pages/extensions/plugins/plugin-formatters";

export function PluginImportReviewModal({
	open,
	loading,
	scan,
	source,
	onCancel,
	onInstall,
}: {
	open: boolean;
	loading: boolean;
	scan: PluginScanResult | null;
	source: PluginSource | null;
	onCancel: () => void;
	onInstall: () => Promise<void>;
}): React.JSX.Element {
	const { t } = useTranslation();
	if (scan === null) return <></>;
	const summary = scan.harnessBundle;
	const skippedRows = summary?.skippedRows ?? [];
	return (
		<Modal
			open={open}
			width={720}
			title={t("settings.import.plugin.reviewTitle", { name: scan.packageName })}
			okText={t("settings.import.plugin.install")}
			confirmLoading={loading}
			onCancel={onCancel}
			onOk={(): void => { void onInstall(); }}
		>
			<Space direction="vertical" size="middle" style={{ width: "100%" }}>
				<Space wrap>
					<Tag color="blue">{t(`settings.plugins.classification.${scan.compatibility.classification}`)}</Tag>
					<Tag>{scan.version}</Tag>
					{scan.compatibility.harnessBundle ? <Tag color="purple">{t("settings.import.plugin.harness")}</Tag> : null}
					{scan.compatibility.harnessClient ? <Tag color="gold">{t("settings.import.plugin.harnessClientStatic")}</Tag> : null}
				</Space>
				<Descriptions bordered size="small" column={1}>
					<Descriptions.Item label={t("settings.import.plugin.source")}>{source === null ? t("settings.plugins.items.notDeclared") : sourceLabel(source)}</Descriptions.Item>
					<Descriptions.Item label={t("settings.import.plugin.hash")}>{scan.contentHash}</Descriptions.Item>
					<Descriptions.Item label={t("settings.import.plugin.patchPath")}>{scan.compatibility.patchPath ?? t("settings.plugins.items.notDeclared")}</Descriptions.Item>
					<Descriptions.Item label={t("settings.import.plugin.patchRows")}>{summary === undefined ? t("settings.plugins.items.notDeclared") : `${summary.bridgeableRows} / ${summary.totalRows}`}</Descriptions.Item>
					<Descriptions.Item label={t("settings.import.plugin.patchOperations")}>{summary?.operations.join(", ") || t("settings.plugins.items.notDeclared")}</Descriptions.Item>
					<Descriptions.Item label={t("settings.import.plugin.readme")}>{scan.presentation?.readme ? t("settings.import.plugin.available") : t("settings.plugins.noReadme")}</Descriptions.Item>
					<Descriptions.Item label={t("settings.import.plugin.changelog")}>{scan.presentation?.changelog ? t("settings.import.plugin.available") : t("settings.plugins.noChangelog")}</Descriptions.Item>
					<Descriptions.Item label={t("settings.import.plugin.icon")}>{scan.presentation?.iconDataUrl ? t("settings.import.plugin.available") : t("settings.import.plugin.placeholderIcon")}</Descriptions.Item>
					<Descriptions.Item label={t("settings.import.plugin.lockfile")}>{scan.dependencyLockHash ? t("settings.import.plugin.available") : t("settings.plugins.items.notDeclared")}</Descriptions.Item>
				</Descriptions>
				{scan.presentation?.readme ? <Typography.Paragraph ellipsis={{ rows: 5, expandable: true }}>{scan.presentation.readme}</Typography.Paragraph> : <Alert type="info" showIcon title={t("settings.plugins.noReadme")} />}
				{scan.compatibility.warnings.length > 0 ? <Alert type="warning" showIcon title={t("settings.plugins.warnings")} description={<List size="small" dataSource={scan.compatibility.warnings} renderItem={(item): React.JSX.Element => <List.Item>{item}</List.Item>} />} /> : null}
				{skippedRows.length ? <Alert type="warning" showIcon title={t("settings.import.plugin.skippedRows", { count: skippedRows.length })} description={<List size="small" dataSource={skippedRows} renderItem={(item: (typeof skippedRows)[number]): React.JSX.Element => <List.Item>{item.index}: {item.reason}</List.Item>} />} /> : null}
				<Alert type="info" showIcon title={t("settings.import.plugin.reviewNotice")} />
			</Space>
		</Modal>
	);
}

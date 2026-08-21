import { Alert, Descriptions, Empty, List, Modal, Space, Tag, Typography } from "antd";
import { useTranslation } from "react-i18next";
import type { HarnessBundleSummary, PluginRecord } from "@/platform/rpc/plugin-api";

export function HarnessBundlePreview({ plugin, summary, open, loading, onClose }: {
	plugin?: PluginRecord;
	summary: HarnessBundleSummary | null;
	open: boolean;
	loading: boolean;
	onClose: () => void;
}): React.JSX.Element {
	const { t } = useTranslation();
	return (
		<Modal open={open} title={t("settings.plugins.harness.previewTitle", { name: plugin?.packageName ?? "" })} footer={null} loading={loading} onCancel={onClose}>
			{summary === null ? <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} /> : (
				<Space orientation="vertical" size="middle" style={{ width: "100%" }}>
					<Descriptions size="small" column={1} bordered>
						<Descriptions.Item label={t("settings.plugins.harness.patchPath")}>{summary.patchPath ?? "—"}</Descriptions.Item>
						<Descriptions.Item label={t("settings.plugins.harness.operations")}><Space wrap>{summary.operations.map((operation) => <Tag key={operation}>{operation}</Tag>)}</Space></Descriptions.Item>
						<Descriptions.Item label={t("settings.plugins.harness.rows")}>{summary.bridgeableRows} / {summary.totalRows}</Descriptions.Item>
					</Descriptions>
					{summary.dangerousConstructs.length > 0 ? <Alert type="warning" showIcon title={t("settings.plugins.harness.dangerous")} description={summary.dangerousConstructs.join(", ")} /> : null}
					<List
						size="small"
						header={<Typography.Text strong>{t("settings.plugins.harness.skippedRows")}</Typography.Text>}
						dataSource={summary.skippedRows}
						locale={{ emptyText: t("settings.plugins.harness.noSkippedRows") }}
						renderItem={(row) => <List.Item><Typography.Text>#{row.index} {row.id ?? row.name ?? ""}</Typography.Text><Typography.Text type="secondary">{row.reason}</Typography.Text></List.Item>}
					/>
				</Space>
			)}
		</Modal>
	);
}

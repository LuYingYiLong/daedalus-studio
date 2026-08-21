import { Empty, List, Tag, Typography } from "antd";
import { useTranslation } from "react-i18next";
import type { PluginRuntimeLog } from "@/platform/rpc/plugin-api";
import styles from "./plugins.module.css";

export function PluginLogList({
	logs,
}: {
	logs: PluginRuntimeLog[];
}): React.JSX.Element {
	const { t } = useTranslation();
	if (logs.length === 0)
		return (
			<Empty
				image={Empty.PRESENTED_IMAGE_SIMPLE}
				description={t("settings.plugins.runtime.noLogs")}
			/>
		);
	return (
		<List
			className={styles.logList}
			size="small"
			dataSource={logs}
			renderItem={(log): React.JSX.Element => (
				<List.Item>
					<List.Item.Meta
						title={
							<span>
								{log.event}{" "}
								<Tag
									color={
										log.status === "ok"
											? "success"
											: "error"
									}
								>
									{log.status}
								</Tag>
							</span>
						}
						description={
							<Typography.Text type="secondary">
								{log.message ?? ""}
							</Typography.Text>
						}
					/>
					<Typography.Text type="secondary">
						{new Date(log.createdAt).toLocaleTimeString()}
					</Typography.Text>
				</List.Item>
			)}
		/>
	);
}

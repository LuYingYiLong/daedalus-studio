import { Button, Empty, List, Spin, Statistic, Tag, Typography } from "antd";
import { useTranslation } from "react-i18next";
import type { TracePage, TraceRecord, TraceSummary } from "@/platform/rpc/trace-api";
import styles from "./RemoteApp.module.css";

type RemoteTraceScreenProps = {
	busy: boolean;
	summary: TraceSummary | null;
	page: TracePage | null;
	onLoadMore: () => void;
	onSelect: (record: TraceRecord) => void;
};

function RemoteTraceScreen({ busy, summary, page, onLoadMore, onSelect }: RemoteTraceScreenProps): React.JSX.Element {
	const { t } = useTranslation();
	return (
		<section className={styles.scrollScreen} data-testid="remote-trajectory-screen">
			<Spin spinning={busy}>
				<Typography.Paragraph type="secondary" className={styles.screenDescription}>{t("remote.trajectory.description")}</Typography.Paragraph>
				{summary === null ? <Empty description={t("remote.trajectory.empty")} /> : (
					<>
						<div className={styles.traceStats}>
							<Statistic title={t("remote.traceStats.turns")} value={summary.turnCount} />
							<Statistic title={t("remote.traceStats.calls")} value={summary.modelCallCount} />
							<Statistic title={t("remote.traceStats.tools")} value={summary.toolCallCount} />
							<Statistic title={t("remote.traceStats.errors")} value={summary.errorCount} />
						</div>
						<div className={styles.traceListCard}>
							<List
								dataSource={page?.records ?? []}
								renderItem={(record: TraceRecord): React.JSX.Element => (
									<List.Item className={styles.traceItem} onClick={(): void => onSelect(record)}>
										<List.Item.Meta title={`${record.kind} · ${record.status}`} description={`Turn ${record.turn} · ${record.durationMs ?? 0} ms`} />
										<Tag>{record.detailLevel}</Tag>
									</List.Item>
								)}
							/>
							{page?.nextCursor !== undefined ? <Button block type="text" loading={busy} onClick={onLoadMore}>{t("remote.loadMore")}</Button> : null}
						</div>
					</>
				)}
			</Spin>
		</section>
	);
}

export default RemoteTraceScreen;

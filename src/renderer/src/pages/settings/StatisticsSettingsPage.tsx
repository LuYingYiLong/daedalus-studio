import { Column, Line, Pie } from "@ant-design/charts";
import { Alert, Card, Divider, Empty, Segmented, Spin, Statistic, Tooltip, Typography } from "antd";
import { useMemo, useState } from "react";
import { useRequest } from "ahooks";
import { useTranslation } from "react-i18next";
import {
	fetchUsageMetricsSummary,
	fetchUsageMetricsTrends,
	listUsageMetricsLogs,
	type UsageMetricsFilters,
	type UsageMetricsGroupSummary,
	type UsageMetricsLog,
	type UsageMetricsSummary,
	type UsageMetricsTrendPoint
} from "@/api/usage-metrics-api";
import styles from "./StatisticsSettingsPage.module.css";

type TimeRangeKey = "7d" | "30d" | "90d" | "all";

type DistributionRow = {
	key: string;
	label: string;
	value: number;
};

type ModelTokenSegmentRow = {
	key: string;
	label: string;
	segment: string;
	value: number;
	tokens: number;
};

type TokenHeatmapCell = {
	key: string;
	dateLabel: string;
	tokens: number;
	level: 0 | 1 | 2 | 3 | 4;
};

type StatisticsData = {
	summary: UsageMetricsSummary;
	trends: UsageMetricsTrendPoint[];
	recentLogs: UsageMetricsLog[];
};

function getTimeRangeFilters(range: TimeRangeKey): UsageMetricsFilters | undefined {
	if (range === "all") {
		return undefined;
	}

	const days: number = range === "7d" ? 7 : range === "30d" ? 30 : 90;
	const startAt = new Date();
	startAt.setDate(startAt.getDate() - days);
	return {
		startAt: startAt.toISOString()
	};
}

function formatInteger(value: number): string {
	return new Intl.NumberFormat().format(Math.round(value));
}

function formatCompact(value: number): string {
	return new Intl.NumberFormat(undefined, {
		notation: "compact",
		maximumFractionDigits: 1
	}).format(value);
}

function formatPercent(value: number): string {
	return new Intl.NumberFormat(undefined, {
		style: "percent",
		maximumFractionDigits: 1
	}).format(Number.isFinite(value) ? value : 0);
}

function formatDuration(ms: number | undefined): string {
	if (ms === undefined || !Number.isFinite(ms) || ms <= 0) {
		return "-";
	}
	if (ms < 1000) {
		return `${Math.round(ms)} ms`;
	}
	return `${(ms / 1000).toFixed(ms < 10000 ? 1 : 0)} s`;
}

function formatBucket(value: string): string {
	const date = new Date(value);
	if (Number.isNaN(date.getTime())) {
		return value;
	}
	return new Intl.DateTimeFormat(undefined, {
		month: "short",
		day: "2-digit"
	}).format(date);
}

function formatHeatmapDate(date: Date): string {
	return new Intl.DateTimeFormat(undefined, {
		year: "numeric",
		month: "short",
		day: "2-digit"
	}).format(date);
}

function getAverage(values: Array<number | undefined>): number | undefined {
	const numericValues: number[] = values.filter((value: number | undefined): value is number => value !== undefined && Number.isFinite(value));
	if (numericValues.length === 0) {
		return undefined;
	}
	return numericValues.reduce((sum: number, value: number): number => sum + value, 0) / numericValues.length;
}

function toTopGroupRows(groups: UsageMetricsGroupSummary[], limit: number): DistributionRow[] {
	return groups
		.filter((group: UsageMetricsGroupSummary): boolean => group.requests > 0)
		.slice(0, limit)
		.map((group: UsageMetricsGroupSummary): DistributionRow => ({
			key: group.key || "unknown",
			label: group.key || "unknown",
			value: group.realTotalTokens
		}));
}

function toModelTokenSegmentRows(groups: UsageMetricsGroupSummary[], limit: number, labels: { hit: string; miss: string }): ModelTokenSegmentRow[] {
	return groups
		.filter((group: UsageMetricsGroupSummary): boolean => group.realTotalTokens > 0)
		.slice(0, limit)
		.flatMap((group: UsageMetricsGroupSummary): ModelTokenSegmentRow[] => {
			const modelLabel: string = group.key || "unknown";
			const hitTokens: number = Math.max(0, group.cacheReadTokens);
			const missTokens: number = Math.max(0, group.realTotalTokens - hitTokens);
			const totalTokens: number = Math.max(1, hitTokens + missTokens);
			return [
				{
					key: `${modelLabel}:miss`,
					label: modelLabel,
					segment: labels.miss,
					value: missTokens / totalTokens,
					tokens: missTokens
				},
				{
					key: `${modelLabel}:hit`,
					label: modelLabel,
					segment: labels.hit,
					value: hitTokens / totalTokens,
					tokens: hitTokens
				}
			];
		});
}

function toDateKey(date: Date): string {
	return date.toISOString().slice(0, 10);
}

function startOfUtcDay(date: Date): Date {
	return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function addDays(date: Date, days: number): Date {
	const next = new Date(date);
	next.setUTCDate(next.getUTCDate() + days);
	return next;
}

function createTokenHeatmapCells(points: UsageMetricsTrendPoint[], range: TimeRangeKey): TokenHeatmapCell[] {
	const today = startOfUtcDay(new Date());
	const pointDates: Date[] = points
		.map((point: UsageMetricsTrendPoint): Date => startOfUtcDay(new Date(point.bucket)))
		.filter((date: Date): boolean => !Number.isNaN(date.getTime()));
	const tokenByDate = new Map<string, number>();
	for (const point of points) {
		const date = startOfUtcDay(new Date(point.bucket));
		if (Number.isNaN(date.getTime())) {
			continue;
		}
		tokenByDate.set(toDateKey(date), point.realTotalTokens);
	}

	const rangeDays: number | null = range === "7d" ? 7 : range === "30d" ? 30 : range === "90d" ? 90 : null;
	const firstPointDate: Date = pointDates.length > 0
		? pointDates.reduce((earliest: Date, date: Date): Date => date < earliest ? date : earliest, pointDates[0]!)
		: addDays(today, -29);
	const rangeStart: Date = rangeDays === null ? firstPointDate : addDays(today, -(rangeDays - 1));
	const minimumDisplayStart: Date = addDays(today, -363);
	const displayStart: Date = rangeStart > minimumDisplayStart ? minimumDisplayStart : rangeStart;
	const gridStart: Date = addDays(displayStart, -displayStart.getUTCDay());
	const gridEnd: Date = addDays(today, 6 - today.getUTCDay());
	const values: number[] = Array.from(tokenByDate.values()).filter((value: number): boolean => value > 0);
	const maxTokens: number = values.length > 0 ? Math.max(...values) : 0;
	const cells: TokenHeatmapCell[] = [];

	for (let cursor: Date = gridStart; cursor <= gridEnd; cursor = addDays(cursor, 1)) {
		const key: string = toDateKey(cursor);
		const tokens: number = tokenByDate.get(key) ?? 0;
		const ratio: number = maxTokens > 0 ? tokens / maxTokens : 0;
		const level: TokenHeatmapCell["level"] = tokens <= 0 ? 0 : ratio <= 0.25 ? 1 : ratio <= 0.5 ? 2 : ratio <= 0.75 ? 3 : 4;
		cells.push({
			key,
			dateLabel: formatHeatmapDate(cursor),
			tokens,
			level
		});
	}

	return cells;
}

async function loadStatisticsData(range: TimeRangeKey): Promise<StatisticsData> {
	const filters: UsageMetricsFilters | undefined = getTimeRangeFilters(range);
	const [summary, trends, recentLogs] = await Promise.all([
		fetchUsageMetricsSummary(filters),
		fetchUsageMetricsTrends({ ...filters, bucket: "day" }),
		listUsageMetricsLogs({ ...filters, limit: 100 })
	]);

	return {
		summary,
		trends: trends.points,
		recentLogs: recentLogs.logs
	};
}

function ChartEmpty({ description }: { description: string }): React.JSX.Element {
	return (
		<div className={styles.emptyChart}>
			<Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={description} />
		</div>
	);
}

function StatisticsSettingsPage(): React.JSX.Element {
	const { t } = useTranslation();
	const [range, setRange] = useState<TimeRangeKey>("30d");
	const {
		data,
		loading: isLoading,
		error
	} = useRequest((): Promise<StatisticsData> => loadStatisticsData(range), {
		refreshDeps: [range]
	});

	const summary: UsageMetricsSummary | null = data?.summary ?? null;
	const averageDurationMs: number | undefined = getAverage(data?.recentLogs.map((log: UsageMetricsLog): number => log.durationMs) ?? []);
	const averageFirstTokenMs: number | undefined = getAverage(data?.recentLogs.map((log: UsageMetricsLog): number | undefined => log.firstTokenMs) ?? []);
	const providerRows: DistributionRow[] = useMemo((): DistributionRow[] => {
		return toTopGroupRows(summary?.byProvider ?? [], 8);
	}, [summary?.byProvider]);
	const modelRows: ModelTokenSegmentRow[] = useMemo((): ModelTokenSegmentRow[] => {
		return toModelTokenSegmentRows(summary?.byModel ?? [], 10, {
			hit: t("settings.statistics.cacheSegments.hit"),
			miss: t("settings.statistics.cacheSegments.miss")
		});
	}, [summary?.byModel, t]);
	const requestTrendData = useMemo((): Array<{ bucket: string; requests: number }> => {
		return (data?.trends ?? []).map((point: UsageMetricsTrendPoint) => ({
			bucket: formatBucket(point.bucket),
			requests: point.requests
		}));
	}, [data?.trends]);
	const tokenTrendData = useMemo((): Array<{ bucket: string; tokens: number }> => {
		return (data?.trends ?? []).map((point: UsageMetricsTrendPoint) => ({
			bucket: formatBucket(point.bucket),
			tokens: point.realTotalTokens
		}));
	}, [data?.trends]);
	const tokenHeatmapCells: TokenHeatmapCell[] = useMemo((): TokenHeatmapCell[] => {
		return createTokenHeatmapCells(data?.trends ?? [], range);
	}, [data?.trends, range]);
	const tokenHeatmapColumnCount: number = Math.max(1, Math.ceil(tokenHeatmapCells.length / 7));
	const heatmapHasActivity: boolean = tokenHeatmapCells.some((cell: TokenHeatmapCell): boolean => cell.tokens > 0);

	return (
		<section className={styles.page}>
			<header className={styles.header}>
				<div className={styles.titleBlock}>
					<Typography.Title level={3} className={styles.title}>{t("settings.statistics.title")}</Typography.Title>
				</div>
				<div className={styles.actions}>
					<Segmented<TimeRangeKey>
						value={range}
						options={[
							{ value: "7d", label: t("settings.statistics.range.last7Days") },
							{ value: "30d", label: t("settings.statistics.range.last30Days") },
							{ value: "90d", label: t("settings.statistics.range.last90Days") },
							{ value: "all", label: t("settings.statistics.range.all") }
						]}
						onChange={setRange}
					/>
				</div>
			</header>

			<div className={styles.content}>
				{error !== undefined ? (
					<Alert type="error" showIcon message={t("settings.statistics.errors.load")} description={error instanceof Error ? error.message : String(error)} />
				) : null}
				{summary !== null && !summary.available ? (
					<Alert type="warning" showIcon message={t("settings.statistics.unavailable.title")} description={summary.errorMessage ?? t("settings.statistics.unavailable.description")} />
				) : null}

				{isLoading && data === undefined ? (
					<Card>
						<div className={styles.loading}>
							<Spin />
						</div>
					</Card>
				) : summary !== null ? (
					<>
						<div className={styles.metricGrid}>
							<Statistic
								title={t("settings.statistics.metrics.requests")}
								value={summary.requests}
								formatter={(value): string => formatInteger(Number(value))}
							/>
							<Divider vertical className={styles.divider} />
							<Statistic
								title={t("settings.statistics.metrics.tokens")}
								value={formatCompact(summary.realTotalTokens)}
								suffix={t("settings.statistics.metrics.tokensSuffix")}
							/>
							<Divider vertical className={styles.divider} />
							<Statistic
								title={t("settings.statistics.metrics.cacheHitRate")}
								value={formatPercent(summary.cacheHitRate)}
							/>
							<Divider vertical className={styles.divider} />
							<Statistic
								title={t("settings.statistics.metrics.avgDuration")}
								value={formatDuration(averageDurationMs)}
							/>
							<Divider vertical className={styles.divider} />
							<Statistic
								title={t("settings.statistics.metrics.avgFirstToken")}
								value={formatDuration(averageFirstTokenMs)}
							/>
						</div>

						<Card title={t("settings.statistics.heatmap.title")} className={styles.heatmapCard}>
							{heatmapHasActivity ? (
								<>
									<div className={styles.heatmapScroller}>
										<div
											className={styles.heatmapGrid}
											style={{ gridTemplateColumns: `repeat(${tokenHeatmapColumnCount}, minmax(0, 1fr))` }}
										>
											{tokenHeatmapCells.map((cell: TokenHeatmapCell): React.JSX.Element => (
												<Tooltip
													key={cell.key}
													title={t("settings.statistics.heatmap.tooltip", {
														date: cell.dateLabel,
														tokens: formatInteger(cell.tokens)
													})}
												>
													<span className={styles.heatmapCell} data-level={cell.level} />
												</Tooltip>
											))}
										</div>
									</div>
								</>
							) : <ChartEmpty description={t("settings.statistics.empty.noUsage")} />}
						</Card>

						<div className={styles.chartGrid}>
							<Card title={t("settings.statistics.charts.requestsTrend")} className={styles.chartCard}>
								<div className={styles.chartBody}>
									{requestTrendData.length > 0 ? (
										<Column
											data={requestTrendData}
											xField="bucket"
											yField="requests"
											height={260}
											autoFit
											colorField="bucket"
											axis={{ x: { labelAutoRotate: false } }}
										/>
									) : <ChartEmpty description={t("settings.statistics.empty.noUsage")} />}
								</div>
							</Card>

							<Card title={t("settings.statistics.charts.tokensTrend")} className={styles.chartCard}>
								<div className={styles.chartBody}>
									{tokenTrendData.length > 0 ? (
										<Line
											data={tokenTrendData}
											xField="bucket"
											yField="tokens"
											height={260}
											autoFit
											shapeField="smooth"
											style={{ lineWidth: 2 }}
										/>
									) : <ChartEmpty description={t("settings.statistics.empty.noUsage")} />}
								</div>
							</Card>

							<Card title={t("settings.statistics.charts.providerShare")} className={styles.chartCard}>
								<div className={styles.chartBody}>
									{providerRows.length > 0 ? (
										<Pie
											data={providerRows}
											angleField="value"
											colorField="label"
											height={260}
											autoFit
											innerRadius={0.58}
											legend={{ color: { position: "right" } }}
										/>
									) : <ChartEmpty description={t("settings.statistics.empty.noUsage")} />}
								</div>
							</Card>

							<Card title={t("settings.statistics.charts.modelTokens")} className={styles.chartCard}>
								<div className={styles.chartBody}>
									{modelRows.length > 0 ? (
										<Column
											data={modelRows}
											xField="label"
											yField="value"
											height={260}
											autoFit
											colorField="segment"
											stack
											axis={{
												x: { labelAutoRotate: true },
												y: { labelFormatter: ".0%" }
											}}
											tooltip={{
												items: [
													(d: ModelTokenSegmentRow): { name: string; value: string } => ({
														name: d.segment,
														value: `${formatPercent(d.value)} / ${formatInteger(d.tokens)} ${t("settings.statistics.metrics.tokensSuffix")}`
													})
												]
											}}
										/>
									) : <ChartEmpty description={t("settings.statistics.empty.noUsage")} />}
								</div>
							</Card>
						</div>
					</>
				) : null}
			</div>
		</section>
	);
}

export default StatisticsSettingsPage;

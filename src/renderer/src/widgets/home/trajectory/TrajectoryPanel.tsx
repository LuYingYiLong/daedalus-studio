import { useEffect, useMemo, useState } from "react";
import {
	Alert,
	Button,
	Collapse,
	Descriptions,
	Empty,
	Flex,
	Input,
	Spin,
	Tag,
	Typography,
} from "antd";
import type { CollapseProps } from "antd";
import { useTranslation } from "react-i18next";
import {
	filterTraceRecords,
	filterTraceRecordsByTimeRange,
	formatTraceDuration,
	formatTraceTokens,
	getTraceRecordTitle,
	groupTraceRecords,
} from "@/domain/trajectory/trajectory-model";
import type { TraceTimeRange } from "@/domain/trajectory/trajectory-model";
import type { TraceDetail, TraceRecord } from "@/platform/rpc/trace-api";
import { Icon } from "@/assets/icons";
import { useTrajectoryController } from "./useTrajectoryController";
import TraceGantt from "./TrajectoryGantt";
import styles from "./TrajectoryPanel.module.css";

type TrajectoryPanelProps = {
	sessionId: string | null;
	isActive: boolean;
};

function serializeDetail(value: unknown): string {
	if (typeof value === "string") return value;
	try {
		return JSON.stringify(value, null, 2);
	} catch {
		return String(value);
	}
}

function statusColor(status: TraceRecord["status"]): string {
	if (status === "success") return "success";
	if (status === "error") return "error";
	if (status === "cancelled") return "default";
	if (status === "approval_required") return "warning";
	return "processing";
}

function TraceInspector({
	detail,
	loading,
}: {
	detail: TraceDetail | null;
	loading: boolean;
}): React.JSX.Element {
	const { t } = useTranslation();
	if (loading)
		return (
			<div className={styles.inspectorState}>
				<Spin size="small" /> {t("trajectory.loadingDetail")}
			</div>
		);
	if (detail === null)
		return (
			<Empty
				image={Empty.PRESENTED_IMAGE_SIMPLE}
				description={t("trajectory.details")}
			/>
		);
	if (detail.detailLevel === "compacted")
		return (
			<Alert
				type="info"
				showIcon={true}
				title={t("trajectory.compacted")}
			/>
		);
	if (detail.detailsHidden === true)
		return (
			<Alert type="info" showIcon={true} title={t("trajectory.hidden")} />
		);

	const collapseItems = detail.promptSections.map((section) => ({
		key: section.id,
		label: (
			<Flex align="center" gap="small">
				<Tag>{section.kind}</Tag>
				<span>{section.label}</span>
				<Typography.Text type="secondary">
					{section.charCount.toLocaleString()} chars
				</Typography.Text>
			</Flex>
		),
		children: (
			<pre className={styles.codeBlock}>
				{serializeDetail(section.content)}
			</pre>
		),
	}));
	const inspectorItems: NonNullable<CollapseProps["items"]> = [
		...(collapseItems.length > 0
			? [
					{
						key: "prompt-sections",
						label: t("trajectory.promptSections"),
						children: (
							<Collapse size="small" items={collapseItems} />
						),
					},
				]
			: []),
		...(detail.request === undefined
			? []
			: [
					{
						key: "request",
						label: t("trajectory.request"),
						children: (
							<Typography.Text>
								{serializeDetail(detail.request)}
							</Typography.Text>
						),
					},
				]),
		...(detail.response === undefined
			? []
			: [
					{
						key: "response",
						label: t("trajectory.response"),
						children: (
							<Typography.Text>
								{serializeDetail(detail.response)}
							</Typography.Text>
						),
					},
				]),
		...(detail.redactions.length > 0
			? [
					{
						key: "redactions",
						label: t("trajectory.redactions"),
						children: (
							<Flex wrap gap={4}>
								{detail.redactions.map(
									(field): React.JSX.Element => (
										<Tag key={field}>{field}</Tag>
									),
								)}
							</Flex>
						),
					},
				]
			: []),
	];

	return (
		<div
			className={styles.inspectorBody}
			data-testid="trajectory-inspector"
		>
			<Typography.Text
				copyable={{ text: detail.record.recordId }}
				className={styles.recordId}
			>
				{detail.record.recordId}
			</Typography.Text>
			<Descriptions
				size="small"
				column={1}
				items={[
					{
						key: "request",
						label: "requestId",
						children: detail.record.requestId,
					},
					...(detail.record.runId === undefined
						? []
						: [
								{
									key: "run",
									label: "runId",
									children: detail.record.runId,
								},
							]),
					...(detail.record.toolCallId === undefined
						? []
						: [
								{
									key: "tool",
									label: "toolCallId",
									children: detail.record.toolCallId,
								},
							]),
					{
						key: "timing",
						label: t("trajectory.timing"),
						children: `${detail.record.durationMs ?? 0} ms · ${detail.record.inputTokens ?? 0}/${detail.record.outputTokens ?? 0}`,
					},
				]}
			/>
			{inspectorItems.length > 0 ? (
				<Collapse
					size="small"
					defaultActiveKey={inspectorItems.flatMap(
						(item): string[] =>
							item.key === undefined ? [] : [String(item.key)],
					)}
					items={inspectorItems}
				/>
			) : null}
		</div>
	);
}

function TrajectoryPanel({
	sessionId,
	isActive,
}: TrajectoryPanelProps): React.JSX.Element {
	const { t } = useTranslation();
	const controller = useTrajectoryController(sessionId, isActive);
	const [query, setQuery] = useState<string>("");
	const [timeRange, setTimeRange] = useState<TraceTimeRange | null>(null);
	useEffect((): void => {
		setTimeRange(null);
	}, [sessionId]);
	const filteredRecords: TraceRecord[] = useMemo(
		(): TraceRecord[] =>
			filterTraceRecords(controller.records, "all", query),
		[controller.records, query],
	);
	const timeFilteredRecords: TraceRecord[] = useMemo(
		(): TraceRecord[] =>
			filterTraceRecordsByTimeRange(filteredRecords, timeRange),
		[filteredRecords, timeRange],
	);
	const groups = useMemo(
		() => groupTraceRecords(timeFilteredRecords),
		[timeFilteredRecords],
	);
	const selectedDetail: TraceDetail | null =
		controller.detail?.record.recordId === controller.selectedRecordId
			? controller.detail
			: null;
	if (sessionId === null)
		return (
			<Empty
				image={Empty.PRESENTED_IMAGE_SIMPLE}
				description={t("trajectory.noSession")}
			/>
		);
	if (controller.unavailable)
		return (
			<Empty
				image={Empty.PRESENTED_IMAGE_SIMPLE}
				description={t("trajectory.unavailable")}
			/>
		);

	const stats = [
		{
			key: "duration",
			value: formatTraceDuration(controller.summary.durationMs),
		},
		{ key: "turns", value: controller.summary.turnCount },
		{ key: "calls", value: controller.summary.modelCallCount },
		{ key: "tools", value: controller.summary.toolCallCount },
		{
			key: "tokens",
			value: formatTraceTokens(
				controller.summary.inputTokens +
					controller.summary.outputTokens,
			),
		},
		{ key: "errors", value: controller.summary.errorCount },
	];

	return (
		<section className={styles.panel} data-testid="trajectory-panel">
			<header className={styles.header}>
				<div className={styles.toolbar}>
					<Typography.Text
						type="secondary"
						className={styles.statsLine}
						title={stats
							.map(
								(stat): string =>
									`${t(`trajectory.stats.${stat.key}`)} ${stat.value}`,
							)
							.join(" / ")}
					>
						{stats.map(
							(stat, index): React.JSX.Element => (
								<span key={stat.key}>
									{index > 0 ? " / " : null}
									{t(`trajectory.stats.${stat.key}`)}{" "}
									{stat.value}
								</span>
							),
						)}
					</Typography.Text>
					<Input
						prefix={<Icon name="search" />}
						allowClear
						value={query}
						onChange={(event): void => setQuery(event.target.value)}
						placeholder={t("trajectory.filter.placeholder")}
					/>
				</div>
				<TraceGantt
					records={filteredRecords}
					onTimeRangeChange={setTimeRange}
				/>
			</header>
			<div className={styles.body}>
				{controller.error !== null && !controller.unavailable ? (
					<Alert
						type="warning"
						showIcon={true}
						closable={true}
						title={controller.error}
					/>
				) : null}
				<div className={styles.content}>
					<div
						className={styles.ledger}
						role="list"
						aria-label={t("dock.tabs.trajectory")}
					>
						<Spin spinning={controller.isLoading}>
							{groups.length === 0 && !controller.isLoading ? (
								<Empty
									image={Empty.PRESENTED_IMAGE_SIMPLE}
									description={t("trajectory.empty")}
								/>
							) : (
								groups.map(
									(group): React.JSX.Element => (
										<section
											key={`${group.turn}:${group.requestId}`}
											className={styles.turnGroup}
										>
											<header>
												<Typography.Text strong>
													{t("trajectory.turn", {
														turn: group.turn,
													})}
												</Typography.Text>
												<Typography.Text
													copyable={{
														text: group.requestId,
													}}
													type="secondary"
													ellipsis
												>
													{group.requestId}
												</Typography.Text>
											</header>
											{group.records.map(
												(record): React.JSX.Element => (
													<button
														key={record.recordId}
														type="button"
														role="listitem"
														data-testid={`trajectory-record-${record.recordId}`}
														className={`${styles.recordRow} ${controller.selectedRecordId === record.recordId ? styles.selected : ""}`}
														onClick={(): void =>
															controller.selectRecord(
																record.recordId,
															)
														}
													>
														<span
															className={
																styles.recordIcon
															}
														>
															<Icon
																name={
																	record.kind ===
																	"tool_call"
																		? "mcp"
																		: record.kind ===
																			  "thinking"
																			? "thinking"
																			: record.kind ===
																				  "error"
																				? "error"
																				: "info"
																}
															/>
														</span>
														<span
															className={
																styles.recordMain
															}
														>
															<strong>
																{t(
																	`trajectory.kind.${record.kind}`,
																)}
															</strong>
															<small>
																{getTraceRecordTitle(
																	record,
																)}
															</small>
														</span>
														{record.detailLevel ===
														"compacted" ? (
															<Tag>
																{t(
																	"trajectory.compacted",
																)}
															</Tag>
														) : null}
														<Tag
															color={statusColor(
																record.status,
															)}
														>
															{t(
																`trajectory.status.${record.status}`,
															)}
														</Tag>
														<time>
															{formatTraceDuration(
																record.durationMs ??
																	0,
															)}
														</time>
													</button>
												),
											)}
										</section>
									),
								)
							)}
							{controller.nextCursor !== undefined ? (
								<Button
									block
									loading={controller.isLoadingMore}
									onClick={(): void => {
										void controller.loadMore();
									}}
								>
									{t("trajectory.loadMore")}
								</Button>
							) : null}
						</Spin>
					</div>
					<aside
						className={styles.inspector}
						aria-label={t("trajectory.details")}
					>
						<TraceInspector
							detail={selectedDetail}
							loading={controller.isLoadingDetail}
						/>
					</aside>
				</div>
			</div>
		</section>
	);
}

export default TrajectoryPanel;

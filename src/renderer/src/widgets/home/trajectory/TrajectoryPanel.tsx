import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import {
	Alert,
	App,
	Button,
	Collapse,
	Descriptions,
	Empty,
	Flex,
	Input,
	Menu,
	Splitter,
	Spin,
	Tag,
	Typography,
} from "antd";
import type { CollapseProps, MenuProps } from "antd";
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

const ReactJsonView = lazy(() => import("@microlink/react-json-view"));
const ComputerObservationHistory = lazy(() => import("@/widgets/computer-observation/ComputerObservationHistory"));
const BrowserActivityHistory = lazy(() => import("@/widgets/browser/BrowserActivityHistory"));

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

function getJsonObject(value: unknown): object | null {
	if (value !== null && typeof value === "object") return value;
	if (typeof value !== "string") return null;

	const trimmed = value.trim();
	if (trimmed.length < 2 || (trimmed[0] !== "{" && trimmed[0] !== "[")) {
		return null;
	}

	try {
		const parsed: unknown = JSON.parse(trimmed);
		return parsed !== null && typeof parsed === "object" ? parsed : null;
	} catch {
		return null;
	}
}

function JsonDetail({ value }: { value: unknown }): React.JSX.Element {
	const source = getJsonObject(value);
	if (source === null) {
		return <pre className={styles.codeBlock}>{serializeDetail(value)}</pre>;
	}

	return (
		<div className={styles.jsonView} data-testid="trajectory-json-view">
			<Suspense
				fallback={
					<pre className={styles.codeBlock}>
						{serializeDetail(value)}
					</pre>
				}
			>
				<ReactJsonView
					src={source}
					name={false}
					style={{
						display: "block",
						width: "100%",
						maxHeight: 512,
						overflow: "auto",
						boxSizing: "border-box",
						fontFamily: "var(--ds-font-family-code)",
						fontSize: 12,
						lineHeight: 1.5,
						backgroundColor: "transparent",
					}}
					theme="rjv-default"
					iconStyle="triangle"
					indentWidth={2}
					collapsed={2}
					collapseStringsAfterLength={240}
					groupArraysAfterLength={20}
					displayObjectSize={true}
					displayDataTypes={false}
					displayArrayKey={true}
					enableClipboard={true}
					onEdit={false}
					onAdd={false}
					onDelete={false}
					sortKeys={false}
					quotesOnKeys={true}
					escapeStrings={true}
					showComma={true}
				/>
			</Suspense>
		</div>
	);
}

function statusColor(status: TraceRecord["status"]): string {
	if (status === "success") return "success";
	if (status === "error") return "error";
	if (status === "cancelled") return "default";
	if (status === "approval_required") return "warning";
	return "processing";
}

export function TraceInspector({
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
		children: <JsonDetail value={section.content} />,
	}));
	const inspectorItems: NonNullable<CollapseProps["items"]> = [
		...(detail.record.summary.externalBrowser === true && typeof detail.record.summary.activityId === "string" ? [{ key: "browser-activity", label: t("externalBrowser.evidence"), children: <Suspense fallback={<Spin />}><BrowserActivityHistory key={detail.record.recordId} sessionId={detail.record.sessionId} activityId={detail.record.summary.activityId} renderDetail={value => <JsonDetail value={value} />} /></Suspense> }] : []),
		...(typeof detail.record.summary.observationId === "string" ? [{ key: "computer-observation", label: t("computer.viewEvidence"), children: <Suspense fallback={<Spin />}><ComputerObservationHistory key={detail.record.recordId} sessionId={detail.record.sessionId} observationId={detail.record.summary.observationId} /></Suspense> }] : []),
		...(collapseItems.length > 0
			? [
					{
						key: "prompt-sections",
						label: t("trajectory.promptSections"),
						children: (
							<Collapse
								size="small"
								items={collapseItems}
								className={styles.collapse}
								ghost
							/>
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
						children: <JsonDetail value={detail.request} />,
					},
				]),
		...(detail.response === undefined
			? []
			: [
					{
						key: "response",
						label: t("trajectory.response"),
						children: <JsonDetail value={detail.response} />,
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
	const metadataItems: NonNullable<CollapseProps["items"]> = [
		{
			key: "metadata",
			label: t("trajectory.metadata"),
			children: (
				<div className={styles.metadataBody}>
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
				</div>
			),
		},
	];

	return (
		<div
			className={styles.inspectorBody}
			data-testid="trajectory-inspector"
		>
			<Collapse
				size="small"
				defaultActiveKey={["metadata"]}
				items={metadataItems}
				className={styles.collapse}
				bordered={false}
			/>
			{inspectorItems.length > 0 ? (
				<Collapse
					size="small"
					defaultActiveKey={inspectorItems.flatMap(
						(item): string[] =>
							item.key === undefined ? [] : [String(item.key)],
					)}
					items={inspectorItems}
					className={styles.collapse}
					bordered={false}
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
	const { message } = App.useApp();
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
	const ledgerItems: MenuProps["items"] = useMemo(
		(): MenuProps["items"] =>
			groups.map((group): NonNullable<MenuProps["items"]>[number] => ({
				type: "group",
				key: `${group.turn}:${group.requestId}`,
				label: (
					<div className={styles.menuGroupLabel}>
						<Typography.Text strong>
							{t("trajectory.turn", { turn: group.turn })}
						</Typography.Text>
						<Typography.Text
							copyable={{ text: group.requestId }}
							type="secondary"
							ellipsis
						>
							{group.requestId}
						</Typography.Text>
					</div>
				),
				children: group.records.map(
					(record): NonNullable<MenuProps["items"]>[number] => ({
						key: record.recordId,
						"data-testid": `trajectory-record-${record.recordId}`,
						label: (
							<div className={styles.recordRow}>
								<span className={styles.recordIcon}>
									<Icon
										name={
											record.kind === "tool_call"
												? "mcp"
												: record.kind === "thinking"
													? "thinking"
													: record.kind === "error"
														? "error"
														: "info"
										}
									/>
								</span>
								<Flex gap="small" align="center">
									<strong>
										{t(`trajectory.kind.${record.kind}`)}
									</strong>
									<p className={styles.traceRecordTitle}>
										{getTraceRecordTitle(record)}
									</p>
								</Flex>
								{record.detailLevel === "compacted" ? (
									<Tag>{t("trajectory.compacted")}</Tag>
								) : null}
								<Tag color={statusColor(record.status)}>
									{t(`trajectory.status.${record.status}`)}
								</Tag>
								<time>
									{formatTraceDuration(
										record.durationMs ?? 0,
									)}
								</time>
							</div>
						),
					}),
				),
			})),
		[groups, t],
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
	const handleExportLog = (): void => {
		void controller
			.exportLog({
				dialogTitle: t("trajectory.exportDialogTitle"),
				buttonLabel: t("trajectory.exportDialogButton"),
			})
			.then((result): void => {
				if (result.saved) message.success(t("trajectory.logExported"));
			})
			.catch((error: unknown): void => {
				console.error("[TrajectoryPanel] export log failed", error);
				message.error(t("trajectory.exportFailed"));
			});
	};

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
					<Flex className={styles.toolbarActions} gap="small" align="center">
						<Button
							type="text"
							icon={<Icon name="export" />}
							loading={controller.isExporting}
							disabled={
								controller.isLoading ||
								controller.records.length === 0
							}
							onClick={handleExportLog}
						>
							{controller.isExporting
								? t("trajectory.exportingLog")
								: t("trajectory.exportLog")}
						</Button>
						<Input
							prefix={<Icon name="search" />}
							allowClear
							value={query}
							onChange={(event): void => setQuery(event.target.value)}
							placeholder={t("trajectory.filter.placeholder")}
						/>
					</Flex>
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
					<Splitter
						className={styles.splitter}
						orientation="horizontal"
						draggerIcon={null}
					>
						<Splitter.Panel
							defaultSize="60%"
							min={280}
							className={styles.ledgerPanel}
						>
							<div className={styles.ledger}>
								<Spin spinning={controller.isLoading}>
									{groups.length === 0 &&
									!controller.isLoading ? (
										<Empty
											image={Empty.PRESENTED_IMAGE_SIMPLE}
											description={t("trajectory.empty")}
										/>
									) : (
										<Menu
											className={styles.ledgerMenu}
											mode="inline"
											items={ledgerItems}
											selectedKeys={
												controller.selectedRecordId ===
												null
													? []
													: [
															controller.selectedRecordId,
														]
											}
											onClick={({ key }): void =>
												controller.selectRecord(key)
											}
											aria-label={t(
												"dock.tabs.trajectory",
											)}
										/>
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
						</Splitter.Panel>
						<Splitter.Panel
							defaultSize="40%"
							min={280}
							className={styles.inspectorPanel}
						>
							<aside
								className={styles.inspector}
								aria-label={t("trajectory.details")}
							>
								<TraceInspector
									detail={selectedDetail}
									loading={controller.isLoadingDetail}
								/>
							</aside>
						</Splitter.Panel>
					</Splitter>
				</div>
			</div>
		</section>
	);
}

export default TrajectoryPanel;

import { Column } from "@ant-design/charts";
import { Checkbox, Empty, theme as antdTheme, Typography } from "antd";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
	buildTraceGanttSegments,
	formatTraceDuration,
	getTraceRecordTitle,
} from "@/domain/trajectory/trajectory-model";
import type { TraceRecord, TraceRecordKind } from "@/platform/rpc/trace-api";
import styles from "./TrajectoryGantt.module.css";

type TraceGanttProps = {
	records: readonly TraceRecord[];
};

type TraceGanttDatum = ReturnType<typeof buildTraceGanttSegments>[number] & {
	label: string;
};

const TRACE_GANTT_KINDS: TraceRecordKind[] = [
	"turn",
	"prompt",
	"model_call",
	"thinking",
	"tool_call",
	"approval",
	"retry",
	"step",
	"provider_reconnect",
	"final_response",
	"error",
];

function shortenLabel(value: string, maxLength: number): string {
	return value.length <= maxLength
		? value
		: `${value.slice(0, maxLength - 1)}…`;
}

function TraceGantt({ records }: TraceGanttProps): React.JSX.Element {
	const { t } = useTranslation();
	const { token } = antdTheme.useToken();
	const [visibleKinds, setVisibleKinds] = useState<TraceRecordKind[]>(
		TRACE_GANTT_KINDS,
	);
	const allSegments = useMemo((): TraceGanttDatum[] => {
		const recordById: Map<string, TraceRecord> = new Map(
			records.map((record): [string, TraceRecord] => [
				record.recordId,
				record,
			]),
		);
		return buildTraceGanttSegments(records).map(
			(segment): TraceGanttDatum => {
				const sourceRecord: TraceRecord | undefined = recordById.get(
					segment.recordId,
				);
				const title: string =
					sourceRecord === undefined
						? segment.kind
						: getTraceRecordTitle(sourceRecord);
				return {
					...segment,
					label: `${t("trajectory.turn", { turn: segment.turn })} · ${t(`trajectory.kind.${segment.kind}`)} #${segment.sequence} · ${shortenLabel(title, 24)}`,
				};
			},
		);
	}, [records, t]);
	const segments = useMemo(
		(): TraceGanttDatum[] =>
			allSegments.filter((segment): boolean =>
				visibleKinds.includes(segment.kind),
			),
		[allSegments, visibleKinds],
	);
	const kindOptions = useMemo(
		() =>
			TRACE_GANTT_KINDS.map((kind): { label: string; value: TraceRecordKind } => ({
				label: t(`trajectory.kind.${kind}`),
				value: kind,
			})),
		[t],
	);
	const chartHeight: number = Math.min(
		420,
		Math.max(160, segments.length * 28 + 56),
	);
	const chartTheme = useMemo(
		() => ({
			axis: {
				gridStroke: token.colorBorderSecondary,
				gridStrokeOpacity: 0.55,
				labelFill: token.colorTextSecondary,
				labelOpacity: 1,
				lineStroke: token.colorBorderSecondary,
				lineStrokeOpacity: 0.75,
				tickStroke: token.colorBorderSecondary,
				tickOpacity: 0.75,
				titleFill: token.colorText,
				titleOpacity: 1,
			},
		}),
		[token.colorBorderSecondary, token.colorText, token.colorTextSecondary],
	);
	const colorRange: string[] = [
		token.colorPrimary,
		token.colorInfo,
		token.colorPrimary,
		token.colorWarning,
		token.colorSuccess,
		token.colorWarning,
		token.colorTextTertiary,
		token.colorInfo,
		token.colorWarning,
		token.colorSuccess,
		token.colorError,
	];

	return (
		<section className={styles.section} data-testid="trajectory-gantt">
			<div className={styles.filters}>
				<Typography.Text type="secondary">
					{t("trajectory.gantt.filterLabel")}
				</Typography.Text>
				<Checkbox.Group
					options={kindOptions}
					value={visibleKinds}
					onChange={(values): void => {
						const selectedKinds: Set<TraceRecordKind> = new Set(values);
						setVisibleKinds(
							TRACE_GANTT_KINDS.filter((kind): boolean =>
								selectedKinds.has(kind),
							),
						);
					}}
					aria-label={t("trajectory.gantt.filterLabel")}
				/>
			</div>
			{segments.length === 0 ? (
				<div className={styles.empty}>
					<Empty
						image={Empty.PRESENTED_IMAGE_SIMPLE}
						description={t("trajectory.gantt.empty")}
					/>
				</div>
			) : (
				<div className={styles.chart}>
					<Column
						data={segments}
						theme={chartTheme}
						xField="label"
						yField={["startOffsetMs", "endOffsetMs"]}
						coordinate={{ transform: [{ type: "transpose" }] }}
						colorField="kind"
						scale={{
							x: {
								domain: segments.map(
									(segment): string => segment.label,
								),
							},
							color: {
								domain: TRACE_GANTT_KINDS,
								range: colorRange,
							},
						}}
						height={chartHeight}
						autoFit
						legend={false}
						axis={{
							x: false,
							y: {
								labelFormatter: (value: string): string =>
									formatTraceDuration(Number(value)),
							},
						}}
						tooltip={{
							title: "label",
							items: [
								(
									datum: TraceGanttDatum,
								): { name: string; value: string } => ({
									name: t("trajectory.gantt.duration"),
									value: formatTraceDuration(
										datum.durationMs,
									),
								}),
								(
									datum: TraceGanttDatum,
								): { name: string; value: string } => ({
									name: "requestId",
									value: datum.requestId,
								}),
							],
						}}
					/>
				</div>
			)}
		</section>
	);
}

export default TraceGantt;

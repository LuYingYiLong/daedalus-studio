import { Column } from "@ant-design/charts";
import { Checkbox, Empty, theme as antdTheme, Typography } from "antd";
import { useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
	buildTraceGanttSegments,
	formatTraceDuration,
	getTraceRecordTitle,
} from "@/domain/trajectory/trajectory-model";
import type { TraceTimeRange } from "@/domain/trajectory/trajectory-model";
import type { TraceRecord, TraceRecordKind } from "@/platform/rpc/trace-api";
import styles from "./TrajectoryGantt.module.css";

type TraceGanttProps = {
	records: readonly TraceRecord[];
	onTimeRangeChange?: (timeRange: TraceTimeRange | null) => void;
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

function TraceGantt({
	records,
	onTimeRangeChange,
}: TraceGanttProps): React.JSX.Element {
	const { t } = useTranslation();
	const { token } = antdTheme.useToken();
	const pointerSelectionRef = useRef<{
		pointerId: number;
		startX: number;
		currentX: number;
		width: number;
	} | null>(null);
	const [selection, setSelection] = useState<{
		startX: number;
		endX: number;
		width: number;
	} | null>(null);
	const [visibleKinds, setVisibleKinds] =
		useState<TraceRecordKind[]>(TRACE_GANTT_KINDS);
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
	const originMs: number | null = useMemo((): number | null => {
		const timestamps: number[] = allSegments
			.map((segment): number => Date.parse(segment.startedAt))
			.filter((value): boolean => Number.isFinite(value));
		return timestamps.length === 0 ? null : Math.min(...timestamps);
	}, [allSegments]);
	const maxOffsetMs: number = useMemo(
		(): number =>
			Math.max(
				1,
				...segments.map(
					(segment): number => segment.endOffsetMs,
				),
			),
		[segments],
	);
	const getPointerX = (
		event: React.PointerEvent<HTMLDivElement>,
	): { x: number; width: number } => {
		const bounds: DOMRect = event.currentTarget.getBoundingClientRect();
		return {
			x: Math.max(0, Math.min(bounds.width, event.clientX - bounds.left)),
			width: bounds.width,
		};
	};
	const updatePointerSelection = (
		event: React.PointerEvent<HTMLDivElement>,
	): void => {
		const currentSelection = pointerSelectionRef.current;
		if (currentSelection === null) return;
		const { x } = getPointerX(event);
		pointerSelectionRef.current = { ...currentSelection, currentX: x };
		setSelection({
			startX: currentSelection.startX,
			endX: x,
			width: currentSelection.width,
		});
	};
	const finishPointerSelection = (
		event: React.PointerEvent<HTMLDivElement>,
	): void => {
		const currentSelection = pointerSelectionRef.current;
		if (currentSelection === null) return;
		const { x, width } = getPointerX(event);
		const startX: number = Math.min(currentSelection.startX, x);
		const endX: number = Math.max(currentSelection.startX, x);
		pointerSelectionRef.current = null;
		if (event.currentTarget.hasPointerCapture(event.pointerId)) {
			event.currentTarget.releasePointerCapture(event.pointerId);
		}
		if (endX - startX < 4 || width <= 0 || originMs === null) {
			setSelection(null);
			onTimeRangeChange?.(null);
			return;
		}
		setSelection({ startX, endX, width });
		const startOffsetMs: number = (startX / width) * maxOffsetMs;
		const endOffsetMs: number = (endX / width) * maxOffsetMs;
		onTimeRangeChange?.([
			originMs + startOffsetMs,
			originMs + endOffsetMs,
		]);
	};
	const kindOptions = useMemo(
		() =>
			TRACE_GANTT_KINDS.map(
				(kind): { label: string; value: TraceRecordKind } => ({
					label: t(`trajectory.kind.${kind}`),
					value: kind,
				}),
			),
		[t],
	);
	const chartHeight: number = Math.min(
		128,
		Math.max(48, segments.length * 4 + 32),
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
						const selectedKinds: Set<TraceRecordKind> = new Set(
							values,
						);
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
						style={{ minWidth: 2, maxWidth: 2 }}
						state={{ inactive: { opacity: 1 } }}
						scale={{
							x: {
								domain: segments.map(
									(segment): string => segment.label,
								),
								paddingInner: 0,
								paddingOuter: 0,
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
								position: "top",
								labelAutoRotate: false,
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
					<div
						className={styles.selectionLayer}
						role="slider"
						aria-label={t("trajectory.gantt.rangeHint")}
						aria-valuemin={0}
						aria-valuemax={maxOffsetMs}
						tabIndex={0}
						onPointerDown={(event): void => {
							if (event.button !== 0) return;
							const { x, width } = getPointerX(event);
							pointerSelectionRef.current = {
								pointerId: event.pointerId,
								startX: x,
								currentX: x,
								width,
							};
							setSelection({ startX: x, endX: x, width });
							event.currentTarget.setPointerCapture(event.pointerId);
						}}
						onPointerMove={updatePointerSelection}
						onPointerUp={finishPointerSelection}
						onPointerCancel={(event): void => {
							pointerSelectionRef.current = null;
							setSelection(null);
							onTimeRangeChange?.(null);
							if (event.currentTarget.hasPointerCapture(event.pointerId)) {
								event.currentTarget.releasePointerCapture(event.pointerId);
							}
						}}
					/>
					{selection === null ? null : (
						<div
							className={styles.selection}
							style={{
								left: Math.min(selection.startX, selection.endX),
								width: Math.abs(selection.endX - selection.startX),
							}}
						/>
					)}
				</div>
			)}
		</section>
	);
}

export default TraceGantt;

import type { TraceRecord, TraceRecordKind, TraceSummary } from "@/platform/rpc/trace-api";

export type TraceTurnGroup = {
	turn: number;
	requestId: string;
	records: TraceRecord[];
};

export type TraceGanttSegment = {
	recordId: string;
	requestId: string;
	sequence: number;
	turn: number;
	kind: TraceRecordKind;
	status: TraceRecord["status"];
	startedAt: string;
	finishedAt?: string;
	startOffsetMs: number;
	endOffsetMs: number;
	durationMs: number;
};

export const EMPTY_TRACE_SUMMARY: TraceSummary = {
	revision: 0,
	turnCount: 0,
	modelCallCount: 0,
	toolCallCount: 0,
	errorCount: 0,
	durationMs: 0,
	inputTokens: 0,
	outputTokens: 0,
	hasDetails: false,
};

export function mergeTraceRecords(current: readonly TraceRecord[], incoming: readonly TraceRecord[]): TraceRecord[] {
	const byId: Map<string, TraceRecord> = new Map(current.map((record): [string, TraceRecord] => [record.recordId, record]));
	for (const record of incoming) {
		const existing: TraceRecord | undefined = byId.get(record.recordId);
		if (existing === undefined || record.revision >= existing.revision) byId.set(record.recordId, record);
	}
	return [...byId.values()].sort((left, right): number => left.sequence - right.sequence);
}

export function groupTraceRecords(records: readonly TraceRecord[]): TraceTurnGroup[] {
	const byTurn: Map<number, TraceTurnGroup> = new Map();
	for (const record of records) {
		let group: TraceTurnGroup | undefined = byTurn.get(record.turn);
		if (group === undefined) {
			group = { turn: record.turn, requestId: record.requestId, records: [] };
			byTurn.set(record.turn, group);
		}
		if (record.kind !== "turn") group.records.push(record);
	}
	return [...byTurn.values()].sort((left, right): number => left.turn - right.turn);
}

export function buildTraceGanttSegments(records: readonly TraceRecord[]): TraceGanttSegment[] {
	const parsedRecords: Array<{
		record: TraceRecord;
		startedAtMs: number;
		finishedAtMs?: number;
		durationMs: number;
	}> = records.flatMap((record): Array<{
		record: TraceRecord;
		startedAtMs: number;
		finishedAtMs?: number;
		durationMs: number;
	}> => {
		const startedAtMs: number = Date.parse(record.startedAt);
		if (!Number.isFinite(startedAtMs)) return [];
		const parsedFinishedAtMs: number = record.finishedAt === undefined ? Number.NaN : Date.parse(record.finishedAt);
		const finishedAtMs: number | undefined = Number.isFinite(parsedFinishedAtMs) ? parsedFinishedAtMs : undefined;
		const measuredDurationMs: number = finishedAtMs === undefined ? 0 : Math.max(0, finishedAtMs - startedAtMs);
		const declaredDurationMs: number = typeof record.durationMs === "number" && Number.isFinite(record.durationMs)
			? Math.max(0, record.durationMs)
			: 0;
		return [{
			record,
			startedAtMs,
			finishedAtMs,
			durationMs: Math.max(declaredDurationMs, measuredDurationMs),
		}];
	});
	if (parsedRecords.length === 0) return [];

	const originMs: number = Math.min(...parsedRecords.map((item): number => item.startedAtMs));
	return parsedRecords
		.sort((left, right): number => left.startedAtMs - right.startedAtMs || left.record.sequence - right.record.sequence)
		.map((item): TraceGanttSegment => {
			const startOffsetMs: number = Math.max(0, item.startedAtMs - originMs);
			const endOffsetMs: number = Math.max(
				startOffsetMs + 1,
				item.finishedAtMs === undefined ? startOffsetMs + item.durationMs : item.finishedAtMs - originMs,
				startOffsetMs + item.durationMs,
			);
			return {
				recordId: item.record.recordId,
				requestId: item.record.requestId,
				sequence: item.record.sequence,
				turn: item.record.turn,
				kind: item.record.kind,
				status: item.record.status,
				startedAt: item.record.startedAt,
				...(item.record.finishedAt === undefined ? {} : { finishedAt: item.record.finishedAt }),
				startOffsetMs,
				endOffsetMs,
				durationMs: item.durationMs,
			};
		});
}

export function filterTraceRecords(records: readonly TraceRecord[], kind: TraceRecordKind | "all", query: string): TraceRecord[] {
	const normalizedQuery: string = query.trim().toLocaleLowerCase();
	return records.filter((record): boolean => {
		if (kind !== "all" && record.kind !== kind) return false;
		if (normalizedQuery.length === 0) return true;
		return [record.recordId, record.requestId, record.runId, record.stepId, record.toolCallId, record.provider, record.model]
			.some((value): boolean => value?.toLocaleLowerCase().includes(normalizedQuery) === true);
	});
}

export function formatTraceDuration(durationMs: number): string {
	if (durationMs < 1_000) return `${Math.max(0, durationMs)} ms`;
	if (durationMs < 60_000) return `${(durationMs / 1_000).toFixed(1)} s`;
	return `${Math.floor(durationMs / 60_000)}m ${Math.round((durationMs % 60_000) / 1_000)}s`;
}

export function formatTraceTokens(value: number): string {
	return new Intl.NumberFormat(undefined, { notation: value >= 10_000 ? "compact" : "standard" }).format(value);
}

export function getTraceRecordTitle(record: TraceRecord): string {
	const toolName: unknown = record.summary.toolName;
	const title: unknown = record.summary.title;
	return typeof toolName === "string" ? toolName : typeof title === "string" ? title : record.provider !== undefined && record.model !== undefined ? `${record.provider} · ${record.model}` : record.kind;
}

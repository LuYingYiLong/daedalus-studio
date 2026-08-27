import type {
	TraceDetail,
	TraceRecord,
	TraceSummary,
} from "@/platform/rpc/trace-api";

export type TraceLogExportDocument = {
	format: "daedalus-trajectory-log";
	version: 1;
	exportedAt: string;
	sessionId: string;
	summary: TraceSummary;
	records: TraceRecord[];
	details: TraceDetail[];
};

export function serializeTraceLog(params: {
	sessionId: string;
	summary: TraceSummary;
	records: readonly TraceRecord[];
	details: readonly TraceDetail[];
	exportedAt?: string;
}): string {
	const document: TraceLogExportDocument = {
		format: "daedalus-trajectory-log",
		version: 1,
		exportedAt: params.exportedAt ?? new Date().toISOString(),
		sessionId: params.sessionId,
		summary: params.summary,
		records: [...params.records],
		details: [...params.details],
	};
	return `${JSON.stringify(document, null, 2)}\n`;
}

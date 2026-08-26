import { createBackendClient } from "@/platform/rpc/transport/backend-client";

export type TraceRecordKind =
	| "turn"
	| "prompt"
	| "model_call"
	| "thinking"
	| "tool_call"
	| "approval"
	| "retry"
	| "step"
	| "provider_reconnect"
	| "final_response"
	| "error";

export type TraceRecordStatus =
	| "pending"
	| "running"
	| "success"
	| "error"
	| "cancelled"
	| "approval_required";

export type TraceDetailLevel = "full" | "summary" | "compacted";

export type TraceRecord = {
	recordId: string;
	parentId?: string;
	sessionId: string;
	sequence: number;
	turn: number;
	kind: TraceRecordKind;
	status: TraceRecordStatus;
	requestId: string;
	runId?: string;
	stepId?: string;
	toolCallId?: string;
	provider?: string;
	model?: string;
	startedAt: string;
	finishedAt?: string;
	durationMs?: number;
	inputTokens?: number;
	outputTokens?: number;
	detailLevel: TraceDetailLevel;
	summary: Record<string, unknown>;
	contentHash?: string;
	truncated: boolean;
	hasDetails: boolean;
	revision: number;
};

export type TracePromptSection = {
	id: string;
	kind: "system" | "developer" | "history" | "user" | "tools" | "workspace" | "context" | "provider";
	label: string;
	content?: unknown;
	charCount: number;
	contentHash: string;
	truncated: boolean;
};

export type TraceSummary = {
	revision: number;
	turnCount: number;
	modelCallCount: number;
	toolCallCount: number;
	errorCount: number;
	durationMs: number;
	inputTokens: number;
	outputTokens: number;
	hasDetails: boolean;
};

export type TracePage = {
	revision: number;
	records: TraceRecord[];
	nextCursor?: string;
};

export type TraceDetail = {
	record: TraceRecord;
	promptSections: TracePromptSection[];
	request?: unknown;
	response?: unknown;
	redactions: string[];
	detailLevel: TraceDetailLevel;
	detailsHidden?: boolean;
};

export async function fetchTraceSummary(sessionId: string): Promise<TraceSummary> {
	return (await createBackendClient()).request<TraceSummary>("session.trace.summary", { sessionId });
}

export async function fetchTracePage(params: {
	sessionId: string;
	cursor?: string;
	limit?: number;
	turn?: number;
	kind?: TraceRecordKind;
}): Promise<TracePage> {
	return (await createBackendClient()).request<TracePage>("session.trace.page", params);
}

export async function fetchTraceDetail(sessionId: string, recordId: string): Promise<TraceDetail> {
	return (await createBackendClient()).request<TraceDetail>("session.trace.detail", { sessionId, recordId });
}

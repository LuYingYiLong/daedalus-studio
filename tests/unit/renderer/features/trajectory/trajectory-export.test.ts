import { describe, expect, it } from "vitest";
import { serializeTraceLog } from "@/domain/trajectory/trajectory-export";
import type { TraceRecord, TraceSummary } from "@/platform/rpc/trace-api";

const summary: TraceSummary = {
	revision: 3,
	turnCount: 1,
	modelCallCount: 1,
	toolCallCount: 0,
	errorCount: 0,
	durationMs: 120,
	inputTokens: 10,
	outputTokens: 20,
	hasDetails: true,
};

const record: TraceRecord = {
	recordId: "trace-1",
	sessionId: "session-test",
	sequence: 1,
	turn: 1,
	kind: "model_call",
	status: "success",
	requestId: "request-1",
	startedAt: "2026-08-27T00:00:00.000Z",
	detailLevel: "full",
	summary: {},
	truncated: false,
	hasDetails: false,
	revision: 3,
};

describe("trajectory export", () => {
	it("serializes a versioned, readable JSON document", () => {
		const content: string = serializeTraceLog({
			sessionId: "session-test",
			summary,
			records: [record],
			details: [],
			exportedAt: "2026-08-27T00:00:01.000Z",
		});
		const document = JSON.parse(content) as Record<string, unknown>;

		expect(document).toMatchObject({
		format: "daedalus-trajectory-log",
		version: 1,
		exportedAt: "2026-08-27T00:00:01.000Z",
		sessionId: "session-test",
		summary,
		records: [record],
		details: [],
	});
		expect(content.endsWith("\n")).toBe(true);
	});
});

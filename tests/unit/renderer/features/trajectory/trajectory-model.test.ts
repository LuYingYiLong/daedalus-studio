import { describe, expect, it } from "vitest";
import { filterTraceRecords, formatTraceDuration, groupTraceRecords, mergeTraceRecords } from "@/domain/trajectory/trajectory-model";
import type { TraceRecord } from "@/platform/rpc/trace-api";

function record(overrides: Partial<TraceRecord> = {}): TraceRecord {
	return {
		recordId: "record-1",
		sessionId: "session-1",
		sequence: 1,
		turn: 1,
		kind: "prompt",
		status: "success",
		requestId: "request-1",
		startedAt: "2026-08-26T00:00:00.000Z",
		detailLevel: "full",
		summary: {},
		truncated: false,
		hasDetails: true,
		revision: 1,
		...overrides,
	};
}

describe("trajectory model", () => {
	it("upserts realtime records by revision and preserves sequence order", () => {
		const current = [record(), record({ recordId: "record-2", sequence: 2, revision: 3, status: "running" })];
		const result = mergeTraceRecords(current, [
			record({ recordId: "record-2", sequence: 2, revision: 2, status: "error" }),
			record({ recordId: "record-3", sequence: 3, revision: 4, kind: "tool_call" }),
		]);
		expect(result.map((item): string => item.recordId)).toEqual(["record-1", "record-2", "record-3"]);
		expect(result[1]?.status).toBe("running");
	});

	it("groups child records by canonical turn without rendering synthetic turn rows", () => {
		const groups = groupTraceRecords([
			record({ recordId: "turn-1", kind: "turn" }),
			record({ recordId: "prompt-1", kind: "prompt" }),
			record({ recordId: "tool-2", kind: "tool_call", turn: 2, requestId: "request-2", sequence: 3 }),
		]);
		expect(groups).toHaveLength(2);
		expect(groups[0]?.records.map((item): string => item.recordId)).toEqual(["prompt-1"]);
		expect(groups[1]?.requestId).toBe("request-2");
	});

	it("filters by kind and developer identifiers", () => {
		const records = [
			record({ kind: "prompt" }),
			record({ recordId: "tool-1", kind: "tool_call", sequence: 2, toolCallId: "call-needle" }),
		];
		expect(filterTraceRecords(records, "tool_call", "needle")).toEqual([records[1]]);
		expect(filterTraceRecords(records, "prompt", "needle")).toEqual([]);
		expect(formatTraceDuration(61_200)).toBe("1m 1s");
	});
});

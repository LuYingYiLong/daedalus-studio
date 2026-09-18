import { describe, expect, it } from "vitest";
import type { FlowDocumentNodeStatus } from "@/platform/rpc/types";
import { normalizeFlowNodeRunStatus } from "@/widgets/flow/FlowNodes";

describe("Flow node run status", (): void => {
	it("normalizes detailed runtime states into idle, success, and failed lamps", (): void => {
		const expected: Record<FlowDocumentNodeStatus, "idle" | "success" | "failed"> = {
			idle: "idle",
			queued: "idle",
			running: "success",
			waiting: "idle",
			completed: "success",
			cached: "success",
			failed: "failed",
			cancelled: "idle",
			skipped: "idle",
		};
		for (const [status, lamp] of Object.entries(expected) as Array<[
			FlowDocumentNodeStatus,
			"idle" | "success" | "failed",
		]>) {
			expect(normalizeFlowNodeRunStatus(status)).toBe(lamp);
		}
	});
});

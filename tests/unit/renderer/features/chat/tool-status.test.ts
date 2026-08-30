import { describe, expect, it } from "vitest";
import { getToolStatus } from "@/domain/conversation/tool-status";

describe("tool terminal display", () => {
	it.each(["tool.", "agent.tool."])("stops unfinished %s events when the parent turn was cancelled", prefix => {
		for (const events of [
			[{ type: `${prefix}call`, preview: true }],
			[{ type: `${prefix}call` }],
			[{ type: `${prefix}call` }, { type: `${prefix}approval_required` }],
		]) expect(getToolStatus(events, true)).toBe("stopped");
	});
	it("keeps actual results authoritative after cancellation", () => {
		expect(getToolStatus([{ type: "tool.result" }], true)).toBe("success");
		expect(getToolStatus([{ type: "tool.result", validationStatus: "failed" }], true)).toBe("error");
		expect(getToolStatus([{ type: "tool.result" }, { type: "tool.error" }], true)).toBe("error");
		expect(getToolStatus([{ type: "tool.error" }, { type: "tool.result" }], true)).toBe("success");
	});
	it("does not turn pending or paused tools into a terminal state without a cancelled turn", () => {
		expect(getToolStatus([{ type: "tool.call", preview: true }])).toBe("pending");
		expect(getToolStatus([{ type: "tool.call" }])).toBe("running");
		expect(getToolStatus([{ type: "tool.call" }, { type: "tool.approval_required" }])).toBe("approval");
		expect(getToolStatus([{ type: "tool.approval_required" }, { type: "tool.approved" }])).toBe("running");
	});
});

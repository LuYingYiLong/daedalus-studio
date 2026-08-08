import { describe, expect, it } from "vitest";
import { getToolRecovery, isTimelineToolEventType } from "@/domain/conversation/tool-part-data";

describe("timeline tool event compatibility", () => {
	it("recognizes normalized and legacy agent-prefixed terminal events", () => {
		expect(isTimelineToolEventType({ type: "tool.result" }, "tool.result")).toBe(true);
		expect(isTimelineToolEventType({ type: "agent.tool.result" }, "tool.result")).toBe(true);
		expect(isTimelineToolEventType({ type: "agent.tool.error" }, "tool.error")).toBe(true);
		expect(isTimelineToolEventType({ type: "tool.call" }, "tool.result")).toBe(false);
	});

	it("reads recovery status from current events and persisted failure details", () => {
		expect(getToolRecovery([{
			type: "tool.error",
			recovery: { recoveryKey: "a", attempt: 2, maxAttempts: 3, status: "failed" }
		}])).toEqual({ recoveryKey: "a", attempt: 2, maxAttempts: 3, status: "failed" });
		expect(getToolRecovery([{
			type: "agent.tool.error",
			failure: {
				details: { recovery: { recoveryKey: "b", attempt: 3, maxAttempts: 3, status: "exhausted" } }
			}
		}])).toEqual({ recoveryKey: "b", attempt: 3, maxAttempts: 3, status: "exhausted" });
	});

	it("does not infer recovery state from free-form failure text", () => {
		expect(getToolRecovery([{
			type: "tool.error",
			message: "retry 3/3 exhausted"
		}])).toBeUndefined();
	});
});

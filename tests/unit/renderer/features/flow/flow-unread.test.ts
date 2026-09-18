import { describe, expect, it } from "vitest";
import {
	applyFlowRunFinished,
	markActiveFlowRead,
	removeUnreadFlows,
} from "@/domain/flow/flow-unread";

describe("Flow unread runs", (): void => {
	it("marks a finished run unread while the window is not focused", (): void => {
		const next = applyFlowRunFinished(new Set<string>(), {
			activeFlowId: "flow-a",
			flowId: "flow-a",
			surfaceVisible: true,
			windowFocused: false,
		});

		expect([...next]).toEqual(["flow-a"]);
	});

	it("marks a hidden or different Flow unread", (): void => {
		const hidden = applyFlowRunFinished(new Set<string>(), {
			activeFlowId: "flow-a",
			flowId: "flow-a",
			surfaceVisible: false,
			windowFocused: true,
		});
		const different = applyFlowRunFinished(new Set<string>(), {
			activeFlowId: "flow-a",
			flowId: "flow-b",
			surfaceVisible: true,
			windowFocused: true,
		});

		expect([...hidden]).toEqual(["flow-a"]);
		expect([...different]).toEqual(["flow-b"]);
	});

	it("does not mark the visible focused Flow unread", (): void => {
		const current = new Set<string>();
		const next = applyFlowRunFinished(current, {
			activeFlowId: "flow-a",
			flowId: "flow-a",
			surfaceVisible: true,
			windowFocused: true,
		});

		expect(next).toBe(current);
	});

	it("clears only the visible active Flow after focus", (): void => {
		const current = new Set(["flow-a", "flow-b"]);
		expect(markActiveFlowRead(current, "flow-a", true, false)).toBe(current);
		expect(markActiveFlowRead(current, "flow-a", false, true)).toBe(current);
		expect([...markActiveFlowRead(current, "flow-a", true, true)]).toEqual(["flow-b"]);
	});

	it("removes archived Flows", (): void => {
		const current = new Set(["flow-a", "flow-b", "flow-c"]);
		expect([...removeUnreadFlows(current, ["flow-a", "flow-c"])]).toEqual(["flow-b"]);
	});
});

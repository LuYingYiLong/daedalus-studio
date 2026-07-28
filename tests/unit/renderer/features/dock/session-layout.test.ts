import { describe, expect, it } from "vitest";
import {
	createDefaultSessionLayout,
	createTerminalRuntimeId,
	listTerminalRuntimeIds
} from "@/features/dock/session-layout";
import {
	createDockTab,
	getNextDockTabIndex,
	reorderDockTabs
} from "@/features/dock/DockPanelTabs";

describe("session dock layout", () => {
	it("creates the fixed closed defaults", () => {
		const layout = createDefaultSessionLayout();
		expect(layout.side).toMatchObject({
			open: false,
			size: 520,
			activeTabKey: "side:review:1"
		});
		expect(layout.bottom).toMatchObject({
			open: false,
			size: 280,
			activeTabKey: "bottom:terminal:1"
		});
	});

	it("creates stable keys and preserves explicit tab order", () => {
		const first = createDockTab("side", "review", 1);
		const second = createDockTab("side", "terminal", 1);
		const third = createDockTab("side", "review", 2);
		expect(getNextDockTabIndex([first, second, third], "review")).toBe(3);
		expect(reorderDockTabs([first, second, third], first.key, third.key)).toEqual([
			second,
			third,
			first
		]);
	});

	it("scopes terminal runtime ids to their session", () => {
		const layout = createDefaultSessionLayout();
		layout.side.tabs.push(createDockTab("side", "terminal", 1));
		expect(createTerminalRuntimeId("session-one", "bottom:terminal:1"))
			.not.toBe(createTerminalRuntimeId("session-two", "bottom:terminal:1"));
		expect(listTerminalRuntimeIds("session-one", layout)).toEqual([
			"session-one:side:terminal:1",
			"session-one:bottom:terminal:1"
		]);
		expect(createTerminalRuntimeId(`session-${"x".repeat(100)}`, `bottom:terminal:${"9".repeat(80)}`))
			.toHaveLength(80);
	});
});

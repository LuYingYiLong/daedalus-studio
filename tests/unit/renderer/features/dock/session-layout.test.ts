import { describe, expect, it } from "vitest";
import {
	createDefaultSessionLayout,
	createDefaultBrowserPanelLayout,
	createTerminalRuntimeId,
	listTerminalRuntimeIds,
	resetSessionFilePanelWorkspaceState
} from "@/domain/session/session-layout";
import {
	createDockTab,
	getNextDockTabIndex,
	reorderDockTabs
} from "@/widgets/dock/DockPanelTabs";

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
		expect(layout.fullscreenDock).toBeNull();
		expect(layout.browserPanels).toEqual({});
		expect(createDefaultBrowserPanelLayout()).toEqual({ lastUrl: null });
	});

	it("creates stable keys and preserves explicit tab order", () => {
		const first = createDockTab("side", "review", 1);
		const second = createDockTab("side", "terminal", 1);
		const third = createDockTab("side", "review", 2);
		const browser = createDockTab("side", "browser", 1);
		expect(getNextDockTabIndex([first, second, third], "review")).toBe(3);
		expect(reorderDockTabs([first, second, third], first.key, third.key)).toEqual([
			second,
			third,
			first
		]);
		expect(browser).toEqual({ key: "side:browser:1", kind: "browser", index: 1 });
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

	it("clears workspace-specific file panel state while preserving panel geometry", () => {
		const layout = createDefaultSessionLayout();
		layout.filePanels["side:files:1"] = {
			sidebarOpen: false,
			splitSize: 64,
			selectedSourceFolderId: "source-a",
			expandedPathsBySourceFolder: { "source-a": ["src"] },
			tabs: [{ key: "source-a:src/index.ts", sourceFolderId: "source-a", relativePath: "src/index.ts", pinned: true }],
			activeTabKey: "source-a:src/index.ts",
			previewTabKey: null
		};
		layout.browserPanels["side:browser:1"] = { lastUrl: "https://example.com" };

		const result = resetSessionFilePanelWorkspaceState(layout);
		expect(result.filePanels["side:files:1"]).toMatchObject({
			sidebarOpen: false,
			splitSize: 64,
			selectedSourceFolderId: null,
			expandedPathsBySourceFolder: {},
			tabs: [],
			activeTabKey: null,
			previewTabKey: null
		});
		expect(result.browserPanels["side:browser:1"]?.lastUrl).toBe("https://example.com");
	});
});

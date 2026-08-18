import { describe, expect, it } from "vitest";
import { readRepoFile } from "../../../../helpers/repo-paths";

describe("HomePage closed dock layout", () => {
	it("keeps direct Splitter panels stable while only mounting open dock content", () => {
		const source: string = readRepoFile("src", "renderer", "src", "widgets", "home", "HomePage.tsx");
		const dockPanelSource: string = readRepoFile("src", "renderer", "src", "widgets", "home", "HomeDockPanel.tsx");
		expect(source).toContain("const renderSideDock: boolean = sideDockConfig !== null");
		expect(source).toContain("const renderBottomDock: boolean = bottomDockConfig !== null");
		expect(source).toContain("sideDockOpen || sideDockFullscreen");
		expect(source).toContain("bottomDockOpen || bottomDockFullscreen");
		expect(source).toContain("size={sideDockConfig?.panel.size ?? SIDE_DOCK_CLOSED_SIZE}");
		expect(source).toContain("size={bottomDockConfig?.panel.size ?? BOTTOM_DOCK_CLOSED_SIZE}");
		expect(source).toContain("<HomeDockPanel {...sideDockConfig.content} />");
		expect(source).toContain("<HomeDockPanel {...bottomDockConfig.content} />");
		expect(dockPanelSource).not.toContain("<Splitter.Panel");
		expect(dockPanelSource).toContain("<DockPanelTabs {...dockPanelProps} />");
	});
});

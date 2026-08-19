import { describe, expect, it } from "vitest";
import { readRepoFile } from "../../../../helpers/repo-paths";

describe("HomePage closed dock layout", () => {
	it("keeps direct Splitter panels stable while only mounting open dock content", () => {
		const source: string = readRepoFile("src", "renderer", "src", "widgets", "home", "HomePage.tsx");
		const normalizedSource: string = source.replace(/\s+/gu, " ");
		const configSource: string = readRepoFile("src", "renderer", "src", "widgets", "home", "home-dock-panel-config.ts");
		const dockPanelSource: string = readRepoFile("src", "renderer", "src", "widgets", "home", "HomeDockPanel.tsx");
		expect(source).toContain("createHomeDockPanelConfigs");
		expect(configSource).toContain("sideDockConfig !== null && (side.isOpen || side.isFullscreen)");
		expect(configSource).toContain("bottomDockConfig !== null && (bottom.isOpen || bottom.isFullscreen)");
		expect(normalizedSource).toContain("size={ sideDockConfig?.panel.size ?? SIDE_DOCK_CLOSED_SIZE }");
		expect(normalizedSource).toContain("size={ bottomDockConfig?.panel.size ?? BOTTOM_DOCK_CLOSED_SIZE }");
		expect(normalizedSource).toContain("<HomeDockPanel {...sideDockConfig.content} />");
		expect(normalizedSource).toContain("<HomeDockPanel {...bottomDockConfig.content} />");
		expect(dockPanelSource).not.toContain("<Splitter.Panel");
		expect(dockPanelSource).toContain("<DockPanelTabs {...dockPanelProps} />");
	});
});

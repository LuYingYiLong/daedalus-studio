import { describe, expect, it } from "vitest";
import { readRepoFile } from "../../../../helpers/repo-paths";

describe("Home dock fullscreen", () => {
	it("toggles the dock control and uses the chat area as the fullscreen bounds", () => {
		const panelTabsSource: string = readRepoFile("src", "renderer", "src", "widgets", "panel-tabs", "PanelTabs.tsx");
		const dockSource: string = readRepoFile("src", "renderer", "src", "widgets", "dock", "DockPanelTabs.tsx");
		const dockCss: string = readRepoFile("src", "renderer", "src", "widgets", "dock", "DockPanelTabs.module.css");
		const homeSource: string = readRepoFile("src", "renderer", "src", "widgets", "home", "HomePage.tsx");
		const homeCss: string = readRepoFile("src", "renderer", "src", "widgets", "home", "HomePage.module.css");
		const composerSource: string = readRepoFile("src", "renderer", "src", "widgets", "composer", "Composer.tsx");
		const composerCss: string = readRepoFile("src", "renderer", "src", "widgets", "composer", "Composer.module.css");

		expect(panelTabsSource).toContain('name={isFullscreen ? "compress" : "distraction-free"}');
		expect(panelTabsSource).toContain("aria-pressed={isFullscreen}");
		expect(dockSource).toContain("isFullscreen={isFullscreen}");
		expect(dockSource).toContain('t("dock.tabs.enterFullscreen")');
		expect(dockCss).toContain(".fullscreen");
		expect(dockCss).toContain("padding-top: var(--ds-space-2);");
		expect(homeSource).toContain("type DockFullscreenPlacement");
		expect(homeSource).toContain("visualSessionLayout.fullscreenDock");
		expect(homeSource).toContain("toggleDockFullscreen");
		expect(homeSource).toContain('size={bottomDockFullscreen ? "100%"');
		expect(homeSource).toContain('size={sideDockFullscreen ? "100%"');
		expect(homeSource).toContain("fullscreenComposer");
		expect(homeSource).toContain("renderComposer(true)");
		expect(composerSource).toContain("autoSize={compact ? { minRows: 1, maxRows: 1 }");
		expect(composerCss).toContain(".composerRootCompact .footer");
		expect(homeSource).toContain("data-dock-fullscreen={activeFullscreenDock ?? undefined}");
		expect(homeCss).toContain("data-fullscreen-motion-disabled=\"true\"");
	});
});

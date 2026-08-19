import { describe, expect, it } from "vitest";
import { readAppImplementation, readRepoFile } from "../../../../helpers/repo-paths";

describe("global workspace sidebar layout", () => {
	const appSource: string = readAppImplementation();
	const homeSource: string = readRepoFile("src", "renderer", "src", "widgets", "home", "HomePage.tsx");
	const titlebarSource: string = readRepoFile("src", "renderer", "src", "app", "shell", "Titlebar.tsx");

	it("stores the workspace sidebar outside session layouts and persists only resize end", () => {
		expect(appSource).toContain("workspaceSidebar: clientPreferences.workspaceSidebar");
		expect(appSource).toContain("updateClientPreferences({ workspaceSidebar })");
		expect(homeSource).toContain("onResize={handleWorkspaceSidebarResize}");
		expect(homeSource).toContain("onResizeEnd={handleWorkspaceSidebarResizeEnd}");
		expect(homeSource).toContain("applyVisualWorkspaceSidebar({");
		expect(homeSource).toContain("commitWorkspaceSidebar({");
	});

	it("uses text buttons and state-specific layout icons", () => {
		const normalizedTitlebarSource: string = titlebarSource.replace(/\s+/gu, " ");
		const normalizedHomeSource: string = homeSource.replace(/\s+/gu, " ");
		expect(titlebarSource).toContain('type="text"');
		expect(titlebarSource).toContain('shape="circle"');
		expect(normalizedTitlebarSource).toContain('"layout-left-toggled" : "layout-left"');
		expect(homeSource).toContain('type="text"');
		expect(normalizedHomeSource).toContain('"layout-right-toggled" : "layout-right"');
		expect(normalizedHomeSource).toContain('"layout-bottom-toggled" : "layout-bottom"');
		expect(homeSource).not.toContain('type={summaryOpen ? "primary" : "text"}');
	});
});

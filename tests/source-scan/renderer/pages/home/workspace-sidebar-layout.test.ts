import { describe, expect, it } from "vitest";
import { readRepoFile } from "../../../../helpers/repo-paths";

describe("global workspace sidebar layout", () => {
	const appSource: string = readRepoFile("src", "renderer", "src", "app", "App.tsx");
	const homeSource: string = readRepoFile("src", "renderer", "src", "pages", "home", "HomePage.tsx");
	const titlebarSource: string = readRepoFile("src", "renderer", "src", "app", "layout", "Titlebar.tsx");

	it("stores the workspace sidebar outside session layouts and persists only resize end", () => {
		expect(appSource).toContain("workspaceSidebar={clientPreferences.workspaceSidebar}");
		expect(appSource).toContain("updateClientPreferences({ workspaceSidebar })");
		expect(homeSource).toContain("onResize={handleWorkspaceSidebarResize}");
		expect(homeSource).toContain("onResizeEnd={handleWorkspaceSidebarResizeEnd}");
		expect(homeSource).toContain("{ persist: false }");
	});

	it("uses text buttons and state-specific layout icons", () => {
		expect(titlebarSource).toContain('type="text"');
		expect(titlebarSource).toContain('shape="circle"');
		expect(titlebarSource).toContain('"layout-left-toggled" : "layout-left"');
		expect(homeSource).toContain('type="text"');
		expect(homeSource).toContain('"layout-right-toggled" : "layout-right"');
		expect(homeSource).toContain('"layout-bottom-toggled" : "layout-bottom"');
		expect(homeSource).not.toContain('type={summaryOpen ? "primary" : "text"}');
	});
});

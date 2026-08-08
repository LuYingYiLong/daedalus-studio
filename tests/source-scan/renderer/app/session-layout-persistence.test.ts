import { describe, expect, it } from "vitest";
import { readAppImplementation, readRepoFile } from "../../../helpers/repo-paths";

describe("session layout persistence wiring", () => {
	const appSource: string = readAppImplementation();
	const bootstrapSource: string = readRepoFile("src", "renderer", "src", "app", "bootstrap.ts");
	const homeSource: string = readRepoFile("src", "renderer", "src", "pages", "home", "HomePage.tsx");
	const dockSource: string = readRepoFile("src", "renderer", "src", "features", "dock", "DockPanelTabs.tsx");
	const preloadSource: string = readRepoFile("src", "preload", "index.ts");

	it("loads layouts during bootstrap and exposes the dedicated Electron API", () => {
		expect(bootstrapSource).toContain("window.electronAPI.sessionLayout.getAll()");
		expect(bootstrapSource).toContain("sessionLayouts: SessionLayoutMap;");
		expect(preloadSource).toContain('"session-layout:get-all"');
		expect(preloadSource).toContain('"session-layout:save"');
		expect(preloadSource).toContain('"session-layout:remove"');
	});

	it("keeps layouts in App and does not persist transient splitter movement", () => {
		expect(appSource).toContain("bootstrapData.sessionLayouts");
		expect(appSource).toContain("window.electronAPI.sessionLayout.save({ sessionId, layout })");
		expect(homeSource).toContain("applyVisualSessionLayout({");
		expect(homeSource).toContain("commitSessionLayout({");
		expect(homeSource).toContain("onResizeEnd={handleSideDockResizeEnd}");
		expect(homeSource).toContain("onResizeEnd={handleBottomDockResizeEnd}");
		expect(homeSource).not.toContain("setSideDockOpen(false);");
	});

	it("uses controlled tabs and session-scoped terminal ids", () => {
		expect(dockSource).not.toContain("useState<DockTab");
		expect(dockSource).toContain("layout: DockLayoutPreferences;");
		expect(dockSource).toContain("onLayoutChange: (layout: DockLayoutPreferences) => void;");
		expect(dockSource).toContain("createTerminalRuntimeId(sessionId, tab.key)");
		expect(homeSource).toContain("listTerminalRuntimeIds(previous.sessionId, previous.layout)");
	});

	it("cleans layouts only from destructive session lifecycle paths", () => {
		expect(appSource).toContain("deleteSessionWithLayout");
		expect(appSource).toContain("...result.deletedArchivedSessionIds");
		expect(appSource).toContain("window.electronAPI.sessionLayout.remove");
		expect(appSource).not.toContain("handleSessionArchive(session: SessionMetadata): void {\n\t\tremoveStoredSessionLayouts");
	});
});

import { describe, expect, it } from "vitest";
import { readAppImplementation, readRepoFile } from "../../../../helpers/repo-paths";

describe("ArchivedSessionSettingsPage", () => {
	it("invalidates the main-window session catalog after restoring a session", () => {
		const pageSource: string = readRepoFile(
			"src",
			"renderer",
			"src",
			"widgets", "settings",
			"ArchivedSessionSettingsPage.tsx"
		);
		const appSource: string = readAppImplementation();
		const workspaceTreeSource: string = readRepoFile(
			"src",
			"renderer",
			"src",
			"widgets", "workspace",
			"WorkspaceTree.tsx"
		);
		const preloadSource: string = readRepoFile("src", "preload", "index.ts");
		const mainSource: string = readRepoFile("src", "main", "index.ts");
		const viteEnvSource: string = readRepoFile("src", "renderer", "src", "vite-env.d.ts");

		expect(pageSource).toContain("window.electronAPI.sessionCatalog.notifyChanged()");
		expect(pageSource).toContain("window.electronAPI.sessionCatalog.onChanged");
		expect(pageSource).toContain("setCatalogRevision((currentRevision: number): number => currentRevision + 1)");
		expect(workspaceTreeSource).toContain("window.electronAPI.sessionCatalog.notifyChanged()");
		expect(appSource).toContain("window.electronAPI.sessionCatalog.onChanged");
		expect(appSource).toContain("setWorkspaceRefreshToken((currentToken: number): number => currentToken + 1)");
		expect(preloadSource).toContain('ipcRenderer.send("session-catalog:changed")');
		expect(preloadSource).toContain('ipcRenderer.on("session-catalog:changed", handler)');
		expect(mainSource).toContain('ipcMain.on("session-catalog:changed"');
		expect(mainSource).toContain("broadcastSessionCatalogChanged(event.sender.id)");
		expect(viteEnvSource).toContain("interface SessionCatalogAPI");
	});
});

import { describe, expect, it } from "vitest";
import { readRepoFile } from "../../../../helpers/repo-paths";

describe("GeneralSettingsPage", () => {
	it("renders general options and splits backend settings from client preferences", () => {
		const pageSource: string = readRepoFile("src", "renderer", "src", "pages", "settings", "GeneralSettingsPage.tsx");
		const apiSource: string = readRepoFile("src", "renderer", "src", "api", "client-preferences-api.ts");
		const generalApiSource: string = readRepoFile("src", "renderer", "src", "api", "general-settings-api.ts");
		const preloadSource: string = readRepoFile("src", "preload", "index.ts");
		const viteEnvSource: string = readRepoFile("src", "renderer", "src", "vite-env.d.ts");

		expect(pageSource).toContain("Auto-expand todo list");
		expect(pageSource).toContain("Check for updates on startup");
		expect(pageSource).toContain("Daedalus Studio and backend updates");
		expect(pageSource).toContain("Minimize to tray on close");
		expect(pageSource).toContain("Display settings");
		expect(pageSource).toContain("Theme");
		expect(pageSource).toContain("System");
		expect(pageSource).toContain("updateClientPreferences");
		expect(pageSource).toContain("updateGeneralSettings");
		expect(pageSource).not.toContain("<List");
		expect(pageSource).not.toContain("List.Item");
		expect(pageSource).not.toContain(", List,");
		expect(apiSource).toContain("window.electronAPI.clientPreferences.get");
		expect(apiSource).toContain("window.electronAPI.clientPreferences.update");
		expect(generalApiSource).toContain('client.request<GeneralSettings>("generalSettings.get")');
		expect(generalApiSource).toContain('client.request<GeneralSettings>("generalSettings.update", patch)');
		expect(preloadSource).toContain("client-preferences:get");
		expect(preloadSource).toContain("client-preferences:update");
		expect(viteEnvSource).toContain("ClientPreferencesAPI");
		expect(viteEnvSource).toContain("autoCheckForUpdates: boolean;");
	});
});

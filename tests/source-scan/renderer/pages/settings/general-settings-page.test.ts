import { describe, expect, it } from "vitest";
import { readRepoFile } from "../../../../helpers/repo-paths";

describe("GeneralSettingsPage", () => {
	it("renders general options and splits backend settings from client preferences", () => {
		const pageSource: string = readRepoFile("src", "renderer", "src", "pages", "settings", "GeneralSettingsPage.tsx");
		const apiSource: string = readRepoFile("src", "renderer", "src", "api", "client-preferences-api.ts");
		const generalApiSource: string = readRepoFile("src", "renderer", "src", "api", "general-settings-api.ts");
		const preloadSource: string = readRepoFile("src", "preload", "index.ts");
		const viteEnvSource: string = readRepoFile("src", "renderer", "src", "vite-env.d.ts");

		expect(pageSource).toContain("useTranslation");
		expect(pageSource).toContain("settings.general.general.autoExpandTodoList.title");
		expect(pageSource).toContain("settings.general.general.autoCheckForUpdates.title");
		expect(pageSource).toContain("settings.general.general.minimizeToTrayOnClose.title");
		expect(pageSource).toContain("settings.general.display.title");
		expect(pageSource).toContain("settings.general.display.theme.title");
		expect(pageSource).toContain("settings.general.display.language.title");
		expect(pageSource).toContain("Select<LanguagePreference>");
		expect(pageSource).toContain("languageOptions");
		expect(pageSource).toContain("updateClientPreferences");
		expect(pageSource).toContain("updateGeneralSettings");
		expect(pageSource).toContain("settings.general.godot.executable");
		expect(pageSource).toContain("window.electronAPI.pickGodotExecutable()");
		expect(apiSource).toContain('language: "system"');
		expect(generalApiSource).toContain("godotExecutablePath: null");
		expect(generalApiSource).toContain("schemaVersion: 2;");
		expect(generalApiSource).toContain("godotExecutableVersion: string | null;");
		expect(generalApiSource).toContain('godotExecutableStatus: "unconfigured" | "ready" | "unavailable";');
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
		expect(viteEnvSource).toContain('language: "system" | "en-US" | "zh-CN";');
	});
});

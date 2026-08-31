import { describe, expect, it } from "vitest";
import { readRepoFile } from "../../../../helpers/repo-paths";

describe("GeneralSettingsPage", () => {
	it("keeps general options separate from Studio appearance preferences", () => {
		const pageSource: string = readRepoFile("src", "renderer", "src", "widgets", "settings", "GeneralSettingsPage.tsx");
		const appearancePageSource: string = readRepoFile("src", "renderer", "src", "widgets", "settings", "AppearanceSettingsPage.tsx");
		const cssSource: string = readRepoFile("src", "renderer", "src", "widgets", "settings", "GeneralSettingsPage.module.css");
	const motionCssSource: string = readRepoFile("src", "renderer", "src", "widgets", "settings", "components", "SettingsPageMotion.module.css");
		const apiSource: string = readRepoFile("src", "renderer", "src", "platform", "rpc", "client-preferences-api.ts");
		const clientPreferencesContractSource: string = readRepoFile("src", "contracts", "client-preferences.ts");
		const generalApiSource: string = readRepoFile("src", "renderer", "src", "platform", "rpc", "general-settings-api.ts");
		const generalSettingsContractSource: string = readRepoFile("src", "contracts", "general-settings.ts");
		const preloadSource: string = readRepoFile("src", "preload", "index.ts");
		const viteEnvSource: string = readRepoFile("src", "renderer", "src", "vite-env.d.ts");
		const mainSource: string = readRepoFile("src", "main", "index.ts");
		const preferencesControllerSource: string = readRepoFile(
			"src",
			"renderer",
			"src",
			"app",
			"runtime",
			"hooks",
			"useClientPreferencesController.ts"
		);

		expect(pageSource).toContain("useTranslation");
		expect(pageSource).toContain("settings.general.general.nextStepHintsEnabled.title");
		expect(pageSource).toContain("settings.general.general.autoCompactActivityDetails.title");
		expect(pageSource).toContain("settings.general.general.developerMode.title");
		expect(pageSource).toContain("settings.general.notifications.title");
		expect(pageSource).toContain("settings.general.notifications.runCompleted.title");
		expect(pageSource).toContain("settings.general.general.autoCheckForUpdates.title");
		expect(pageSource).toContain("settings.general.general.minimizeToTrayOnClose.title");
		expect(pageSource).toContain("settings.general.display.language.title");
		expect(pageSource).toContain("Select<LanguagePreference>");
		expect(pageSource).toContain("languageOptions");
		expect(pageSource).toContain("updateGeneralSettings");
		expect(pageSource).toContain("settings.general.godot.executable");
		expect(pageSource).toContain("draftGeneralSettings.godotExecutablePath?.trim()");
		expect(pageSource).toContain("<SettingsItem");
		expect(pageSource).toContain("pageMotionStyles.enter");
		expect(pageSource).not.toContain("<Input");
		expect(appearancePageSource).toContain("settings.appearance.theme.title");
		expect(appearancePageSource).toContain("settings.appearance.fonts.${key === \"fontFamily\" ? \"body\" : \"code\"}");
		expect(appearancePageSource).toContain("settings.appearance.interface.motion.title");
		expect(appearancePageSource).toContain("settings.appearance.interface.uiFontSize.title");
		expect(appearancePageSource).toContain("settings.appearance.fonts.codeSize.title");
		expect(appearancePageSource).toContain("<Switch");
		expect(appearancePageSource).toContain("<InputNumber");
		expect(appearancePageSource).toContain("<Input");
		expect(appearancePageSource).toContain("updateClientPreferences");
		expect(appearancePageSource).toContain("event.preventDefault()");
		expect(pageSource).not.toContain("<Tag");
		expect(pageSource).toContain("window.electronAPI.pickGodotExecutable()");
		expect(apiSource).toContain('"../../../../contracts/client-preferences"');
		expect(clientPreferencesContractSource).toContain("export type ClientPreferences = {");
		expect(clientPreferencesContractSource).toContain("notifyOnRunCompleted: boolean;");
		expect(clientPreferencesContractSource).toContain("fontFamily: string;");
		expect(clientPreferencesContractSource).toContain("fontFamilyCode: string;");
		expect(clientPreferencesContractSource).toContain("animationsEnabled: boolean;");
		expect(clientPreferencesContractSource).toContain("uiFontSize: number;");
		expect(clientPreferencesContractSource).toContain("codeFontSize: number;");
		expect(clientPreferencesContractSource).toContain("export type ClientPreferencesPatch = Partial<ClientPreferences>;");
		expect(generalApiSource).toContain("godotExecutablePath: null");
		expect(generalSettingsContractSource).toContain("nextStepHintsEnabled: boolean;");
		expect(generalSettingsContractSource).toContain("autoCompactActivityDetails: boolean;");
		expect(generalSettingsContractSource).toContain("developerMode: boolean;");
		expect(generalSettingsContractSource).not.toContain("fontFamily: string;");
		expect(generalSettingsContractSource).not.toContain("fontFamilyCode: string;");
		expect(generalSettingsContractSource).toContain("schemaVersion: 5;");
		expect(generalSettingsContractSource).toContain("godotExecutableVersion: string | null;");
		expect(generalSettingsContractSource).toContain('godotExecutableStatus: "unconfigured" | "ready" | "unavailable";');
		expect(pageSource).not.toContain("<List");
		expect(pageSource).not.toContain("List.Item");
		expect(pageSource).not.toContain(", List,");
		expect(cssSource).toContain("padding: 0px 0px var(--ds-space-2) var(--ds-space-2);");
		expect(cssSource).toContain(".settingsStack");
		expect(cssSource).toContain("overflow-y: auto;");
		expect(motionCssSource).toContain("animation: settingsPageContentEnter 160ms ease-out both;");
		expect(motionCssSource).toContain("@media (prefers-reduced-motion: reduce)");
		expect(apiSource).toContain("window.electronAPI.clientPreferences.get");
		expect(apiSource).toContain("window.electronAPI.clientPreferences.update");
		expect(generalApiSource).toContain('client.request<GeneralSettings>("generalSettings.get")');
		expect(generalApiSource).toContain('client.request<GeneralSettings>("generalSettings.update", patch)');
		expect(generalApiSource).toContain("window.electronAPI.generalSettings?.notifyChanged(settings)");
		expect(preloadSource).toContain("client-preferences:get");
		expect(preloadSource).toContain("client-preferences:update");
		expect(preloadSource).toContain("client-preferences:changed");
		expect(preloadSource).toContain('"../contracts/client-preferences"');
		expect(preloadSource).toContain("applyRendererTheme(preferences)");
		expect(preloadSource).toContain("preferences.uiFontSize");
		expect(preloadSource).toContain("preferences.codeFontSize");
		expect(preloadSource).toContain("preferences.animationsEnabled");
		expect(mainSource).toContain("broadcastClientPreferencesChanged(nextPreferences)");
		expect(mainSource).toContain('ipcMain.on("general-settings:changed"');
		expect(preferencesControllerSource).toContain("window.electronAPI.clientPreferences.onChanged");
		expect(preferencesControllerSource).toContain("dispatchClientPreferencesChanged(preferences)");
		expect(viteEnvSource).toContain("ClientPreferencesAPI");
		expect(viteEnvSource).toContain('"../../contracts/client-preferences"');
		expect(viteEnvSource).toContain("onChanged: (callback: (preferences: ClientPreferences) => void) => () => void;");
		expect(viteEnvSource).toContain("type ClientPreferences = StudioClientPreferences;");
		expect(viteEnvSource).toContain("type ClientPreferencesPatch = StudioClientPreferencesPatch;");
	});
});

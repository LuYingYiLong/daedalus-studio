import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const TEST_DIR: string = dirname(fileURLToPath(import.meta.url));

describe("GeneralSettingsPage", () => {
	it("renders general options and splits backend settings from client preferences", () => {
		const pageSource = readFileSync(join(TEST_DIR, "GeneralSettingsPage.tsx"), "utf8");
		const apiSource = readFileSync(join(TEST_DIR, "..", "..", "api", "client-preferences-api.ts"), "utf8");
		const generalApiSource = readFileSync(join(TEST_DIR, "..", "..", "api", "general-settings-api.ts"), "utf8");
		const preloadSource = readFileSync(join(TEST_DIR, "..", "..", "..", "..", "preload", "index.ts"), "utf8");
		const viteEnvSource = readFileSync(join(TEST_DIR, "..", "..", "vite-env.d.ts"), "utf8");

		expect(pageSource).toContain("Auto-expand todo list");
		expect(pageSource).toContain("Minimize to tray on close");
		expect(pageSource).toContain("updateClientPreferences");
		expect(pageSource).toContain("updateGeneralSettings");
		expect(apiSource).toContain("window.electronAPI.clientPreferences.get");
		expect(apiSource).toContain("window.electronAPI.clientPreferences.update");
		expect(generalApiSource).toContain('client.request<GeneralSettings>("generalSettings.get")');
		expect(generalApiSource).toContain('client.request<GeneralSettings>("generalSettings.update", patch)');
		expect(preloadSource).toContain("client-preferences:get");
		expect(preloadSource).toContain("client-preferences:update");
		expect(viteEnvSource).toContain("ClientPreferencesAPI");
	});
});

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const TEST_DIR: string = dirname(fileURLToPath(import.meta.url));

describe("SearchSettingsPage", () => {
	it("renders web search settings backed by backend RPC", () => {
		const pageSource = readFileSync(join(TEST_DIR, "SearchSettingsPage.tsx"), "utf8");
		const settingsSource = readFileSync(join(TEST_DIR, "SettingsPage.tsx"), "utf8");
		const apiSource = readFileSync(join(TEST_DIR, "..", "..", "api", "web-search-settings-api.ts"), "utf8");
		const providerSource = readFileSync(join(TEST_DIR, "ProviderSettingsPage.tsx"), "utf8");
		const composerSource = readFileSync(join(TEST_DIR, "..", "..", "features", "composer", "Composer.tsx"), "utf8");

		expect(settingsSource).toContain('key: "search"');
		expect(settingsSource).toContain('label: "Search"');
		expect(settingsSource).toContain('icon: <Icon name="search" />');
		expect(pageSource).not.toContain("Enable web search");
		expect(pageSource).toContain("Search model");
		expect(pageSource).toContain("Composer Search button");
		expect(apiSource).toContain('client.request<WebSearchSettings>("webSearchSettings.get")');
		expect(apiSource).toContain('client.request<WebSearchSettings>("webSearchSettings.update", patch)');
		expect(providerSource).toContain('{ key: "webSearch", label: "Search", icon: "search"');
		expect(composerSource).toContain('modelBadges.push("Search")');
		expect(composerSource).toContain("webSearchEnabled");
		expect(composerSource).toContain('Icon name="search"');
	});
});

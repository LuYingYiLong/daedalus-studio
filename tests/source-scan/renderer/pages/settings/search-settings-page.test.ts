import { describe, expect, it } from "vitest";
import { readRepoFile } from "../../../../helpers/repo-paths";

describe("SearchSettingsPage", () => {
	it("renders web search settings backed by backend RPC", () => {
		const pageSource: string = readRepoFile("src", "renderer", "src", "pages", "settings", "SearchSettingsPage.tsx");
		const settingsSource: string = readRepoFile("src", "renderer", "src", "pages", "settings", "SettingsPage.tsx");
		const apiSource: string = readRepoFile("src", "renderer", "src", "api", "web-search-settings-api.ts");
		const providerSource: string = readRepoFile("src", "renderer", "src", "pages", "settings", "ProviderSettingsPage.tsx");
		const composerSource: string = readRepoFile("src", "renderer", "src", "features", "composer", "Composer.tsx");

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

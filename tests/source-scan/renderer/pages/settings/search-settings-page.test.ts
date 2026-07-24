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
		expect(settingsSource).toContain('labelKey: "settings.menu.search"');
		expect(settingsSource).toContain('icon: <Icon name="search" />');
		expect(pageSource).toContain("settings.search.enabled.title");
		expect(pageSource).toContain("<Switch");
		expect(pageSource).toContain("checked={settings.enabled}");
		expect(pageSource).toContain("void savePatch(\"enabled\", { enabled });");
		expect(pageSource).toContain("settings.search.model.title");
		expect(pageSource).toContain("settings.search.maxResults.title");
		expect(pageSource).toContain("SEARCH_RESULT_MARKS");
		expect(pageSource).toContain("onChangeComplete");
		expect(pageSource).not.toContain("<List");
		expect(pageSource).not.toContain("List.Item");
		expect(pageSource).not.toContain(", List,");
		expect(apiSource).toContain("enabled: boolean");
		expect(apiSource).toContain("enabled?: boolean");
		expect(apiSource).toContain("maxResults: number");
		expect(pageSource).toContain("settings.search.model.description");
		expect(apiSource).toContain('client.request<WebSearchSettings>("webSearchSettings.get")');
		expect(apiSource).toContain('client.request<WebSearchSettings>("webSearchSettings.update", patch)');
		expect(providerSource).toContain('key: "webSearch"');
		expect(providerSource).toContain('labelKey: "settings.provider.capabilities.webSearch"');
		expect(composerSource).toContain('modelBadges.push("Search")');
		expect(composerSource).not.toContain("webSearchEnabled");
		expect(composerSource).not.toContain("onWebSearchEnabledChange");
		expect(composerSource).not.toContain("searchButton");
	});
});

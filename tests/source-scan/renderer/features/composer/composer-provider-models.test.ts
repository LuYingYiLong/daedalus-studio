import { describe, expect, it } from "vitest";
import { readAppImplementation, readRepoFile } from "../../../../helpers/repo-paths";

describe("Composer provider models", () => {
	it("shows configured and enabled providers only and opens provider settings for the empty state", () => {
		const composerSource: string = readRepoFile("src", "renderer", "src", "widgets", "composer", "Composer.tsx");
		const homePageSource: string = readRepoFile("src", "renderer", "src", "widgets", "home", "HomePage.tsx");
	const appSource: string = readAppImplementation();

		expect(composerSource).toContain("return provider.configured && provider.enabled !== false;");
		expect(composerSource).toContain('t("composer.model.configureProvider")');
		expect(composerSource).toContain("onClick={!hasConfiguredProviders ? onConfigureProvider : undefined}");
		expect(composerSource).toContain("`${selectedProvider.displayName}/${selectedModelInfo?.displayName ?? selectedModel.model}`");
		expect(homePageSource).toContain('window.electronAPI.windowControl.openSettings("provider")');
		expect(appSource).toContain("const firstProvider = selection?.providers.find((provider): boolean => provider.configured && provider.enabled !== false && provider.models.length > 0);");
		expect(appSource).toContain("window.addEventListener(\"focus\", handleWindowFocus);");
	});
});

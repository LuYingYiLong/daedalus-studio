import { describe, expect, it } from "vitest";
import { readRepoFile } from "../../../../helpers/repo-paths";

describe("Composer provider models", () => {
	it("shows configured providers only and opens provider settings for the empty state", () => {
		const composerSource: string = readRepoFile("src", "renderer", "src", "features", "composer", "Composer.tsx");
		const homePageSource: string = readRepoFile("src", "renderer", "src", "pages", "home", "HomePage.tsx");
		const appSource: string = readRepoFile("src", "renderer", "src", "app", "App.tsx");

		expect(composerSource).toContain("return provider.configured;");
		expect(composerSource).toContain('t("composer.model.configureProvider")');
		expect(composerSource).toContain("onClick={!hasConfiguredProviders ? onConfigureProvider : undefined}");
		expect(composerSource).toContain("`${selectedProvider.displayName}/${selectedModelInfo?.displayName ?? selectedModel.model}`");
		expect(homePageSource).toContain('window.electronAPI.windowControl.openSettings("provider")');
		expect(appSource).toContain("return provider.configured && provider.models.length > 0;");
		expect(appSource).toContain("window.addEventListener(\"focus\", handleWindowFocus);");
	});
});

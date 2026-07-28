import { describe, expect, it } from "vitest";
import { readRepoFile } from "../../../../helpers/repo-paths";

describe("Provider settings scrolling", () => {
	it("allocates the content row below the settings drag header and scrolls only on overflow", () => {
		const windowCss: string = readRepoFile("src", "renderer", "src", "app", "SettingsWindow.module.css");
		const providerCss: string = readRepoFile("src", "renderer", "src", "pages", "settings", "ProviderSettingsPage.module.css");

		expect(windowCss).toContain("grid-template-rows: 36px minmax(0, 1fr);");
		expect(providerCss).toContain("overflow-y: auto;");
		expect(providerCss).not.toContain("overflow-y: scroll;");
	});
});

import { describe, expect, it } from "vitest";
import { readRepoFile } from "../../../../helpers/repo-paths";

describe("Provider detail pane motion", () => {
	it("keeps provider detail changes spatially stable and accessible", () => {
		const pageSource: string = readRepoFile("src", "renderer", "src", "widgets", "settings", "ProviderSettingsPage.tsx");
		const providerCss: string = readRepoFile("src", "renderer", "src", "widgets", "settings", "ProviderSettingsPage.module.css");

		expect(pageSource).toContain("key={selectedProvider.provider}");
		expect(pageSource).toContain("styles.detailTransition");
		expect(providerCss).toContain("transform: translate3d(8px, 0, 0);");
		expect(providerCss).toContain("transform: translate3d(0, 0, 0);");
		expect(providerCss).toContain("@media (prefers-reduced-motion: reduce)");
		expect(providerCss).toContain("providerDetailEnterReduced");
	});
});

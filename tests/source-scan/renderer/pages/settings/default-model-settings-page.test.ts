import { describe, expect, it } from "vitest";
import { readRepoFile } from "../../../../helpers/repo-paths";

describe("DefaultModelSettingsPage", () => {
	it("uses the Select clear-icon API for the single-value model selector", () => {
		const pageSource: string = readRepoFile("src", "renderer", "src", "pages", "settings", "DefaultModelSettingsPage.tsx");

		expect(pageSource).toContain('allowClear={{ clearIcon: <Icon name="clear" /> }}');
		expect(pageSource).toContain('suffixIcon={<Icon name="arrow-down" style={{ pointerEvents: "none" }} />}');
		expect(pageSource).not.toContain('removeIcon={<Icon name="clear" />}');
	});

	it("includes the Git commit model routing option", () => {
		const pageSource: string = readRepoFile("src", "renderer", "src", "pages", "settings", "DefaultModelSettingsPage.tsx");

		expect(pageSource).toContain('key: "gitCommit"');
		expect(pageSource).toContain("Git commit model");
		expect(pageSource).toContain("Defaults to the main model when unset.");
	});

	it("provides a text-only command review route and supplemental prompt", () => {
		const pageSource: string = readRepoFile("src", "renderer", "src", "pages", "settings", "DefaultModelSettingsPage.tsx");
		const providerSource: string = readRepoFile("src", "renderer", "src", "api", "provider-api.ts");
		const promptSource: string = readRepoFile("src", "renderer", "src", "api", "user-prompt-api.ts");

		expect(pageSource).toContain('key: "commandReview"');
		expect(pageSource).toContain("!isImageTaskModel(model)");
		expect(pageSource).toContain('placeholder: "Not configured - always ask me"');
		expect(pageSource).toContain("maxLength={20000}");
		expect(providerSource).toContain("commandReview: ProviderTaskModelRef | null;");
		expect(promptSource).toContain("commandReviewPrompt: string;");
	});
});

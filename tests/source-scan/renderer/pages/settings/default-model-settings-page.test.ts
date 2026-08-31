import { describe, expect, it } from "vitest";
import { readRepoFile } from "../../../../helpers/repo-paths";

describe("DefaultModelSettingsPage", () => {
	it("uses the Select clear-icon API for the single-value model selector", () => {
		const pageSource: string = readRepoFile("src", "renderer", "src", "widgets", "settings", "DefaultModelSettingsPage.tsx");

		expect(pageSource).toContain('allowClear={{ clearIcon: <Icon name="clear" /> }}');
		expect(pageSource).toContain('suffixIcon={<Icon name="arrow-down" style={{ pointerEvents: "none" }} />}');
		expect(pageSource).not.toContain('removeIcon={<Icon name="clear" />}');
	});

	it("includes the Git commit model routing option", () => {
		const pageSource: string = readRepoFile("src", "renderer", "src", "widgets", "settings", "DefaultModelSettingsPage.tsx");

		expect(pageSource).toContain('key: "gitCommit"');
		expect(pageSource).toContain("settings.defaultModel.routing.gitCommit.title");
		expect(pageSource).toContain("settings.defaultModel.routing.gitCommit.description");
	});

	it("includes a reasoning-disabled next-step suggestion route", () => {
		const pageSource: string = readRepoFile("src", "renderer", "src", "widgets", "settings", "DefaultModelSettingsPage.tsx");
		const providerSource: string = readRepoFile("src", "renderer", "src", "platform", "rpc", "provider-api.ts");

		expect(pageSource).toContain('key: "nextStepHints"');
		expect(pageSource).toContain("settings.defaultModel.routing.nextStepHints.title");
		expect(pageSource).toContain("settings.defaultModel.routing.nextStepHints.description");
		expect(providerSource).toContain("nextStepHints: ProviderTaskModelRef | null;");
	});

	it("does not expose the removed workflow planner route", () => {
		const pageSource: string = readRepoFile("src", "renderer", "src", "widgets", "settings", "DefaultModelSettingsPage.tsx");
		const providerSource: string = readRepoFile("src", "renderer", "src", "platform", "rpc", "provider-api.ts");

		expect(pageSource).not.toContain("workflowPlanner");
		expect(providerSource).not.toContain("workflowPlanner");
	});

	it("provides a text-only command review route", () => {
		const pageSource: string = readRepoFile("src", "renderer", "src", "widgets", "settings", "DefaultModelSettingsPage.tsx");
		const providerSource: string = readRepoFile("src", "renderer", "src", "platform", "rpc", "provider-api.ts");
		const promptSource: string = readRepoFile("src", "renderer", "src", "platform", "rpc", "user-prompt-api.ts");

		expect(pageSource).toContain('key: "commandReview"');
		expect(pageSource).toContain("!isImageTaskModel(model)");
		expect(pageSource).toContain('placeholderKey: "settings.defaultModel.notConfigured"');
		expect(providerSource).toContain("commandReview: ProviderTaskModelRef | null;");
		expect(promptSource).toContain("commandReviewPrompt: string;");
	});

	it("only offers configured and enabled providers and renders provider before model", () => {
		const pageSource: string = readRepoFile("src", "renderer", "src", "widgets", "settings", "DefaultModelSettingsPage.tsx");

		expect(pageSource).toContain("return provider.configured && provider.enabled !== false;");
		expect(pageSource).toContain("`${provider.displayName}/${model.displayName}`");
		expect(pageSource).toContain("disabled={!hasConfiguredProviders}");
		expect(pageSource).toContain('t("settings.defaultModel.configureProvider")');
		expect(pageSource).toContain("activate: false");
		expect(pageSource).not.toContain("saveParams.model");
	});

	it("keeps the model routing page scrollable inside the preserved settings viewport", () => {
		const pageCss: string = readRepoFile("src", "renderer", "src", "widgets", "settings", "DefaultModelSettingsPage.module.css");
		const windowCss: string = readRepoFile("src", "renderer", "src", "app", "shell", "SettingsWindow.module.css");

		expect(pageCss).toContain("overflow: auto;");
		expect(windowCss).toContain(".pageView {");
		expect(windowCss).toContain("display: grid;");
		expect(windowCss).toContain(".pageView > * {");
	});
});

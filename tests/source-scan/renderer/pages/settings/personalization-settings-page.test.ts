import { describe, expect, it } from "vitest";
import { readRepoFile } from "../../../../helpers/repo-paths";

describe("PersonalizationSettingsPage source", () => {
	const pageSource: string = readRepoFile("src", "renderer", "src", "pages", "settings", "PersonalizationSettingsPage.tsx");
	const apiSource: string = readRepoFile("src", "renderer", "src", "api", "user-prompt-api.ts");

	it("exposes a dedicated git commit prompt setting", () => {
		expect(pageSource).toContain("Git commit prompt");
		expect(pageSource).toContain("draftGitCommitPrompt");
		expect(pageSource).toContain("setSavedGitCommitPrompt(config.gitCommitPrompt)");
		expect(pageSource).toContain("gitCommitPrompt: draftGitCommitPrompt");
		expect(apiSource).toContain("gitCommitPrompt: string");
		expect(apiSource).toContain("gitCommitUpdatedAt: string");
		expect(apiSource).toContain("UserPromptConfigPatch");
	});
});

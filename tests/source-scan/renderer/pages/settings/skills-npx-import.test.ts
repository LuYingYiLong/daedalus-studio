import { describe, expect, it } from "vitest";
import { readRepoFile } from "../../../../helpers/repo-paths";

describe("Skills settings npx import", () => {
	it("discovers local Codex skills before importing selected folders through the existing API", () => {
		const source: string = readRepoFile("src", "renderer", "src", "pages", "settings", "SkillsSettingsPage.tsx");

		expect(source).toContain("importFromNpx");
		expect(source).toContain("window.electronAPI.skillCli.listGlobalCodexSkills()");
		expect(source).toContain('kind: "folder"');
		expect(source).toContain("selectedNpxCandidates");
		expect(source).toContain("alreadyInstalled");
	});
});

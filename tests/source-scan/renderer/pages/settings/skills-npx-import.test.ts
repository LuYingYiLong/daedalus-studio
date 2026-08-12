import { describe, expect, it } from "vitest";
import { readRepoFile } from "../../../../helpers/repo-paths";

describe("Skills settings npx import", () => {
	it("discovers local Codex skills before importing selected folders through the existing API", () => {
		const source: string = readRepoFile("src", "renderer", "src", "widgets", "settings", "SkillsSettingsPage.tsx");

		expect(source).toContain("importFromNpx");
		expect(source).toContain("window.electronAPI.skillCli.listGlobalCodexSkills()");
		expect(source).toContain('kind: "folder"');
		expect(source).toContain("selectedNpxCandidates");
		expect(source).toContain("alreadyInstalled");
	});

	it("keeps edit and delete actions visible and edits SKILL.md through the backend API", () => {
		const pageSource: string = readRepoFile("src", "renderer", "src", "widgets", "settings", "SkillsSettingsPage.tsx");
		const apiSource: string = readRepoFile("src", "renderer", "src", "platform", "rpc", "skill-api.ts");

		expect(pageSource).toContain("openSkillEditor(skill)");
		expect(pageSource).toContain('icon={<Icon name="pencil" />}');
		expect(pageSource).toContain('icon={<Icon name="remove" />}');
		expect(pageSource).toContain("disabled={!skill.removable");
		expect(pageSource).toContain("updateSkillContent(skillEditor.skill.ref, skillEditor.content, targetForSkill(skillEditor.skill))");
		expect(pageSource).not.toContain("{skill.removable ? (");
		expect(apiSource).toContain('"skill.get"');
		expect(apiSource).toContain('"skill.update"');
	});
});

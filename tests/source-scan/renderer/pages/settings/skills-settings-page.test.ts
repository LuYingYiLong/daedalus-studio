import { describe, expect, it } from "vitest";
import { readRepoFile } from "../../../../helpers/repo-paths";

describe("SkillsSettingsPage", () => {
	it("filters out internal builtin skills and exposes scope filters", () => {
		const source: string = readRepoFile("src", "renderer", "src", "widgets", "settings", "SkillsSettingsPage.tsx");
		expect(source).toContain('skill.source !== "builtin"');
		expect(source).toContain('value: "personal"');
		expect(source).toContain('value: "project"');
		expect(source).toContain("settings.skills.empty.none");
	});

	it("wires ZIP and folder install actions through skillFs and skill.install", () => {
		const pageSource: string = readRepoFile("src", "renderer", "src", "widgets", "settings", "SkillsSettingsPage.tsx");
		const apiSource: string = readRepoFile("src", "renderer", "src", "platform", "rpc", "skill-api.ts");
		const viteEnvSource: string = readRepoFile("src", "renderer", "src", "vite-env.d.ts");
		expect(pageSource).toContain("pickSkillZip");
		expect(pageSource).toContain("pickSkillDirectory");
		expect(apiSource).toContain('"skill.install"');
		expect(viteEnvSource).toContain("pickSkillZip");
		expect(viteEnvSource).toContain("pickSkillDirectory");
	});

	it("requires an explicit project and source-folder target for project skill operations", () => {
		const pageSource: string = readRepoFile("src", "renderer", "src", "widgets", "settings", "SkillsSettingsPage.tsx");
		const apiSource: string = readRepoFile("src", "renderer", "src", "platform", "rpc", "skill-api.ts");
		expect(pageSource).toContain("fetchWorkspaces()");
		expect(pageSource).toContain("setSelectedWorkspaceId(null)");
		expect(pageSource).not.toContain("result.workspaces[0]");
		expect(pageSource).toContain("selectedProjectTarget()");
		expect(pageSource).toContain("sourceFolderId: selectedSourceFolderId");
		expect(pageSource).toContain("targetForSkill(skill)");
		expect(apiSource).toContain("export type SkillTarget");
		expect(apiSource).toContain("workspaceId?: string");
		expect(apiSource).toContain("sourceFolderId?: string");
		expect(apiSource).toContain('{ ref, enabled, ...target }');
	});
});

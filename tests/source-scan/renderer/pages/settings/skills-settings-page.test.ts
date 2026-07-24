import { describe, expect, it } from "vitest";
import { readRepoFile } from "../../../../helpers/repo-paths";

describe("SkillsSettingsPage", () => {
	it("filters out internal builtin skills and exposes scope filters", () => {
		const source: string = readRepoFile("src", "renderer", "src", "pages", "settings", "SkillsSettingsPage.tsx");
		expect(source).toContain('skill.source !== "builtin"');
		expect(source).toContain('value: "personal"');
		expect(source).toContain('value: "project"');
		expect(source).toContain("settings.skills.empty.none");
	});

	it("wires ZIP and folder install actions through skillFs and skill.install", () => {
		const pageSource: string = readRepoFile("src", "renderer", "src", "pages", "settings", "SkillsSettingsPage.tsx");
		const apiSource: string = readRepoFile("src", "renderer", "src", "api", "skill-api.ts");
		const viteEnvSource: string = readRepoFile("src", "renderer", "src", "vite-env.d.ts");
		expect(pageSource).toContain("pickSkillZip");
		expect(pageSource).toContain("pickSkillDirectory");
		expect(apiSource).toContain('"skill.install"');
		expect(viteEnvSource).toContain("pickSkillZip");
		expect(viteEnvSource).toContain("pickSkillDirectory");
	});
});

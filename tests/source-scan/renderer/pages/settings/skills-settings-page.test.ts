import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const TEST_DIR: string = dirname(fileURLToPath(import.meta.url));

describe("SkillsSettingsPage", () => {
	it("filters out internal builtin skills and exposes scope filters", () => {
		const source = readFileSync(join(TEST_DIR, "SkillsSettingsPage.tsx"), "utf8");
		expect(source).toContain('skill.source !== "builtin"');
		expect(source).toContain('value: "personal"');
		expect(source).toContain('value: "project"');
		expect(source).toContain("No custom skills yet. Ask the agent to create a skill");
	});

	it("wires ZIP and folder install actions through skillFs and skill.install", () => {
		const pageSource = readFileSync(join(TEST_DIR, "SkillsSettingsPage.tsx"), "utf8");
		const apiSource = readFileSync(join(TEST_DIR, "..", "..", "api", "skill-api.ts"), "utf8");
		const viteEnvSource = readFileSync(join(TEST_DIR, "..", "..", "vite-env.d.ts"), "utf8");
		expect(pageSource).toContain("pickSkillZip");
		expect(pageSource).toContain("pickSkillDirectory");
		expect(apiSource).toContain('"skill.install"');
		expect(viteEnvSource).toContain("pickSkillZip");
		expect(viteEnvSource).toContain("pickSkillDirectory");
	});
});

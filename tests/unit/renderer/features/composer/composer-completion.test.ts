import { describe, expect, it } from "vitest";
import type { SlashCommandDefinition } from "@/api/command-api";
import type { SkillSummary } from "@/api/skill-api";
import {
	createCompletionOptions,
	extractEnabledSkillRefs,
	getCompletionToken,
	replaceCompletionToken
} from "@/features/composer/composer-completion";

const commands: SlashCommandDefinition[] = [
	{
		command: "/help",
		usage: "/help",
		insertText: "/help",
		description: "显示指令帮助。",
		requiresArgument: false,
		examples: ["/help"]
	},
	{
		command: "/create-skill",
		usage: "/create-skill [需求]",
		insertText: "/create-skill ",
		description: "创建 skill。",
		requiresArgument: false,
		examples: ["/create-skill 创建审查流程"]
	}
];

const skills: SkillSummary[] = [
	{
		ref: "builtin:skill-creator",
		slug: "skill-creator",
		name: "Skill Creator",
		description: "Create skills",
		source: "builtin",
		enabled: true,
		valid: true,
		editable: false,
		removable: false,
		displayPath: "builtin"
	},
	{
		ref: "builtin:image-gen",
		slug: "image-gen",
		name: "Image Generator",
		description: "Generate images",
		source: "builtin",
		enabled: true,
		valid: true,
		editable: false,
		removable: false,
		displayPath: "builtin"
	},
	{
		ref: "project:disabled-skill",
		slug: "disabled-skill",
		name: "Disabled",
		description: "Disabled skill",
		source: "project",
		enabled: false,
		valid: true,
		editable: true,
		removable: false,
		displayPath: "project"
	},
	{
		ref: "personal:invalid-skill",
		slug: "invalid-skill",
		name: "Invalid",
		description: "Invalid skill",
		source: "personal",
		enabled: true,
		valid: false,
		editable: true,
		removable: true,
		displayPath: "personal"
	}
];

describe("composer-completion", () => {
	it("detects slash commands only at the beginning of the current line", () => {
		const token = getCompletionToken("/he", 3);

		expect(token).toEqual({ trigger: "/", query: "/he", start: 0, end: 3 });
		expect(getCompletionToken("please /he", 10)).toBeNull();

		const options = createCompletionOptions({ commands, skills, token });
		expect(options.map((option) => option.label)).toEqual(["/help"]);
	});

	it("replaces a slash token with insertText", () => {
		const token = getCompletionToken("/create", 7);
		expect(token).not.toBeNull();

		const replacement = replaceCompletionToken("/create", token!, "/create-skill ");
		expect(replacement).toEqual({
			value: "/create-skill ",
			caretIndex: "/create-skill ".length
		});
	});

	it("detects skill mentions after whitespace and filters enabled valid skills", () => {
		const value = "请使用 @skill";
		const token = getCompletionToken(value, value.length);

		expect(token).toEqual({
			trigger: "@",
			query: "skill",
			start: 4,
			end: value.length
		});
		expect(getCompletionToken("email@test", "email@test".length)).toBeNull();

		const options = createCompletionOptions({ commands, skills, token });
		expect(options).toHaveLength(1);
		expect(options[0].insertText).toBe("@builtin:skill-creator ");
	});

	it("extracts unique enabled skill refs with the backend-compatible boundary rule", () => {
		const refs = extractEnabledSkillRefs(
			"@builtin:skill-creator, @project:disabled-skill @personal:invalid-skill @builtin:skill-creator",
			skills
		);

		expect(refs).toEqual(["builtin:skill-creator"]);
	});

	it("shows and extracts the image generation alias", () => {
		const token = getCompletionToken("@image", "@image".length);
		const options = createCompletionOptions({ commands, skills, token });

		expect(options.some((option) => option.label === "@image-gen" && option.insertText === "@builtin:image-gen ")).toBe(true);
		expect(extractEnabledSkillRefs("@image-gen 生成一张图", skills)).toEqual(["builtin:image-gen"]);
	});
});

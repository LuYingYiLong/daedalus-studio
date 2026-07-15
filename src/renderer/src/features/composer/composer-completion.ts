import type { SlashCommandDefinition } from "@/api/command-api";
import type { SkillSummary } from "@/api/skill-api";

export type ComposerCompletionTrigger = "/" | "@";

export type ComposerCompletionToken = {
	trigger: ComposerCompletionTrigger;
	query: string;
	start: number;
	end: number;
};

export type ComposerCompletionOption = {
	key: string;
	trigger: ComposerCompletionTrigger;
	label: string;
	description: string;
	insertText: string;
};

const MAX_SKILL_REFS = 4;
const SKILL_REF_PATTERN = /(?:^|\s)@(builtin|personal|project):([a-z0-9][a-z0-9-]{0,63})(?=\s|$|[.,;:!?，。；：！？])/gu;
const IMAGE_GEN_ALIAS_PATTERN = /(?:^|\s)@image-gen(?=\s|$|[.,;:!?，。；：！？])/giu;
const IMAGE_GEN_REF = "builtin:image-gen";

export function getCompletionToken(value: string, selectionStart: number): ComposerCompletionToken | null {
	const caretIndex: number = Math.max(0, Math.min(selectionStart, value.length));
	const lineStart: number = value.lastIndexOf("\n", caretIndex - 1) + 1;
	const linePrefix: string = value.slice(lineStart, caretIndex);

	const skillToken: ComposerCompletionToken | null = getSkillCompletionToken(linePrefix, lineStart, caretIndex);
	if (skillToken !== null) {
		return skillToken;
	}

	return getSlashCompletionToken(linePrefix, lineStart, caretIndex);
}

function getSlashCompletionToken(linePrefix: string, lineStart: number, caretIndex: number): ComposerCompletionToken | null {
	const slashIndex: number = linePrefix.lastIndexOf("/");
	if (slashIndex < 0) {
		return null;
	}

	if (linePrefix.slice(0, slashIndex).trim().length > 0) {
		return null;
	}

	const query: string = linePrefix.slice(slashIndex).trim();
	if (query.length === 0 || query.includes(" ")) {
		return null;
	}

	return {
		trigger: "/",
		query,
		start: lineStart + slashIndex,
		end: caretIndex
	};
}

function getSkillCompletionToken(linePrefix: string, lineStart: number, caretIndex: number): ComposerCompletionToken | null {
	const atIndex: number = linePrefix.lastIndexOf("@");
	if (atIndex < 0) {
		return null;
	}

	if (atIndex > 0) {
		const precedingCharacter: string = linePrefix.charAt(atIndex - 1);
		if (precedingCharacter !== " " && precedingCharacter !== "\t") {
			return null;
		}
	}

	const query: string = linePrefix.slice(atIndex + 1);
	if (query.includes(" ") || query.includes("\t")) {
		return null;
	}

	return {
		trigger: "@",
		query: query.length === 0 ? "@" : query,
		start: lineStart + atIndex,
		end: caretIndex
	};
}

export function createSlashCompletionOptions(commands: readonly SlashCommandDefinition[], token: ComposerCompletionToken | null): ComposerCompletionOption[] {
	if (token === null || token.trigger !== "/") {
		return [];
	}

	const normalizedQuery: string = token.query.toLowerCase();

	return commands.flatMap((command: SlashCommandDefinition): ComposerCompletionOption[] => {
		const commandText: string = command.command.toLowerCase();
		const usageText: string = command.usage.toLowerCase();
		const matches: boolean = normalizedQuery === "/"
			|| commandText.startsWith(normalizedQuery)
			|| usageText.startsWith(normalizedQuery);

		if (!matches) {
			return [];
		}

		return [{
			key: command.command,
			trigger: "/",
			label: command.usage,
			description: command.description,
			insertText: command.insertText
		}];
	});
}

export function createSkillCompletionOptions(skills: readonly SkillSummary[], token: ComposerCompletionToken | null): ComposerCompletionOption[] {
	if (token === null || token.trigger !== "@") {
		return [];
	}

	const normalizedQuery: string = token.query === "@" ? "" : token.query.toLowerCase();

	return skills.flatMap((skill: SkillSummary): ComposerCompletionOption[] => {
		if (!skill.enabled || !skill.valid) {
			return [];
		}

		const alias: string = skill.ref === IMAGE_GEN_REF ? "image-gen" : "";
		const searchableText: string = `${skill.ref} ${alias} ${skill.name} ${skill.description}`.toLowerCase();
		if (normalizedQuery.length > 0 && !searchableText.includes(normalizedQuery)) {
			return [];
		}

		const label: string = skill.ref === IMAGE_GEN_REF ? "@image-gen" : `@${skill.ref}`;
		return [{
			key: skill.ref,
			trigger: "@",
			label,
			description: `${skill.name}${skill.description.length > 0 ? ` - ${skill.description}` : ""}`,
			insertText: `@${skill.ref} `
		}];
	});
}

export function createCompletionOptions(params: {
	commands: readonly SlashCommandDefinition[];
	skills: readonly SkillSummary[];
	token: ComposerCompletionToken | null;
}): ComposerCompletionOption[] {
	if (params.token?.trigger === "/") {
		return createSlashCompletionOptions(params.commands, params.token);
	}

	if (params.token?.trigger === "@") {
		return createSkillCompletionOptions(params.skills, params.token);
	}

	return [];
}

export function replaceCompletionToken(value: string, token: ComposerCompletionToken, insertText: string): { value: string; caretIndex: number } {
	const nextValue: string = `${value.slice(0, token.start)}${insertText}${value.slice(token.end)}`;
	const caretIndex: number = token.start + insertText.length;

	return { value: nextValue, caretIndex };
}

export function extractEnabledSkillRefs(message: string, skills: readonly SkillSummary[]): string[] {
	const enabledRefs: Set<string> = new Set(
		skills
			.filter((skill: SkillSummary): boolean => skill.enabled && skill.valid)
			.map((skill: SkillSummary): string => skill.ref)
	);
	const refs: string[] = [];

	for (const match of message.matchAll(SKILL_REF_PATTERN)) {
		const ref: string = `${match[1]}:${match[2]}`;
		if (!enabledRefs.has(ref) || refs.includes(ref)) {
			continue;
		}

		refs.push(ref);
		if (refs.length >= MAX_SKILL_REFS) {
			break;
		}
	}

	if (refs.length < MAX_SKILL_REFS && enabledRefs.has(IMAGE_GEN_REF)) {
		for (const _match of message.matchAll(IMAGE_GEN_ALIAS_PATTERN)) {
			if (!refs.includes(IMAGE_GEN_REF)) {
				refs.push(IMAGE_GEN_REF);
			}
			break;
		}
	}

	return refs;
}

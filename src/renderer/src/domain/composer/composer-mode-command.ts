import type { ChatMode } from "@/platform/rpc/chat-api";

export type ComposerModeCommand = {
	mode: ChatMode;
	message: string;
};

const MODE_BY_COMMAND: Readonly<Record<string, ChatMode>> = {
	ask: "ask",
	agent: "agent",
	plan: "plan",
	goal: "goal"
};

const MODE_COMMAND_PATTERN = /^\s*\/([a-z]+)(?:\s+([\s\S]*))?$/iu;

export function parseComposerModeCommand(value: string): ComposerModeCommand | null {
	const match: RegExpMatchArray | null = value.match(MODE_COMMAND_PATTERN);
	if (match === null) {
		return null;
	}

	const mode: ChatMode | undefined = MODE_BY_COMMAND[match[1].toLowerCase()];
	if (mode === undefined) {
		return null;
	}

	return {
		mode,
		message: match[2]?.trim() ?? ""
	};
}

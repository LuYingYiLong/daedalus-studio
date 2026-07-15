import { createBackendClient } from "./backend-client";

export type SlashCommandDefinition = {
	command: string;
	usage: string;
	insertText: string;
	description: string;
	requiresArgument: boolean;
	examples: string[];
};

export type SlashCommandListResult = {
	commands: SlashCommandDefinition[];
};

export async function fetchSlashCommands(): Promise<SlashCommandDefinition[]> {
	const client = await createBackendClient();
	const result = await client.request<SlashCommandListResult>("command.list");

	return result.commands;
}

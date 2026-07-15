import { createBackendClient } from "./backend-client";

export type UserPromptConfig = {
	schemaVersion: 1;
	prompt: string;
	updatedAt: string;
};

export async function fetchUserPromptConfig(): Promise<UserPromptConfig> {
	const client = await createBackendClient();

	return client.request<UserPromptConfig>("userPrompt.get");
}

export async function saveUserPrompt(prompt: string): Promise<UserPromptConfig> {
	const client = await createBackendClient();

	return client.request<UserPromptConfig>("userPrompt.set", {
		prompt
	});
}

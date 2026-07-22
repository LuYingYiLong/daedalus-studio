import { createBackendClient } from "./backend-client";

export type UserPromptConfig = {
	schemaVersion: 1;
	prompt: string;
	updatedAt: string;
	gitCommitPrompt: string;
	gitCommitUpdatedAt: string;
};

export type UserPromptConfigPatch = {
	prompt?: string;
	gitCommitPrompt?: string;
};

export async function fetchUserPromptConfig(): Promise<UserPromptConfig> {
	const client = await createBackendClient();

	return client.request<UserPromptConfig>("userPrompt.get");
}

export async function saveUserPrompt(patch: UserPromptConfigPatch): Promise<UserPromptConfig> {
	const client = await createBackendClient();

	return client.request<UserPromptConfig>("userPrompt.set", patch);
}

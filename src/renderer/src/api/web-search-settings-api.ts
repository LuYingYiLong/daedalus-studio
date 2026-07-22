import { createBackendClient } from "./backend-client";

export type WebSearchModelOption = {
	provider: string;
	providerDisplayName: string;
	model: string;
	modelDisplayName: string;
	configured: boolean;
	apiKeyMasked: string | null;
	baseUrl: string;
	contextWindowTokens: number;
	maxOutputTokens: number;
};

export type WebSearchSettings = {
	schemaVersion: 1;
	enabled: boolean;
	provider: string;
	model: string;
	maxResults: number;
	updatedAt: string;
	available: boolean;
	configured: boolean;
	selectedSupported: boolean;
	apiKeyMasked: string | null;
	models: WebSearchModelOption[];
};

export type WebSearchSettingsPatch = {
	enabled?: boolean;
	provider?: string;
	model?: string;
	maxResults?: number;
};

export async function fetchWebSearchSettings(): Promise<WebSearchSettings> {
	const client = await createBackendClient();

	return client.request<WebSearchSettings>("webSearchSettings.get");
}

export async function updateWebSearchSettings(patch: WebSearchSettingsPatch): Promise<WebSearchSettings> {
	const client = await createBackendClient();

	return client.request<WebSearchSettings>("webSearchSettings.update", patch);
}

import { createBackendClient } from "@/shared/api/transport/backend-client";

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
	searchOptions?: {
		maxKeywords?: {
			min: number;
			max: number;
			defaultValue: number;
			chargedPerUnit: boolean;
		};
	};
};

export type WebSearchSettings = {
	schemaVersion: 2;
	enabled: boolean;
	provider: string;
	model: string;
	maxResults: number;
	maxKeywords: number;
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
	maxKeywords?: number;
};

export async function fetchWebSearchSettings(): Promise<WebSearchSettings> {
	const client = await createBackendClient();

	return client.request<WebSearchSettings>("webSearchSettings.get");
}

export async function updateWebSearchSettings(patch: WebSearchSettingsPatch): Promise<WebSearchSettings> {
	const client = await createBackendClient();

	return client.request<WebSearchSettings>("webSearchSettings.update", patch);
}

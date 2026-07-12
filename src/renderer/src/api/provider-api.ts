import { createBackendClient } from "./backend-client";

export type ProviderModelSelection = {
	activeModel: {
		providerId: string;
		modelId: string;
	};
	current: {
		provider: string;
		displayName: string;
		configured: boolean;
		model: string;
		modelDisplayName: string;
		baseUrl: string;
		apiKeyMasked: string | null;
	};
	providers: ProviderModelSelectionProvider[];
};

export type ProviderModelInfo = {
	id: string;
	displayName: string;
	provider: ProviderId;
	endpointType: EndpointType;
	contextWindowTokens: number;
	maxOutputTokens: number;
	capabilities: ProviderModelCapabilities;
	ownedBy?: string | undefined;
};

export type ProviderId = string;

export type EndpointType = "openai-chat-completions" | "openai-responses";

export type ProviderModelCapabilities = {
	imageInput?: boolean | undefined;
	videoInput?: boolean | undefined;
	reasoning?: boolean | undefined;
};

export type ProviderModelSelectionProvider = {
	provider: string;
	displayName: string;
	configured: boolean;
	selected: boolean;
	selectedModel: string | null;
	selectedModelDisplayName: string | null;
	defaultModel: string;
	baseUrl: string;
	apiKeyMasked: string | null;
	models: ProviderModelInfo[];
	modelsSource: "cache" | "fallback";
	modelsCacheUpdatedAt?: string | null;
};

export type SaveProviderModelSelectionParams = {
	provider: string;
	model: string;
	activate?: boolean;
};

export async function fetchProviderModelSelection(): Promise<ProviderModelSelection> {
	const client = await createBackendClient();

	return client.request<ProviderModelSelection>("provider.modelSelection.get");
}

export async function saveProviderModelSelection(params: SaveProviderModelSelectionParams): Promise<unknown> {
	const client = await createBackendClient();

	return client.request("provider.config.set", {
		provider: params.provider,
		model: params.model,
		activate: params.activate ?? true
	});
}

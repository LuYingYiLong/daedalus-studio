import { createBackendClient } from "@/platform/rpc/transport/backend-client";

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
	modelRouting: ProviderModelRouting;
};

export type ProviderTaskModelRef = {
	provider: string;
	model: string;
};

export type ProviderModelRouting = {
	imageRecognition: ProviderTaskModelRef | null;
	workflowPlanner: ProviderTaskModelRef | null;
	sessionTitle: ProviderTaskModelRef | null;
	nextStepHints: ProviderTaskModelRef | null;
	imageGeneration: ProviderTaskModelRef | null;
	gitCommit: ProviderTaskModelRef | null;
	commandReview: ProviderTaskModelRef | null;
	goalEvaluator: ProviderTaskModelRef | null;
	contextCompression: ProviderTaskModelRef | null;
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

export type EndpointType = "openai-chat-completions" | "openai-responses" | "anthropic-messages";

export type ProviderModelCapabilities = {
	imageInput?: boolean | undefined;
	videoInput?: boolean | undefined;
	reasoning?: boolean | undefined;
	reasoningEfforts?: ProviderReasoningEffortOption[] | undefined;
	tools?: boolean | undefined;
	webSearch?: boolean | undefined;
	vision?: boolean | undefined;
	imageGeneration?: boolean | undefined;
	imageEdit?: boolean | undefined;
};

export type ProviderReasoningEffortOption = {
	id: string;
	fallback: "low" | "medium" | "high" | "max";
};

export type ProviderRequestJsonValue =
	| null
	| boolean
	| number
	| string
	| ProviderRequestJsonValue[]
	| { [key: string]: ProviderRequestJsonValue };

export type ProviderRequestOverrides = {
	headers: Record<string, string>;
	body: Record<string, ProviderRequestJsonValue>;
};

export type ProviderModelSelectionProvider = {
	provider: string;
	displayName: string;
	configured: boolean;
	selected: boolean;
	selectedModel: string | null;
	selectedModelDisplayName: string | null;
	defaultModel: string | null;
	baseUrl: string;
	custom: boolean;
	enabled?: boolean | undefined;
	providerType: CustomProviderType | null;
	ready: boolean;
	apiKeyMasked: string | null;
	requestOverrides?: ProviderRequestOverrides | undefined;
	models: ProviderModelInfo[];
	modelsSource: "cache" | "fallback";
	modelsCacheUpdatedAt?: string | null;
};

export type CustomProviderType = "openai" | "openai-responses" | "anthropic";

export type EditableModelCapabilities = {
	vision: boolean;
	webSearch: boolean;
	reasoning: boolean;
	tools: boolean;
};

export type SaveProviderModelSelectionParams = {
	provider: string;
	model: string;
	activate?: boolean;
};

export type ProviderModelsListResult = {
	provider: string;
	models: ProviderModelInfo[];
	stale: boolean;
	source: "api" | "cache" | "fallback";
	error?: string | undefined;
};

export type DiscoveredProviderModel = Omit<ProviderModelInfo, "provider" | "endpointType">;

export type ProviderTaskModelKind = keyof ProviderModelRouting;

export type ProviderModelRemovalGuard =
	| { kind: "activeModel" }
	| { kind: "providerSelection" }
	| { kind: "taskRouting"; task: ProviderTaskModelKind }
	| { kind: "webSearch" };

export type ProviderModelUsage =
	| { kind: "activeModel"; model: string }
	| { kind: "taskRouting"; task: ProviderTaskModelKind; model: string };

export type ProviderMutationResult = {
	updated: boolean;
	usages: ProviderModelUsage[];
	selection: ProviderModelSelection;
};

export type ProviderUsageResult = {
	usages: ProviderModelUsage[];
};

export type ManagedProviderModel = DiscoveredProviderModel & {
	enabled: boolean;
	removalGuards: ProviderModelRemovalGuard[];
};

export type ProviderModelsDiscoverResult = {
	provider: string;
	models: DiscoveredProviderModel[];
	managedModels: ManagedProviderModel[];
	source: "api" | "fallback";
	error?: string | undefined;
};

export type SaveProviderConfigParams = {
	provider: string;
	apiKey?: string | null | undefined;
	model?: string | undefined;
	baseUrl?: string | null | undefined;
	enabled?: boolean | undefined;
	activate?: boolean | undefined;
	modelRouting?: Partial<ProviderModelRouting> | undefined;
	requestOverrides?: ProviderRequestOverrides | null | undefined;
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

export async function saveProviderConfig(params: SaveProviderConfigParams): Promise<ProviderModelSelection> {
	const client = await createBackendClient();

	await client.request("provider.config.set", params);
	return client.request<ProviderModelSelection>("provider.modelSelection.get");
}

export async function listProviderModels(provider: string, refresh: boolean = false): Promise<ProviderModelsListResult> {
	const client = await createBackendClient();

	return client.request<ProviderModelsListResult>("provider.models.list", {
		provider,
		refresh
	});
}

export async function discoverProviderModels(params: {
	provider: string;
	apiKey?: string | undefined;
	baseUrl?: string | null | undefined;
}): Promise<ProviderModelsDiscoverResult> {
	const client = await createBackendClient();
	return client.request<ProviderModelsDiscoverResult>("provider.models.discover", params);
}

export async function importProviderModels(params: {
	provider: string;
	models: DiscoveredProviderModel[];
}): Promise<ProviderModelSelection> {
	const client = await createBackendClient();
	return client.request<ProviderModelSelection>("provider.models.import", params);
}

export async function syncProviderModels(params: {
	provider: string;
	upsertModels: DiscoveredProviderModel[];
	enableModelIds: string[];
	removeModelIds: string[];
}): Promise<ProviderModelSelection> {
	const client = await createBackendClient();
	return client.request<ProviderModelSelection>("provider.models.sync", params);
}

export async function addCustomProvider(params: {
	displayName: string;
	providerType: CustomProviderType;
}): Promise<{ providerId: string; selection: ProviderModelSelection }> {
	const client = await createBackendClient();
	return client.request("provider.custom.add", params);
}

export async function setProviderEnabled(params: {
	provider: string;
	enabled: boolean;
}): Promise<ProviderMutationResult> {
	const client = await createBackendClient();
	return client.request("provider.setEnabled", params);
}

export async function getProviderUsage(provider: string): Promise<ProviderUsageResult> {
	const client = await createBackendClient();
	return client.request("provider.usage.get", { provider });
}

export async function removeCustomProvider(provider: string): Promise<ProviderMutationResult> {
	const client = await createBackendClient();
	return client.request("provider.custom.remove", { provider });
}

export async function addProviderModel(params: {
	provider: string;
	id: string;
	displayName: string;
}): Promise<ProviderModelSelection> {
	const client = await createBackendClient();
	return client.request("provider.model.add", params);
}

export async function updateProviderModel(params: {
	provider: string;
	id: string;
	displayName: string;
	capabilities: EditableModelCapabilities;
}): Promise<ProviderModelSelection> {
	const client = await createBackendClient();
	return client.request("provider.model.update", params);
}

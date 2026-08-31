import type {
	BaseReasoningEffort,
	EditableModelCapabilityUpdates,
	EditableModelCapabilityValues,
	EditableModelCapabilities,
	ManagedProviderModel,
	ProviderModelCapabilities,
	ProviderModelDiscoveryFailureCode,
	ProviderModelInfo,
	ProviderModelSelectionProvider,
	ProviderModelsDiscoverResult,
	ProviderReasoningEffortOption,
	DiscoveredProviderModel,
} from "@/platform/rpc/provider-api";

export type CapabilityBadge = {
	key: keyof ProviderModelCapabilities;
	labelKey: string;
	icon: string;
	color: string;
};

export type ModelFormValues = {
	id: string;
	displayName: string;
	inheritDisplayName: boolean;
	contextWindowTokens: number;
	inheritContextWindowTokens: boolean;
	maxOutputTokens: number;
	inheritMaxOutputTokens: boolean;
	capabilities: Record<keyof EditableModelCapabilities, CapabilityFormValue>;
	inheritReasoningEfforts: boolean;
	reasoningEfforts: ReasoningEffortFormValue[];
};

export type CapabilityFormValue = "inherit" | "enabled" | "disabled";

export type ReasoningEffortFormValue = {
	id: string;
	fallback: BaseReasoningEffort;
	default: boolean;
};

export type EditableCapability = {
	key: keyof EditableModelCapabilities;
	labelKey: string;
};

export const CAPABILITY_BADGES: CapabilityBadge[] = [
	{
		key: "imageInput",
		labelKey: "settings.provider.capabilities.vision",
		icon: "vision",
		color: "purple",
	},
	{
		key: "webSearch",
		labelKey: "settings.provider.capabilities.webSearch",
		icon: "search",
		color: "green",
	},
	{
		key: "reasoning",
		labelKey: "settings.provider.capabilities.reasoning",
		icon: "thinking",
		color: "blue",
	},
	{
		key: "tools",
		labelKey: "settings.provider.capabilities.tools",
		icon: "mcp",
		color: "orange",
	},
];

export const EDITABLE_CAPABILITIES: EditableCapability[] = [
	{ key: "imageInput", labelKey: "settings.provider.capabilities.vision" },
	{ key: "videoInput", labelKey: "settings.provider.capabilities.videoInput" },
	{ key: "reasoning", labelKey: "settings.provider.capabilities.reasoning" },
	{ key: "tools", labelKey: "settings.provider.capabilities.tools" },
	{ key: "webSearch", labelKey: "settings.provider.capabilities.webSearch" },
	{ key: "imageGeneration", labelKey: "settings.provider.capabilities.imageGeneration" },
	{ key: "imageEdit", labelKey: "settings.provider.capabilities.imageEdit" },
];

export function createUniformCapabilityFormValues(
	value: CapabilityFormValue,
): ModelFormValues["capabilities"] {
	const values = {} as ModelFormValues["capabilities"];
	for (const capability of EDITABLE_CAPABILITIES) {
		values[capability.key] = value;
	}
	return values;
}

export function getVisibleCapabilities(
	capabilities: ProviderModelCapabilities,
): CapabilityBadge[] {
	return CAPABILITY_BADGES.filter(
		(badge: CapabilityBadge): boolean => capabilities[badge.key] === true,
	);
}

export function createCapabilityFormValues(
	model: ProviderModelInfo | null,
	allowInheritance: boolean,
): ModelFormValues["capabilities"] {
	const values: ModelFormValues["capabilities"] =
		createUniformCapabilityFormValues("disabled");
	for (const capability of EDITABLE_CAPABILITIES) {
		const override: boolean | undefined =
			model?.customization?.capabilities[capability.key];
		if (allowInheritance && override === undefined) {
			values[capability.key] = "inherit";
		} else {
			values[capability.key] =
				(override ?? model?.capabilities[capability.key]) === true
					? "enabled"
					: "disabled";
		}
	}
	return values;
}

export function toEditableCapabilities(
	values: ModelFormValues["capabilities"],
	allowInheritance: boolean,
): EditableModelCapabilityUpdates {
	const capabilities = {} as EditableModelCapabilityUpdates;
	for (const capability of EDITABLE_CAPABILITIES) {
		const value: CapabilityFormValue = values[capability.key];
		capabilities[capability.key] =
			allowInheritance && value === "inherit" ? null : value === "enabled";
	}
	return capabilities;
}

export function toCustomModelCapabilities(
	values: ModelFormValues["capabilities"],
): EditableModelCapabilityValues {
	const capabilities = {} as EditableModelCapabilityValues;
	for (const capability of EDITABLE_CAPABILITIES) {
		capabilities[capability.key] = values[capability.key] === "enabled";
	}
	return capabilities;
}

export function createReasoningEffortFormValues(
	model: ProviderModelInfo | null,
): ReasoningEffortFormValue[] {
	const efforts: readonly ProviderReasoningEffortOption[] =
		model?.customization?.reasoningEfforts ??
		model?.capabilities.reasoningEfforts ??
		[];
	return efforts.map(
		(effort: ProviderReasoningEffortOption): ReasoningEffortFormValue => ({
			id: effort.id,
			fallback: effort.fallback,
			default: effort.default === true,
		}),
	);
}

export function createAddModelFormValues(): ModelFormValues {
	return {
		id: "",
		displayName: "",
		inheritDisplayName: false,
		contextWindowTokens: 128_000,
		inheritContextWindowTokens: false,
		maxOutputTokens: 8_192,
		inheritMaxOutputTokens: false,
		capabilities: createCapabilityFormValues(null, false),
		inheritReasoningEfforts: false,
		reasoningEfforts: [],
	};
}

export function createEditModelFormValues(model: ProviderModelInfo): ModelFormValues {
	const isCustomModel: boolean = model.customization?.source === "custom";
	return {
		id: model.id,
		displayName: model.displayName,
		inheritDisplayName: !isCustomModel && model.customization?.displayName === undefined,
		contextWindowTokens: model.contextWindowTokens,
		inheritContextWindowTokens: !isCustomModel && model.customization?.contextWindowTokens === undefined,
		maxOutputTokens: model.maxOutputTokens,
		inheritMaxOutputTokens: !isCustomModel && model.customization?.maxOutputTokens === undefined,
		capabilities: createCapabilityFormValues(model, !isCustomModel),
		inheritReasoningEfforts: !isCustomModel && model.customization?.reasoningEfforts === undefined,
		reasoningEfforts: createReasoningEffortFormValues(model),
	};
}

export function toReasoningEffortOptions(
	values: readonly ReasoningEffortFormValue[],
): ProviderReasoningEffortOption[] {
	return values.map(
		(effort: ReasoningEffortFormValue): ProviderReasoningEffortOption => ({
			id: effort.id.trim(),
			fallback: effort.fallback,
			...(effort.default ? { default: true } : {}),
		}),
	);
}

export function getCustomizationErrorMessage(
	error: unknown,
	fallbackKey: string,
	t: (key: string) => string,
): string | null {
	if (!(error instanceof Error)) {
		return null;
	}
	if (error.message.startsWith("provider_name_conflict:")) {
		return t("settings.provider.errors.providerNameConflict");
	}
	if (error.message.startsWith("provider_model_exists:")) {
		return t("settings.provider.errors.modelIdConflict");
	}
	if (error.message.startsWith("provider_model_not_found:")) {
		return t("settings.provider.errors.modelNotFound");
	}
	return error.message.length > 0
		? `${t(fallbackKey)}: ${error.message}`
		: t(fallbackKey);
}

export function mergeManagedModels(
	previousModels: readonly ManagedProviderModel[],
	managedModels: readonly ManagedProviderModel[],
	remoteModels: readonly DiscoveredProviderModel[],
	preservePrevious: boolean,
): ManagedProviderModel[] {
	const modelsById: Map<string, ManagedProviderModel> = new Map();
	if (preservePrevious) {
		for (const model of previousModels) {
			modelsById.set(model.id, model);
		}
	}
	for (const model of managedModels) {
		modelsById.set(model.id, model);
	}
	for (const model of remoteModels) {
		const existing: ManagedProviderModel | undefined = modelsById.get(model.id);
		modelsById.set(model.id, {
			...model,
			enabled: existing?.enabled ?? false,
			removalGuards: existing?.removalGuards ?? [],
		});
	}
	return [...modelsById.values()];
}

export function getDiscoveryFailureMessage(
	result: ProviderModelsDiscoverResult,
	t: (key: string) => string,
): string {
	const code: ProviderModelDiscoveryFailureCode | undefined = result.failure?.code;
	const guidanceKey: string | null = code === undefined
		? null
		: `settings.provider.discovery.failures.${code}`;
	const guidance: string | null = guidanceKey === null ? null : t(guidanceKey);
	const detail: string | undefined = result.error;
	if (guidance === null || guidance === guidanceKey) {
		return detail ?? t("settings.provider.errors.discoverModels");
	}
	return detail === undefined ? guidance : `${guidance} (${detail})`;
}

export function isOpenAICompatibleCustomProvider(
	provider: ProviderModelSelectionProvider,
): boolean {
	return provider.custom &&
		(provider.providerType === "openai" || provider.providerType === "openai-responses");
}

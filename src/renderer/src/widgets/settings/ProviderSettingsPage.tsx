import {
	Alert,
	App,
	Button,
	Divider,
	Empty,
	Flex,
	Form,
	Input,
	InputNumber,
	Menu,
	Modal,
	Segmented,
	Select,
	Space,
	Switch,
	Table,
	Tag,
	Tooltip,
	Typography,
} from "antd";
import type { MenuProps, TableProps } from "antd";
import { useEffect, useMemo, useRef, useState } from "react";
import type { ChangeEvent, Key, KeyboardEvent } from "react";
import { useTranslation } from "react-i18next";
import { Icon } from "@/assets/icons";
import {
	addCustomProvider,
	addProviderModel,
	discoverProviderModels,
	fetchProviderModelSelection,
	getProviderUsage,
	removeCustomProvider,
	saveProviderConfig,
	setProviderEnabled,
	syncProviderModels,
	updateCustomProvider,
	updateProviderModel,
	type CustomProviderType,
	type BaseReasoningEffort,
	type DiscoveredProviderModel,
	type EditableModelCapabilityUpdates,
	type EditableModelCapabilityValues,
	type EditableModelCapabilities,
	type ManagedProviderModel,
	type ProviderModelCapabilities,
	type ProviderModelDiscoveryFailureCode,
	type ProviderModelRemovalGuard,
	type ProviderModelsDiscoverResult,
	type ProviderModelInfo,
	type ProviderReasoningEffortOption,
	type ProviderModelSelection,
	type ProviderModelSelectionProvider,
	type ProviderModelUsage,
	type ProviderRequestOverrides,
} from "@/platform/rpc/provider-api";
import ProviderRequestConfigModal from "./ProviderRequestConfigModal";
import styles from "./ProviderSettingsPage.module.css";

type CapabilityBadge = {
	key: keyof ProviderModelCapabilities;
	labelKey: string;
	icon: string;
	color: string;
};

type ProviderSettingsPageProps = {
	onSelectionChange?: (selection: ProviderModelSelection) => void;
};

type AddProviderFormValues = {
	displayName: string;
	providerType: CustomProviderType;
	websiteUrl?: string | null;
};

type ModelFormValues = {
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

type CapabilityFormValue = "inherit" | "enabled" | "disabled";

type ReasoningEffortFormValue = {
	id: string;
	fallback: BaseReasoningEffort;
	default: boolean;
};

type EditableCapability = {
	key: keyof EditableModelCapabilities;
	labelKey: string;
};

const CAPABILITY_BADGES: CapabilityBadge[] = [
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

const EDITABLE_CAPABILITIES: EditableCapability[] = [
	{
		key: "imageInput",
		labelKey: "settings.provider.capabilities.vision",
	},
	{
		key: "videoInput",
		labelKey: "settings.provider.capabilities.videoInput",
	},
	{ key: "reasoning", labelKey: "settings.provider.capabilities.reasoning" },
	{ key: "tools", labelKey: "settings.provider.capabilities.tools" },
	{ key: "webSearch", labelKey: "settings.provider.capabilities.webSearch" },
	{
		key: "imageGeneration",
		labelKey: "settings.provider.capabilities.imageGeneration",
	},
	{ key: "imageEdit", labelKey: "settings.provider.capabilities.imageEdit" },
];

function createUniformCapabilityFormValues(
	value: CapabilityFormValue,
): ModelFormValues["capabilities"] {
	const values = {} as ModelFormValues["capabilities"];
	for (const capability of EDITABLE_CAPABILITIES) {
		values[capability.key] = value;
	}
	return values;
}

function getVisibleCapabilities(
	capabilities: ProviderModelCapabilities,
): CapabilityBadge[] {
	return CAPABILITY_BADGES.filter(
		(badge: CapabilityBadge): boolean => capabilities[badge.key] === true,
	);
}

function createCapabilityFormValues(
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

function toEditableCapabilities(
	values: ModelFormValues["capabilities"],
	allowInheritance: boolean,
): EditableModelCapabilityUpdates {
	const capabilities = {} as EditableModelCapabilityUpdates;
	for (const capability of EDITABLE_CAPABILITIES) {
		const value: CapabilityFormValue = values[capability.key];
		capabilities[capability.key] =
			allowInheritance && value === "inherit"
				? null
				: value === "enabled";
	}
	return capabilities;
}

function toCustomModelCapabilities(
	values: ModelFormValues["capabilities"],
): EditableModelCapabilityValues {
	const capabilities = {} as EditableModelCapabilityValues;
	for (const capability of EDITABLE_CAPABILITIES) {
		capabilities[capability.key] = values[capability.key] === "enabled";
	}
	return capabilities;
}

function createReasoningEffortFormValues(
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

function createAddModelFormValues(): ModelFormValues {
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

function createEditModelFormValues(model: ProviderModelInfo): ModelFormValues {
	const isCustomModel: boolean = model.customization?.source === "custom";
	return {
		id: model.id,
		displayName: model.displayName,
		inheritDisplayName:
			!isCustomModel && model.customization?.displayName === undefined,
		contextWindowTokens: model.contextWindowTokens,
		inheritContextWindowTokens:
			!isCustomModel &&
			model.customization?.contextWindowTokens === undefined,
		maxOutputTokens: model.maxOutputTokens,
		inheritMaxOutputTokens:
			!isCustomModel && model.customization?.maxOutputTokens === undefined,
		capabilities: createCapabilityFormValues(model, !isCustomModel),
		inheritReasoningEfforts:
			!isCustomModel &&
			model.customization?.reasoningEfforts === undefined,
		reasoningEfforts: createReasoningEffortFormValues(model),
	};
}

function toReasoningEffortOptions(
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

function getCustomizationErrorMessage(
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

function renderCapabilityTags(
	capabilities: ProviderModelCapabilities,
	t: (key: string) => string,
): React.JSX.Element {
	return (
		<span className={styles.capabilities}>
			{getVisibleCapabilities(capabilities).map(
				(capability: CapabilityBadge): React.JSX.Element => (
					<Tag
						key={capability.key}
						color={capability.color}
						className={styles.capabilityTag}
					>
						<Icon name={capability.icon} width={16} />
						{t(capability.labelKey)}
					</Tag>
				),
			)}
		</span>
	);
}

function mergeManagedModels(
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
		const existing: ManagedProviderModel | undefined = modelsById.get(
			model.id,
		);
		modelsById.set(model.id, {
			...model,
			enabled: existing?.enabled ?? false,
			removalGuards: existing?.removalGuards ?? [],
		});
	}
	return [...modelsById.values()];
}

function getDiscoveryFailureMessage(
	result: ProviderModelsDiscoverResult,
	t: (key: string) => string,
): string {
	const code: ProviderModelDiscoveryFailureCode | undefined =
		result.failure?.code;
	const guidanceKey: string | null =
		code === undefined
			? null
			: `settings.provider.discovery.failures.${code}`;
	const guidance: string | null =
		guidanceKey === null ? null : t(guidanceKey);
	const detail: string | undefined = result.error;
	if (guidance === null || guidance === guidanceKey) {
		return detail ?? t("settings.provider.errors.discoverModels");
	}
	return detail === undefined ? guidance : `${guidance} (${detail})`;
}

function isOpenAICompatibleCustomProvider(
	provider: ProviderModelSelectionProvider,
): boolean {
	return (
		provider.custom &&
		(provider.providerType === "openai" ||
			provider.providerType === "openai-responses")
	);
}

function ProviderSettingsPage({
	onSelectionChange,
}: ProviderSettingsPageProps): React.JSX.Element | null {
	const { t } = useTranslation();
	const { message, modal } = App.useApp();
	const [selection, setSelection] = useState<ProviderModelSelection | null>(
		null,
	);
	const [selectedProviderId, setSelectedProviderId] = useState<string | null>(
		null,
	);
	const [query, setQuery] = useState<string>("");
	const [draftBaseUrl, setDraftBaseUrl] = useState<string>("");
	const [draftApiKey, setDraftApiKey] = useState<string>("");
	const [isApiKeyDirty, setIsApiKeyDirty] = useState<boolean>(false);
	const [isLoading, setIsLoading] = useState<boolean>(true);
	const [isSaving, setIsSaving] = useState<boolean>(false);
	const [isCredentialSaving, setIsCredentialSaving] =
		useState<boolean>(false);
	const [isTesting, setIsTesting] = useState<boolean>(false);
	const [errorMessage, setErrorMessage] = useState<string | null>(null);
	const [isRequestConfigOpen, setIsRequestConfigOpen] =
		useState<boolean>(false);
	const [isRequestConfigSaving, setIsRequestConfigSaving] =
		useState<boolean>(false);
	const [providerAction, setProviderAction] = useState<
		"enable" | "disable" | "remove" | null
	>(null);
	const [requestConfigError, setRequestConfigError] = useState<string | null>(
		null,
	);
	const [providerDialogMode, setProviderDialogMode] = useState<
		"add" | "edit" | null
	>(null);
	const [editingProvider, setEditingProvider] =
		useState<ProviderModelSelectionProvider | null>(null);
	const [modelDialogMode, setModelDialogMode] = useState<
		"add" | "edit" | null
	>(null);
	const [editingModel, setEditingModel] = useState<ProviderModelInfo | null>(
		null,
	);
	const [dialogError, setDialogError] = useState<string | null>(null);
	const [isDialogSaving, setIsDialogSaving] = useState<boolean>(false);
	const [isDiscoveryOpen, setIsDiscoveryOpen] = useState<boolean>(false);
	const [discoveryProvider, setDiscoveryProvider] =
		useState<ProviderModelSelectionProvider | null>(null);
	const [discoveryQuery, setDiscoveryQuery] = useState<string>("");
	const [discoveredModels, setDiscoveredModels] = useState<
		ManagedProviderModel[]
	>([]);
	const [latestRemoteModels, setLatestRemoteModels] = useState<
		DiscoveredProviderModel[]
	>([]);
	const [selectedDiscoveredModelIds, setSelectedDiscoveredModelIds] =
		useState<Key[]>([]);
	const [initialEnabledModelIds, setInitialEnabledModelIds] = useState<
		Set<string>
	>(new Set());
	const [discoverySource, setDiscoverySource] = useState<
		ProviderModelsDiscoverResult["source"] | null
	>(null);
	const [discoveryError, setDiscoveryError] = useState<string | null>(null);
	const [isDiscovering, setIsDiscovering] = useState<boolean>(false);
	const [isImporting, setIsImporting] = useState<boolean>(false);
	const discoveryRequestIdRef = useRef<number>(0);
	const [providerForm] = Form.useForm<AddProviderFormValues>();
	const [modelForm] = Form.useForm<ModelFormValues>();
	const canInheritModelFields: boolean =
		modelDialogMode === "edit" &&
		editingModel?.customization?.source !== "custom";
	const inheritDisplayName: boolean =
		Form.useWatch("inheritDisplayName", modelForm) ?? false;
	const inheritContextWindowTokens: boolean =
		Form.useWatch("inheritContextWindowTokens", modelForm) ?? false;
	const inheritMaxOutputTokens: boolean =
		Form.useWatch("inheritMaxOutputTokens", modelForm) ?? false;
	const inheritReasoningEfforts: boolean =
		Form.useWatch("inheritReasoningEfforts", modelForm) ?? false;
	const reasoningCapabilityValue: CapabilityFormValue =
		Form.useWatch(["capabilities", "reasoning"], modelForm) ?? "disabled";
	const reasoningEffortsEnabled: boolean =
		reasoningCapabilityValue === "enabled" ||
		(reasoningCapabilityValue === "inherit" &&
			editingModel?.capabilities.reasoning === true);

	useEffect((): (() => void) => {
		let cancelled: boolean = false;

		async function loadSelection(): Promise<void> {
			try {
				setIsLoading(true);
				setErrorMessage(null);
				const result: ProviderModelSelection =
					await fetchProviderModelSelection();

				if (cancelled) {
					return;
				}

				setSelection(result);
				onSelectionChange?.(result);
				setSelectedProviderId(
					(currentProviderId: string | null): string => {
						return (
							currentProviderId ??
							result.providers[0]?.provider ??
							result.activeModel.providerId
						);
					},
				);
			} catch (error: unknown) {
				if (!cancelled) {
					setErrorMessage(
						error instanceof Error
							? error.message
							: t("settings.provider.errors.load"),
					);
				}
			} finally {
				if (!cancelled) {
					setIsLoading(false);
				}
			}
		}

		void loadSelection();

		return (): void => {
			cancelled = true;
		};
	}, [onSelectionChange, t]);

	const selectedProvider: ProviderModelSelectionProvider | null =
		useMemo((): ProviderModelSelectionProvider | null => {
			if (selection === null) {
				return null;
			}
			return (
				selection.providers.find(
					(provider: ProviderModelSelectionProvider): boolean => {
						return provider.provider === selectedProviderId;
					},
				) ??
				selection.providers[0] ??
				null
			);
		}, [selectedProviderId, selection]);

	useEffect((): void => {
		if (selectedProvider === null) {
			return;
		}

		setDraftBaseUrl(selectedProvider.baseUrl);
		setDraftApiKey("");
		setIsApiKeyDirty(false);
	}, [selectedProvider]);

	useEffect((): void => {
		setIsRequestConfigOpen(false);
		setRequestConfigError(null);
	}, [selectedProviderId]);

	const filteredProviders: ProviderModelSelectionProvider[] =
		useMemo((): ProviderModelSelectionProvider[] => {
			if (selection === null) {
				return [];
			}

			const normalizedQuery: string = query.trim().toLowerCase();
			if (normalizedQuery.length === 0) {
				return selection.providers;
			}

			return selection.providers.filter(
				(provider: ProviderModelSelectionProvider): boolean => {
					return (
						provider.displayName
							.toLowerCase()
							.includes(normalizedQuery) ||
						provider.provider
							.toLowerCase()
							.includes(normalizedQuery)
					);
				},
			);
		}, [query, selection]);

	const providerMenuItems: MenuProps["items"] =
		useMemo((): MenuProps["items"] => {
			return filteredProviders.map(
				(
					provider: ProviderModelSelectionProvider,
				): NonNullable<MenuProps["items"]>[number] => {
					const enabled: boolean = provider.enabled !== false;
					return {
						key: provider.provider,
						label: (
							<span className={styles.providerMenuLabel}>
								<span className={styles.providerName}>
									{provider.displayName}
								</span>
								{enabled ? (
									<Tag
										color="success"
										className={styles.providerStatusTag}
									>
										{t("settings.common.on")}
									</Tag>
								) : null}
							</span>
						),
					};
				},
			);
		}, [filteredProviders, t]);

	function createDiscoveryParams(
		provider: ProviderModelSelectionProvider,
	): Parameters<typeof discoverProviderModels>[0] {
		const params: Parameters<typeof discoverProviderModels>[0] = {
			provider: provider.provider,
		};
		const apiKey: string = draftApiKey.trim();
		const baseUrl: string = draftBaseUrl.trim();
		if (isApiKeyDirty && apiKey.length > 0) {
			params.apiKey = apiKey;
		}
		params.baseUrl = baseUrl.length > 0 ? baseUrl : null;
		return params;
	}

	function createCredentialSavePayload(
		provider: ProviderModelSelectionProvider,
		enableProvider: boolean = false,
	): Parameters<typeof saveProviderConfig>[0] {
		const payload: Parameters<typeof saveProviderConfig>[0] = {
			provider: provider.provider,
			baseUrl:
				draftBaseUrl.trim().length > 0 ? draftBaseUrl.trim() : null,
			activate: false,
		};
		if (enableProvider) {
			payload.enabled = true;
		}
		if (isApiKeyDirty && draftApiKey.trim().length > 0) {
			payload.apiKey = draftApiKey.trim();
		}
		return payload;
	}

	async function handleSaveRequestOverrides(
		value: ProviderRequestOverrides,
	): Promise<void> {
		if (selectedProvider === null) {
			return;
		}

		try {
			setIsRequestConfigSaving(true);
			setRequestConfigError(null);
			const nextSelection: ProviderModelSelection =
				await saveProviderConfig({
					provider: selectedProvider.provider,
					requestOverrides: value,
					activate: false,
				});
			setSelection(nextSelection);
			onSelectionChange?.(nextSelection);
			setSelectedProviderId(selectedProvider.provider);
			setIsRequestConfigOpen(false);
			void message.success(
				t("settings.provider.messages.requestConfigurationSaved"),
			);
		} catch (error: unknown) {
			setRequestConfigError(
				error instanceof Error
					? error.message
					: t("settings.provider.errors.saveRequestConfiguration"),
			);
		} finally {
			setIsRequestConfigSaving(false);
		}
	}

	async function handleClearApiKey(
		provider: ProviderModelSelectionProvider,
	): Promise<void> {
		if (!provider.configured) {
			setDraftApiKey("");
			setIsApiKeyDirty(false);
			return;
		}

		try {
			setIsSaving(true);
			setErrorMessage(null);
			const resolvedModel: string | null =
				provider.selectedModel ?? provider.defaultModel;
			const payload: Parameters<typeof saveProviderConfig>[0] = {
				provider: provider.provider,
				apiKey: null,
				baseUrl:
					draftBaseUrl.trim().length > 0 ? draftBaseUrl.trim() : null,
				activate: provider.selected && resolvedModel !== null,
			};
			if (resolvedModel !== null) {
				payload.model = resolvedModel;
			}
			const nextSelection: ProviderModelSelection =
				await saveProviderConfig(payload);
			setSelection(nextSelection);
			onSelectionChange?.(nextSelection);
			setSelectedProviderId(provider.provider);
			setDraftApiKey("");
			setIsApiKeyDirty(false);
		} catch (error: unknown) {
			setErrorMessage(
				error instanceof Error
					? error.message
					: t("settings.provider.errors.clearApiKey"),
			);
		} finally {
			setIsSaving(false);
		}
	}

	async function handleSaveCredentials(
		provider: ProviderModelSelectionProvider,
	): Promise<void> {
		try {
			setIsCredentialSaving(true);
			setErrorMessage(null);
			const nextSelection: ProviderModelSelection =
				await saveProviderConfig(createCredentialSavePayload(provider));
			setSelection(nextSelection);
			onSelectionChange?.(nextSelection);
			setSelectedProviderId(provider.provider);
			setDraftApiKey("");
			setIsApiKeyDirty(false);
			void message.success(
				t("settings.provider.messages.credentialsSaved"),
			);
		} catch (error: unknown) {
			setErrorMessage(
				error instanceof Error
					? error.message
					: t("settings.provider.errors.saveCredentials"),
			);
		} finally {
			setIsCredentialSaving(false);
		}
	}

	async function handleTestProvider(
		provider: ProviderModelSelectionProvider,
	): Promise<void> {
		try {
			setIsTesting(true);
			setErrorMessage(null);
			const result: ProviderModelsDiscoverResult =
				await discoverProviderModels(createDiscoveryParams(provider));
			if (result.source !== "api" || result.error !== undefined) {
				throw new Error(getDiscoveryFailureMessage(result, t));
			}
			const nextSelection: ProviderModelSelection =
				await saveProviderConfig(
					createCredentialSavePayload(provider, true),
				);
			setSelection(nextSelection);
			onSelectionChange?.(nextSelection);
			setSelectedProviderId(provider.provider);
			setDraftApiKey("");
			setIsApiKeyDirty(false);
			void message.success(t("settings.provider.messages.testSuccess"));
		} catch (error: unknown) {
			setErrorMessage(
				error instanceof Error
					? error.message
					: t("settings.provider.errors.testConnection"),
			);
		} finally {
			setIsTesting(false);
		}
	}

	async function loadDiscoveredModels(
		provider: ProviderModelSelectionProvider,
		preserveSelection: boolean,
	): Promise<void> {
		const requestId: number = discoveryRequestIdRef.current + 1;
		discoveryRequestIdRef.current = requestId;
		setIsDiscovering(true);
		setDiscoveryError(null);
		try {
			const result: ProviderModelsDiscoverResult =
				await discoverProviderModels(createDiscoveryParams(provider));
			if (discoveryRequestIdRef.current !== requestId) {
				return;
			}
			setLatestRemoteModels(
				(
					currentModels: DiscoveredProviderModel[],
				): DiscoveredProviderModel[] => {
					if (!preserveSelection) {
						return result.models;
					}
					const modelsById: Map<string, DiscoveredProviderModel> =
						new Map(
							currentModels.map(
								(
									model: DiscoveredProviderModel,
								): [string, DiscoveredProviderModel] => [
									model.id,
									model,
								],
							),
						);
					for (const model of result.models) {
						modelsById.set(model.id, model);
					}
					return [...modelsById.values()];
				},
			);
			setDiscoveredModels(
				(
					currentModels: ManagedProviderModel[],
				): ManagedProviderModel[] => {
					const nextModels: ManagedProviderModel[] =
						mergeManagedModels(
							currentModels,
							result.managedModels,
							result.models,
							preserveSelection,
						);
					const availableIds: Set<string> = new Set(
						nextModels.map(
							(model: ManagedProviderModel): string => model.id,
						),
					);
					const guardedIds: Set<string> = new Set(
						nextModels
							.filter(
								(model: ManagedProviderModel): boolean =>
									model.removalGuards.length > 0,
							)
							.map(
								(model: ManagedProviderModel): string =>
									model.id,
							),
					);
					setSelectedDiscoveredModelIds(
						(currentIds: Key[]): Key[] => {
							const nextIds: Set<string> = preserveSelection
								? new Set(
										currentIds
											.map((currentId: Key): string =>
												String(currentId),
											)
											.filter(
												(modelId: string): boolean =>
													availableIds.has(modelId),
											),
									)
								: new Set(
										result.managedModels
											.filter(
												(
													model: ManagedProviderModel,
												): boolean => model.enabled,
											)
											.map(
												(
													model: ManagedProviderModel,
												): string => model.id,
											),
									);
							for (const modelId of guardedIds) {
								nextIds.add(modelId);
							}
							return [...nextIds];
						},
					);
					if (!preserveSelection) {
						setInitialEnabledModelIds(
							new Set(
								result.managedModels
									.filter(
										(
											model: ManagedProviderModel,
										): boolean => model.enabled,
									)
									.map(
										(model: ManagedProviderModel): string =>
											model.id,
									),
							),
						);
					}
					return nextModels;
				},
			);
			setDiscoverySource(result.source);
			setDiscoveryError(
				result.error === undefined
					? null
					: getDiscoveryFailureMessage(result, t),
			);
		} catch (error: unknown) {
			if (discoveryRequestIdRef.current === requestId) {
				if (!preserveSelection) {
					setDiscoveredModels([]);
					setLatestRemoteModels([]);
					setSelectedDiscoveredModelIds([]);
					setInitialEnabledModelIds(new Set());
				}
				setDiscoverySource(null);
				setDiscoveryError(
					error instanceof Error
						? error.message
						: t("settings.provider.errors.discoverModels"),
				);
			}
		} finally {
			if (discoveryRequestIdRef.current === requestId) {
				setIsDiscovering(false);
			}
		}
	}

	function openDiscoveryDialog(
		provider: ProviderModelSelectionProvider,
	): void {
		setDiscoveryProvider(provider);
		setDiscoveryQuery("");
		setDiscoveredModels([]);
		setLatestRemoteModels([]);
		setSelectedDiscoveredModelIds([]);
		setInitialEnabledModelIds(new Set());
		setDiscoverySource(null);
		setDiscoveryError(null);
		setIsDiscoveryOpen(true);
		setIsDiscovering(true);
		void loadDiscoveredModels(provider, false);
	}

	function closeDiscoveryDialog(): void {
		discoveryRequestIdRef.current += 1;
		setIsDiscoveryOpen(false);
		setIsDiscovering(false);
		setIsImporting(false);
	}

	function getRemovalGuardMessage(guard: ProviderModelRemovalGuard): string {
		switch (guard.kind) {
			case "activeModel":
				return t("settings.provider.discovery.guards.activeModel");
			case "providerSelection":
				return t(
					"settings.provider.discovery.guards.providerSelection",
				);
			case "taskRouting":
				return t("settings.provider.discovery.guards.taskRouting", {
					task: guard.task,
				});
			case "webSearch":
				return t("settings.provider.discovery.guards.webSearch");
		}
	}

	function getProviderUsageLabel(usage: ProviderModelUsage): string {
		if (usage.kind === "activeModel") {
			return t("settings.provider.usage.activeModel", {
				model: usage.model,
			});
		}
		const task: string = t(
			`settings.defaultModel.routing.${usage.task}.title`,
			{
				defaultValue: usage.task,
			},
		);
		return t("settings.provider.usage.taskRouting", {
			task,
			model: usage.model,
		});
	}

	function showProviderUsageBlocked(
		provider: ProviderModelSelectionProvider,
		usages: ProviderModelUsage[],
	): void {
		void modal.warning({
			title: t("settings.provider.usage.blockedTitle"),
			content: (
				<div>
					<Typography.Paragraph>
						{t("settings.provider.usage.blockedDescription", {
							provider: provider.displayName,
						})}
					</Typography.Paragraph>
					<ul>
						{usages.map(
							(usage: ProviderModelUsage): React.JSX.Element => (
								<li
									key={
										usage.kind === "taskRouting"
											? `${usage.kind}:${usage.task}:${usage.model}`
											: `${usage.kind}:${usage.model}`
									}
								>
									{getProviderUsageLabel(usage)}
								</li>
							),
						)}
					</ul>
				</div>
			),
			okText: t("settings.common.confirm"),
		});
	}

	function applyProviderSelection(
		nextSelection: ProviderModelSelection,
		nextProviderId: string | null,
	): void {
		setSelection(nextSelection);
		onSelectionChange?.(nextSelection);
		setSelectedProviderId(
			nextProviderId ??
				nextSelection.providers[0]?.provider ??
				nextSelection.activeModel.providerId,
		);
	}

	async function handleProviderEnabledChange(
		provider: ProviderModelSelectionProvider,
		enabled: boolean,
	): Promise<void> {
		try {
			setProviderAction(enabled ? "enable" : "disable");
			setErrorMessage(null);
			const result = await setProviderEnabled({
				provider: provider.provider,
				enabled,
			});
			if (!result.updated) {
				showProviderUsageBlocked(provider, result.usages);
				return;
			}
			applyProviderSelection(result.selection, provider.provider);
			void message.success(
				t(
					enabled
						? "settings.provider.messages.providerEnabled"
						: "settings.provider.messages.providerDisabled",
					{
						provider: provider.displayName,
					},
				),
			);
		} catch (error: unknown) {
			setErrorMessage(
				getCustomizationErrorMessage(
					error,
					"settings.provider.errors.updateProviderState",
					t,
				),
			);
		} finally {
			setProviderAction(null);
		}
	}

	async function handleRemoveProvider(
		provider: ProviderModelSelectionProvider,
	): Promise<void> {
		if (!provider.custom) {
			return;
		}

		try {
			const usage = await getProviderUsage(provider.provider);
			if (usage.usages.length > 0) {
				showProviderUsageBlocked(provider, usage.usages);
				return;
			}
		} catch (error: unknown) {
			setErrorMessage(
				getCustomizationErrorMessage(
					error,
					"settings.provider.errors.removeProvider",
					t,
				),
			);
			return;
		}

		const confirmed: boolean = await modal.confirm({
			title: t("settings.provider.remove.confirmTitle"),
			content: t("settings.provider.remove.confirmDescription", {
				provider: provider.displayName,
			}),
			okText: t("settings.provider.actions.removeProvider"),
			okButtonProps: { danger: true },
			cancelText: t("settings.common.cancel"),
		});
		if (!confirmed) {
			return;
		}

		try {
			setProviderAction("remove");
			setErrorMessage(null);
			const result = await removeCustomProvider(provider.provider);
			if (!result.updated) {
				showProviderUsageBlocked(provider, result.usages);
				return;
			}
			applyProviderSelection(result.selection, null);
			void message.success(
				t("settings.provider.messages.providerRemoved", {
					provider: provider.displayName,
				}),
			);
		} catch (error: unknown) {
			setErrorMessage(
				getCustomizationErrorMessage(
					error,
					"settings.provider.errors.removeProvider",
					t,
				),
			);
		} finally {
			setProviderAction(null);
		}
	}

	async function handleSyncDiscoveredModels(): Promise<void> {
		if (discoveryProvider === null) {
			return;
		}
		const selectedIds: Set<string> = new Set(
			selectedDiscoveredModelIds.map((id: Key): string => String(id)),
		);
		const upsertModels: DiscoveredProviderModel[] =
			latestRemoteModels.filter(
				(model: DiscoveredProviderModel): boolean => {
					return selectedIds.has(model.id);
				},
			);
		const enableModelIds: string[] = [...selectedIds].filter(
			(modelId: string): boolean => !initialEnabledModelIds.has(modelId),
		);
		const removeModelIds: string[] = [...initialEnabledModelIds].filter(
			(modelId: string): boolean => !selectedIds.has(modelId),
		);
		if (removeModelIds.length > 0) {
			const removedModels: ManagedProviderModel[] =
				discoveredModels.filter(
					(model: ManagedProviderModel): boolean => {
						return removeModelIds.includes(model.id);
					},
				);
			const confirmed: boolean = await modal.confirm({
				title: t("settings.provider.discovery.removeConfirmTitle"),
				content: (
					<div>
						<Typography.Paragraph>
							{t(
								"settings.provider.discovery.removeConfirmDescription",
								{ count: removedModels.length },
							)}
						</Typography.Paragraph>
						<ul>
							{removedModels.map(
								(
									model: ManagedProviderModel,
								): React.JSX.Element => (
									<li key={model.id}>
										{model.displayName} ({model.id})
									</li>
								),
							)}
						</ul>
					</div>
				),
				okText: t("settings.provider.actions.removeModels"),
				okButtonProps: { danger: true },
				cancelText: t("settings.common.cancel"),
			});
			if (!confirmed) {
				return;
			}
		}

		try {
			setIsImporting(true);
			setDiscoveryError(null);
			if (discoverySource === "api") {
				await saveProviderConfig(
					createCredentialSavePayload(discoveryProvider),
				);
			}
			const nextSelection: ProviderModelSelection =
				await syncProviderModels({
					provider: discoveryProvider.provider,
					upsertModels,
					enableModelIds,
					removeModelIds,
				});
			setSelection(nextSelection);
			onSelectionChange?.(nextSelection);
			setSelectedProviderId(discoveryProvider.provider);
			if (discoverySource === "api") {
				setDraftApiKey("");
				setIsApiKeyDirty(false);
			}
			closeDiscoveryDialog();
			void message.success(
				t("settings.provider.messages.syncSuccess", {
					enabled: enableModelIds.length,
					removed: removeModelIds.length,
				}),
			);
		} catch (error: unknown) {
			setDiscoveryError(
				error instanceof Error
					? error.message
					: t("settings.provider.errors.syncModels"),
			);
		} finally {
			setIsImporting(false);
		}
	}

	function openAddProviderDialog(): void {
		setDialogError(null);
		setEditingProvider(null);
		providerForm.setFieldsValue({
			displayName: "",
			providerType: "openai",
			websiteUrl: "",
		});
		setProviderDialogMode("add");
	}

	function openEditProviderDialog(
		provider: ProviderModelSelectionProvider,
	): void {
		if (!provider.custom) {
			return;
		}
		setDialogError(null);
		setEditingProvider(provider);
		providerForm.setFieldsValue({
			displayName: provider.displayName,
			providerType: provider.providerType ?? "openai",
			websiteUrl: provider.websiteUrl ?? "",
		});
		setProviderDialogMode("edit");
	}

	function openAddModelDialog(): void {
		setDialogError(null);
		setEditingModel(null);
		modelForm.setFieldsValue(createAddModelFormValues());
		setModelDialogMode("add");
	}

	function openEditModelDialog(model: ProviderModelInfo): void {
		setDialogError(null);
		setEditingModel(model);
		modelForm.setFieldsValue(createEditModelFormValues(model));
		setModelDialogMode("edit");
	}

	async function handleAddProvider(): Promise<void> {
		try {
			const values: AddProviderFormValues =
				await providerForm.validateFields();
			setIsDialogSaving(true);
			setDialogError(null);
			const result = await addCustomProvider({
				...values,
				websiteUrl: values.websiteUrl?.trim() || null,
			});
			setSelection(result.selection);
			onSelectionChange?.(result.selection);
			setSelectedProviderId(result.providerId);
			setProviderDialogMode(null);
			setEditingProvider(null);
		} catch (error: unknown) {
			const message: string | null = getCustomizationErrorMessage(
				error,
				"settings.provider.errors.addProvider",
				t,
			);
			if (message !== null) {
				setDialogError(message);
			}
		} finally {
			setIsDialogSaving(false);
		}
	}

	async function handleSaveProvider(): Promise<void> {
		if (editingProvider === null) {
			return;
		}
		try {
			const values: AddProviderFormValues =
				await providerForm.validateFields();
			setIsDialogSaving(true);
			setDialogError(null);
			const result = await updateCustomProvider({
				provider: editingProvider.provider,
				displayName: values.displayName,
				providerType: values.providerType,
				websiteUrl: values.websiteUrl?.trim() || null,
			});
			setSelection(result.selection);
			onSelectionChange?.(result.selection);
			setSelectedProviderId(editingProvider.provider);
			setProviderDialogMode(null);
			setEditingProvider(null);
			void message.success(
				t("settings.provider.messages.providerUpdated"),
			);
		} catch (error: unknown) {
			const errorMessage: string | null = getCustomizationErrorMessage(
				error,
				"settings.provider.errors.updateProvider",
				t,
			);
			if (errorMessage !== null) {
				setDialogError(errorMessage);
			}
		} finally {
			setIsDialogSaving(false);
		}
	}

	async function handleOpenProviderWebsite(
		provider: ProviderModelSelectionProvider,
	): Promise<void> {
		const websiteUrl: string | undefined = provider.websiteUrl;
		if (websiteUrl === undefined) {
			return;
		}
		try {
			await window.electronAPI.windowControl.openExternal(websiteUrl);
		} catch (error: unknown) {
			void message.error(
				error instanceof Error
					? error.message
					: t("settings.provider.errors.openWebsite"),
			);
		}
	}

	async function handleSaveModel(): Promise<void> {
		if (selectedProvider === null || modelDialogMode === null) {
			return;
		}
		try {
			const values: ModelFormValues = await modelForm.validateFields();
			const reasoningEfforts: ProviderReasoningEffortOption[] =
				values.capabilities.reasoning === "disabled"
					? []
					: toReasoningEffortOptions(values.reasoningEfforts);
			setIsDialogSaving(true);
			setDialogError(null);
			const nextSelection: ProviderModelSelection =
				modelDialogMode === "add"
					? await addProviderModel({
							provider: selectedProvider.provider,
							id: values.id,
							displayName: values.displayName,
							contextWindowTokens: values.contextWindowTokens,
							maxOutputTokens: values.maxOutputTokens,
							capabilities: toCustomModelCapabilities(
								values.capabilities,
							),
							reasoningEfforts,
						})
					: await updateProviderModel({
							provider: selectedProvider.provider,
							id: editingModel?.id ?? values.id,
							displayName:
								canInheritModelFields &&
								values.inheritDisplayName
									? null
									: values.displayName,
							contextWindowTokens:
								canInheritModelFields &&
								values.inheritContextWindowTokens
									? null
									: values.contextWindowTokens,
							maxOutputTokens:
								canInheritModelFields &&
								values.inheritMaxOutputTokens
									? null
									: values.maxOutputTokens,
							capabilities: toEditableCapabilities(
								values.capabilities,
								canInheritModelFields,
							),
							reasoningEfforts:
								values.capabilities.reasoning !== "disabled" &&
								canInheritModelFields &&
								values.inheritReasoningEfforts
									? null
									: reasoningEfforts,
						});
			setSelection(nextSelection);
			onSelectionChange?.(nextSelection);
			setSelectedProviderId(selectedProvider.provider);
			setModelDialogMode(null);
			setEditingModel(null);
		} catch (error: unknown) {
			const message: string | null = getCustomizationErrorMessage(
				error,
				"settings.provider.errors.saveModel",
				t,
			);
			if (message !== null) {
				setDialogError(message);
			}
		} finally {
			setIsDialogSaving(false);
		}
	}

	if (isLoading && selection === null) {
		return null;
	}

	if (selection === null || selectedProvider === null) {
		return (
			<section className={styles.page}>
				<div className={styles.providerListPane} />
				<div className={styles.detailPane}>
					<div className={styles.detailContent}>
						<div className={styles.detailBody}>
							<Alert
								type="error"
								description={
									errorMessage ??
									t("settings.provider.errors.noSettings")
								}
							/>
						</div>
					</div>
				</div>
			</section>
		);
	}

	const modelColumns: TableProps<ProviderModelInfo>["columns"] = [
		{
			title: t("settings.provider.columns.model"),
			align: "center",
			key: "model",
			render: (
				_value: unknown,
				model: ProviderModelInfo,
			): React.JSX.Element => (
				<span className={styles.modelName}>{model.displayName}</span>
			),
		},
		{
			title: t("settings.provider.columns.capabilities"),
			dataIndex: "capabilities",
			key: "capabilities",
			align: "center",
			width: 360,
			render: (
				capabilities: ProviderModelCapabilities,
			): React.JSX.Element => renderCapabilityTags(capabilities, t),
		},
	];
	const normalizedDiscoveryQuery: string = discoveryQuery
		.trim()
		.toLowerCase();
	const filteredDiscoveredModels: ManagedProviderModel[] =
		normalizedDiscoveryQuery.length === 0
			? discoveredModels
			: discoveredModels.filter(
					(model: ManagedProviderModel): boolean => {
						return (
							model.id
								.toLowerCase()
								.includes(normalizedDiscoveryQuery) ||
							model.displayName
								.toLowerCase()
								.includes(normalizedDiscoveryQuery)
						);
					},
				);
	const discoveryColumns: TableProps<ManagedProviderModel>["columns"] = [
		{
			title: t("settings.provider.fields.modelId"),
			dataIndex: "id",
			key: "id",
			width: 240,
			ellipsis: true,
			render: (
				modelId: string,
				model: ManagedProviderModel,
			): React.JSX.Element => {
				const guardMessage: string | null =
					model.removalGuards[0] === undefined
						? null
						: getRemovalGuardMessage(model.removalGuards[0]);
				const content: React.JSX.Element = <span>{modelId}</span>;
				return guardMessage === null ? (
					content
				) : (
					<Tooltip title={guardMessage}>{content}</Tooltip>
				);
			},
		},
		{
			title: t("settings.provider.fields.modelName"),
			dataIndex: "displayName",
			key: "displayName",
			ellipsis: true,
		},
		{
			title: t("settings.provider.columns.capabilities"),
			dataIndex: "capabilities",
			key: "capabilities",
			align: "center",
			width: 320,
			render: (
				capabilities: ProviderModelCapabilities,
			): React.JSX.Element => renderCapabilityTags(capabilities, t),
		},
	];
	const selectedDiscoveryIds: Set<string> = new Set(
		selectedDiscoveredModelIds.map((key: Key): string => String(key)),
	);
	const selectionChanged: boolean =
		selectedDiscoveryIds.size !== initialEnabledModelIds.size ||
		[...selectedDiscoveryIds].some(
			(modelId: string): boolean => !initialEnabledModelIds.has(modelId),
		);
	const hasSelectedRemoteModels: boolean = latestRemoteModels.some(
		(model: DiscoveredProviderModel): boolean => {
			return selectedDiscoveryIds.has(model.id);
		},
	);
	const canApplyDiscoveryChanges: boolean =
		selectionChanged || hasSelectedRemoteModels;
	const selectedProviderEnabled: boolean = selectedProvider.enabled !== false;
	const providerEnableUnavailable: boolean =
		!selectedProviderEnabled && !selectedProvider.configured;
	const isProviderActionPending: boolean = providerAction !== null;
	const hasUnsavedCredentials: boolean =
		isApiKeyDirty ||
		draftBaseUrl.trim() !== selectedProvider.baseUrl.trim();
	const showOpenAICompatibleBaseUrlHint: boolean =
		isOpenAICompatibleCustomProvider(selectedProvider);

	return (
		<section className={styles.page}>
			<aside className={styles.providerListPane}>
				<Input
					prefix={<Icon name="search" />}
					placeholder={t("settings.provider.searchPlaceholder")}
					className={styles.searchBox}
					value={query}
					onChange={(event: ChangeEvent<HTMLInputElement>): void =>
						setQuery(event.target.value)
					}
				/>

				<Menu
					className={`${styles.providerMenu} daedalus-compact-menu`}
					inlineIndent={8}
					items={providerMenuItems}
					mode="inline"
					selectedKeys={[selectedProvider.provider]}
					onClick={({ key }): void =>
						setSelectedProviderId(String(key))
					}
				/>

				<Button
					className={styles.addProviderButton}
					icon={<Icon name="add" />}
					onClick={openAddProviderDialog}
				>
					{t("settings.common.add")}
				</Button>
			</aside>

			<section className={styles.detailPane}>
				<div
					key={selectedProvider.provider}
					className={`${styles.detailContent} ${styles.detailTransition}`}
				>
					<header className={styles.detailHeader}>
						<Space>
							<Typography.Title
								level={3}
								className={styles.detailTitle}
							>
								{selectedProvider.displayName}
							</Typography.Title>
							{selectedProvider.websiteUrl !== undefined ? (
								<Tooltip
									title={t(
										"settings.provider.actions.openWebsite",
									)}
								>
									<Button
										type="text"
										icon={<Icon name="external-link" />}
										shape="circle"
										aria-label={t(
											"settings.provider.actions.openWebsite",
										)}
										onClick={(): void =>
											void handleOpenProviderWebsite(
												selectedProvider,
											)
										}
									/>
								</Tooltip>
							) : null}
						</Space>
						<Space>
							<Tooltip
								title={
									providerEnableUnavailable
										? t("settings.provider.enterApiKey")
										: selectedProviderEnabled
											? t(
													"settings.provider.actions.disableProvider",
												)
											: t(
													"settings.provider.actions.enableProvider",
												)
								}
								placement="bottom"
							>
								<Switch
									checked={selectedProviderEnabled}
									loading={
										providerAction === "enable" ||
										providerAction === "disable"
									}
									disabled={
										isProviderActionPending ||
										providerEnableUnavailable
									}
									aria-label={
										selectedProviderEnabled
											? t(
													"settings.provider.actions.disableProvider",
												)
											: t(
													"settings.provider.actions.enableProvider",
												)
									}
									onChange={(enabled: boolean): void =>
										void handleProviderEnabledChange(
											selectedProvider,
											enabled,
										)
									}
								/>
							</Tooltip>
							<Tooltip
								title={t(
									"settings.provider.actions.removeProvider",
								)}
								placement="bottom"
							>
								<Button
									type="text"
									shape="circle"
									danger
									icon={<Icon name="remove" />}
									loading={providerAction === "remove"}
									disabled={
										isProviderActionPending ||
										!selectedProvider.custom
									}
									onClick={(): void =>
										void handleRemoveProvider(
											selectedProvider,
										)
									}
								/>
							</Tooltip>
							<Tooltip
								title={t(
									"settings.provider.actions.editProvider",
								)}
								placement="bottom"
							>
								<Button
									type="text"
									shape="circle"
									icon={<Icon name="pencil" />}
									disabled={
										isProviderActionPending ||
										!selectedProvider.custom
									}
									aria-label={t(
										"settings.provider.actions.editProvider",
									)}
									onClick={(): void =>
										openEditProviderDialog(selectedProvider)
									}
								/>
							</Tooltip>
						</Space>
					</header>

					<div className={styles.detailBody}>
						{errorMessage !== null ? (
							<Alert
								type="warning"
								showIcon={true}
								description={errorMessage}
								action={
									<Button
										size="small"
										type="text"
										icon={<Icon name="close" />}
										onClick={(): void =>
											setErrorMessage(null)
										}
									/>
								}
							/>
						) : null}

						<div className={styles.fieldGroup}>
							<div className={styles.fieldLabelRow}>
								<Typography.Title
									className={styles.fieldLabel}
									level={4}
								>
									{t("settings.provider.apiKey")}
								</Typography.Title>
							</div>
							<Flex gap="small">
								<Space.Compact
									block
									className={styles.apiKeyCompact}
								>
									<Input.Password
										value={draftApiKey}
										placeholder={
											selectedProvider.apiKeyMasked ??
											t("settings.provider.enterApiKey")
										}
										onChange={(
											event: ChangeEvent<HTMLInputElement>,
										): void => {
											setDraftApiKey(event.target.value);
											setIsApiKeyDirty(true);
										}}
									/>
									<Button
										onClick={(): void =>
											void handleTestProvider(
												selectedProvider,
											)
										}
										loading={isTesting}
										disabled={
											isSaving || isCredentialSaving
										}
									>
										{t("settings.provider.actions.test")}
									</Button>
									<Button
										onClick={(): void =>
											void handleSaveCredentials(
												selectedProvider,
											)
										}
										loading={isCredentialSaving}
										disabled={
											isSaving ||
											isCredentialSaving ||
											isTesting ||
											!hasUnsavedCredentials
										}
									>
										{t("settings.common.save")}
									</Button>
								</Space.Compact>
								<Button
									color="danger"
									variant="solid"
									icon={<Icon name="clear" />}
									danger={selectedProvider.configured}
									aria-label={t(
										"settings.provider.actions.clearApiKey",
									)}
									disabled={
										isSaving ||
										isCredentialSaving ||
										isTesting ||
										(!selectedProvider.configured &&
											draftApiKey.length === 0)
									}
									loading={isSaving}
									onClick={(): void =>
										void handleClearApiKey(selectedProvider)
									}
								/>
							</Flex>
							<Typography.Text
								type="secondary"
								className={styles.fieldHint}
							>
								{selectedProvider.apiKeyMasked !== null &&
								!isApiKeyDirty
									? t("settings.provider.savedKey", {
											key: selectedProvider.apiKeyMasked,
										})
									: t("settings.provider.newKeyHint")}
							</Typography.Text>
						</div>

						<div className={styles.fieldGroup}>
							<Flex justify="space-between">
								<Typography.Title
									className={styles.fieldLabel}
									level={4}
								>
									{t("settings.provider.apiBaseUrl")}
								</Typography.Title>
								<Tooltip
									title={t(
										"settings.provider.requestConfiguration.open",
									)}
								>
									<Button
										type="text"
										shape="circle"
										icon={<Icon name="more-v" />}
										aria-label={t(
											"settings.provider.requestConfiguration.open",
										)}
										onClick={(): void => {
											setRequestConfigError(null);
											setIsRequestConfigOpen(true);
										}}
									/>
								</Tooltip>
							</Flex>
							<Input
								value={draftBaseUrl}
								onChange={(
									event: ChangeEvent<HTMLInputElement>,
								): void => setDraftBaseUrl(event.target.value)}
							/>
							<div className={styles.fieldHints}>
								{showOpenAICompatibleBaseUrlHint ? (
									<Typography.Text
										type="secondary"
										className={styles.fieldHint}
									>
										{t(
											"settings.provider.baseUrlHints.openaiCompatible",
										)}
									</Typography.Text>
								) : null}
								<Typography.Text
									type="secondary"
									className={styles.fieldHint}
								>
									{t("settings.provider.modelListSource", {
										source: selectedProvider.modelsSource,
									})}
									{selectedProvider.modelsCacheUpdatedAt
										? ` - ${t("settings.provider.updated", { updatedAt: selectedProvider.modelsCacheUpdatedAt })}`
										: ""}
								</Typography.Text>
							</div>
						</div>

						<div className={styles.modelSectionHeader}>
							<div className={styles.modelTitle}>
								<Typography.Title
									className={styles.fieldLabel}
									level={4}
								>
									{t("settings.provider.models")}
								</Typography.Title>
								<Tag>{selectedProvider.models.length}</Tag>
							</div>
							<div className={styles.modelActions}>
								<Space.Compact>
									<Button
										icon={<Icon name="reload" />}
										onClick={(): void =>
											openDiscoveryDialog(
												selectedProvider,
											)
										}
										disabled={isTesting}
									>
										{t(
											"settings.provider.actions.fetchModels",
										)}
									</Button>
									<Button
										icon={<Icon name="add" />}
										aria-label={t(
											"settings.provider.actions.addModel",
										)}
										onClick={openAddModelDialog}
									/>
								</Space.Compact>
							</div>
						</div>

						<div className={styles.modelGroup}>
							<Table<ProviderModelInfo>
								className={styles.modelTable}
								columns={modelColumns}
								dataSource={selectedProvider.models}
								pagination={false}
								rowKey="id"
								size="small"
								scroll={{ x: true }}
								onRow={(
									model: ProviderModelInfo,
								): React.HTMLAttributes<HTMLTableRowElement> => ({
									className: styles.editableModelRow,
									role: "button",
									tabIndex: 0,
									onClick: (): void =>
										openEditModelDialog(model),
									onKeyDown: (
										event: KeyboardEvent<HTMLTableRowElement>,
									): void => {
										if (
											event.key === "Enter" ||
											event.key === " "
										) {
											event.preventDefault();
											openEditModelDialog(model);
										}
									},
								})}
							/>
						</div>
					</div>
				</div>
			</section>

			<ProviderRequestConfigModal
				open={isRequestConfigOpen}
				providerName={selectedProvider.displayName}
				initialValue={selectedProvider.requestOverrides}
				saving={isRequestConfigSaving}
				errorMessage={requestConfigError}
				onCancel={(): void => {
					if (!isRequestConfigSaving) {
						setIsRequestConfigOpen(false);
						setRequestConfigError(null);
					}
				}}
				onSave={(value: ProviderRequestOverrides): void =>
					void handleSaveRequestOverrides(value)
				}
			/>

			<Modal
				open={isDiscoveryOpen}
				title={t("settings.provider.dialogs.discoverModelsTitle", {
					provider:
						discoveryProvider?.displayName ??
						selectedProvider.displayName,
				})}
				okText={t("settings.provider.actions.applyModelChanges")}
				cancelText={t("settings.common.cancel")}
				confirmLoading={isImporting}
				okButtonProps={{
					disabled: isDiscovering || !canApplyDiscoveryChanges,
				}}
				cancelButtonProps={{ disabled: isImporting }}
				closable={!isImporting}
				keyboard={!isImporting}
				mask={{ closable: !isImporting }}
				width={900}
				destroyOnHidden={true}
				onCancel={closeDiscoveryDialog}
				onOk={(): void => void handleSyncDiscoveredModels()}
				className={styles.modal}
			>
				<div className={styles.discoveryDialog}>
					<Flex className={styles.discoveryHeader} gap="small">
						<Input
							prefix={<Icon name="search" />}
							placeholder={t(
								"settings.provider.discovery.searchPlaceholder",
							)}
							value={discoveryQuery}
							allowClear={true}
							onChange={(
								event: ChangeEvent<HTMLInputElement>,
							): void => setDiscoveryQuery(event.target.value)}
						/>
						<Tooltip
							title={t("settings.provider.actions.reloadModels")}
						>
							<Button
								icon={<Icon name="reload" />}
								aria-label={t(
									"settings.provider.actions.reloadModels",
								)}
								loading={isDiscovering}
								disabled={
									isImporting || discoveryProvider === null
								}
								onClick={(): void => {
									if (discoveryProvider !== null) {
										void loadDiscoveredModels(
											discoveryProvider,
											true,
										);
									}
								}}
							/>
						</Tooltip>
					</Flex>

					{discoveryError !== null ? (
						<>
							<Alert
								type={
									discoveredModels.length > 0
										? "warning"
										: "error"
								}
								showIcon={true}
								description={discoveryError}
							/>
							{discoverySource === "fallback" &&
							discoveryProvider?.custom ? (
								<Alert
									type="info"
									showIcon={true}
									description={t(
										"settings.provider.discovery.manualModelHint",
									)}
								/>
							) : null}
						</>
					) : null}

					<Table<ManagedProviderModel>
						className={styles.discoveryTable}
						columns={discoveryColumns}
						dataSource={filteredDiscoveredModels}
						rowKey="id"
						size="small"
						pagination={false}
						loading={isDiscovering}
						scroll={{ x: 760, y: 420 }}
						rowSelection={{
							selectedRowKeys: selectedDiscoveredModelIds,
							preserveSelectedRowKeys: true,
							getCheckboxProps: (
								model: ManagedProviderModel,
							) => ({
								disabled: model.removalGuards.length > 0,
								title:
									model.removalGuards[0] === undefined
										? undefined
										: getRemovalGuardMessage(
												model.removalGuards[0],
											),
								"aria-label":
									model.removalGuards[0] === undefined
										? t(
												"settings.provider.discovery.selectModel",
												{ model: model.displayName },
											)
										: getRemovalGuardMessage(
												model.removalGuards[0],
											),
							}),
							onChange: (keys: Key[]): void => {
								const nextIds: Set<string> = new Set(
									discoveredModels
										.filter(
											(
												model: ManagedProviderModel,
											): boolean =>
												model.removalGuards.length > 0,
										)
										.map(
											(
												model: ManagedProviderModel,
											): string => model.id,
										),
								);
								for (const key of keys) {
									nextIds.add(String(key));
								}
								setSelectedDiscoveredModelIds([...nextIds]);
							},
						}}
						locale={{
							emptyText: isDiscovering ? null : (
								<Empty
									image={Empty.PRESENTED_IMAGE_SIMPLE}
									description={
										discoveryError ??
										t("settings.provider.discovery.empty")
									}
								/>
							),
						}}
					/>
				</div>
			</Modal>

			<Modal
				open={providerDialogMode !== null}
				title={
					providerDialogMode === "edit"
						? t("settings.provider.dialogs.editProviderTitle")
						: t("settings.provider.dialogs.addProviderTitle")
				}
				okText={
					providerDialogMode === "edit"
						? t("settings.common.save")
						: t("settings.common.add")
				}
				cancelText={t("settings.common.cancel")}
				confirmLoading={isDialogSaving}
				destroyOnHidden={true}
				onCancel={(): void => {
					setProviderDialogMode(null);
					setEditingProvider(null);
					setDialogError(null);
				}}
				onOk={(): void =>
					void (providerDialogMode === "edit"
						? handleSaveProvider()
						: handleAddProvider())
				}
				className={styles.modal}
			>
				{dialogError !== null ? (
					<Alert
						className={styles.dialogAlert}
						type="error"
						showIcon={true}
						description={dialogError}
					/>
				) : null}
				<Form<AddProviderFormValues>
					form={providerForm}
					layout="vertical"
					preserve={false}
					initialValues={{ providerType: "openai" }}
				>
					<Form.Item
						name="displayName"
						label={t("settings.provider.fields.providerName")}
						rules={[
							{
								required: true,
								whitespace: true,
								max: 80,
								message: t(
									"settings.provider.validation.providerName",
								),
							},
						]}
					>
						<Input autoFocus={true} maxLength={80} />
					</Form.Item>
					<Form.Item
						name="providerType"
						label={t("settings.provider.fields.providerType")}
						rules={[
							{
								required: true,
								message: t(
									"settings.provider.validation.providerType",
								),
							},
						]}
					>
						<Select
							options={[
								{ value: "openai", label: "OpenAI" },
								{
									value: "openai-responses",
									label: "OpenAI-Response",
								},
								{ value: "anthropic", label: "Anthropic" },
							]}
						/>
					</Form.Item>
					<Form.Item
						name="websiteUrl"
						label={t("settings.provider.fields.websiteUrl")}
						rules={[
							{
								validator: async (
									_rule: unknown,
									value: string | undefined,
								): Promise<void> => {
									const normalized: string =
										value?.trim() ?? "";
									if (normalized.length === 0) {
										return;
									}
									try {
										const url: URL = new URL(normalized);
										if (
											url.protocol !== "http:" &&
											url.protocol !== "https:"
										) {
											throw new Error("invalid_protocol");
										}
									} catch {
										throw new Error(
											t(
												"settings.provider.validation.websiteUrl",
											),
										);
									}
								},
							},
						]}
					>
						<Input
							placeholder={t(
								"settings.provider.placeholders.websiteUrl",
							)}
							maxLength={2048}
						/>
					</Form.Item>
				</Form>
			</Modal>

			<Modal
				open={modelDialogMode !== null}
				title={
					modelDialogMode === "edit"
						? t("settings.provider.dialogs.editModelTitle")
						: t("settings.provider.dialogs.addModelTitle")
				}
				okText={
					modelDialogMode === "edit"
						? t("settings.common.save")
						: t("settings.common.add")
				}
				cancelText={t("settings.common.cancel")}
				confirmLoading={isDialogSaving}
				forceRender={true}
				afterOpenChange={(open: boolean): void => {
					if (!open) {
						return;
					}
					const values: ModelFormValues =
						modelDialogMode === "edit" && editingModel !== null
							? createEditModelFormValues(editingModel)
							: createAddModelFormValues();
					modelForm.setFieldsValue(values);
					modelForm.setFieldValue(
						"reasoningEfforts",
						values.reasoningEfforts,
					);
				}}
				onCancel={(): void => {
					setModelDialogMode(null);
					setEditingModel(null);
					setDialogError(null);
				}}
				onOk={(): void => void handleSaveModel()}
				className={styles.modal}
				width={720}
			>
				{dialogError !== null ? (
					<Alert
						className={styles.dialogAlert}
						type="error"
						showIcon={true}
						description={dialogError}
					/>
				) : null}
				{canInheritModelFields ? (
					<Alert
						className={styles.dialogAlert}
						type="info"
						showIcon={true}
						description={t(
							"settings.provider.modelOverrides.description",
						)}
						action={
							<Button
								type="primary"
								onClick={(): void => {
									modelForm.setFieldsValue({
										inheritDisplayName: true,
										inheritContextWindowTokens: true,
										inheritMaxOutputTokens: true,
										capabilities:
											createUniformCapabilityFormValues(
												"inherit",
											),
										inheritReasoningEfforts: true,
									});
								}}
							>
								{t("settings.provider.modelOverrides.resetAll")}
							</Button>
						}
					/>
				) : null}
				<Form<ModelFormValues>
					form={modelForm}
					layout="vertical"
					preserve={false}
					initialValues={{
						inheritDisplayName: false,
						inheritContextWindowTokens: false,
						inheritMaxOutputTokens: false,
						capabilities:
							createUniformCapabilityFormValues("disabled"),
						inheritReasoningEfforts: false,
						reasoningEfforts: [],
					}}
				>
					<Form.Item
						name="id"
						label={t("settings.provider.fields.modelId")}
						rules={[
							{
								required: true,
								whitespace: true,
								max: 200,
								message: t(
									"settings.provider.validation.modelId",
								),
							},
						]}
					>
						<Input
							autoFocus={modelDialogMode === "add"}
							readOnly={modelDialogMode === "edit"}
							maxLength={200}
						/>
					</Form.Item>
					<Form.Item label={t("settings.provider.fields.modelName")}>
						<Flex gap="small" align="center">
							<Form.Item
								noStyle={true}
								name="displayName"
								rules={[
									{
										required: true,
										whitespace: true,
										max: 120,
										message: t(
											"settings.provider.validation.modelName",
										),
									},
								]}
							>
								<Input
									autoFocus={modelDialogMode === "edit"}
									disabled={
										canInheritModelFields &&
										inheritDisplayName
									}
									maxLength={120}
								/>
							</Form.Item>
							{canInheritModelFields ? (
								<Flex
									gap={6}
									align="center"
									className={styles.inheritControl}
								>
									<Form.Item
										noStyle={true}
										name="inheritDisplayName"
										valuePropName="checked"
									>
										<Switch size="small" />
									</Form.Item>
									<Typography.Text type="secondary">
										{t(
											"settings.provider.modelOverrides.inherit",
										)}
									</Typography.Text>
								</Flex>
							) : null}
						</Flex>
					</Form.Item>
					<Form.Item
						label={t(
							"settings.provider.fields.contextWindowTokens",
						)}
					>
						<Flex gap="small" align="center">
							<Form.Item
								noStyle={true}
								name="contextWindowTokens"
								rules={[
									{
										required: true,
										type: "number",
										min: 1,
										max: 2_000_000_000,
										message: t(
											"settings.provider.validation.tokenLimit",
										),
									},
								]}
							>
								<InputNumber<number>
									disabled={
										canInheritModelFields &&
										inheritContextWindowTokens
									}
									min={1}
									max={2_000_000_000}
									precision={0}
									style={{ width: "100%" }}
								/>
							</Form.Item>
							{canInheritModelFields ? (
								<Flex
									gap={6}
									align="center"
									className={styles.inheritControl}
								>
									<Form.Item
										noStyle={true}
										name="inheritContextWindowTokens"
										valuePropName="checked"
									>
										<Switch size="small" />
									</Form.Item>
									<Typography.Text type="secondary">
										{t(
											"settings.provider.modelOverrides.inherit",
										)}
									</Typography.Text>
								</Flex>
							) : null}
						</Flex>
					</Form.Item>
					<Form.Item
						label={t("settings.provider.fields.maxOutputTokens")}
					>
						<Flex gap="small" align="center">
							<Form.Item
								noStyle={true}
								name="maxOutputTokens"
								rules={[
									{
										required: true,
										type: "number",
										min: 1,
										max: 2_000_000_000,
										message: t(
											"settings.provider.validation.tokenLimit",
										),
									},
								]}
							>
								<InputNumber<number>
									disabled={
										canInheritModelFields &&
										inheritMaxOutputTokens
									}
									min={1}
									max={2_000_000_000}
									precision={0}
									style={{ width: "100%" }}
								/>
							</Form.Item>
							{canInheritModelFields ? (
								<Flex
									gap={6}
									align="center"
									className={styles.inheritControl}
								>
									<Form.Item
										noStyle={true}
										name="inheritMaxOutputTokens"
										valuePropName="checked"
									>
										<Switch size="small" />
									</Form.Item>
									<Typography.Text type="secondary">
										{t(
											"settings.provider.modelOverrides.inherit",
										)}
									</Typography.Text>
								</Flex>
							) : null}
						</Flex>
					</Form.Item>
					<Divider
						orientation="horizontal"
						className={styles.modelFormDivider}
					>
						{t("settings.provider.fields.modelCapabilities")}
					</Divider>
					{EDITABLE_CAPABILITIES.map(
						(capability: EditableCapability): React.JSX.Element => (
							<Form.Item
								key={capability.key}
								name={["capabilities", capability.key]}
								label={t(capability.labelKey)}
							>
								<Segmented<CapabilityFormValue>
									block={true}
									options={[
										...(canInheritModelFields
											? [
													{
														value: "inherit" as CapabilityFormValue,
														label: t(
															"settings.provider.modelOverrides.inherit",
														),
													},
												]
											: []),
										{
											value: "enabled" as CapabilityFormValue,
											label: t("settings.common.on"),
										},
										{
											value: "disabled" as CapabilityFormValue,
											label: t("settings.common.off"),
										},
									]}
								/>
							</Form.Item>
						),
					)}
					<Divider
						orientation="horizontal"
						className={styles.modelFormDivider}
					>
						{t("settings.provider.fields.reasoningEfforts")}
					</Divider>
					<div className={styles.reasoningEffortHeader}>
						<Typography.Text type="secondary">
							{t(
								reasoningEffortsEnabled
									? "settings.provider.reasoningEfforts.description"
									: "settings.provider.reasoningEfforts.disabled",
							)}
						</Typography.Text>
						{canInheritModelFields ? (
							<Flex
								gap={6}
								align="center"
								className={styles.inheritControl}
							>
								<Form.Item
									noStyle={true}
									name="inheritReasoningEfforts"
									valuePropName="checked"
								>
									<Switch
										size="small"
										disabled={!reasoningEffortsEnabled}
									/>
								</Form.Item>
								<Typography.Text type="secondary">
									{t(
										"settings.provider.modelOverrides.inherit",
									)}
								</Typography.Text>
							</Flex>
						) : null}
					</div>
					<Form.List name="reasoningEfforts">
						{(fields, { add, remove }): React.JSX.Element => (
							<div className={styles.reasoningEffortList}>
								{fields.length === 0 ? (
									<Typography.Text
										type="secondary"
										className={styles.reasoningEffortEmpty}
									>
										{t(
											"settings.provider.reasoningEfforts.empty",
										)}
									</Typography.Text>
								) : null}
								{fields.map(
									(field): React.JSX.Element => (
										<div
											key={field.key}
											className={
												styles.reasoningEffortRow
											}
										>
											<Form.Item
												name={[field.name, "id"]}
												label={t(
													"settings.provider.fields.reasoningEffortId",
												)}
												rules={[
													{
														required: true,
														whitespace: true,
														max: 32,
														message: t(
															"settings.provider.validation.reasoningEffortId",
														),
													},
													{
														validator: async (
															_rule,
															value:
																| string
																| undefined,
														): Promise<void> => {
															const id: string =
																value?.trim() ??
																"";
															const efforts: ReasoningEffortFormValue[] =
																modelForm.getFieldValue(
																	"reasoningEfforts",
																) ?? [];
															if (
																id.length > 0 &&
																efforts.filter(
																	(
																		effort,
																	): boolean =>
																		effort?.id?.trim() ===
																		id,
																).length > 1
															) {
																throw new Error(
																	t(
																		"settings.provider.validation.reasoningEffortDuplicate",
																	),
																);
															}
														},
													},
												]}
											>
												<Input
													disabled={
														!reasoningEffortsEnabled ||
														inheritReasoningEfforts
													}
													maxLength={32}
												/>
											</Form.Item>
											<Form.Item
												name={[field.name, "fallback"]}
												label={t(
													"settings.provider.fields.reasoningEffortFallback",
												)}
												rules={[{ required: true }]}
											>
												<Select
													disabled={
														!reasoningEffortsEnabled ||
														inheritReasoningEfforts
													}
													options={(
														[
															"low",
															"medium",
															"high",
															"max",
														] as const
													).map(
														(
															fallback: BaseReasoningEffort,
														) => ({
															value: fallback,
															label: t(
																`settings.provider.reasoningEfforts.fallback.${fallback}`,
															),
														}),
													)}
												/>
											</Form.Item>
											<Form.Item
												name={[field.name, "default"]}
												label={t(
													"settings.provider.fields.reasoningEffortDefault",
												)}
												valuePropName="checked"
											>
												<Switch
													disabled={
														!reasoningEffortsEnabled ||
														inheritReasoningEfforts
													}
													onChange={(
														checked: boolean,
													): void => {
														if (!checked) {
															return;
														}
														const efforts: ReasoningEffortFormValue[] =
															modelForm.getFieldValue(
																"reasoningEfforts",
															) ?? [];
														modelForm.setFieldValue(
															"reasoningEfforts",
															efforts.map(
																(
																	effort,
																	index,
																): ReasoningEffortFormValue => ({
																	...effort,
																	default:
																		index ===
																		field.name,
																}),
															),
														);
													}}
												/>
											</Form.Item>
											<Button
												type="text"
												danger={true}
												disabled={
													!reasoningEffortsEnabled ||
													inheritReasoningEfforts
												}
												onClick={(): void =>
													remove(field.name)
												}
											>
												{t(
													"settings.provider.actions.removeReasoningEffort",
												)}
											</Button>
										</div>
									),
								)}
								<Button
									icon={<Icon name="add" />}
									disabled={
										!reasoningEffortsEnabled ||
										inheritReasoningEfforts ||
										fields.length >= 16
									}
									onClick={(): void =>
										add({
											id: "",
											fallback: "medium",
											default: fields.length === 0,
										})
									}
								>
									{t(
										"settings.provider.actions.addReasoningEffort",
									)}
								</Button>
							</div>
						)}
					</Form.List>
				</Form>
			</Modal>
		</section>
	);
}

export default ProviderSettingsPage;

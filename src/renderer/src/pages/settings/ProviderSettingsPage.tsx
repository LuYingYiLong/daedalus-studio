import { Alert, App, Button, Divider, Empty, Flex, Form, Input, Menu, Modal, Select, Space, Spin, Table, Tag, Tooltip, Typography } from "antd";
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
	saveProviderConfig,
	syncProviderModels,
	updateProviderModel,
	type CustomProviderType,
	type DiscoveredProviderModel,
	type EditableModelCapabilities,
	type ManagedProviderModel,
	type ProviderModelCapabilities,
	type ProviderModelRemovalGuard,
	type ProviderModelsDiscoverResult,
	type ProviderModelInfo,
	type ProviderModelSelection,
	type ProviderModelSelectionProvider
} from "@/api/provider-api";
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
};

type ModelFormValues = {
	id: string;
	displayName: string;
	capabilities: Array<keyof EditableModelCapabilities>;
};

const CAPABILITY_BADGES: CapabilityBadge[] = [
	{ key: "vision", labelKey: "settings.provider.capabilities.vision", icon: "vision", color: "purple" },
	{ key: "webSearch", labelKey: "settings.provider.capabilities.webSearch", icon: "search", color: "green" },
	{ key: "reasoning", labelKey: "settings.provider.capabilities.reasoning", icon: "thinking", color: "blue" },
	{ key: "tools", labelKey: "settings.provider.capabilities.tools", icon: "mcp", color: "orange" }
];

function getVisibleCapabilities(capabilities: ProviderModelCapabilities): CapabilityBadge[] {
	return CAPABILITY_BADGES.filter((badge: CapabilityBadge): boolean => capabilities[badge.key] === true);
}

function getEditableCapabilities(capabilities: ProviderModelCapabilities): Array<keyof EditableModelCapabilities> {
	const values: Array<keyof EditableModelCapabilities> = [];
	if (capabilities.vision === true || capabilities.imageInput === true) {
		values.push("vision");
	}
	for (const key of ["webSearch", "reasoning", "tools"] as const) {
		if (capabilities[key] === true) {
			values.push(key);
		}
	}
	return values;
}

function toEditableCapabilities(values: Array<keyof EditableModelCapabilities>): EditableModelCapabilities {
	const selected: Set<keyof EditableModelCapabilities> = new Set(values);
	return {
		vision: selected.has("vision"),
		webSearch: selected.has("webSearch"),
		reasoning: selected.has("reasoning"),
		tools: selected.has("tools")
	};
}

function getCustomizationErrorMessage(
	error: unknown,
	fallbackKey: string,
	t: (key: string) => string
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
	return error.message.length > 0 ? `${t(fallbackKey)}: ${error.message}` : t(fallbackKey);
}

function renderCapabilityTags(capabilities: ProviderModelCapabilities, t: (key: string) => string): React.JSX.Element {
	return (
		<span className={styles.capabilities}>
			{getVisibleCapabilities(capabilities).map((capability: CapabilityBadge): React.JSX.Element => (
				<Tag key={capability.key} color={capability.color} className={styles.capabilityTag}>
					<Icon name={capability.icon} width={16} />
					{t(capability.labelKey)}
				</Tag>
			))}
		</span>
	);
}

function mergeManagedModels(
	previousModels: readonly ManagedProviderModel[],
	managedModels: readonly ManagedProviderModel[],
	remoteModels: readonly DiscoveredProviderModel[],
	preservePrevious: boolean
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
			removalGuards: existing?.removalGuards ?? []
		});
	}
	return [...modelsById.values()];
}

function ProviderSettingsPage({ onSelectionChange }: ProviderSettingsPageProps): React.JSX.Element {
	const { t } = useTranslation();
	const { message, modal } = App.useApp();
	const [selection, setSelection] = useState<ProviderModelSelection | null>(null);
	const [selectedProviderId, setSelectedProviderId] = useState<string | null>(null);
	const [query, setQuery] = useState<string>("");
	const [draftBaseUrl, setDraftBaseUrl] = useState<string>("");
	const [draftApiKey, setDraftApiKey] = useState<string>("");
	const [isApiKeyDirty, setIsApiKeyDirty] = useState<boolean>(false);
	const [isLoading, setIsLoading] = useState<boolean>(true);
	const [isSaving, setIsSaving] = useState<boolean>(false);
	const [isTesting, setIsTesting] = useState<boolean>(false);
	const [errorMessage, setErrorMessage] = useState<string | null>(null);
	const [isAddProviderOpen, setIsAddProviderOpen] = useState<boolean>(false);
	const [modelDialogMode, setModelDialogMode] = useState<"add" | "edit" | null>(null);
	const [editingModel, setEditingModel] = useState<ProviderModelInfo | null>(null);
	const [dialogError, setDialogError] = useState<string | null>(null);
	const [isDialogSaving, setIsDialogSaving] = useState<boolean>(false);
	const [isDiscoveryOpen, setIsDiscoveryOpen] = useState<boolean>(false);
	const [discoveryProvider, setDiscoveryProvider] = useState<ProviderModelSelectionProvider | null>(null);
	const [discoveryQuery, setDiscoveryQuery] = useState<string>("");
	const [discoveredModels, setDiscoveredModels] = useState<ManagedProviderModel[]>([]);
	const [latestRemoteModels, setLatestRemoteModels] = useState<DiscoveredProviderModel[]>([]);
	const [selectedDiscoveredModelIds, setSelectedDiscoveredModelIds] = useState<Key[]>([]);
	const [initialEnabledModelIds, setInitialEnabledModelIds] = useState<Set<string>>(new Set());
	const [discoverySource, setDiscoverySource] = useState<ProviderModelsDiscoverResult["source"] | null>(null);
	const [discoveryError, setDiscoveryError] = useState<string | null>(null);
	const [isDiscovering, setIsDiscovering] = useState<boolean>(false);
	const [isImporting, setIsImporting] = useState<boolean>(false);
	const discoveryRequestIdRef = useRef<number>(0);
	const [providerForm] = Form.useForm<AddProviderFormValues>();
	const [modelForm] = Form.useForm<ModelFormValues>();

	useEffect((): (() => void) => {
		let cancelled: boolean = false;

		async function loadSelection(): Promise<void> {
			try {
				setIsLoading(true);
				setErrorMessage(null);
				const result: ProviderModelSelection = await fetchProviderModelSelection();

				if (cancelled) {
					return;
				}

				setSelection(result);
				onSelectionChange?.(result);
				setSelectedProviderId((currentProviderId: string | null): string => {
					return currentProviderId ?? result.providers[0]?.provider ?? result.activeModel.providerId;
				});
			} catch (error: unknown) {
				if (!cancelled) {
					setErrorMessage(error instanceof Error ? error.message : t("settings.provider.errors.load"));
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

	const selectedProvider: ProviderModelSelectionProvider | null = useMemo((): ProviderModelSelectionProvider | null => {
		if (selection === null) {
			return null;
		}
		return selection.providers.find((provider: ProviderModelSelectionProvider): boolean => {
			return provider.provider === selectedProviderId;
		}) ?? selection.providers[0] ?? null;
	}, [selectedProviderId, selection]);

	useEffect((): void => {
		if (selectedProvider === null) {
			return;
		}

		setDraftBaseUrl(selectedProvider.baseUrl);
		setDraftApiKey("");
		setIsApiKeyDirty(false);
	}, [selectedProvider]);

	const filteredProviders: ProviderModelSelectionProvider[] = useMemo((): ProviderModelSelectionProvider[] => {
		if (selection === null) {
			return [];
		}

		const normalizedQuery: string = query.trim().toLowerCase();
		if (normalizedQuery.length === 0) {
			return selection.providers;
		}

		return selection.providers.filter((provider: ProviderModelSelectionProvider): boolean => {
			return provider.displayName.toLowerCase().includes(normalizedQuery)
				|| provider.provider.toLowerCase().includes(normalizedQuery);
		});
	}, [query, selection]);

	const providerMenuItems: MenuProps["items"] = useMemo((): MenuProps["items"] => {
		return filteredProviders.map((provider: ProviderModelSelectionProvider): NonNullable<MenuProps["items"]>[number] => {
			return {
				key: provider.provider,
				label: (
					<span className={styles.providerMenuLabel}>
						<span className={styles.providerName}>{provider.displayName}</span>
						{provider.configured ? <Tag color="success" className={styles.providerStatusTag}>{t("settings.common.on")}</Tag> : null}
					</span>
				)
			};
		});
	}, [filteredProviders, t]);

	function createDiscoveryParams(provider: ProviderModelSelectionProvider): Parameters<typeof discoverProviderModels>[0] {
		const params: Parameters<typeof discoverProviderModels>[0] = {
			provider: provider.provider
		};
		const apiKey: string = draftApiKey.trim();
		const baseUrl: string = draftBaseUrl.trim();
		if (isApiKeyDirty && apiKey.length > 0) {
			params.apiKey = apiKey;
		}
		params.baseUrl = baseUrl.length > 0 ? baseUrl : null;
		return params;
	}

	function createCredentialSavePayload(provider: ProviderModelSelectionProvider): Parameters<typeof saveProviderConfig>[0] {
		const payload: Parameters<typeof saveProviderConfig>[0] = {
			provider: provider.provider,
			baseUrl: draftBaseUrl.trim().length > 0 ? draftBaseUrl.trim() : null,
			activate: false
		};
		if (isApiKeyDirty && draftApiKey.trim().length > 0) {
			payload.apiKey = draftApiKey.trim();
		}
		return payload;
	}

	async function handleClearApiKey(provider: ProviderModelSelectionProvider): Promise<void> {
		if (!provider.configured) {
			setDraftApiKey("");
			setIsApiKeyDirty(false);
			return;
		}

		try {
			setIsSaving(true);
			setErrorMessage(null);
			const resolvedModel: string | null = provider.selectedModel ?? provider.defaultModel;
			const payload: Parameters<typeof saveProviderConfig>[0] = {
				provider: provider.provider,
				apiKey: null,
				baseUrl: draftBaseUrl.trim().length > 0 ? draftBaseUrl.trim() : null,
				activate: provider.selected && resolvedModel !== null
			};
			if (resolvedModel !== null) {
				payload.model = resolvedModel;
			}
			const nextSelection: ProviderModelSelection = await saveProviderConfig(payload);
			setSelection(nextSelection);
			onSelectionChange?.(nextSelection);
			setSelectedProviderId(provider.provider);
			setDraftApiKey("");
			setIsApiKeyDirty(false);
		} catch (error: unknown) {
			setErrorMessage(error instanceof Error ? error.message : t("settings.provider.errors.clearApiKey"));
		} finally {
			setIsSaving(false);
		}
	}

	async function handleTestProvider(provider: ProviderModelSelectionProvider): Promise<void> {
		try {
			setIsTesting(true);
			setErrorMessage(null);
			const result: ProviderModelsDiscoverResult = await discoverProviderModels(createDiscoveryParams(provider));
			if (result.source !== "api" || result.error !== undefined) {
				throw new Error(result.error ?? t("settings.provider.errors.testConnection"));
			}
			const nextSelection: ProviderModelSelection = await saveProviderConfig(createCredentialSavePayload(provider));
			setSelection(nextSelection);
			onSelectionChange?.(nextSelection);
			setSelectedProviderId(provider.provider);
			setDraftApiKey("");
			setIsApiKeyDirty(false);
			void message.success(t("settings.provider.messages.testSuccess"));
		} catch (error: unknown) {
			setErrorMessage(error instanceof Error ? error.message : t("settings.provider.errors.testConnection"));
		} finally {
			setIsTesting(false);
		}
	}

	async function loadDiscoveredModels(
		provider: ProviderModelSelectionProvider,
		preserveSelection: boolean
	): Promise<void> {
		const requestId: number = discoveryRequestIdRef.current + 1;
		discoveryRequestIdRef.current = requestId;
		setIsDiscovering(true);
		setDiscoveryError(null);
		try {
			const result: ProviderModelsDiscoverResult = await discoverProviderModels(createDiscoveryParams(provider));
			if (discoveryRequestIdRef.current !== requestId) {
				return;
			}
			setLatestRemoteModels((currentModels: DiscoveredProviderModel[]): DiscoveredProviderModel[] => {
				if (!preserveSelection) {
					return result.models;
				}
				const modelsById: Map<string, DiscoveredProviderModel> = new Map(
					currentModels.map((model: DiscoveredProviderModel): [string, DiscoveredProviderModel] => [model.id, model])
				);
				for (const model of result.models) {
					modelsById.set(model.id, model);
				}
				return [...modelsById.values()];
			});
			setDiscoveredModels((currentModels: ManagedProviderModel[]): ManagedProviderModel[] => {
				const nextModels: ManagedProviderModel[] = mergeManagedModels(
					currentModels,
					result.managedModels,
					result.models,
					preserveSelection
				);
				const availableIds: Set<string> = new Set(nextModels.map((model: ManagedProviderModel): string => model.id));
				const guardedIds: Set<string> = new Set(
					nextModels
						.filter((model: ManagedProviderModel): boolean => model.removalGuards.length > 0)
						.map((model: ManagedProviderModel): string => model.id)
				);
				setSelectedDiscoveredModelIds((currentIds: Key[]): Key[] => {
					const nextIds: Set<string> = preserveSelection
						? new Set(
							currentIds
								.map((currentId: Key): string => String(currentId))
								.filter((modelId: string): boolean => availableIds.has(modelId))
						)
						: new Set(
							result.managedModels
								.filter((model: ManagedProviderModel): boolean => model.enabled)
								.map((model: ManagedProviderModel): string => model.id)
						);
					for (const modelId of guardedIds) {
						nextIds.add(modelId);
					}
					return [...nextIds];
				});
				if (!preserveSelection) {
					setInitialEnabledModelIds(new Set(
						result.managedModels
							.filter((model: ManagedProviderModel): boolean => model.enabled)
							.map((model: ManagedProviderModel): string => model.id)
					));
				}
				return nextModels;
			});
			setDiscoverySource(result.source);
			setDiscoveryError(result.error ?? null);
		} catch (error: unknown) {
			if (discoveryRequestIdRef.current === requestId) {
				if (!preserveSelection) {
					setDiscoveredModels([]);
					setLatestRemoteModels([]);
					setSelectedDiscoveredModelIds([]);
					setInitialEnabledModelIds(new Set());
				}
				setDiscoverySource(null);
				setDiscoveryError(error instanceof Error ? error.message : t("settings.provider.errors.discoverModels"));
			}
		} finally {
			if (discoveryRequestIdRef.current === requestId) {
				setIsDiscovering(false);
			}
		}
	}

	function openDiscoveryDialog(provider: ProviderModelSelectionProvider): void {
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
				return t("settings.provider.discovery.guards.providerSelection");
			case "taskRouting":
				return t("settings.provider.discovery.guards.taskRouting", { task: guard.task });
			case "webSearch":
				return t("settings.provider.discovery.guards.webSearch");
		}
	}

	async function handleSyncDiscoveredModels(): Promise<void> {
		if (discoveryProvider === null) {
			return;
		}
		const selectedIds: Set<string> = new Set(selectedDiscoveredModelIds.map((id: Key): string => String(id)));
		const upsertModels: DiscoveredProviderModel[] = latestRemoteModels.filter((model: DiscoveredProviderModel): boolean => {
			return selectedIds.has(model.id);
		});
		const enableModelIds: string[] = [...selectedIds].filter((modelId: string): boolean => !initialEnabledModelIds.has(modelId));
		const removeModelIds: string[] = [...initialEnabledModelIds].filter((modelId: string): boolean => !selectedIds.has(modelId));
		if (removeModelIds.length > 0) {
			const removedModels: ManagedProviderModel[] = discoveredModels.filter((model: ManagedProviderModel): boolean => {
				return removeModelIds.includes(model.id);
			});
			const confirmed: boolean = await modal.confirm({
				title: t("settings.provider.discovery.removeConfirmTitle"),
				content: (
					<div>
						<Typography.Paragraph>
							{t("settings.provider.discovery.removeConfirmDescription", { count: removedModels.length })}
						</Typography.Paragraph>
						<ul>
							{removedModels.map((model: ManagedProviderModel): React.JSX.Element => (
								<li key={model.id}>{model.displayName} ({model.id})</li>
							))}
						</ul>
					</div>
				),
				okText: t("settings.provider.actions.removeModels"),
				okButtonProps: { danger: true },
				cancelText: t("settings.common.cancel")
			});
			if (!confirmed) {
				return;
			}
		}

		try {
			setIsImporting(true);
			setDiscoveryError(null);
			if (discoverySource === "api") {
				await saveProviderConfig(createCredentialSavePayload(discoveryProvider));
			}
			const nextSelection: ProviderModelSelection = await syncProviderModels({
				provider: discoveryProvider.provider,
				upsertModels,
				enableModelIds,
				removeModelIds
			});
			setSelection(nextSelection);
			onSelectionChange?.(nextSelection);
			setSelectedProviderId(discoveryProvider.provider);
			if (discoverySource === "api") {
				setDraftApiKey("");
				setIsApiKeyDirty(false);
			}
			closeDiscoveryDialog();
			void message.success(t("settings.provider.messages.syncSuccess", {
				enabled: enableModelIds.length,
				removed: removeModelIds.length
			}));
		} catch (error: unknown) {
			setDiscoveryError(error instanceof Error ? error.message : t("settings.provider.errors.syncModels"));
		} finally {
			setIsImporting(false);
		}
	}

	function openAddProviderDialog(): void {
		setDialogError(null);
		providerForm.setFieldsValue({
			displayName: "",
			providerType: "openai"
		});
		setIsAddProviderOpen(true);
	}

	function openAddModelDialog(): void {
		setDialogError(null);
		setEditingModel(null);
		modelForm.setFieldsValue({
			id: "",
			displayName: "",
			capabilities: []
		});
		setModelDialogMode("add");
	}

	function openEditModelDialog(model: ProviderModelInfo): void {
		setDialogError(null);
		setEditingModel(model);
		modelForm.setFieldsValue({
			id: model.id,
			displayName: model.displayName,
			capabilities: getEditableCapabilities(model.capabilities)
		});
		setModelDialogMode("edit");
	}

	async function handleAddProvider(): Promise<void> {
		try {
			const values: AddProviderFormValues = await providerForm.validateFields();
			setIsDialogSaving(true);
			setDialogError(null);
			const result = await addCustomProvider(values);
			setSelection(result.selection);
			onSelectionChange?.(result.selection);
			setSelectedProviderId(result.providerId);
			setIsAddProviderOpen(false);
		} catch (error: unknown) {
			const message: string | null = getCustomizationErrorMessage(error, "settings.provider.errors.addProvider", t);
			if (message !== null) {
				setDialogError(message);
			}
		} finally {
			setIsDialogSaving(false);
		}
	}

	async function handleSaveModel(): Promise<void> {
		if (selectedProvider === null || modelDialogMode === null) {
			return;
		}
		try {
			const values: ModelFormValues = await modelForm.validateFields();
			setIsDialogSaving(true);
			setDialogError(null);
			const nextSelection: ProviderModelSelection = modelDialogMode === "add"
				? await addProviderModel({
					provider: selectedProvider.provider,
					id: values.id,
					displayName: values.displayName
				})
				: await updateProviderModel({
					provider: selectedProvider.provider,
					id: editingModel?.id ?? values.id,
					displayName: values.displayName,
					capabilities: toEditableCapabilities(values.capabilities)
				});
			setSelection(nextSelection);
			onSelectionChange?.(nextSelection);
			setSelectedProviderId(selectedProvider.provider);
			setModelDialogMode(null);
			setEditingModel(null);
		} catch (error: unknown) {
			const message: string | null = getCustomizationErrorMessage(error, "settings.provider.errors.saveModel", t);
			if (message !== null) {
				setDialogError(message);
			}
		} finally {
			setIsDialogSaving(false);
		}
	}

	if (isLoading && selection === null) {
		return (
			<section className={styles.page}>
				<div className={styles.providerListPane}>
					<Spin />
				</div>
				<div className={styles.detailPane} />
			</section>
		);
	}

	if (selection === null || selectedProvider === null) {
		return (
			<section className={styles.page}>
				<div className={styles.providerListPane} />
				<div className={styles.detailPane}>
					<div className={styles.detailContent}>
						<div className={styles.detailBody}>
							<Alert type="error" description={errorMessage ?? t("settings.provider.errors.noSettings")} />
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
			render: (_value: unknown, model: ProviderModelInfo): React.JSX.Element => (
				<span className={styles.modelName}>{model.displayName}</span>
			)
		},
		{
			title: t("settings.provider.columns.capabilities"),
			dataIndex: "capabilities",
			key: "capabilities",
			align: "center",
			width: 360,
			render: (capabilities: ProviderModelCapabilities): React.JSX.Element => renderCapabilityTags(capabilities, t)
		}
	];
	const normalizedDiscoveryQuery: string = discoveryQuery.trim().toLowerCase();
	const filteredDiscoveredModels: ManagedProviderModel[] = normalizedDiscoveryQuery.length === 0
		? discoveredModels
		: discoveredModels.filter((model: ManagedProviderModel): boolean => {
			return model.id.toLowerCase().includes(normalizedDiscoveryQuery)
				|| model.displayName.toLowerCase().includes(normalizedDiscoveryQuery);
		});
	const discoveryColumns: TableProps<ManagedProviderModel>["columns"] = [
		{
			title: t("settings.provider.fields.modelId"),
			dataIndex: "id",
			key: "id",
			width: 240,
			ellipsis: true,
			render: (modelId: string, model: ManagedProviderModel): React.JSX.Element => {
				const guardMessage: string | null = model.removalGuards[0] === undefined
					? null
					: getRemovalGuardMessage(model.removalGuards[0]);
				const content: React.JSX.Element = <span>{modelId}</span>;
				return guardMessage === null ? content : <Tooltip title={guardMessage}>{content}</Tooltip>;
			}
		},
		{
			title: t("settings.provider.fields.modelName"),
			dataIndex: "displayName",
			key: "displayName",
			ellipsis: true
		},
		{
			title: t("settings.provider.columns.capabilities"),
			dataIndex: "capabilities",
			key: "capabilities",
			align: "center",
			width: 320,
			render: (capabilities: ProviderModelCapabilities): React.JSX.Element => renderCapabilityTags(capabilities, t)
		}
	];
	const selectedDiscoveryIds: Set<string> = new Set(selectedDiscoveredModelIds.map((key: Key): string => String(key)));
	const selectionChanged: boolean = (
		selectedDiscoveryIds.size !== initialEnabledModelIds.size
		|| [...selectedDiscoveryIds].some((modelId: string): boolean => !initialEnabledModelIds.has(modelId))
	);
	const hasSelectedRemoteModels: boolean = latestRemoteModels.some((model: DiscoveredProviderModel): boolean => {
		return selectedDiscoveryIds.has(model.id);
	});
	const canApplyDiscoveryChanges: boolean = selectionChanged || hasSelectedRemoteModels;

	return (
		<section className={styles.page}>
			<aside className={styles.providerListPane}>
				<Input
					prefix={<Icon name="search" />}
					placeholder={t("settings.provider.searchPlaceholder")}
					className={styles.searchBox}
					value={query}
					onChange={(event: ChangeEvent<HTMLInputElement>): void => setQuery(event.target.value)}
				/>

				<Menu
					className={`${styles.providerMenu} daedalus-compact-menu`}
					inlineIndent={8}
					items={providerMenuItems}
					mode="inline"
					selectedKeys={[selectedProvider.provider]}
					onClick={({ key }): void => setSelectedProviderId(String(key))}
				/>

				<Button className={styles.addProviderButton} icon={<Icon name="add" />} onClick={openAddProviderDialog}>
					{t("settings.common.add")}
				</Button>
			</aside>

			<Divider vertical size="small" className={styles.divider} />

			<section className={styles.detailPane}>
				<div className={styles.detailContent}>
					<header className={styles.detailHeader}>
						<Typography.Title level={3} className={styles.detailTitle}>
							{selectedProvider.displayName}
						</Typography.Title>
					</header>

					<div className={styles.detailBody}>
						{errorMessage !== null ? (
							<Alert
								type="warning"
								showIcon={true}
								description={errorMessage}
								action={(
									<Button
										size="small"
										type="text"
										icon={<Icon name="close" />}
										onClick={(): void => setErrorMessage(null)}
									/>
								)}
							/>
						) : null}

						<div className={styles.fieldGroup}>
							<div className={styles.fieldLabelRow}>
								<Typography.Title className={styles.fieldLabel} level={4}>{t("settings.provider.apiKey")}</Typography.Title>
							</div>
							<Space.Compact>
								<Input.Password
									value={draftApiKey}
									placeholder={selectedProvider.apiKeyMasked ?? t("settings.provider.enterApiKey")}
									onChange={(event: ChangeEvent<HTMLInputElement>): void => {
										setDraftApiKey(event.target.value);
										setIsApiKeyDirty(true);
									}}
								/>
								<Button
									onClick={(): void => void handleTestProvider(selectedProvider)}
									loading={isTesting}
								>
									{t("settings.provider.actions.test")}
								</Button>
								<Button
									color="danger"
									variant="solid"
									icon={<Icon name="clear" />}
									danger={selectedProvider.configured}
									aria-label={t("settings.provider.actions.clearApiKey")}
									disabled={isSaving || isTesting || (!selectedProvider.configured && draftApiKey.length === 0)}
									loading={isSaving}
									onClick={(): void => void handleClearApiKey(selectedProvider)}
								/>
							</Space.Compact>
							<Typography.Text type="secondary" className={styles.fieldHint}>
								{selectedProvider.apiKeyMasked !== null && !isApiKeyDirty ? t("settings.provider.savedKey", { key: selectedProvider.apiKeyMasked }) : t("settings.provider.newKeyHint")}
							</Typography.Text>
						</div>

						<div className={styles.fieldGroup}>
							<Typography.Title className={styles.fieldLabel} level={4}>{t("settings.provider.apiBaseUrl")}</Typography.Title>
							<Input
								value={draftBaseUrl}
								onChange={(event: ChangeEvent<HTMLInputElement>): void => setDraftBaseUrl(event.target.value)}
							/>
							<Typography.Text type="secondary" className={styles.fieldHint}>
								{t("settings.provider.modelListSource", { source: selectedProvider.modelsSource })}
								{selectedProvider.modelsCacheUpdatedAt ? ` - ${t("settings.provider.updated", { updatedAt: selectedProvider.modelsCacheUpdatedAt })}` : ""}
							</Typography.Text>
						</div>

						<div className={styles.modelSectionHeader}>
							<div className={styles.modelTitle}>
								<Typography.Title className={styles.fieldLabel} level={4}>{t("settings.provider.models")}</Typography.Title>
								<Tag>{selectedProvider.models.length}</Tag>
							</div>
							<div className={styles.modelActions}>
								<Space.Compact>
									<Button
										icon={<Icon name="reload" />}
										onClick={(): void => openDiscoveryDialog(selectedProvider)}
										disabled={isTesting}
									>
										{t("settings.provider.actions.fetchModels")}
									</Button>
									<Button
										icon={<Icon name="add" />}
										aria-label={t("settings.provider.actions.addModel")}
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
								onRow={(model: ProviderModelInfo): React.HTMLAttributes<HTMLTableRowElement> => ({
									className: styles.editableModelRow,
									role: "button",
									tabIndex: 0,
									onClick: (): void => openEditModelDialog(model),
									onKeyDown: (event: KeyboardEvent<HTMLTableRowElement>): void => {
										if (event.key === "Enter" || event.key === " ") {
											event.preventDefault();
											openEditModelDialog(model);
										}
									}
								})}
							/>
						</div>
					</div>
				</div>
			</section>

			<Modal
				open={isDiscoveryOpen}
				title={t("settings.provider.dialogs.discoverModelsTitle", {
					provider: discoveryProvider?.displayName ?? selectedProvider.displayName
				})}
				okText={t("settings.provider.actions.applyModelChanges")}
				cancelText={t("settings.common.cancel")}
				confirmLoading={isImporting}
				okButtonProps={{
					disabled: isDiscovering || !canApplyDiscoveryChanges
				}}
				cancelButtonProps={{ disabled: isImporting }}
				closable={!isImporting}
				keyboard={!isImporting}
				mask={{ closable: !isImporting }}
				width={900}
				destroyOnHidden={true}
				onCancel={closeDiscoveryDialog}
				onOk={(): void => void handleSyncDiscoveredModels()}
			>
				<div className={styles.discoveryDialog}>
					<Flex className={styles.discoveryHeader} gap="small">
						<Input
							prefix={<Icon name="search" />}
							placeholder={t("settings.provider.discovery.searchPlaceholder")}
							value={discoveryQuery}
							allowClear={true}
							onChange={(event: ChangeEvent<HTMLInputElement>): void => setDiscoveryQuery(event.target.value)}
						/>
						<Tooltip title={t("settings.provider.actions.reloadModels")}>
							<Button
								icon={<Icon name="reload" />}
								aria-label={t("settings.provider.actions.reloadModels")}
								loading={isDiscovering}
								disabled={isImporting || discoveryProvider === null}
								onClick={(): void => {
									if (discoveryProvider !== null) {
										void loadDiscoveredModels(discoveryProvider, true);
									}
								}}
							/>
						</Tooltip>
					</Flex>

					{discoveryError !== null ? (
						<Alert
							type={discoveredModels.length > 0 ? "warning" : "error"}
							showIcon={true}
							description={discoveryError}
						/>
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
							getCheckboxProps: (model: ManagedProviderModel) => ({
								disabled: model.removalGuards.length > 0,
								title: model.removalGuards[0] === undefined
									? undefined
									: getRemovalGuardMessage(model.removalGuards[0]),
								"aria-label": model.removalGuards[0] === undefined
									? t("settings.provider.discovery.selectModel", { model: model.displayName })
									: getRemovalGuardMessage(model.removalGuards[0])
							}),
							onChange: (keys: Key[]): void => {
								const nextIds: Set<string> = new Set(
									discoveredModels
										.filter((model: ManagedProviderModel): boolean => model.removalGuards.length > 0)
										.map((model: ManagedProviderModel): string => model.id)
								);
								for (const key of keys) {
									nextIds.add(String(key));
								}
								setSelectedDiscoveredModelIds([...nextIds]);
							}
						}}
						locale={{
							emptyText: isDiscovering ? null : (
								<Empty
									image={Empty.PRESENTED_IMAGE_SIMPLE}
									description={discoveryError ?? t("settings.provider.discovery.empty")}
								/>
							)
						}}
					/>
				</div>
			</Modal>

			<Modal
				open={isAddProviderOpen}
				title={t("settings.provider.dialogs.addProviderTitle")}
				okText={t("settings.common.add")}
				cancelText={t("settings.common.cancel")}
				confirmLoading={isDialogSaving}
				destroyOnHidden={true}
				onCancel={(): void => {
					setIsAddProviderOpen(false);
					setDialogError(null);
				}}
				onOk={(): void => void handleAddProvider()}
			>
				{dialogError !== null ? <Alert className={styles.dialogAlert} type="error" showIcon={true} description={dialogError} /> : null}
				<Form<AddProviderFormValues>
					form={providerForm}
					layout="vertical"
					preserve={false}
					initialValues={{ providerType: "openai" }}
				>
					<Form.Item
						name="displayName"
						label={t("settings.provider.fields.providerName")}
						rules={[{
							required: true,
							whitespace: true,
							max: 80,
							message: t("settings.provider.validation.providerName")
						}]}
					>
						<Input autoFocus={true} maxLength={80} />
					</Form.Item>
					<Form.Item
						name="providerType"
						label={t("settings.provider.fields.providerType")}
						rules={[{ required: true, message: t("settings.provider.validation.providerType") }]}
					>
						<Select
							options={[
								{ value: "openai", label: "OpenAI" },
								{ value: "openai-responses", label: "OpenAI-Response" },
								{ value: "anthropic", label: "Anthropic" }
							]}
						/>
					</Form.Item>
				</Form>
			</Modal>

			<Modal
				open={modelDialogMode !== null}
				title={modelDialogMode === "edit"
					? t("settings.provider.dialogs.editModelTitle")
					: t("settings.provider.dialogs.addModelTitle")}
				okText={modelDialogMode === "edit" ? t("settings.common.save") : t("settings.common.add")}
				cancelText={t("settings.common.cancel")}
				confirmLoading={isDialogSaving}
				forceRender={true}
				onCancel={(): void => {
					setModelDialogMode(null);
					setEditingModel(null);
					setDialogError(null);
				}}
				onOk={(): void => void handleSaveModel()}
			>
				{dialogError !== null ? <Alert className={styles.dialogAlert} type="error" showIcon={true} description={dialogError} /> : null}
				<Form<ModelFormValues>
					form={modelForm}
					layout="vertical"
					preserve={false}
					initialValues={{ capabilities: [] }}
				>
					<Form.Item
						name="id"
						label={t("settings.provider.fields.modelId")}
						rules={[{
							required: true,
							whitespace: true,
							max: 200,
							message: t("settings.provider.validation.modelId")
						}]}
					>
						<Input autoFocus={modelDialogMode === "add"} readOnly={modelDialogMode === "edit"} maxLength={200} />
					</Form.Item>
					<Form.Item
						name="displayName"
						label={t("settings.provider.fields.modelName")}
						rules={[{
							required: true,
							whitespace: true,
							max: 120,
							message: t("settings.provider.validation.modelName")
						}]}
					>
						<Input autoFocus={modelDialogMode === "edit"} maxLength={120} />
					</Form.Item>
					<Form.Item
						name="capabilities"
						label={t("settings.provider.fields.modelTypes")}
						hidden={modelDialogMode !== "edit"}
					>
						<Select
							mode="multiple"
							options={CAPABILITY_BADGES.map((capability: CapabilityBadge) => ({
								value: capability.key,
								label: t(capability.labelKey)
							}))}
						/>
					</Form.Item>
				</Form>
			</Modal>
		</section>
	);
}

export default ProviderSettingsPage;

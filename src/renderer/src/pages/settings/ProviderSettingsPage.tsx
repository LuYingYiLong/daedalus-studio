import { Alert, Button, Divider, Form, Input, Menu, Modal, Select, Space, Spin, Table, Tag, Typography } from "antd";
import type { MenuProps, TableProps } from "antd";
import { useEffect, useMemo, useState } from "react";
import type { ChangeEvent, KeyboardEvent } from "react";
import { useTranslation } from "react-i18next";
import { Icon } from "@/assets/icons";
import {
	addCustomProvider,
	addProviderModel,
	fetchProviderModelSelection,
	listProviderModels,
	saveProviderConfig,
	updateProviderModel,
	type CustomProviderType,
	type EditableModelCapabilities,
	type ProviderModelCapabilities,
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

function ProviderSettingsPage({ onSelectionChange }: ProviderSettingsPageProps): React.JSX.Element {
	const { t } = useTranslation();
	const [selection, setSelection] = useState<ProviderModelSelection | null>(null);
	const [selectedProviderId, setSelectedProviderId] = useState<string | null>(null);
	const [query, setQuery] = useState<string>("");
	const [draftBaseUrl, setDraftBaseUrl] = useState<string>("");
	const [draftApiKey, setDraftApiKey] = useState<string>("");
	const [isApiKeyDirty, setIsApiKeyDirty] = useState<boolean>(false);
	const [isLoading, setIsLoading] = useState<boolean>(true);
	const [isSaving, setIsSaving] = useState<boolean>(false);
	const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
	const [errorMessage, setErrorMessage] = useState<string | null>(null);
	const [isAddProviderOpen, setIsAddProviderOpen] = useState<boolean>(false);
	const [modelDialogMode, setModelDialogMode] = useState<"add" | "edit" | null>(null);
	const [editingModel, setEditingModel] = useState<ProviderModelInfo | null>(null);
	const [dialogError, setDialogError] = useState<string | null>(null);
	const [isDialogSaving, setIsDialogSaving] = useState<boolean>(false);
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

	async function reloadSelection(preferredProviderId: string | null = selectedProviderId): Promise<ProviderModelSelection> {
		const nextSelection: ProviderModelSelection = await fetchProviderModelSelection();
		setSelection(nextSelection);
		onSelectionChange?.(nextSelection);
		setSelectedProviderId(preferredProviderId ?? nextSelection.activeModel.providerId);
		return nextSelection;
	}

	function createSavePayload(provider: ProviderModelSelectionProvider, modelId?: string): Parameters<typeof saveProviderConfig>[0] {
		const resolvedModel: string | null = modelId ?? provider.selectedModel ?? provider.defaultModel;
		const payload: Parameters<typeof saveProviderConfig>[0] = {
			provider: provider.provider,
			baseUrl: draftBaseUrl.trim().length > 0 ? draftBaseUrl.trim() : null,
			activate: resolvedModel !== null
		};
		if (resolvedModel !== null) {
			payload.model = resolvedModel;
		}

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

	async function handleRefreshModels(provider: ProviderModelSelectionProvider): Promise<void> {
		try {
			setIsRefreshing(true);
			setErrorMessage(null);
			await saveProviderConfig(createSavePayload(provider));
			const result = await listProviderModels(provider.provider, true);
			await reloadSelection(provider.provider);
			if (result.error !== undefined) {
				setErrorMessage(result.error);
			}
		} catch (error: unknown) {
			setErrorMessage(error instanceof Error ? error.message : t("settings.provider.errors.refreshModels"));
		} finally {
			setIsRefreshing(false);
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
									onClick={(): void => void handleRefreshModels(selectedProvider)}
									loading={isRefreshing}
								>
									{t("settings.provider.actions.test")}
								</Button>
								<Button
									color="danger"
									variant="solid"
									icon={<Icon name="clear" />}
									danger={selectedProvider.configured}
									aria-label={t("settings.provider.actions.clearApiKey")}
									disabled={isSaving || isRefreshing || (!selectedProvider.configured && draftApiKey.length === 0)}
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
										onClick={(): void => void handleRefreshModels(selectedProvider)}
										loading={isRefreshing}
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
					{modelDialogMode === "edit" ? (
						<Form.Item name="capabilities" label={t("settings.provider.fields.modelTypes")}>
							<Select
								mode="multiple"
								options={CAPABILITY_BADGES.map((capability: CapabilityBadge) => ({
									value: capability.key,
									label: t(capability.labelKey)
								}))}
							/>
						</Form.Item>
					) : null}
				</Form>
			</Modal>
		</section>
	);
}

export default ProviderSettingsPage;

import { Alert, Button, Divider, Input, Menu, Space, Spin, Table, Tag, Typography } from "antd";
import type { MenuProps, TableProps } from "antd";
import { useEffect, useMemo, useState } from "react";
import type { ChangeEvent } from "react";
import { useTranslation } from "react-i18next";
import { Icon } from "@/assets/icons";
import {
	fetchProviderModelSelection,
	listProviderModels,
	saveProviderConfig,
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

const CAPABILITY_BADGES: CapabilityBadge[] = [
	{ key: "reasoning", labelKey: "settings.provider.capabilities.reasoning", icon: "thinking", color: "blue" },
	{ key: "tools", labelKey: "settings.provider.capabilities.tools", icon: "mcp", color: "orange" },
	{ key: "webSearch", labelKey: "settings.provider.capabilities.webSearch", icon: "search", color: "green" },
	{ key: "vision", labelKey: "settings.provider.capabilities.vision", icon: "show", color: "purple" },
	{ key: "imageGeneration", labelKey: "settings.provider.capabilities.imageGeneration", icon: "draw", color: "magenta" },
	{ key: "imageEdit", labelKey: "settings.provider.capabilities.imageEdit", icon: "draw", color: "cyan" }
];

function getModelTokenText(model: ProviderModelInfo): string {
	return `${model.contextWindowTokens.toLocaleString()} ctx / ${model.maxOutputTokens.toLocaleString()} out`;
}

function getVisibleCapabilities(capabilities: ProviderModelCapabilities): CapabilityBadge[] {
	return CAPABILITY_BADGES.filter((badge: CapabilityBadge): boolean => capabilities[badge.key] === true);
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
					return currentProviderId ?? result.activeModel.providerId;
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
		const payload: Parameters<typeof saveProviderConfig>[0] = {
			provider: provider.provider,
			baseUrl: draftBaseUrl.trim().length > 0 ? draftBaseUrl.trim() : null,
			model: modelId ?? provider.selectedModel ?? provider.defaultModel,
			activate: true
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
			const nextSelection: ProviderModelSelection = await saveProviderConfig({
				provider: provider.provider,
				apiKey: null,
				baseUrl: draftBaseUrl.trim().length > 0 ? draftBaseUrl.trim() : null,
				model: provider.selectedModel ?? provider.defaultModel,
				activate: provider.selected
			});
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
				<span>
					<span className={styles.modelName}>{model.displayName}</span>
					<span className={styles.modelMeta}>{model.id} - {getModelTokenText(model)}</span>
				</span>
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

				<Button className={styles.addProviderButton} icon={<Icon name="add" />} disabled={true}>
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
									<Button icon={<Icon name="add" />} disabled={true} />
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
							/>
						</div>
					</div>
				</div>
			</section>
		</section>
	);
}

export default ProviderSettingsPage;

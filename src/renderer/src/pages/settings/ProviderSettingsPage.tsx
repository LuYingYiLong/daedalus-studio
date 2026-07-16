import { Alert, Button, Input, Menu, Space, Spin, Table, Tag, Typography } from "antd";
import type { MenuProps, TableProps } from "antd";
import { useEffect, useMemo, useState } from "react";
import type { ChangeEvent } from "react";
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
	label: string;
	icon: string;
	color: string;
};

type ProviderSettingsPageProps = {
	onSelectionChange?: (selection: ProviderModelSelection) => void;
};

const CAPABILITY_BADGES: CapabilityBadge[] = [
	{ key: "reasoning", label: "Reasoning", icon: "thinking", color: "blue" },
	{ key: "tools", label: "Tools", icon: "mcp", color: "orange" },
	{ key: "webSearch", label: "Web", icon: "global", color: "green" },
	{ key: "vision", label: "Vision", icon: "show", color: "purple" },
	{ key: "imageGeneration", label: "Image", icon: "draw", color: "magenta" },
	{ key: "imageEdit", label: "Edit", icon: "draw", color: "cyan" }
];

function getModelTokenText(model: ProviderModelInfo): string {
	return `${model.contextWindowTokens.toLocaleString()} ctx / ${model.maxOutputTokens.toLocaleString()} out`;
}

function getVisibleCapabilities(capabilities: ProviderModelCapabilities): CapabilityBadge[] {
	return CAPABILITY_BADGES.filter((badge: CapabilityBadge): boolean => capabilities[badge.key] === true);
}

function renderCapabilityTags(capabilities: ProviderModelCapabilities): React.JSX.Element {
	return (
		<span className={styles.capabilities}>
			{getVisibleCapabilities(capabilities).map((capability: CapabilityBadge): React.JSX.Element => (
				<Tag key={capability.key} color={capability.color} className={styles.capabilityTag}>
					<Icon name={capability.icon} width={16} />
					{capability.label}
				</Tag>
			))}
		</span>
	);
}

function ProviderSettingsPage({ onSelectionChange }: ProviderSettingsPageProps): React.JSX.Element {
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
					setErrorMessage(error instanceof Error ? error.message : "Failed to load provider settings");
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
	}, []);

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
						{provider.configured ? <Tag color="success" className={styles.providerStatusTag}>ON</Tag> : null}
					</span>
				)
			};
		});
	}, [filteredProviders]);

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

	async function handleSaveProvider(provider: ProviderModelSelectionProvider, modelId?: string): Promise<void> {
		try {
			setIsSaving(true);
			setErrorMessage(null);
			const nextSelection: ProviderModelSelection = await saveProviderConfig(createSavePayload(provider, modelId));
			setSelection(nextSelection);
			onSelectionChange?.(nextSelection);
			setSelectedProviderId(provider.provider);
			setDraftApiKey("");
			setIsApiKeyDirty(false);
		} catch (error: unknown) {
			setErrorMessage(error instanceof Error ? error.message : "Failed to save provider config");
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
			setErrorMessage(error instanceof Error ? error.message : "Failed to refresh provider models");
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
					<div className={styles.detailBody}>
						<Alert type="error" description={errorMessage ?? "No provider settings available"} />
					</div>
				</div>
			</section>
		);
	}

	const modelColumns: TableProps<ProviderModelInfo>["columns"] = [
		{
			title: "Model",
			align: "center",
			key: "model",
			render: (_value: unknown, model: ProviderModelInfo): React.JSX.Element => (
				<span>
					<span className={styles.modelName}>{model.displayName}</span>
					<span className={styles.modelMeta}>{model.id} · {getModelTokenText(model)}</span>
				</span>
			)
		},
		{
			title: "Capabilities",
			dataIndex: "capabilities",
			key: "capabilities",
			align: "center",
			width: 360,
			render: (capabilities: ProviderModelCapabilities): React.JSX.Element => renderCapabilityTags(capabilities)
		}
	];

	return (
		<section className={styles.page}>
			<aside className={styles.providerListPane}>
				<Input
					prefix={<Icon name="search" />}
					placeholder="Search providers..."
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
					Add
				</Button>
			</aside>

			<section className={styles.detailPane}>
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
							<Typography.Title className={styles.fieldLabel} level={4}>API Key</Typography.Title>
						</div>
						<Space.Compact>
							<Input.Password
								value={draftApiKey}
								placeholder={selectedProvider.apiKeyMasked ?? "Enter API key"}
								onChange={(event: ChangeEvent<HTMLInputElement>): void => {
									setDraftApiKey(event.target.value);
									setIsApiKeyDirty(true);
								}}
							/>
							<Button
								onClick={(): void => void handleRefreshModels(selectedProvider)}
								loading={isRefreshing}
							>
								Test
							</Button>
						</Space.Compact>
						<Typography.Text type="secondary" className={styles.fieldHint}>
							{selectedProvider.apiKeyMasked !== null && !isApiKeyDirty ? `Saved key: ${selectedProvider.apiKeyMasked}` : "Only a newly entered key will be saved."}
						</Typography.Text>
					</div>

					<div className={styles.fieldGroup}>
						<Typography.Title className={styles.fieldLabel} level={4}>API Base URL</Typography.Title>
						<Input
							value={draftBaseUrl}
							onChange={(event: ChangeEvent<HTMLInputElement>): void => setDraftBaseUrl(event.target.value)}
						/>
						<Typography.Text type="secondary" className={styles.fieldHint}>
							Model list source: {selectedProvider.modelsSource}
							{selectedProvider.modelsCacheUpdatedAt ? ` · updated ${selectedProvider.modelsCacheUpdatedAt}` : ""}
						</Typography.Text>
					</div>

					<div className={styles.modelSectionHeader}>
						<div className={styles.modelTitle}>
							<Typography.Title className={styles.fieldLabel} level={4}>Models</Typography.Title>
							<Tag>{selectedProvider.models.length}</Tag>
						</div>
						<div className={styles.modelActions}>
							<Space.Compact>
								<Button
									icon={<Icon name="reload" />}
									onClick={(): void => void handleRefreshModels(selectedProvider)}
									loading={isRefreshing}
								>
									Fetch models
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
			</section>
		</section>
	);
}

export default ProviderSettingsPage;

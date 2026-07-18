import { Alert, Card, List, Select, Spin, Switch, Tag, Typography } from "antd";
import type { SelectProps } from "antd";
import { useEffect, useMemo, useState } from "react";
import {
	fetchWebSearchSettings,
	updateWebSearchSettings,
	type WebSearchModelOption,
	type WebSearchSettings
} from "@/api/web-search-settings-api";
import styles from "./SearchSettingsPage.module.css";

type SavingKey = "enabled" | "model";

function encodeModelValue(option: WebSearchModelOption): string {
	return `${option.provider}:${encodeURIComponent(option.model)}`;
}

function decodeModelValue(value: string): { provider: string; model: string } | null {
	const separatorIndex: number = value.indexOf(":");
	if (separatorIndex <= 0 || separatorIndex >= value.length - 1) {
		return null;
	}

	return {
		provider: value.slice(0, separatorIndex),
		model: decodeURIComponent(value.slice(separatorIndex + 1))
	};
}

function getSelectedModelValue(settings: WebSearchSettings | null): string | undefined {
	if (settings === null) {
		return undefined;
	}

	const selectedOption: WebSearchModelOption | undefined = settings.models.find((option: WebSearchModelOption): boolean => {
		return option.provider === settings.provider && option.model === settings.model;
	});
	return selectedOption === undefined ? undefined : encodeModelValue(selectedOption);
}

function createModelOptions(settings: WebSearchSettings | null): SelectProps["options"] {
	if (settings === null) {
		return [];
	}

	const groups = new Map<string, { label: string; options: NonNullable<SelectProps["options"]> }>();
	for (const option of settings.models) {
		const groupKey: string = option.provider;
		const group = groups.get(groupKey) ?? {
			label: option.providerDisplayName,
			options: []
		};
		group.options.push({
			value: encodeModelValue(option),
			label: `${option.modelDisplayName} / ${option.model}`
		});
		groups.set(groupKey, group);
	}
	return Array.from(groups.values());
}

function SearchSettingsPage(): React.JSX.Element {
	const [settings, setSettings] = useState<WebSearchSettings | null>(null);
	const [isLoading, setIsLoading] = useState<boolean>(true);
	const [savingKey, setSavingKey] = useState<SavingKey | null>(null);
	const [errorMessage, setErrorMessage] = useState<string | null>(null);

	useEffect((): (() => void) => {
		let cancelled: boolean = false;

		async function loadSettings(): Promise<void> {
			try {
				setIsLoading(true);
				setErrorMessage(null);
				const loadedSettings: WebSearchSettings = await fetchWebSearchSettings();
				if (!cancelled) {
					setSettings(loadedSettings);
				}
			} catch (error: unknown) {
				if (!cancelled) {
					setErrorMessage(error instanceof Error ? error.message : "Failed to load web search settings");
				}
			} finally {
				if (!cancelled) {
					setIsLoading(false);
				}
			}
		}

		void loadSettings();

		return (): void => {
			cancelled = true;
		};
	}, []);

	const modelOptions: SelectProps["options"] = useMemo((): SelectProps["options"] => {
		return createModelOptions(settings);
	}, [settings]);
	const selectedModelValue: string | undefined = getSelectedModelValue(settings);
	const selectedModel: WebSearchModelOption | undefined = settings?.models.find((option: WebSearchModelOption): boolean => {
		return option.provider === settings.provider && option.model === settings.model;
	});

	async function savePatch(key: SavingKey, patch: Parameters<typeof updateWebSearchSettings>[0]): Promise<void> {
		try {
			setSavingKey(key);
			setErrorMessage(null);
			const savedSettings: WebSearchSettings = await updateWebSearchSettings(patch);
			setSettings(savedSettings);
		} catch (error: unknown) {
			setErrorMessage(error instanceof Error ? error.message : "Failed to save web search settings");
		} finally {
			setSavingKey(null);
		}
	}

	function handleModelChange(value: string): void {
		const decoded = decodeModelValue(value);
		if (decoded === null) {
			return;
		}
		void savePatch("model", decoded);
	}

	return (
		<section className={styles.page}>
			<header className={styles.header}>
				<div className={styles.titleRow}>
					<Typography.Title level={3} className={styles.title}>
						Search
					</Typography.Title>
				</div>
			</header>

			<div className={styles.content}>
				<Card title="Web search" size="small">
					{errorMessage !== null ? (
						<Alert
							type="warning"
							showIcon={true}
							description={errorMessage}
							closable={{
								onClose: (): void => setErrorMessage(null)
							}}
							className={styles.alert}
						/>
					) : null}

					{isLoading || settings === null ? (
						<div className={styles.loading}>
							<Spin />
						</div>
					) : (
						<List
							className={styles.settingsList}
							dataSource={[
								{
									key: "enabled",
									title: "Enable web search",
									description: "Expose provider-native web search to chats as mcp_web_search when the selected search model is configured.",
									action: (
										<Switch
											checked={settings.enabled}
											loading={savingKey === "enabled"}
											disabled={savingKey !== null && savingKey !== "enabled"}
											onChange={(checked: boolean): void => {
												void savePatch("enabled", { enabled: checked });
											}}
										/>
									)
								},
								{
									key: "model",
									title: "Search model",
									description: "Daedalus currently supports provider-native search through Zhipu/Z.AI web_search models.",
									action: (
										<Select
											value={selectedModelValue}
											options={modelOptions}
											loading={savingKey === "model"}
											disabled={savingKey !== null || settings.models.length === 0}
											placeholder="Select a search model"
											onChange={handleModelChange}
										/>
									)
								}
							]}
							renderItem={(item): React.JSX.Element => (
								<List.Item className={styles.settingsItem} actions={[item.action]}>
									<List.Item.Meta
										title={<Typography.Text>{item.title}</Typography.Text>}
										description={item.description}
									/>
								</List.Item>
							)}
						/>
					)}

					{settings !== null && settings.enabled && !settings.configured ? (
						<Alert
							type="info"
							showIcon={true}
							description="Configure the selected provider API key in Provider settings before web search can be used."
						/>
					) : null}
				</Card>
			</div>
		</section>
	);
}

export default SearchSettingsPage;

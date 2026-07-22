import { Alert, Card, Select, Slider, Spin, Switch, Typography } from "antd";
import type { SelectProps, SliderSingleProps } from "antd";
import { useEffect, useMemo, useState } from "react";
import {
	fetchWebSearchSettings,
	updateWebSearchSettings,
	type WebSearchModelOption,
	type WebSearchSettings
} from "@/api/web-search-settings-api";
import styles from "./SearchSettingsPage.module.css";

type SavingKey = "enabled" | "model" | "maxResults";

const SEARCH_RESULT_MARKS: SliderSingleProps["marks"] = {
	0: "0",
	5: "5",
	10: "10",
	20: "20",
	50: "50",
	100: "100"
};

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
	const [draftMaxResults, setDraftMaxResults] = useState<number>(5);
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
					setDraftMaxResults(loadedSettings.maxResults);
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

	async function savePatch(key: SavingKey, patch: Parameters<typeof updateWebSearchSettings>[0]): Promise<void> {
		try {
			setSavingKey(key);
			setErrorMessage(null);
			const savedSettings: WebSearchSettings = await updateWebSearchSettings(patch);
			setSettings(savedSettings);
			if (key === "maxResults") {
				setDraftMaxResults(savedSettings.maxResults);
			}
		} catch (error: unknown) {
			if (key === "maxResults" && settings !== null) {
				setDraftMaxResults(settings.maxResults);
			}
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

	function handleEnabledChange(enabled: boolean): void {
		void savePatch("enabled", { enabled });
	}

	function handleMaxResultsChangeComplete(value: number | number[]): void {
		if (Array.isArray(value)) {
			return;
		}
		void savePatch("maxResults", { maxResults: value });
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
				<Card title="Web search">
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
						<div className={styles.settingsList}>
							{[
								{
									key: "enabled",
									title: "Enable web search",
									description: "Allow every conversation to use the configured web search tool when current information is needed.",
									action: (
										<Switch
											checked={settings.enabled}
											loading={savingKey === "enabled"}
											disabled={savingKey !== null}
											onChange={handleEnabledChange}
										/>
									)
								},
								{
									key: "model",
									title: "Search model",
									description: "Choose the provider-native search model used by the global web search tool.",
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
								},
								{
									key: "maxResults",
									title: "Search result count",
									description: "Default number of search results returned to the assistant when a search tool call does not override it.",
									action: (
										<div className={styles.sliderControl}>
											<Slider
												min={0}
												max={100}
												step={1}
												marks={SEARCH_RESULT_MARKS}
												value={draftMaxResults}
												disabled={savingKey !== null}
												tooltip={{ formatter: (value: number | undefined): string => `${value ?? 0} results` }}
												onChange={(value: number): void => setDraftMaxResults(value)}
												onChangeComplete={handleMaxResultsChangeComplete}
											/>
										</div>
									)
								}
							].map((item): React.JSX.Element => (
								<div key={item.key} className={styles.settingsItem}>
									<div className={styles.settingsMeta}>
										<Typography.Text>{item.title}</Typography.Text>
										<Typography.Text type="secondary">{item.description}</Typography.Text>
									</div>
									{item.action}
								</div>
							))}
						</div>
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

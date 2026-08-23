import { Alert, Select, Slider, Switch, Typography } from "antd";
import type { SelectProps, SliderSingleProps } from "antd";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
	fetchWebSearchSettings,
	updateWebSearchSettings,
	type WebSearchModelOption,
	type WebSearchSettings,
} from "@/platform/rpc/web-search-settings-api";
import SettingsItem from "@/ui/SettingsItem";
import SettingsList from "@/ui/SettingsList";
import styles from "./SearchSettingsPage.module.css";
import { Icon } from "@/assets/icons";

type SavingKey = "enabled" | "model" | "maxResults" | "maxKeywords";

const SEARCH_RESULT_MARKS: SliderSingleProps["marks"] = {
	0: "0",
	5: "5",
	10: "10",
	20: "20",
	50: "50",
	100: "100",
};

const SEARCH_KEYWORD_MARKS: SliderSingleProps["marks"] = {
	1: "1",
	2: "2",
	3: "3",
};

function encodeModelValue(option: WebSearchModelOption): string {
	return `${option.provider}:${encodeURIComponent(option.model)}`;
}

function decodeModelValue(
	value: string,
): { provider: string; model: string } | null {
	const separatorIndex: number = value.indexOf(":");
	if (separatorIndex <= 0 || separatorIndex >= value.length - 1) {
		return null;
	}

	return {
		provider: value.slice(0, separatorIndex),
		model: decodeURIComponent(value.slice(separatorIndex + 1)),
	};
}

function getSelectedModelValue(
	settings: WebSearchSettings | null,
): string | undefined {
	if (settings === null) {
		return undefined;
	}

	const selectedOption: WebSearchModelOption | undefined =
		settings.models.find((option: WebSearchModelOption): boolean => {
			return (
				option.provider === settings.provider &&
				option.model === settings.model
			);
		});
	return selectedOption === undefined
		? undefined
		: encodeModelValue(selectedOption);
}

function createModelOptions(
	settings: WebSearchSettings | null,
): SelectProps["options"] {
	if (settings === null) {
		return [];
	}

	const groups = new Map<
		string,
		{ label: string; options: NonNullable<SelectProps["options"]> }
	>();
	for (const option of settings.models) {
		const groupKey: string = option.provider;
		const group = groups.get(groupKey) ?? {
			label: option.providerDisplayName,
			options: [],
		};
		group.options.push({
			value: encodeModelValue(option),
			label: `${option.providerDisplayName}/${option.modelDisplayName}`,
		});
		groups.set(groupKey, group);
	}
	return Array.from(groups.values());
}

function SearchSettingsPage(): React.JSX.Element | null {
	const { t } = useTranslation();
	const [settings, setSettings] = useState<WebSearchSettings | null>(null);
	const [draftMaxResults, setDraftMaxResults] = useState<number>(5);
	const [draftMaxKeywords, setDraftMaxKeywords] = useState<number>(1);
	const [isLoading, setIsLoading] = useState<boolean>(true);
	const [savingKey, setSavingKey] = useState<SavingKey | null>(null);
	const [errorMessage, setErrorMessage] = useState<string | null>(null);

	useEffect((): (() => void) => {
		let cancelled: boolean = false;

		async function loadSettings(): Promise<void> {
			try {
				setIsLoading(true);
				setErrorMessage(null);
				const loadedSettings: WebSearchSettings =
					await fetchWebSearchSettings();
				if (!cancelled) {
					setSettings(loadedSettings);
					setDraftMaxResults(loadedSettings.maxResults);
					setDraftMaxKeywords(loadedSettings.maxKeywords);
				}
			} catch (error: unknown) {
				if (!cancelled) {
					setErrorMessage(
						error instanceof Error
							? error.message
							: t("settings.search.errors.load"),
					);
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
	}, [t]);

	const modelOptions: SelectProps["options"] =
		useMemo((): SelectProps["options"] => {
			return createModelOptions(settings);
		}, [settings]);
	const selectedModelValue: string | undefined =
		getSelectedModelValue(settings);
	const selectedModelOption: WebSearchModelOption | undefined =
		settings?.models.find((option: WebSearchModelOption): boolean => {
			return (
				option.provider === settings.provider &&
				option.model === settings.model
			);
		});
	const maxKeywordsConfig = selectedModelOption?.searchOptions?.maxKeywords;

	async function savePatch(
		key: SavingKey,
		patch: Parameters<typeof updateWebSearchSettings>[0],
	): Promise<void> {
		try {
			setSavingKey(key);
			setErrorMessage(null);
			const savedSettings: WebSearchSettings =
				await updateWebSearchSettings(patch);
			setSettings(savedSettings);
			if (key === "maxResults") {
				setDraftMaxResults(savedSettings.maxResults);
			}
			if (key === "maxKeywords") {
				setDraftMaxKeywords(savedSettings.maxKeywords);
			}
		} catch (error: unknown) {
			if (key === "maxResults" && settings !== null) {
				setDraftMaxResults(settings.maxResults);
			}
			if (key === "maxKeywords" && settings !== null) {
				setDraftMaxKeywords(settings.maxKeywords);
			}
			setErrorMessage(
				error instanceof Error
					? error.message
					: t("settings.search.errors.save"),
			);
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

	function handleMaxKeywordsChangeComplete(value: number | number[]): void {
		if (Array.isArray(value)) {
			return;
		}
		void savePatch("maxKeywords", { maxKeywords: value });
	}

	if (isLoading && settings === null) {
		return null;
	}

	return (
		<section className={styles.page}>
			<header className={styles.header}>
				<div className={styles.titleRow}>
					<Typography.Title level={3} className={styles.title}>
						{t("settings.search.title")}
					</Typography.Title>
				</div>
			</header>

			<div className={styles.content}>
				<SettingsList title={t("settings.search.webSearchTitle")}>
					{errorMessage !== null ? (
						<Alert
							type="warning"
							showIcon={true}
							description={errorMessage}
							closable={{
								onClose: (): void => setErrorMessage(null),
							}}
							className={styles.alert}
						/>
					) : null}

					{settings === null ? null : (
						<div className={styles.settingsList}>
							{[
								{
									key: "enabled",
									title: t("settings.search.enabled.title"),
									description: t(
										"settings.search.enabled.description",
									),
									action: (
										<Switch
											checked={settings.enabled}
											loading={savingKey === "enabled"}
											disabled={savingKey !== null}
											onChange={handleEnabledChange}
										/>
									),
								},
								{
									key: "model",
									title: t("settings.search.model.title"),
									description: t(
										"settings.search.model.description",
									),
									action: (
										<Select
											value={selectedModelValue}
											options={modelOptions}
											loading={savingKey === "model"}
											disabled={
												savingKey !== null ||
												settings.models.length === 0
											}
											placeholder={t(
												"settings.search.model.placeholder",
											)}
											onChange={handleModelChange}
										/>
									),
								},
								{
									key: "maxResults",
									title: t(
										"settings.search.maxResults.title",
									),
									description: t(
										"settings.search.maxResults.description",
									),
									action: (
										<div className={styles.sliderControl}>
											<Slider
												min={0}
												max={100}
												step={1}
												marks={SEARCH_RESULT_MARKS}
												value={draftMaxResults}
												disabled={savingKey !== null}
												tooltip={{
													formatter: (
														value:
															| number
															| undefined,
													): string =>
														t(
															"settings.search.maxResults.tooltip",
															{
																count:
																	value ?? 0,
															},
														),
												}}
												onChange={(
													value: number,
												): void =>
													setDraftMaxResults(value)
												}
												onChangeComplete={
													handleMaxResultsChangeComplete
												}
											/>
										</div>
									),
								},
							].map(
								(item): React.JSX.Element => (
									<SettingsItem
										key={item.key}
										searchKey={`item:search.${item.key}`}
										title={item.title}
										description={item.description}
									>
										{item.action}
									</SettingsItem>
								),
							)}
							{maxKeywordsConfig !== undefined ? (
								<SettingsItem
									searchKey="item:search.maxKeywords"
									title={t(
										"settings.search.maxKeywords.title",
									)}
									description={t(
										"settings.search.maxKeywords.description",
									)}
								>
									<div className={styles.sliderControl}>
										<Slider
											min={maxKeywordsConfig.min}
											max={maxKeywordsConfig.max}
											step={1}
											marks={SEARCH_KEYWORD_MARKS}
											value={draftMaxKeywords}
											disabled={savingKey !== null}
											tooltip={{
												formatter: (
													value: number | undefined,
												): string =>
													t(
														"settings.search.maxKeywords.tooltip",
														{ count: value ?? 1 },
													),
											}}
											onChange={(value: number): void =>
												setDraftMaxKeywords(value)
											}
											onChangeComplete={
												handleMaxKeywordsChangeComplete
											}
										/>
									</div>
								</SettingsItem>
							) : null}
						</div>
					)}

					{maxKeywordsConfig?.chargedPerUnit === true ? (
						<Alert
							type="warning"
							showIcon={true}
							description={t(
								"settings.search.maxKeywords.billingNotice",
							)}
							className={styles.providerNotice}
						/>
					) : null}

					{settings !== null &&
					settings.enabled &&
					!settings.configured ? (
						<Alert
							type="info"
							showIcon={true}
							description={t("settings.search.configureProvider")}
						/>
					) : null}
				</SettingsList>
			</div>
		</section>
	);
}

export default SearchSettingsPage;

import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import styles from "./GeneralSettingsPage.module.css";
import { Alert, Button, Card, Input, Segmented, Select, Space, Spin, Switch, Tag, Tooltip, Typography } from "antd";
import type { SelectProps } from "antd";
import { Icon } from "@/assets/icons";
import {
	fetchClientPreferences,
	updateClientPreferences,
	type ClientPreferences,
	type LanguagePreference
} from "@/api/client-preferences-api";
import {
	fetchGeneralSettings,
	updateGeneralSettings,
	type GeneralSettings
} from "@/api/general-settings-api";

type GeneralSettingsPageProps = {
	clientPreferences: ClientPreferences;
	generalSettings: GeneralSettings;
	onClientPreferencesChange: (preferences: ClientPreferences) => void;
	onGeneralSettingsChange: (settings: GeneralSettings) => void;
};

type SettingKey = "autoCheckForUpdates" | "autoExpandTodoList" | "godotExecutablePath" | "language" | "minimizeToTrayOnClose" | "theme";
type ThemePreference = ClientPreferences["theme"];

function GeneralSettingsPage({
	clientPreferences,
	generalSettings,
	onClientPreferencesChange,
	onGeneralSettingsChange
}: GeneralSettingsPageProps): React.JSX.Element {
	const { t } = useTranslation();
	const languageOptions: SelectProps<LanguagePreference>["options"] = [
		{ label: t("settings.general.display.language.system"), value: "system" },
		{ label: t("settings.general.display.language.english"), value: "en-US" },
		{ label: t("settings.general.display.language.chinese"), value: "zh-CN" }
	];
	const [draftClientPreferences, setDraftClientPreferences] = useState<ClientPreferences>(clientPreferences);
	const [draftGeneralSettings, setDraftGeneralSettings] = useState<GeneralSettings>(generalSettings);
	const [isLoading, setIsLoading] = useState<boolean>(true);
	const [savingKey, setSavingKey] = useState<SettingKey | null>(null);
	const [errorMessage, setErrorMessage] = useState<string | null>(null);

	useEffect((): void => {
		setDraftClientPreferences(clientPreferences);
	}, [clientPreferences]);

	useEffect((): void => {
		setDraftGeneralSettings(generalSettings);
	}, [generalSettings]);

	useEffect((): (() => void) => {
		let cancelled: boolean = false;

		async function loadSettings(): Promise<void> {
			try {
				setIsLoading(true);
				setErrorMessage(null);
				const [loadedClientPreferences, loadedGeneralSettings] = await Promise.all([
					fetchClientPreferences(),
					fetchGeneralSettings()
				]);
				if (cancelled) {
					return;
				}
				setDraftClientPreferences(loadedClientPreferences);
				setDraftGeneralSettings(loadedGeneralSettings);
				onClientPreferencesChange(loadedClientPreferences);
				onGeneralSettingsChange(loadedGeneralSettings);
			} catch (error: unknown) {
				if (!cancelled) {
					setErrorMessage(error instanceof Error ? error.message : t("settings.general.errors.load"));
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
	}, [onClientPreferencesChange, onGeneralSettingsChange, t]);

	async function handleAutoExpandTodoListChange(checked: boolean): Promise<void> {
		const previousSettings: GeneralSettings = draftGeneralSettings;
		const optimisticSettings: GeneralSettings = {
			...previousSettings,
			autoExpandTodoList: checked
		};

		try {
			setSavingKey("autoExpandTodoList");
			setErrorMessage(null);
			setDraftGeneralSettings(optimisticSettings);
			onGeneralSettingsChange(optimisticSettings);
			const savedSettings: GeneralSettings = await updateGeneralSettings({ autoExpandTodoList: checked });
			setDraftGeneralSettings(savedSettings);
			onGeneralSettingsChange(savedSettings);
		} catch (error: unknown) {
			setDraftGeneralSettings(previousSettings);
			onGeneralSettingsChange(previousSettings);
			setErrorMessage(error instanceof Error ? error.message : t("settings.general.errors.save"));
		} finally {
			setSavingKey(null);
		}
	}

	async function saveGodotExecutablePath(path: string | null): Promise<void> {
		try {
			setSavingKey("godotExecutablePath");
			setErrorMessage(null);
			const savedSettings: GeneralSettings = await updateGeneralSettings({ godotExecutablePath: path });
			setDraftGeneralSettings(savedSettings);
			onGeneralSettingsChange(savedSettings);
		} catch (error: unknown) {
			setErrorMessage(error instanceof Error ? error.message : t("settings.general.errors.godotExecutable"));
		} finally {
			setSavingKey(null);
		}
	}

	async function handleGodotExecutablePick(): Promise<void> {
		try {
			setSavingKey("godotExecutablePath");
			setErrorMessage(null);
			const path: string | null = await window.electronAPI.pickGodotExecutable();
			if (path === null) {
				return;
			}
			const savedSettings: GeneralSettings = await updateGeneralSettings({ godotExecutablePath: path });
			setDraftGeneralSettings(savedSettings);
			onGeneralSettingsChange(savedSettings);
		} catch (error: unknown) {
			setErrorMessage(error instanceof Error ? error.message : t("settings.general.errors.godotExecutable"));
		} finally {
			setSavingKey(null);
		}
	}

	async function handleMinimizeToTrayChange(checked: boolean): Promise<void> {
		await updateClientPreferenceSwitch("minimizeToTrayOnClose", checked);
	}

	async function handleAutoCheckForUpdatesChange(checked: boolean): Promise<void> {
		await updateClientPreferenceSwitch("autoCheckForUpdates", checked);
	}

	async function updateClientPreferenceSwitch(key: "autoCheckForUpdates" | "minimizeToTrayOnClose", checked: boolean): Promise<void> {
		const previousPreferences: ClientPreferences = draftClientPreferences;
		const optimisticPreferences: ClientPreferences = {
			...previousPreferences,
			[key]: checked
		};

		try {
			setSavingKey(key);
			setErrorMessage(null);
			setDraftClientPreferences(optimisticPreferences);
			onClientPreferencesChange(optimisticPreferences);
			const savedPreferences: ClientPreferences = await updateClientPreferences({ [key]: checked });
			setDraftClientPreferences(savedPreferences);
			onClientPreferencesChange(savedPreferences);
		} catch (error: unknown) {
			setDraftClientPreferences(previousPreferences);
			onClientPreferencesChange(previousPreferences);
			setErrorMessage(error instanceof Error ? error.message : t("settings.general.errors.save"));
		} finally {
			setSavingKey(null);
		}
	}

	async function handleThemeChange(themePreference: ThemePreference): Promise<void> {
		const previousPreferences: ClientPreferences = draftClientPreferences;
		const optimisticPreferences: ClientPreferences = {
			...previousPreferences,
			theme: themePreference
		};

		try {
			setSavingKey("theme");
			setErrorMessage(null);
			setDraftClientPreferences(optimisticPreferences);
			onClientPreferencesChange(optimisticPreferences);
			const savedPreferences: ClientPreferences = await updateClientPreferences({ theme: themePreference });
			setDraftClientPreferences(savedPreferences);
			onClientPreferencesChange(savedPreferences);
		} catch (error: unknown) {
			setDraftClientPreferences(previousPreferences);
			onClientPreferencesChange(previousPreferences);
			setErrorMessage(error instanceof Error ? error.message : t("settings.general.errors.save"));
		} finally {
			setSavingKey(null);
		}
	}

	async function handleLanguageChange(languagePreference: LanguagePreference): Promise<void> {
		const previousPreferences: ClientPreferences = draftClientPreferences;
		const optimisticPreferences: ClientPreferences = {
			...previousPreferences,
			language: languagePreference
		};

		try {
			setSavingKey("language");
			setErrorMessage(null);
			setDraftClientPreferences(optimisticPreferences);
			onClientPreferencesChange(optimisticPreferences);
			const savedPreferences: ClientPreferences = await updateClientPreferences({ language: languagePreference });
			setDraftClientPreferences(savedPreferences);
			onClientPreferencesChange(savedPreferences);
		} catch (error: unknown) {
			setDraftClientPreferences(previousPreferences);
			onClientPreferencesChange(previousPreferences);
			setErrorMessage(error instanceof Error ? error.message : t("settings.general.errors.save"));
		} finally {
			setSavingKey(null);
		}
	}

	return (
		<section className={styles.page}>
			<header className={styles.header}>
				<div className={styles.titleRow}>
					<Typography.Title level={3} className={styles.title}>
						{t("settings.general.title")}
					</Typography.Title>
				</div>
			</header>

			<div className={styles.settingsStack}>
				<Card
					title={t("settings.general.display.title")}
				>
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

					{isLoading ? (
						<div className={styles.loading}>
							<Spin />
						</div>
					) : (
						<div className={styles.preferenceList}>
							<div className={styles.preferenceItem}>
								<div className={styles.preferenceMeta}>
									<Typography.Text>{t("settings.general.display.theme.title")}</Typography.Text>
									<Typography.Text type="secondary">{t("settings.general.display.theme.description")}</Typography.Text>
								</div>
								<Segmented
									className={styles.themeControl}
									value={draftClientPreferences.theme}
									disabled={savingKey !== null && savingKey !== "theme"}
									options={[
										{ label: t("settings.general.display.theme.system"), value: "system" },
										{ label: t("settings.general.display.theme.light"), value: "light" },
										{ label: t("settings.general.display.theme.dark"), value: "dark" }
									]}
									onChange={(value: string | number): void => {
										void handleThemeChange(value as ThemePreference);
									}}
								/>
							</div>
							<div className={styles.preferenceItem}>
								<div className={styles.preferenceMeta}>
									<Typography.Text>{t("settings.general.display.language.title")}</Typography.Text>
									<Typography.Text type="secondary">{t("settings.general.display.language.description")}</Typography.Text>
								</div>
								<Select<LanguagePreference>
									className={styles.preferenceControl}
									value={draftClientPreferences.language}
									disabled={savingKey !== null && savingKey !== "language"}
									options={languageOptions}
									placeholder={t("settings.general.display.language.placeholder")}
									onChange={(value: LanguagePreference): void => {
										void handleLanguageChange(value);
									}}
								/>
							</div>
						</div>
					)}
				</Card>

				<Card title={t("settings.general.godot.title")}>
					{isLoading ? (
						<div className={styles.loading}>
							<Spin />
						</div>
					) : (
						<div className={styles.godotSetting}>
							<div className={styles.preferenceMeta}>
								<div className={styles.godotTitleRow}>
									<Typography.Text>{t("settings.general.godot.executable")}</Typography.Text>
									<Tag
										color={draftGeneralSettings.godotExecutableStatus === "ready" ? "success" : undefined}
									>
										{draftGeneralSettings.godotExecutableStatus === "ready"
											? t("settings.general.godot.status.ready", { version: draftGeneralSettings.godotExecutableVersion ?? t("settings.general.godot.status.readyFallback") })
											: draftGeneralSettings.godotExecutableStatus === "unavailable"
												? t("settings.general.godot.status.unavailable")
												: t("settings.general.godot.status.unconfigured")}
									</Tag>
								</div>
								<Typography.Text type="secondary">
									{t("settings.general.godot.description")}
								</Typography.Text>
							</div>
							<Space.Compact>
								<Input
									readOnly={true}
									value={draftGeneralSettings.godotExecutablePath ?? ""}
									placeholder={t("settings.general.godot.placeholder")}
								/>
								<Button
									icon={<Icon name="folder-open" />}
									loading={savingKey === "godotExecutablePath"}
									disabled={savingKey !== null && savingKey !== "godotExecutablePath"}
									onClick={(): void => { void handleGodotExecutablePick(); }}
								>
									{t("settings.general.godot.browse")}
								</Button>
								<Tooltip title={t("settings.general.godot.clear")}>
									<Button
										aria-label={t("settings.general.godot.clear")}
										icon={<Icon name="clear" />}
										disabled={savingKey !== null || draftGeneralSettings.godotExecutablePath === null}
										onClick={(): void => { void saveGodotExecutablePath(null); }}
									/>
								</Tooltip>
							</Space.Compact>
							{draftGeneralSettings.godotExecutableError === null ? null : (
								<Typography.Text type="danger">{draftGeneralSettings.godotExecutableError}</Typography.Text>
							)}
						</div>
					)}
				</Card>

				<Card
					title={t("settings.general.general.title")}
				>
					{isLoading ? (
						<div className={styles.loading}>
							<Spin />
						</div>
					) : (
						<div className={styles.preferenceList}>
							{[
								{
									key: "autoExpandTodoList" as const,
									title: t("settings.general.general.autoExpandTodoList.title"),
									description: t("settings.general.general.autoExpandTodoList.description"),
									checked: draftGeneralSettings.autoExpandTodoList,
									onChange: handleAutoExpandTodoListChange
								},
								{
									key: "autoCheckForUpdates" as const,
									title: t("settings.general.general.autoCheckForUpdates.title"),
									description: t("settings.general.general.autoCheckForUpdates.description"),
									checked: draftClientPreferences.autoCheckForUpdates,
									onChange: handleAutoCheckForUpdatesChange
								},
								{
									key: "minimizeToTrayOnClose" as const,
									title: t("settings.general.general.minimizeToTrayOnClose.title"),
									description: t("settings.general.general.minimizeToTrayOnClose.description"),
									checked: draftClientPreferences.minimizeToTrayOnClose,
									onChange: handleMinimizeToTrayChange
								}
							].map((item): React.JSX.Element => (
								<div key={item.key} className={styles.preferenceItem}>
									<div className={styles.preferenceMeta}>
										<Typography.Text>{item.title}</Typography.Text>
										<Typography.Text type="secondary">{item.description}</Typography.Text>
									</div>
									<Switch
										checked={item.checked}
										loading={savingKey === item.key}
										disabled={savingKey !== null && savingKey !== item.key}
										onChange={(checked: boolean): void => {
											void item.onChange(checked);
										}}
									/>
								</div>
							))}
						</div>
					)}
				</Card>
			</div>
		</section>
	);
}
export default GeneralSettingsPage;

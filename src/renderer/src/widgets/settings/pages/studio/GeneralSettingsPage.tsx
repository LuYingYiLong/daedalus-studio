import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import styles from "./GeneralSettingsPage.module.css";
import pageMotionStyles from "@/widgets/settings/components/SettingsPageMotion.module.css";
import {
	Alert,
	Select,
	Switch,
	Typography,
} from "antd";
import type { SelectProps } from "antd";
import SettingsItem from "@/ui/SettingsItem";
import SettingsList from "@/ui/SettingsList";
import {
	fetchClientPreferences,
	updateClientPreferences,
	type ClientPreferences,
	type LanguagePreference,
} from "@/platform/rpc/client-preferences-api";
import {
	fetchGeneralSettings,
	updateGeneralSettings,
	type GeneralSettings,
} from "@/platform/rpc/general-settings-api";

type GeneralSettingsPageProps = {
	clientPreferences: ClientPreferences;
	generalSettings: GeneralSettings;
	onClientPreferencesChange: (preferences: ClientPreferences) => void;
	onGeneralSettingsChange: (settings: GeneralSettings) => void;
};

type SettingKey =
	| "autoCheckForUpdates"
	| "language"
	| "minimizeToTrayOnClose"
	| "autoCompactActivityDetails"
	| "developerMode"
	| "nextStepHintsEnabled"
	| "notifyOnRunCompleted";

function GeneralSettingsPage({
	clientPreferences,
	generalSettings,
	onClientPreferencesChange,
	onGeneralSettingsChange,
}: GeneralSettingsPageProps): React.JSX.Element | null {
	const { t } = useTranslation();
	const languageOptions: SelectProps<LanguagePreference>["options"] = [
		{
			label: t("settings.general.display.language.system"),
			value: "system",
		},
		{
			label: t("settings.general.display.language.english"),
			value: "en-US",
		},
		{
			label: t("settings.general.display.language.chinese"),
			value: "zh-CN",
		},
	];
	const [draftClientPreferences, setDraftClientPreferences] =
		useState<ClientPreferences>(clientPreferences);
	const [draftGeneralSettings, setDraftGeneralSettings] =
		useState<GeneralSettings>(generalSettings);
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
				const [loadedClientPreferences, loadedGeneralSettings] =
					await Promise.all([
						fetchClientPreferences(),
						fetchGeneralSettings(),
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
					setErrorMessage(
						error instanceof Error
							? error.message
							: t("settings.general.errors.load"),
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
	}, [onClientPreferencesChange, onGeneralSettingsChange, t]);

	async function handleNextStepHintsEnabledChange(
		checked: boolean,
	): Promise<void> {
		const previousSettings: GeneralSettings = draftGeneralSettings;
		const optimisticSettings: GeneralSettings = {
			...previousSettings,
			nextStepHintsEnabled: checked,
		};

		try {
			setSavingKey("nextStepHintsEnabled");
			setErrorMessage(null);
			setDraftGeneralSettings(optimisticSettings);
			onGeneralSettingsChange(optimisticSettings);
			const savedSettings: GeneralSettings = await updateGeneralSettings({
				nextStepHintsEnabled: checked,
			});
			setDraftGeneralSettings(savedSettings);
			onGeneralSettingsChange(savedSettings);
		} catch (error: unknown) {
			setDraftGeneralSettings(previousSettings);
			onGeneralSettingsChange(previousSettings);
			setErrorMessage(
				error instanceof Error
					? error.message
					: t("settings.general.errors.save"),
			);
		} finally {
			setSavingKey(null);
		}
	}

	async function handleAutoCompactActivityDetailsChange(
		checked: boolean,
	): Promise<void> {
		const previousSettings: GeneralSettings = draftGeneralSettings;
		const optimisticSettings: GeneralSettings = {
			...previousSettings,
			autoCompactActivityDetails: checked,
		};

		try {
			setSavingKey("autoCompactActivityDetails");
			setErrorMessage(null);
			setDraftGeneralSettings(optimisticSettings);
			onGeneralSettingsChange(optimisticSettings);
			const savedSettings: GeneralSettings = await updateGeneralSettings({
				autoCompactActivityDetails: checked,
			});
			setDraftGeneralSettings(savedSettings);
			onGeneralSettingsChange(savedSettings);
		} catch (error: unknown) {
			setDraftGeneralSettings(previousSettings);
			onGeneralSettingsChange(previousSettings);
			setErrorMessage(
				error instanceof Error
					? error.message
					: t("settings.general.errors.save"),
			);
		} finally {
			setSavingKey(null);
		}
	}

	async function handleDeveloperModeChange(checked: boolean): Promise<void> {
		const previousSettings: GeneralSettings = draftGeneralSettings;
		const optimisticSettings: GeneralSettings = { ...previousSettings, developerMode: checked };
		try {
			setSavingKey("developerMode");
			setErrorMessage(null);
			setDraftGeneralSettings(optimisticSettings);
			onGeneralSettingsChange(optimisticSettings);
			const savedSettings: GeneralSettings = await updateGeneralSettings({ developerMode: checked });
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

	async function handleMinimizeToTrayChange(checked: boolean): Promise<void> {
		await updateClientPreferenceSwitch("minimizeToTrayOnClose", checked);
	}

	async function handleAutoCheckForUpdatesChange(
		checked: boolean,
	): Promise<void> {
		await updateClientPreferenceSwitch("autoCheckForUpdates", checked);
	}

	async function handleRunCompletionNotificationsChange(
		checked: boolean,
	): Promise<void> {
		await updateClientPreferenceSwitch("notifyOnRunCompleted", checked);
	}

	async function updateClientPreferenceSwitch(
		key:
			| "autoCheckForUpdates"
			| "minimizeToTrayOnClose"
			| "notifyOnRunCompleted",
		checked: boolean,
	): Promise<void> {
		const previousPreferences: ClientPreferences = draftClientPreferences;
		const optimisticPreferences: ClientPreferences = {
			...previousPreferences,
			[key]: checked,
		};

		try {
			setSavingKey(key);
			setErrorMessage(null);
			setDraftClientPreferences(optimisticPreferences);
			onClientPreferencesChange(optimisticPreferences);
			const savedPreferences: ClientPreferences =
				await updateClientPreferences({ [key]: checked });
			setDraftClientPreferences(savedPreferences);
			onClientPreferencesChange(savedPreferences);
		} catch (error: unknown) {
			setDraftClientPreferences(previousPreferences);
			onClientPreferencesChange(previousPreferences);
			setErrorMessage(
				error instanceof Error
					? error.message
					: t("settings.general.errors.save"),
			);
		} finally {
			setSavingKey(null);
		}
	}

	async function handleLanguageChange(
		languagePreference: LanguagePreference,
	): Promise<void> {
		const previousPreferences: ClientPreferences = draftClientPreferences;
		const optimisticPreferences: ClientPreferences = {
			...previousPreferences,
			language: languagePreference,
		};

		try {
			setSavingKey("language");
			setErrorMessage(null);
			setDraftClientPreferences(optimisticPreferences);
			onClientPreferencesChange(optimisticPreferences);
			const savedPreferences: ClientPreferences =
				await updateClientPreferences({ language: languagePreference });
			setDraftClientPreferences(savedPreferences);
			onClientPreferencesChange(savedPreferences);
		} catch (error: unknown) {
			setDraftClientPreferences(previousPreferences);
			onClientPreferencesChange(previousPreferences);
			setErrorMessage(
				error instanceof Error
					? error.message
					: t("settings.general.errors.save"),
			);
		} finally {
			setSavingKey(null);
		}
	}

	if (isLoading) {
		return null;
	}

	return (
		<section className={`${styles.page} ${pageMotionStyles.enter}`}>
			<header className={styles.header}>
				<div className={styles.titleRow}>
					<Typography.Title level={3} className={styles.title}>
						{t("settings.general.title")}
					</Typography.Title>
				</div>
			</header>

			<div className={styles.settingsStack}>
				<SettingsList title={t("settings.general.display.title")}>
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

					<div className={styles.preferenceList}>
						<SettingsItem
							searchKey="item:general.language"
							title={t("settings.general.display.language.title")}
							description={t(
								"settings.general.display.language.description",
							)}
						>
							<Select<LanguagePreference>
								value={draftClientPreferences.language}
								disabled={
									savingKey !== null &&
									savingKey !== "language"
								}
								options={languageOptions}
								placeholder={t(
									"settings.general.display.language.placeholder",
								)}
								onChange={(value: LanguagePreference): void => {
									void handleLanguageChange(value);
								}}
							/>
						</SettingsItem>
					</div>
				</SettingsList>
				<SettingsList title={t("settings.general.notifications.title")}>
					<div className={styles.preferenceList}>
						<SettingsItem
							searchKey="item:general.notifyOnRunCompleted"
							title={t(
								"settings.general.notifications.runCompleted.title",
							)}
							description={t(
								"settings.general.notifications.runCompleted.description",
							)}
						>
							<Switch
								checked={
									draftClientPreferences.notifyOnRunCompleted
								}
								loading={savingKey === "notifyOnRunCompleted"}
								disabled={
									savingKey !== null &&
									savingKey !== "notifyOnRunCompleted"
								}
								onChange={(checked: boolean): void => {
									void handleRunCompletionNotificationsChange(
										checked,
									);
								}}
							/>
						</SettingsItem>
					</div>
				</SettingsList>

				<SettingsList title={t("settings.general.general.title")}>
					<div className={styles.preferenceList}>
						{[
							{
								key: "developerMode" as const,
								title: t("settings.general.general.developerMode.title"),
								description: t("settings.general.general.developerMode.description"),
								checked: draftGeneralSettings.developerMode,
								onChange: handleDeveloperModeChange,
							},
							{
								key: "autoCompactActivityDetails" as const,
								title: t(
									"settings.general.general.autoCompactActivityDetails.title",
								),
								description: t(
									"settings.general.general.autoCompactActivityDetails.description",
								),
								checked:
									draftGeneralSettings.autoCompactActivityDetails,
								onChange: handleAutoCompactActivityDetailsChange,
							},
							{
								key: "nextStepHintsEnabled" as const,
								title: t(
									"settings.general.general.nextStepHintsEnabled.title",
								),
								description: t(
									"settings.general.general.nextStepHintsEnabled.description",
								),
								checked:
									draftGeneralSettings.nextStepHintsEnabled,
								onChange: handleNextStepHintsEnabledChange,
							},
							{
								key: "autoCheckForUpdates" as const,
								title: t(
									"settings.general.general.autoCheckForUpdates.title",
								),
								description: t(
									"settings.general.general.autoCheckForUpdates.description",
								),
								checked:
									draftClientPreferences.autoCheckForUpdates,
								onChange: handleAutoCheckForUpdatesChange,
							},
							{
								key: "minimizeToTrayOnClose" as const,
								title: t(
									"settings.general.general.minimizeToTrayOnClose.title",
								),
								description: t(
									"settings.general.general.minimizeToTrayOnClose.description",
								),
								checked:
									draftClientPreferences.minimizeToTrayOnClose,
								onChange: handleMinimizeToTrayChange,
							},
						].map(
							(item): React.JSX.Element => (
								<SettingsItem
									key={item.key}
									searchKey={`item:general.${item.key}`}
									title={item.title}
									description={item.description}
								>
									<Switch
										checked={item.checked}
										loading={savingKey === item.key}
										disabled={
											savingKey !== null &&
											savingKey !== item.key
										}
										onChange={(checked: boolean): void => {
											void item.onChange(checked);
										}}
									/>
								</SettingsItem>
							),
						)}
					</div>
				</SettingsList>
			</div>
		</section>
	);
}
export default GeneralSettingsPage;

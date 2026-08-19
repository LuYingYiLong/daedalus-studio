import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import styles from "./GeneralSettingsPage.module.css";
import pageMotionStyles from "./SettingsPageMotion.module.css";
import {
	Alert,
	Button,
	Select,
	Space,
	Switch,
	Tooltip,
	Typography,
} from "antd";
import type { SelectProps } from "antd";
import { Icon } from "@/assets/icons";
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
	| "godotExecutablePath"
	| "language"
	| "minimizeToTrayOnClose"
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

	async function saveGodotExecutablePath(path: string | null): Promise<void> {
		try {
			setSavingKey("godotExecutablePath");
			setErrorMessage(null);
			const savedSettings: GeneralSettings = await updateGeneralSettings({
				godotExecutablePath: path,
			});
			setDraftGeneralSettings(savedSettings);
			onGeneralSettingsChange(savedSettings);
		} catch (error: unknown) {
			setErrorMessage(
				error instanceof Error
					? error.message
					: t("settings.general.errors.godotExecutable"),
			);
		} finally {
			setSavingKey(null);
		}
	}

	async function handleGodotExecutablePick(): Promise<void> {
		try {
			setSavingKey("godotExecutablePath");
			setErrorMessage(null);
			const path: string | null =
				await window.electronAPI.pickGodotExecutable();
			if (path === null) {
				return;
			}
			const savedSettings: GeneralSettings = await updateGeneralSettings({
				godotExecutablePath: path,
			});
			setDraftGeneralSettings(savedSettings);
			onGeneralSettingsChange(savedSettings);
		} catch (error: unknown) {
			setErrorMessage(
				error instanceof Error
					? error.message
					: t("settings.general.errors.godotExecutable"),
			);
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
				<SettingsList title={t("settings.general.godot.title")}>
					<div className={styles.preferenceList}>
						<SettingsItem
							title={t("settings.general.godot.executable")}
							description={
								draftGeneralSettings.godotExecutablePath?.trim() ||
								t("settings.general.godot.placeholder")
							}
						>
							<Space.Compact>
								<Button
									icon={<Icon name="folder-open" />}
									loading={
										savingKey === "godotExecutablePath"
									}
									disabled={
										savingKey !== null &&
										savingKey !== "godotExecutablePath"
									}
									onClick={(): void => {
										void handleGodotExecutablePick();
									}}
								>
									{t("settings.general.godot.browse")}
								</Button>
								<Tooltip
									title={t("settings.general.godot.clear")}
								>
									<Button
										aria-label={t(
											"settings.general.godot.clear",
										)}
										icon={<Icon name="clear" />}
										disabled={
											savingKey !== null ||
											draftGeneralSettings.godotExecutablePath ===
												null
										}
										onClick={(): void => {
											void saveGodotExecutablePath(null);
										}}
									/>
								</Tooltip>
							</Space.Compact>
						</SettingsItem>
					</div>
				</SettingsList>

				<SettingsList title={t("settings.general.notifications.title")}>
					<div className={styles.preferenceList}>
						<SettingsItem
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

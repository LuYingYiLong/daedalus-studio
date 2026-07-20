import { useEffect, useState } from "react";
import styles from "./GeneralSettingsPage.module.css";
import { Alert, Card, List, Segmented, Spin, Switch, Typography } from "antd";
import {
	fetchClientPreferences,
	updateClientPreferences,
	type ClientPreferences
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

type SettingKey = "autoCheckForUpdates" | "autoExpandTodoList" | "minimizeToTrayOnClose" | "theme";
type ThemePreference = ClientPreferences["theme"];

function GeneralSettingsPage({
	clientPreferences,
	generalSettings,
	onClientPreferencesChange,
	onGeneralSettingsChange
}: GeneralSettingsPageProps): React.JSX.Element {
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
					setErrorMessage(error instanceof Error ? error.message : "Failed to load general settings");
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
	}, [onClientPreferencesChange, onGeneralSettingsChange]);

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
			setErrorMessage(error instanceof Error ? error.message : "Failed to save general settings");
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
			setErrorMessage(error instanceof Error ? error.message : "Failed to save general settings");
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
			setErrorMessage(error instanceof Error ? error.message : "Failed to save general settings");
		} finally {
			setSavingKey(null);
		}
	}

	return (
		<section className={styles.page}>
			<header className={styles.header}>
				<div className={styles.titleRow}>
					<Typography.Title level={3} className={styles.title}>
						General
					</Typography.Title>
				</div>
			</header>

			<div className={styles.settingsStack}>
				<Card
					title="Display settings"
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
						<List className={styles.preferenceList}>
							<List.Item
								className={styles.preferenceItem}
								actions={[
									<Segmented
										key="theme"
										className={styles.themeControl}
										value={draftClientPreferences.theme}
										disabled={savingKey !== null && savingKey !== "theme"}
										options={[
											{ label: "System", value: "system" },
											{ label: "Light", value: "light" },
											{ label: "Dark", value: "dark" }
										]}
										onChange={(value: string | number): void => {
											void handleThemeChange(value as ThemePreference);
										}}
									/>
								]}
							>
								<List.Item.Meta
									title={<Typography.Text>Theme</Typography.Text>}
									description="Choose the Studio color theme for this device."
								/>
							</List.Item>
						</List>
					)}
				</Card>

				<Card
					title="General settings"
				>
					{isLoading ? (
						<div className={styles.loading}>
							<Spin />
						</div>
					) : (
						<List
							className={styles.preferenceList}
							dataSource={[
								{
									key: "autoExpandTodoList" as const,
									title: "Auto-expand todo list",
									description: "Expand the workflow todo list when a session creates a new todo list.",
									checked: draftGeneralSettings.autoExpandTodoList,
									onChange: handleAutoExpandTodoListChange
								},
								{
									key: "autoCheckForUpdates" as const,
									title: "Check for updates on startup",
									description: "Check for Daedalus Studio and backend updates when the app starts.",
									checked: draftClientPreferences.autoCheckForUpdates,
									onChange: handleAutoCheckForUpdatesChange
								},
								{
									key: "minimizeToTrayOnClose" as const,
									title: "Minimize to tray on close",
									description: "Hide Daedalus Studio to the system tray when the window close button is clicked.",
									checked: draftClientPreferences.minimizeToTrayOnClose,
									onChange: handleMinimizeToTrayChange
								}
							]}
							renderItem={(item): React.JSX.Element => (
								<List.Item
									className={styles.preferenceItem}
									actions={[
										<Switch
											key={item.key}
											checked={item.checked}
											loading={savingKey === item.key}
											disabled={savingKey !== null && savingKey !== item.key}
											onChange={(checked: boolean): void => {
												void item.onChange(checked);
											}}
										/>
									]}
								>
									<List.Item.Meta
										title={<Typography.Text>{item.title}</Typography.Text>}
										description={item.description}
									/>
								</List.Item>
							)}
						/>
					)}
				</Card>
			</div>
		</section>
	);
}
export default GeneralSettingsPage;

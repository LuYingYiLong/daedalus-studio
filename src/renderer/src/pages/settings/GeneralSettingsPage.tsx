import { useEffect, useState } from "react";
import styles from "./GeneralSettingsPage.module.css";
import { Alert, Button, Card, Input, Segmented, Space, Spin, Switch, Tag, Tooltip, Typography } from "antd";
import { Icon } from "@/assets/icons";
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

type SettingKey = "autoCheckForUpdates" | "autoExpandTodoList" | "godotExecutablePath" | "minimizeToTrayOnClose" | "theme";
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

	async function saveGodotExecutablePath(path: string | null): Promise<void> {
		try {
			setSavingKey("godotExecutablePath");
			setErrorMessage(null);
			const savedSettings: GeneralSettings = await updateGeneralSettings({ godotExecutablePath: path });
			setDraftGeneralSettings(savedSettings);
			onGeneralSettingsChange(savedSettings);
		} catch (error: unknown) {
			setErrorMessage(error instanceof Error ? error.message : "Failed to validate the Godot executable");
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
			setErrorMessage(error instanceof Error ? error.message : "Failed to validate the Godot executable");
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
						<div className={styles.preferenceList}>
							<div className={styles.preferenceItem}>
								<div className={styles.preferenceMeta}>
									<Typography.Text>Theme</Typography.Text>
									<Typography.Text type="secondary">Choose the Studio color theme for this device.</Typography.Text>
								</div>
								<Segmented
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
							</div>
						</div>
					)}
				</Card>

				<Card title="Godot environment">
					{isLoading ? (
						<div className={styles.loading}>
							<Spin />
						</div>
					) : (
						<div className={styles.godotSetting}>
							<div className={styles.preferenceMeta}>
								<div className={styles.godotTitleRow}>
									<Typography.Text>Godot executable</Typography.Text>
									<Tag
										color={draftGeneralSettings.godotExecutableStatus === "ready" ? "success" : undefined}
									>
										{draftGeneralSettings.godotExecutableStatus === "ready"
											? `Godot ${draftGeneralSettings.godotExecutableVersion ?? "ready"}`
											: draftGeneralSettings.godotExecutableStatus === "unavailable"
												? "Unavailable"
												: "Not configured"}
									</Tag>
								</div>
								<Typography.Text type="secondary">
									Used when a workspace does not provide its own Godot executable path.
								</Typography.Text>
							</div>
							<Space.Compact>
								<Input
									readOnly={true}
									value={draftGeneralSettings.godotExecutablePath ?? ""}
									placeholder="Select a Godot executable"
								/>
								<Button
									icon={<Icon name="folder-open" />}
									loading={savingKey === "godotExecutablePath"}
									disabled={savingKey !== null && savingKey !== "godotExecutablePath"}
									onClick={(): void => { void handleGodotExecutablePick(); }}
								>
									Browse
								</Button>
								<Tooltip title="Clear Godot executable">
									<Button
										aria-label="Clear Godot executable"
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
					title="General settings"
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

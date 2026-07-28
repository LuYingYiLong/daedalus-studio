import { Menu, type MenuProps, Typography } from "antd";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { DEFAULT_CLIENT_PREFERENCES, type ClientPreferences } from "@/api/client-preferences-api";
import { DEFAULT_GENERAL_SETTINGS, type GeneralSettings } from "@/api/general-settings-api";
import { Icon } from "@/assets/icons";
import ProviderSettingsPage from "@/pages/settings/ProviderSettingsPage";
import DefaultModelSettingsPage from "@/pages/settings/DefaultModelSettingsPage";
import PersonalizationSettingsPage from "@/pages/settings/PersonalizationSettingsPage";
import ArchivedSessionSettingsPage from "@/pages/settings/ArchivedSessionSettingsPage";
import McpServersSettingsPage from "@/pages/settings/McpServersSettingsPage";
import SkillsSettingsPage from "@/pages/settings/SkillsSettingsPage";
import GeneralSettingsPage from "@/pages/settings/GeneralSettingsPage";
import SearchSettingsPage from "@/pages/settings/SearchSettingsPage";
import StatisticsSettingsPage from "@/pages/settings/StatisticsSettingsPage";
import AboutSettingsPage from "@/pages/settings/AboutSettingsPage";
import GodotProjectsSettingsPage from "@/pages/settings/GodotProjectsSettingsPage";
import styles from "./SettingsWindow.module.css";

type MenuItem = Required<MenuProps>["items"][number];
type SettingsPageKey =
	| "provider"
	| "default_model"
	| "general"
	| "search"
	| "statistics"
	| "personalization"
	| "mcp_servers"
	| "skills"
	| "godot_projects"
	| "archived_sessions"
	| "about";

type SettingsMenuItemConfig = {
	key: SettingsPageKey;
	labelKey: string;
	icon: React.ReactNode;
};

const menuItemConfigs: SettingsMenuItemConfig[] = [
	{ key: "provider", labelKey: "settings.menu.provider", icon: <Icon name="cloud" /> },
	{ key: "default_model", labelKey: "settings.menu.defaultModel", icon: <Icon name="instance" /> },
	{ key: "general", labelKey: "settings.menu.general", icon: <Icon name="equalizer" /> },
	{ key: "search", labelKey: "settings.menu.search", icon: <Icon name="search" /> },
	{ key: "statistics", labelKey: "settings.menu.statistics", icon: <Icon name="statistics" /> },
	{ key: "personalization", labelKey: "settings.menu.personalization", icon: <Icon name="magic" /> },
	{ key: "mcp_servers", labelKey: "settings.menu.mcpServers", icon: <Icon name="mcp" /> },
	{ key: "skills", labelKey: "settings.menu.skills", icon: <Icon name="skill" /> },
	{ key: "godot_projects", labelKey: "settings.menu.godotProjects", icon: <Icon name="godot" /> },
	{ key: "archived_sessions", labelKey: "settings.menu.archivedSessions", icon: <Icon name="archive" /> },
	{ key: "about", labelKey: "settings.menu.about", icon: <Icon name="info" /> }
];

function isSettingsPageKey(value: string): value is SettingsPageKey {
	return menuItemConfigs.some((item: SettingsMenuItemConfig): boolean => item.key === value);
}

function createSettingsMenuItems(t: (key: string) => string): MenuItem[] {
	return menuItemConfigs.map((item: SettingsMenuItemConfig): MenuItem => ({
		key: item.key,
		label: t(item.labelKey),
		icon: item.icon
	}));
}

function getSettingsPageTitle(key: SettingsPageKey, t: (key: string) => string): string {
	const item: SettingsMenuItemConfig | undefined = menuItemConfigs.find((menuItem: SettingsMenuItemConfig): boolean => menuItem.key === key);
	return item === undefined ? t("settings.menu.fallbackTitle") : t(item.labelKey);
}

function getInitialSettingsPage(): SettingsPageKey {
	const page: string | null = new URLSearchParams(window.location.search).get("page");
	return page !== null && isSettingsPageKey(page) ? page : "provider";
}

function SettingsWindow(): React.JSX.Element {
	const { t, i18n } = useTranslation();
	const [activePage, setActivePage] = useState<SettingsPageKey>(getInitialSettingsPage);
	const [clientPreferences, setClientPreferences] = useState<ClientPreferences>(DEFAULT_CLIENT_PREFERENCES);
	const [generalSettings, setGeneralSettings] = useState<GeneralSettings>(DEFAULT_GENERAL_SETTINGS);
	const items: MenuItem[] = createSettingsMenuItems(t);

	useEffect((): (() => void) => {
		return window.electronAPI.windowControl.onSettingsPageRequested((page: string): void => {
			if (isSettingsPageKey(page)) {
				setActivePage(page);
			}
		});
	}, []);

	useEffect((): void => {
		document.title = t("settings.menu.fallbackTitle");
	}, [i18n.resolvedLanguage, t]);

	return (
		<main className={styles.surface}>
			<aside className={styles.settingsSideBar}>
				<Menu
					className={`${styles.settingsMenu} "daedalus-compact-menu daedalus-compact-menu-flush"`}
					inlineIndent={8}
					mode="inline"
					items={items}
					selectedKeys={[activePage]}
					onClick={({ key }): void => {
						if (isSettingsPageKey(key)) {
							setActivePage(key);
						}
					}}
				/>
			</aside>

			<div className={styles.activePage}>
				<header className={styles.activeHeader} />
				{activePage === "provider" ? (
					<ProviderSettingsPage />
				) : activePage === "default_model" ? (
					<DefaultModelSettingsPage />
				) : activePage === "general" ? (
					<GeneralSettingsPage
						clientPreferences={clientPreferences}
						generalSettings={generalSettings}
						onClientPreferencesChange={setClientPreferences}
						onGeneralSettingsChange={setGeneralSettings}
					/>
				) : activePage === "search" ? (
					<SearchSettingsPage />
				) : activePage === "statistics" ? (
					<StatisticsSettingsPage />
				) : activePage === "personalization" ? (
					<PersonalizationSettingsPage />
				) : activePage === "mcp_servers" ? (
					<McpServersSettingsPage />
				) : activePage === "skills" ? (
					<SkillsSettingsPage />
				) : activePage === "godot_projects" ? (
					<GodotProjectsSettingsPage />
				) : activePage === "archived_sessions" ? (
					<ArchivedSessionSettingsPage />
				) : activePage === "about" ? (
					<AboutSettingsPage />
				) : (
					<section className={styles.placeholder}>
						<div className={styles.placeholderHeader}>
							<Icon name="settings" className={styles.placeholderIcon} />
							<div>
								<Typography.Title level={3} className={styles.placeholderTitle}>
									{getSettingsPageTitle(activePage, t)}
								</Typography.Title>
								<Typography.Text type="secondary">
									{t("settings.menu.placeholder")}
								</Typography.Text>
							</div>
						</div>
					</section>
				)}
			</div>
		</main>
	);
}

export default SettingsWindow;

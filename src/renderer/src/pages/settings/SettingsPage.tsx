import { Divider, Menu, MenuProps, Typography } from "antd";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Icon } from "@/assets/icons";
import type { ProviderModelSelection } from "@/api/provider-api";
import ProviderSettingsPage from "./ProviderSettingsPage";
import DefaultModelSettingsPage from "./DefaultModelSettingsPage";
import PersonalizationSettingsPage from "./PersonalizationSettingsPage";
import ArchivedSessionSettingsPage from "./ArchivedSessionSettingsPage";
import styles from "./SettingsPage.module.css";
import McpServersSettingsPage from "./McpServersSettingsPage";
import SkillsSettingsPage from "./SkillsSettingsPage";
import GeneralSettingsPage from "./GeneralSettingsPage";
import SearchSettingsPage from "./SearchSettingsPage";
import type { ClientPreferences } from "@/api/client-preferences-api";
import type { GeneralSettings } from "@/api/general-settings-api";
import AboutSettingsPage from "./AboutSettingsPage";

type MenuItem = Required<MenuProps>["items"][number];
export type SettingsPageKey =
	| "provider"
	| "default_model"
	| "general"
	| "search"
	| "personalization"
	| "mcp_servers"
	| "skills"
	| "archived_sessions"
	| "about";

type SettingsPageProps = {
	initialPage?: SettingsPageKey;
	onProviderModelSelectionChange?: (selection: ProviderModelSelection) => void;
	clientPreferences: ClientPreferences;
	generalSettings: GeneralSettings;
	onClientPreferencesChange: (preferences: ClientPreferences) => void;
	onGeneralSettingsChange: (settings: GeneralSettings) => void;
};

type SettingsMenuItemConfig = {
	key: SettingsPageKey;
	labelKey: string;
	icon: React.ReactNode;
};

const menuItemConfigs: SettingsMenuItemConfig[] = [
	{
		key: "provider",
		labelKey: "settings.menu.provider",
		icon: <Icon name="cloud" />,
	},
	{
		key: "default_model",
		labelKey: "settings.menu.defaultModel",
		icon: <Icon name="instance" />,
	},
	{
		key: "general",
		labelKey: "settings.menu.general",
		icon: <Icon name="equalizer" />,
	},
	{
		key: "search",
		labelKey: "settings.menu.search",
		icon: <Icon name="search" />,
	},
	{
		key: "personalization",
		labelKey: "settings.menu.personalization",
		icon: <Icon name="magic" />,
	},
	{
		key: "mcp_servers",
		labelKey: "settings.menu.mcpServers",
		icon: <Icon name="mcp" />,
	},
	{
		key: "skills",
		labelKey: "settings.menu.skills",
		icon: <Icon name="skill" />,
	},
	{
		key: "archived_sessions",
		labelKey: "settings.menu.archivedSessions",
		icon: <Icon name="archive" />,
	},
	{
		key: "about",
		labelKey: "settings.menu.about",
		icon: <Icon name="info" />,
	}
];

function createSettingsMenuItems(t: (key: string) => string): MenuItem[] {
	return menuItemConfigs.map((item: SettingsMenuItemConfig): MenuItem => ({
		key: item.key,
		label: t(item.labelKey),
		icon: item.icon
	}));
}

function getSettingsPageTitle(key: SettingsPageKey, t: (key: string) => string): string {
	const item = menuItemConfigs.find((menuItem: SettingsMenuItemConfig): boolean => menuItem.key === key);
	return item === undefined ? t("settings.menu.fallbackTitle") : t(item.labelKey);
}

function SettingsPage({
	initialPage = "provider",
	onProviderModelSelectionChange,
	clientPreferences,
	generalSettings,
	onClientPreferencesChange,
	onGeneralSettingsChange
}: SettingsPageProps): React.JSX.Element {
	const { t } = useTranslation();
	const [activePage, setActivePage] = useState<SettingsPageKey>(initialPage);
	const items: MenuItem[] = createSettingsMenuItems(t);

	useEffect((): void => {
		setActivePage(initialPage);
	}, [initialPage]);

	return (
		<section className={styles.page}>
			<aside className={styles.settingsSideBar}>
				<Menu
					className="daedalus-compact-menu daedalus-compact-menu-flush"
					inlineIndent={8}
					mode="inline"
					items={items}
					selectedKeys={[activePage]}
					onClick={({ key }): void => setActivePage(key as SettingsPageKey)}
				/>
			</aside>

			<Divider vertical size="small" className={styles.divider} />

			<div className={styles.activePage}>
				{activePage === "provider" ? (
					<ProviderSettingsPage onSelectionChange={onProviderModelSelectionChange} />
				) : activePage === "default_model" ? (
					<DefaultModelSettingsPage onSelectionChange={onProviderModelSelectionChange} />
				) : activePage === "general" ? (
					<GeneralSettingsPage
						clientPreferences={clientPreferences}
						generalSettings={generalSettings}
						onClientPreferencesChange={onClientPreferencesChange}
						onGeneralSettingsChange={onGeneralSettingsChange}
					/>
				) : activePage === "search" ? (
					<SearchSettingsPage />
				) : activePage === "personalization" ? (
					<PersonalizationSettingsPage />
				) : activePage === "mcp_servers" ? (
					<McpServersSettingsPage />
				) : activePage === "skills" ? (
					<SkillsSettingsPage />
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
		</section>
	);
}

export default SettingsPage;

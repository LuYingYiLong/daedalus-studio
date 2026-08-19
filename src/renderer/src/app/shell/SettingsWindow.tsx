import { Menu, type MenuProps, Typography } from "antd";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
	DEFAULT_CLIENT_PREFERENCES,
	type ClientPreferences,
} from "@/platform/rpc/client-preferences-api";
import {
	DEFAULT_GENERAL_SETTINGS,
	type GeneralSettings,
} from "@/platform/rpc/general-settings-api";
import { Icon } from "@/assets/icons";
import ProviderSettingsPage from "@/widgets/settings/ProviderSettingsPage";
import DefaultModelSettingsPage from "@/widgets/settings/DefaultModelSettingsPage";
import PersonalizationSettingsPage from "@/widgets/settings/PersonalizationSettingsPage";
import ArchivedSessionSettingsPage from "@/widgets/settings/ArchivedSessionSettingsPage";
import ImportSettingsPage from "@/widgets/settings/ImportSettingsPage";
import McpServersSettingsPage from "@/widgets/settings/McpServersSettingsPage";
import SkillsSettingsPage from "@/widgets/settings/SkillsSettingsPage";
import GeneralSettingsPage from "@/widgets/settings/GeneralSettingsPage";
import SearchSettingsPage from "@/widgets/settings/SearchSettingsPage";
import StatisticsSettingsPage from "@/widgets/settings/StatisticsSettingsPage";
import AboutSettingsPage from "@/widgets/settings/AboutSettingsPage";
import GodotProjectsSettingsPage from "@/widgets/settings/GodotProjectsSettingsPage";
import DocumentationSettingsPage from "@/widgets/settings/DocumentationSettingsPage";
import KeyboardShortcutsSettingsPage from "@/widgets/settings/KeyboardShortcutsSettingsPage";
import HooksSettingsPage from "@/widgets/settings/HooksSettingsPage";
import BrowserSettingsPage from "@/widgets/settings/BrowserSettingsPage";
import styles from "./SettingsWindow.module.css";

type MenuItem = Required<MenuProps>["items"][number];
type SettingsPageKey =
	| "provider"
	| "default_model"
	| "general"
	| "keyboard_shortcuts"
	| "search"
	| "statistics"
	| "personalization"
	| "mcp_servers"
	| "skills"
	| "hooks"
	| "browser"
	| "documentation"
	| "godot_projects"
	| "archived_sessions"
	| "import"
	| "about";

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
		key: "keyboard_shortcuts",
		labelKey: "settings.menu.keyboardShortcuts",
		icon: <Icon name="keyboard" />,
	},
	{
		key: "search",
		labelKey: "settings.menu.search",
		icon: <Icon name="search" />,
	},
	{
		key: "statistics",
		labelKey: "settings.menu.statistics",
		icon: <Icon name="statistics" />,
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
		key: "hooks",
		labelKey: "settings.menu.hooks",
		icon: <Icon name="hook" />,
	},
	{
		key: "browser",
		labelKey: "settings.menu.browser",
		icon: <Icon name="global" />,
	},
	{
		key: "documentation",
		labelKey: "settings.menu.documentation",
		icon: <Icon name="book" />,
	},
	{
		key: "godot_projects",
		labelKey: "settings.menu.godotProjects",
		icon: <Icon name="godot" />,
	},
	{
		key: "archived_sessions",
		labelKey: "settings.menu.archivedSessions",
		icon: <Icon name="archive" />,
	},
	{
		key: "import",
		labelKey: "settings.menu.import",
		icon: <Icon name="download" />,
	},
	{
		key: "about",
		labelKey: "settings.menu.about",
		icon: <Icon name="info" />,
	},
];

function isSettingsPageKey(value: string): value is SettingsPageKey {
	return menuItemConfigs.some(
		(item: SettingsMenuItemConfig): boolean => item.key === value,
	);
}

function createSettingsMenuItems(t: (key: string) => string): MenuItem[] {
	return menuItemConfigs.map(
		(item: SettingsMenuItemConfig): MenuItem => ({
			key: item.key,
			label: t(item.labelKey),
			icon: item.icon,
		}),
	);
}

function getSettingsPageTitle(
	key: SettingsPageKey,
	t: (key: string) => string,
): string {
	const item: SettingsMenuItemConfig | undefined = menuItemConfigs.find(
		(menuItem: SettingsMenuItemConfig): boolean => menuItem.key === key,
	);
	return item === undefined
		? t("settings.menu.fallbackTitle")
		: t(item.labelKey);
}

function getInitialSettingsPage(): SettingsPageKey {
	const page: string | null = new URLSearchParams(window.location.search).get(
		"page",
	);
	return page !== null && isSettingsPageKey(page) ? page : "provider";
}

function SettingsWindow(): React.JSX.Element {
	const { t, i18n } = useTranslation();
	const [activePage, setActivePage] = useState<SettingsPageKey>(() =>
		getInitialSettingsPage(),
	);
	const [visitedPages, setVisitedPages] = useState<Set<SettingsPageKey>>(
		() => new Set([getInitialSettingsPage()]),
	);
	const [clientPreferences, setClientPreferences] =
		useState<ClientPreferences>(DEFAULT_CLIENT_PREFERENCES);
	const [generalSettings, setGeneralSettings] = useState<GeneralSettings>(
		DEFAULT_GENERAL_SETTINGS,
	);
	const items: MenuItem[] = createSettingsMenuItems(t);

	function selectSettingsPage(page: SettingsPageKey): void {
		setActivePage(page);
		setVisitedPages(
			(currentPages: Set<SettingsPageKey>): Set<SettingsPageKey> => {
				if (currentPages.has(page)) {
					return currentPages;
				}

				const nextPages: Set<SettingsPageKey> = new Set(currentPages);
				nextPages.add(page);
				return nextPages;
			},
		);
	}

	function renderSettingsPage(page: SettingsPageKey): React.JSX.Element {
		if (page === "provider") {
			return <ProviderSettingsPage />;
		}
		if (page === "default_model") {
			return <DefaultModelSettingsPage />;
		}
		if (page === "general") {
			return (
				<GeneralSettingsPage
					clientPreferences={clientPreferences}
					generalSettings={generalSettings}
					onClientPreferencesChange={setClientPreferences}
					onGeneralSettingsChange={setGeneralSettings}
				/>
			);
		}
		if (page === "keyboard_shortcuts") {
			return (
				<KeyboardShortcutsSettingsPage
					clientPreferences={clientPreferences}
					onClientPreferencesChange={setClientPreferences}
				/>
			);
		}
		if (page === "search") {
			return <SearchSettingsPage />;
		}
		if (page === "statistics") {
			return <StatisticsSettingsPage />;
		}
		if (page === "personalization") {
			return <PersonalizationSettingsPage />;
		}
		if (page === "mcp_servers") {
			return <McpServersSettingsPage />;
		}
		if (page === "skills") {
			return <SkillsSettingsPage />;
		}
		if (page === "hooks") {
			return <HooksSettingsPage />;
		}
		if (page === "browser") {
			return <BrowserSettingsPage />;
		}
		if (page === "documentation") {
			return <DocumentationSettingsPage />;
		}
		if (page === "godot_projects") {
			return <GodotProjectsSettingsPage />;
		}
		if (page === "archived_sessions") {
			return <ArchivedSessionSettingsPage />;
		}
		if (page === "import") {
			return <ImportSettingsPage />;
		}
		if (page === "about") {
			return <AboutSettingsPage />;
		}

		return (
			<section className={styles.placeholder}>
				<div className={styles.placeholderHeader}>
					<Icon name="settings" className={styles.placeholderIcon} />
					<div>
						<Typography.Title
							level={3}
							className={styles.placeholderTitle}
						>
							{getSettingsPageTitle(page, t)}
						</Typography.Title>
						<Typography.Text type="secondary">
							{t("settings.menu.placeholder")}
						</Typography.Text>
					</div>
				</div>
			</section>
		);
	}

	useEffect((): (() => void) => {
		return window.electronAPI.windowControl.onSettingsPageRequested(
			(page: string): void => {
				if (isSettingsPageKey(page)) {
					selectSettingsPage(page);
				}
			},
		);
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
							selectSettingsPage(key);
						}
					}}
				/>
			</aside>

			<div className={styles.activePage}>
				<header className={styles.activeHeader} />
				<div className={styles.pageViewport}>
					{menuItemConfigs
						.filter((item: SettingsMenuItemConfig): boolean =>
							visitedPages.has(item.key),
						)
						.map(
							(
								item: SettingsMenuItemConfig,
							): React.JSX.Element => {
								const isActive: boolean =
									item.key === activePage;
								return (
									<div
										key={item.key}
										className={`${styles.pageView} ${isActive ? styles.pageViewActive : ""}`}
										aria-hidden={!isActive}
									>
										{renderSettingsPage(item.key)}
									</div>
								);
							},
						)}
				</div>
			</div>
		</main>
	);
}

export default SettingsWindow;

import { AutoComplete, Menu, type MenuProps, Typography } from "antd";
import { useEffect, useMemo, useRef, useState } from "react";
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
import AppearanceSettingsPage from "@/widgets/settings/AppearanceSettingsPage";
import SearchSettingsPage from "@/widgets/settings/SearchSettingsPage";
import StatisticsSettingsPage from "@/widgets/settings/StatisticsSettingsPage";
import AboutSettingsPage from "@/widgets/settings/AboutSettingsPage";
import GodotProjectsSettingsPage from "@/widgets/settings/GodotProjectsSettingsPage";
import DocumentationSettingsPage from "@/widgets/settings/DocumentationSettingsPage";
import KeyboardShortcutsSettingsPage from "@/widgets/settings/KeyboardShortcutsSettingsPage";
import HooksSettingsPage from "@/widgets/settings/HooksSettingsPage";
import BrowserSettingsPage from "@/widgets/settings/BrowserSettingsPage";
import DevelopmentEnvironmentSettingsPage from "@/widgets/settings/DevelopmentEnvironmentSettingsPage";
import WorktreeSettingsPage from "@/widgets/settings/WorktreeSettingsPage";
import PluginsSettingsPage from "@/widgets/settings/PluginsSettingsPage";
import {
	SETTINGS_SEARCH_ENTRIES,
	type SettingsPageKey,
	type SettingsSearchEntry,
} from "@/widgets/settings/settings-search-catalog";
import styles from "./SettingsWindow.module.css";

type MenuItem = Required<MenuProps>["items"][number];
type SettingsMenuItemConfig = {
	key: SettingsPageKey;
	labelKey: string;
	icon: React.ReactNode;
};

type SettingsMenuGroupConfig = {
	key: string;
	labelKey: string;
	items: readonly SettingsPageKey[];
};

type SettingsSearchOption = {
	value: string;
	page: SettingsPageKey;
	searchKey?: string;
	searchText: string;
	label: React.ReactNode;
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
		key: "appearance",
		labelKey: "settings.menu.appearance",
		icon: <Icon name="appearance" />,
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
		key: "plugins",
		labelKey: "settings.menu.plugins",
		icon: <Icon name="plugin" />,
	},
	{
		key: "browser",
		labelKey: "settings.menu.browser",
		icon: <Icon name="global" />,
	},
	{
		key: "environments",
		labelKey: "settings.menu.environments",
		icon: <Icon name="environment" />,
	},
	{
		key: "worktrees",
		labelKey: "settings.menu.worktrees",
		icon: <Icon name="worktree" />,
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

const menuGroupConfigs: SettingsMenuGroupConfig[] = [
	{
		key: "models",
		labelKey: "settings.menu.groups.models",
		items: ["provider", "default_model"],
	},
	{
		key: "studio",
		labelKey: "settings.menu.groups.studio",
		items: [
			"general",
			"appearance",
			"keyboard_shortcuts",
			"search",
			"statistics",
			"personalization",
		],
	},
	{
		key: "extensions",
		labelKey: "settings.menu.groups.extensions",
		items: ["mcp_servers", "skills", "hooks", "plugins"],
	},
	{
		key: "workspace",
		labelKey: "settings.menu.groups.workspace",
		items: ["browser", "environments", "worktrees", "godot_projects"],
	},
	{
		key: "resources",
		labelKey: "settings.menu.groups.resources",
		items: ["documentation", "archived_sessions", "import", "about"],
	},
];

function isSettingsPageKey(value: string): value is SettingsPageKey {
	return menuItemConfigs.some(
		(item: SettingsMenuItemConfig): boolean => item.key === value,
	);
}

function createSettingsMenuItems(t: (key: string) => string): MenuItem[] {
	const itemsByKey: Map<SettingsPageKey, SettingsMenuItemConfig> = new Map(
		menuItemConfigs.map(
			(
				item: SettingsMenuItemConfig,
			): [SettingsPageKey, SettingsMenuItemConfig] => [item.key, item],
		),
	);

	return menuGroupConfigs.map(
		(group: SettingsMenuGroupConfig): MenuItem => ({
			type: "group",
			key: `group:${group.key}`,
			label: t(group.labelKey),
			children: group.items.flatMap(
				(key: SettingsPageKey): MenuItem[] => {
					const item: SettingsMenuItemConfig | undefined =
						itemsByKey.get(key);
					return item === undefined
						? []
						: [
								{
									key: item.key,
									label: t(item.labelKey),
									icon: item.icon,
								},
							];
				},
			),
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

function normalizeSearchText(value: string): string {
	return value.trim().toLocaleLowerCase();
}

function createSettingsSearchOptions(
	t: (key: string) => string,
	query: string,
): SettingsSearchOption[] {
	const normalizedQuery: string = normalizeSearchText(query);
	return SETTINGS_SEARCH_ENTRIES.flatMap(
		(entry: SettingsSearchEntry): SettingsSearchOption[] => {
			const pageTitle: string = getSettingsPageTitle(entry.page, t);
			const title: string = t(entry.titleKey);
			const description: string =
				entry.descriptionKey === undefined
					? ""
					: t(entry.descriptionKey);
			const searchText: string = normalizeSearchText(
				[pageTitle, title, description].join(" "),
			);
			if (
				normalizedQuery.length > 0 &&
				!searchText.includes(normalizedQuery)
			) {
				return [];
			}
			return [
				{
					value: entry.key,
					page: entry.page,
					searchKey: entry.key.startsWith("item:")
						? entry.key
						: undefined,
					searchText,
					label: (
						<div className={styles.settingsSearchOption}>
							<Typography.Text>{title}</Typography.Text>
							<Typography.Text type="secondary">
								{pageTitle}
							</Typography.Text>
						</div>
					),
				},
			];
		},
	);
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
	const [settingsSearchQuery, setSettingsSearchQuery] = useState<string>("");
	const settingsSearchScrollTimer = useRef<number | null>(null);
	const items: MenuItem[] = createSettingsMenuItems(t);
	const settingsSearchOptions: SettingsSearchOption[] = useMemo(
		(): SettingsSearchOption[] =>
			createSettingsSearchOptions(t, settingsSearchQuery),
		[settingsSearchQuery, t],
	);

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

	function scrollToSettingsItem(searchKey: string): void {
		if (settingsSearchScrollTimer.current !== null) {
			window.clearTimeout(settingsSearchScrollTimer.current);
			settingsSearchScrollTimer.current = null;
		}

		const deadline: number = Date.now() + 5000;
		const attemptScroll: () => void = (): void => {
			const activePage: Element | null = document.querySelector(
				`.${styles.pageViewActive}`,
			);
			const target: HTMLElement | undefined =
				activePage === null
					? undefined
					: Array.from(
							activePage.querySelectorAll<HTMLElement>(
								"[data-settings-search-key]",
							),
						).find(
							(element: HTMLElement): boolean =>
								element.dataset.settingsSearchKey === searchKey,
						);
			if (target !== undefined) {
				target.scrollIntoView({ behavior: "smooth", block: "center" });
				settingsSearchScrollTimer.current = null;
				return;
			}
			if (Date.now() >= deadline) {
				settingsSearchScrollTimer.current = null;
				return;
			}
			settingsSearchScrollTimer.current = window.setTimeout(
				attemptScroll,
				100,
			);
		};

		attemptScroll();
	}

	function handleSettingsSearchSelect(value: string): void {
		const option: SettingsSearchOption | undefined =
			settingsSearchOptions.find(
				(candidate: SettingsSearchOption): boolean =>
					candidate.value === value,
			);
		if (option === undefined) {
			return;
		}
		selectSettingsPage(option.page);
		setSettingsSearchQuery("");
		if (option.searchKey !== undefined) {
			scrollToSettingsItem(option.searchKey);
		}
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
		if (page === "appearance") {
			return (
				<AppearanceSettingsPage
					clientPreferences={clientPreferences}
					onClientPreferencesChange={setClientPreferences}
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
		if (page === "plugins") {
			return <PluginsSettingsPage />;
		}
		if (page === "browser") {
			return <BrowserSettingsPage />;
		}
		if (page === "environments") {
			return <DevelopmentEnvironmentSettingsPage />;
		}
		if (page === "worktrees") {
			return <WorktreeSettingsPage />;
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

	useEffect((): (() => void) => {
		return (): void => {
			if (settingsSearchScrollTimer.current !== null) {
				window.clearTimeout(settingsSearchScrollTimer.current);
			}
		};
	}, []);

	useEffect((): void => {
		document.title = t("settings.menu.fallbackTitle");
	}, [i18n.resolvedLanguage, t]);

	return (
		<main className={styles.surface} data-studio-settings-window="true">
			<aside className={styles.settingsSideBar}>
				<div className={styles.settingsSearchBar}>
					<AutoComplete
						prefix={<Icon name="search" />}
						className={styles.settingsSearch}
						value={settingsSearchQuery}
						options={settingsSearchOptions}
						showSearch={false}
						allowClear={true}
						placeholder={t("settings.menu.searchPlaceholder")}
						onChange={(value: string): void =>
							setSettingsSearchQuery(value)
						}
						onSelect={(value: string): void =>
							handleSettingsSearchSelect(value)
						}
					/>
				</div>
				<div className={styles.settingsMenuScroller}>
					<Menu
						className={styles.settingsMenu}
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
				</div>
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

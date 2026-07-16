import { Menu, MenuProps, Typography } from "antd";
import { useState } from "react";
import { Icon } from "@/assets/icons";
import type { ProviderModelSelection } from "@/api/provider-api";
import ProviderSettingsPage from "./ProviderSettingsPage";
import DefaultModelSettingsPage from "./DefaultModelSettingsPage";
import PersonalizationSettingsPage from "./PersonalizationSettingsPage";
import ArchivedSessionSettingsPage from "./ArchivedSessionSettingsPage";
import styles from "./SettingsPage.module.css";
import McpServersSettingsPage from "./MCPServersSettingsPage";

type MenuItem = Required<MenuProps>["items"][number];
type SettingsPageKey = 
	| "provider"
	| "default_model"
	| "general"
	| "personalization"
	| "mcp_servers" 
	| "skills"
	| "archived_sessions";

type SettingsPageProps = {
	onProviderModelSelectionChange?: (selection: ProviderModelSelection) => void;
};

const items: MenuItem[] = [
	{
		key: "provider",
		label: "Provider",
		icon: <Icon name="cloud" />,
	},
	{
		key: "default_model",
		label: "Default model",
		icon: <Icon name="instance" />,
	},
	{
		key: "general",
		label: "General",
		icon: <Icon name="equalizer" />,
	},
	{
		key: "personalization",
		label: "Personalization",
		icon: <Icon name="magic" />,
	},
	{
		key: "mcp_servers",
		label: "MCP Servers",
		icon: <Icon name="mcp" />,
	},
	{
		key: "skills",
		label: "Skills",
		icon: <Icon name="skill" />,
	},
	{
		key: "archived_sessions",
		label: "Archived sessions",
		icon: <Icon name="archive" />,
	}
]

function getSettingsPageTitle(key: SettingsPageKey): string {
	const item = items.find((menuItem: MenuItem): boolean => {
		return menuItem !== null && "key" in menuItem && menuItem.key === key;
	});

	return typeof item === "object" && item !== null && "label" in item && typeof item.label === "string"
		? item.label
		: "Settings";
}

function SettingsPage({ onProviderModelSelectionChange }: SettingsPageProps): React.JSX.Element {
	const [activePage, setActivePage] = useState<SettingsPageKey>("provider");

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
			{activePage === "provider" ? (
				<ProviderSettingsPage onSelectionChange={onProviderModelSelectionChange} />
			) : activePage === "default_model" ? (
				<DefaultModelSettingsPage onSelectionChange={onProviderModelSelectionChange} />
			) : activePage === "personalization" ? (
				<PersonalizationSettingsPage />
			) : activePage === "mcp_servers" ? (
				<McpServersSettingsPage />
			) : activePage === "archived_sessions" ? (
				<ArchivedSessionSettingsPage />
			) : (
				<section className={styles.placeholder}>
					<div className={styles.placeholderHeader}>
						<Icon name="settings" className={styles.placeholderIcon} />
						<div>
							<Typography.Title level={3} className={styles.placeholderTitle}>
								{getSettingsPageTitle(activePage)}
							</Typography.Title>
							<Typography.Text type="secondary">
								This settings section will be implemented later.
							</Typography.Text>
						</div>
					</div>
				</section>
			)}
		</section>
	);
}

export default SettingsPage;

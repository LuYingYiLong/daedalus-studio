import { Icon } from "@/assets/icons";
import { Tabs, Tooltip, type TabsProps } from "antd";
import styles from "./AppNavTabs.module.css";

export type AppPageKey = "agent" | "settings" | "drawing" | "knowledge";

type AppNavItem = {
	key: AppPageKey;
	label: string;
	icon: string;
};

type AppNavTabsProps = {
	activePage: AppPageKey;
	onPageChange: (page: AppPageKey) => void;
};

export const appNavItems: AppNavItem[] = [
	{
		key: "agent",
		label: "Agent",
		icon: "agent"
	},
	{
		key: "settings",
		label: "Settings",
		icon: "settings"
	},
	{
		key: "drawing",
		label: "Draw",
		icon: "draw"
	},
	{
		key: "knowledge",
		label: "Knowledge",
		icon: "book"
	}
];

export function isAppPageKey(key: string): key is AppPageKey {
	return appNavItems.some((item: AppNavItem): boolean => item.key === key);
}

function createTabItems(): TabsProps["items"] {
	return appNavItems.map((item: AppNavItem): NonNullable<TabsProps["items"]>[number] => {
		return {
			key: item.key,
			icon: (
				<Tooltip title={item.label} placement="right">
					<span className={styles.tabIconButton} aria-label={item.label}>
						<Icon name={item.icon} className={styles.tabIcon} />
					</span>
				</Tooltip>
			),
			label: ""
		};
	});
}

function AppNavTabs({ activePage, onPageChange }: AppNavTabsProps): React.JSX.Element {
	return (
		<nav className={styles.nav} aria-label="Application navigation">
			<Tabs
				activeKey={activePage}
				className={styles.tabs}
				items={createTabItems()}
				tabPlacement="start"
				onChange={(key: string): void => {
					if (isAppPageKey(key)) {
						onPageChange(key);
					}
				}}
			/>
		</nav>
	);
}

export default AppNavTabs;

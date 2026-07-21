import { Icon } from "@/assets/icons";
import { Tooltip } from "antd";
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
		icon: "chat"
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

function AppNavTabs({ activePage, onPageChange }: AppNavTabsProps): React.JSX.Element {
	return (
		<nav className={styles.nav} aria-label="Application navigation">
			<div className={styles.navList} role="list">
				{appNavItems.map((item: AppNavItem): React.JSX.Element => (
					<Tooltip key={item.key} title={item.label} placement="right">
						<button
							type="button"
							className={styles.navButton}
							data-active={activePage === item.key ? "true" : "false"}
							aria-label={item.label}
							aria-current={activePage === item.key ? "page" : undefined}
							onClick={(): void => onPageChange(item.key)}
						>
							<Icon name={item.icon} className={styles.navIcon} />
						</button>
					</Tooltip>
				))}
			</div>
		</nav>
	);
}

export default AppNavTabs;

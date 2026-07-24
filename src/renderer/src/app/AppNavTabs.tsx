import { Icon } from "@/assets/icons";
import { Tooltip } from "antd";
import { useTranslation } from "react-i18next";
import styles from "./AppNavTabs.module.css";

export type AppPageKey = "agent" | "settings" | "drawing" | "knowledge";

type AppNavItem = {
	key: AppPageKey;
	labelKey: string;
	icon: string;
};

type AppNavTabsProps = {
	activePage: AppPageKey;
	onPageChange: (page: AppPageKey) => void;
};

export const appNavItems: AppNavItem[] = [
	{
		key: "agent",
		labelKey: "app.navigation.agent",
		icon: "chat"
	},
	{
		key: "settings",
		labelKey: "app.navigation.settings",
		icon: "settings"
	},
	{
		key: "drawing",
		labelKey: "app.navigation.drawing",
		icon: "draw"
	},
	{
		key: "knowledge",
		labelKey: "app.navigation.knowledge",
		icon: "book"
	}
];

export function isAppPageKey(key: string): key is AppPageKey {
	return appNavItems.some((item: AppNavItem): boolean => item.key === key);
}

function AppNavTabs({ activePage, onPageChange }: AppNavTabsProps): React.JSX.Element {
	const { t } = useTranslation();

	return (
		<nav className={styles.nav} aria-label={t("app.navigation.ariaLabel")}>
			<div className={styles.navList} role="list">
				{appNavItems.map((item: AppNavItem): React.JSX.Element => {
					const label: string = t(item.labelKey);
					return (
						<Tooltip key={item.key} title={label} placement="right">
							<button
								type="button"
								className={styles.navButton}
								data-active={activePage === item.key ? "true" : "false"}
								aria-label={label}
								aria-current={activePage === item.key ? "page" : undefined}
								onClick={(): void => onPageChange(item.key)}
							>
								<Icon name={item.icon} className={styles.navIcon} />
							</button>
						</Tooltip>
					);
				})}
			</div>
		</nav>
	);
}

export default AppNavTabs;

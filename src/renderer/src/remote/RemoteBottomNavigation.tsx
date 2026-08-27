import { Badge } from "antd";
import { useTranslation } from "react-i18next";
import { Icon } from "@/assets/icons";
import type { RemotePrimaryScreen } from "./remote-model";
import styles from "./RemoteApp.module.css";

type RemoteBottomNavigationProps = {
	activeScreen: RemotePrimaryScreen;
	hasActiveSession: boolean;
	pendingApprovalCount: number;
	onNavigate: (screen: RemotePrimaryScreen) => void;
};

const NAVIGATION_ITEMS: ReadonlyArray<{
	screen: RemotePrimaryScreen;
	icon: "chat" | "agent" | "shield" | "trajectory";
	labelKey: string;
	requiresSession?: true;
}> = [
	{ screen: "sessions", icon: "chat", labelKey: "remote.navigation.sessions" },
	{ screen: "conversation", icon: "agent", labelKey: "remote.navigation.conversation", requiresSession: true },
	{ screen: "approvals", icon: "shield", labelKey: "remote.navigation.approvals" },
	{ screen: "trajectory", icon: "trajectory", labelKey: "remote.navigation.trajectory", requiresSession: true },
];

function RemoteBottomNavigation({
	activeScreen,
	hasActiveSession,
	pendingApprovalCount,
	onNavigate,
}: RemoteBottomNavigationProps): React.JSX.Element {
	const { t } = useTranslation();
	return (
		<nav className={styles.bottomNavigation} aria-label={t("remote.navigation.label")}>
			{NAVIGATION_ITEMS.map((item): React.JSX.Element => {
				const disabled: boolean = item.requiresSession === true && !hasActiveSession;
				const active: boolean = activeScreen === item.screen;
				const icon = <Icon name={item.icon} />;
				return (
					<button
						key={item.screen}
						type="button"
						className={`${styles.navigationItem} ${active ? styles.navigationItemActive : ""}`}
						disabled={disabled}
						aria-current={active ? "page" : undefined}
						onClick={(): void => onNavigate(item.screen)}
					>
						<span className={styles.navigationIcon}>
							{item.screen === "approvals"
								? <Badge count={pendingApprovalCount} size="small" overflowCount={9}>{icon}</Badge>
								: icon}
						</span>
						<span>{t(item.labelKey)}</span>
					</button>
				);
			})}
		</nav>
	);
}

export default RemoteBottomNavigation;

import { Button } from "antd";
import { useTranslation } from "react-i18next";
import { Icon } from "@/assets/icons";
import WorkspaceTree, { type WorkspaceTreeProps } from "@/widgets/workspace/WorkspaceTree";
import styles from "./HomePage.module.css";

export type HomeWorkspaceSidebarProps = {
	treeProps: WorkspaceTreeProps;
	isOpen: boolean;
	onNewSession: () => void;
	onOpenSettings: () => void;
};

function HomeWorkspaceSidebar({
	treeProps,
	isOpen,
	onNewSession,
	onOpenSettings,
}: HomeWorkspaceSidebarProps): React.JSX.Element {
	const { t } = useTranslation();

	return (
		<aside className={styles.workspaceSidebar} aria-hidden={!isOpen}>
			<header className={styles.workspaceHeader}>
				<Button
					type="text"
					block
					icon={<Icon name="add" />}
					className={styles.createSessionButton}
					onClick={onNewSession}
				>
					{t("agentPage.actions.newSession")}
				</Button>
			</header>
			<WorkspaceTree {...treeProps} />
			<footer className={styles.workspaceFooter}>
				<Button
					icon={<Icon name="settings" />}
					type="text"
					block
					className={styles.openSettingsButton}
					aria-label={t("agentPage.actions.openSettings")}
					onClick={onOpenSettings}
				>
					{t("agentPage.actions.openSettings")}
				</Button>
			</footer>
		</aside>
	);
}

export default HomeWorkspaceSidebar;

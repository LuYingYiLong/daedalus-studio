import { Button } from "antd";
import { useTranslation } from "react-i18next";
import { Icon } from "@/assets/icons";
import WorkspaceTree, {
	type WorkspaceTreeProps,
} from "@/widgets/workspace/WorkspaceTree";
import styles from "./HomePage.module.css";

export type HomeWorkspaceSidebarProps = {
	treeProps: WorkspaceTreeProps;
	isOpen: boolean;
	onNewSession: () => void;
	onOpenScheduledTasks: () => void;
	scheduledTasksActive: boolean;
	scheduledTaskAttentionCount: number;
	onOpenSettings: () => void;
};

function HomeWorkspaceSidebar({
	treeProps,
	isOpen,
	onNewSession,
	onOpenScheduledTasks,
	scheduledTasksActive,
	scheduledTaskAttentionCount,
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
				<Button
					type="text"
					block
					icon={<Icon name="scheduled-task" />}
					className={styles.createSessionButton}
					onClick={onOpenScheduledTasks}
				>
					<span className={styles.sidebarActionLabel}>
						{t("scheduledTasks.title")}
					</span>
					{scheduledTaskAttentionCount > 0 ? (
						<span className={styles.sidebarAttentionBadge}>
							{scheduledTaskAttentionCount}
						</span>
					) : null}
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

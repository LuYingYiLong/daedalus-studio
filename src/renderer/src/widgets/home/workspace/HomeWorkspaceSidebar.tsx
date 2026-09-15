import { Button, Segmented } from "antd";
import { useTranslation } from "react-i18next";
import { Icon } from "@/assets/icons";
import WorkspaceTree, { type WorkspaceTreeProps } from "@/widgets/workspace/WorkspaceTree";
import FlowTree, { type FlowTreeProps } from "@/widgets/flow/FlowTree";
import type { HomePrimarySurface } from "@/features/home/surface/useHomeSurfaceController";
import styles from "../HomePage.module.css";

export type HomeWorkspaceSidebarProps = {
	treeProps: WorkspaceTreeProps;
	flowTreeProps: FlowTreeProps;
	primarySurface: HomePrimarySurface;
	isOpen: boolean;
	onNewSession: () => void;
	onNewFlow: () => void;
	onPrimarySurfaceChange: (surface: HomePrimarySurface) => void;
	onOpenScheduledTasks: () => void;
	scheduledTasksActive: boolean;
	scheduledTaskAttentionCount: number;
	onOpenSettings: () => void;
};

function HomeWorkspaceSidebar({
	treeProps,
	flowTreeProps,
	primarySurface,
	isOpen,
	onNewSession,
	onNewFlow,
	onPrimarySurfaceChange,
	onOpenScheduledTasks,
	scheduledTasksActive,
	scheduledTaskAttentionCount,
	onOpenSettings,
}: HomeWorkspaceSidebarProps): React.JSX.Element {
	const { t } = useTranslation();

	return (
		<aside className={styles.workspaceSidebar} aria-hidden={!isOpen}>
			<header className={styles.workspaceHeader}>
				<Segmented<HomePrimarySurface>
					options={[
						{ label: t("flow.surfaces.chat"), value: "chat" },
						{ label: t("flow.surfaces.flow"), value: "flow" },
					]}
					block
					value={primarySurface}
					onChange={onPrimarySurfaceChange}
				/>
				<Button
					type="text"
					block
					icon={<Icon name="add" />}
					data-studio-new-session={primarySurface === "chat" ? "true" : undefined}
					data-studio-new-flow={primarySurface === "flow" ? "true" : undefined}
					className={styles.createSessionButton}
					onClick={primarySurface === "chat" ? onNewSession : onNewFlow}
				>
					{t(primarySurface === "chat" ? "agentPage.actions.newSession" : "flow.actions.new")}
				</Button>
				<Button
					type="text"
					block
					icon={<Icon name="scheduled-task" />}
					className={styles.createSessionButton}
					onClick={
						scheduledTasksActive ? (): void => onPrimarySurfaceChange(primarySurface) : onOpenScheduledTasks
					}
				>
					<span className={styles.sidebarActionLabel}>{t("scheduledTasks.title")}</span>
					{scheduledTaskAttentionCount > 0 ? (
						<span className={styles.sidebarAttentionBadge}>{scheduledTaskAttentionCount}</span>
					) : null}
				</Button>
			</header>
			{primarySurface === "chat" ? <WorkspaceTree {...treeProps} /> : <FlowTree {...flowTreeProps} />}
			<footer className={styles.workspaceFooter}>
				<Button
					icon={<Icon name="settings" />}
					type="text"
					block
					className={styles.openSettingsButton}
					aria-label={t("agentPage.actions.openSettings")}
					data-studio-open-settings="true"
					onClick={onOpenSettings}
				>
					{t("agentPage.actions.openSettings")}
				</Button>
			</footer>
		</aside>
	);
}

export default HomeWorkspaceSidebar;

import type { ReactNode } from "react";
import { Button, Dropdown, Space, Tooltip } from "antd";
import type { MenuProps } from "antd";
import { useTranslation } from "react-i18next";
import { Icon } from "@/assets/icons";
import type {
	HomePageLaunchController,
	WorkspaceLaunchTarget,
} from "./useHomePageLaunchController";
import { getWorkspaceLaunchIcon } from "./useHomePageLaunchController";
import styles from "../HomePage.module.css";

export type HomePageActionBarProps = {
	showWorkspaceLaunchControls: boolean;
	isOpeningLaunchTarget: boolean;
	selectedLaunchTarget: WorkspaceLaunchTarget;
	workspaceLaunchMenuItems: MenuProps["items"];
	handleWorkspaceLaunchMenuClick: NonNullable<MenuProps["onClick"]>;
	openWorkspaceLaunchTarget: HomePageLaunchController["openWorkspaceLaunchTarget"];
	showSummaryButton: boolean;
	renderSummaryButton: () => ReactNode;
	showBottomDockButton: boolean;
	bottomDockOpen: boolean;
	toggleBottomDock: () => void;
	showSideDockButton: boolean;
	sideDockOpen: boolean;
	toggleSideDock: () => void;
};

function HomePageActionBar({
	showWorkspaceLaunchControls,
	isOpeningLaunchTarget,
	selectedLaunchTarget,
	workspaceLaunchMenuItems,
	handleWorkspaceLaunchMenuClick,
	openWorkspaceLaunchTarget,
	showSummaryButton,
	renderSummaryButton,
	showBottomDockButton,
	bottomDockOpen,
	toggleBottomDock,
	showSideDockButton,
	sideDockOpen,
	toggleSideDock,
}: HomePageActionBarProps): React.JSX.Element | null {
	const { t } = useTranslation();
	const hasControls =
		showWorkspaceLaunchControls ||
		showSummaryButton ||
		showBottomDockButton ||
		showSideDockButton;
	if (!hasControls) {
		return null;
	}

	return (
		<div className={styles.floatingActions}>
			{showWorkspaceLaunchControls ? (
				<Space.Compact className={styles.workspaceLaunchControls}>
					<Button
						loading={isOpeningLaunchTarget}
						icon={getWorkspaceLaunchIcon(selectedLaunchTarget.id)}
						onClick={(): void => {
							void openWorkspaceLaunchTarget(selectedLaunchTarget.id);
						}}
					>
						{t("agentPage.workspaceLaunch.openIn", {
							target: selectedLaunchTarget.label,
						})}
					</Button>
					<Dropdown
						menu={{
							items: workspaceLaunchMenuItems,
							selectedKeys: [selectedLaunchTarget.id],
							onClick: handleWorkspaceLaunchMenuClick,
						}}
						trigger={["click"]}
					>
						<Button
							aria-label={t(
								"agentPage.workspaceLaunch.aria.selectTarget",
							)}
							icon={<Icon name="arrow-down" />}
						/>
					</Dropdown>
				</Space.Compact>
			) : null}
			{showSummaryButton ? renderSummaryButton() : null}
			{showBottomDockButton ? (
				<Tooltip
					title={
						bottomDockOpen
							? t("agentPage.dock.closeBottom")
							: t("agentPage.dock.openBottom")
					}
					placement="bottom"
				>
					<Button
						type="text"
						shape="circle"
						data-studio-open-bottom-dock="true"
						aria-pressed={bottomDockOpen}
						icon={
							<Icon
								name={
									bottomDockOpen
										? "layout-bottom-toggled"
										: "layout-bottom"
								}
							/>
						}
						onClick={toggleBottomDock}
					/>
				</Tooltip>
			) : null}
			{showSideDockButton ? (
				<Tooltip
					title={
						sideDockOpen
							? t("agentPage.dock.closeSidebar")
							: t("agentPage.dock.openSidebar")
					}
					placement="bottom"
				>
					<Button
						type="text"
						shape="circle"
						data-studio-open-side-dock="true"
						aria-pressed={sideDockOpen}
						icon={
							<Icon
								name={
									sideDockOpen
										? "layout-right-toggled"
										: "layout-right"
								}
							/>
						}
						onClick={toggleSideDock}
					/>
				</Tooltip>
			) : null}
		</div>
	);
}

export default HomePageActionBar;

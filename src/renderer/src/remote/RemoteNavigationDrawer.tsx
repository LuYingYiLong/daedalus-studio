import { ConfigProvider, Drawer, Menu } from "antd";
import type { MenuProps } from "antd";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Icon } from "@/assets/icons";
import type { SessionMetadata, WorkspaceConfig } from "@/platform/rpc/types";
import type { RemotePrimaryScreen } from "./remote-model";
import styles from "./RemoteNavigationDrawer.module.css";

type RemoteNavigationDrawerProps = {
	open: boolean;
	activeScreen: RemotePrimaryScreen;
	activeSessionId?: string;
	sessions: SessionMetadata[];
	workspaces: WorkspaceConfig[];
	onClose: () => void;
	onNavigate: (screen: RemotePrimaryScreen) => void;
	onOpenSession: (session: SessionMetadata) => void;
};

function RemoteNavigationDrawer({
	open,
	activeScreen,
	activeSessionId,
	sessions,
	workspaces,
	onClose,
	onNavigate,
	onOpenSession,
}: RemoteNavigationDrawerProps): React.JSX.Element {
	const { t } = useTranslation();
	const hasActiveSession: boolean = activeSessionId !== undefined;
	const items: MenuProps["items"] = useMemo((): MenuProps["items"] => {
		const workspaceItems: NonNullable<MenuProps["items"]> = workspaces.map(
			(workspace: WorkspaceConfig) => {
				const workspaceSessions: SessionMetadata[] = sessions.filter(
					(session: SessionMetadata): boolean =>
						session.workspaceId === workspace.id,
				);
				return {
					key: `workspace:${workspace.id}`,
					icon: <Icon name="folder" />,
					label: workspace.name,
					children:
						workspaceSessions.length === 0
							? [
									{
										key: `workspace-empty:${workspace.id}`,
										label: t("remote.noSessions"),
										disabled: true,
									},
								]
							: workspaceSessions.map(
									(session: SessionMetadata) => ({
										key: `session:${session.id}`,
										label: session.title,
									}),
								),
				};
			},
		);

		return [
			{
				key: "sessions",
				icon: <Icon name="remote" />,
				label: t("remote.navigation.home"),
			},
			{
				type: "group",
				key: "projects-group",
				label: t("remote.home.projects"),
				children: workspaceItems,
			},
			{
				type: "group",
				key: "tools-group",
				label: t("remote.navigation.tools"),
				children: [
					{
						key: "conversation",
						icon: <Icon name="agent" />,
						label: t("remote.navigation.conversation"),
						disabled: !hasActiveSession,
					},
					{
						key: "approvals",
						icon: <Icon name="shield" />,
						label: t("remote.navigation.approvals"),
					},
					{
						key: "trajectory",
						icon: <Icon name="trajectory" />,
						label: t("remote.navigation.trajectory"),
						disabled: !hasActiveSession,
					},
				],
			},
		];
	}, [hasActiveSession, sessions, t, workspaces]);

	const handleClick: MenuProps["onClick"] = ({ key }): void => {
		if (key.startsWith("session:")) {
			const sessionId: string = key.slice("session:".length);
			const session: SessionMetadata | undefined = sessions.find(
				(candidate: SessionMetadata): boolean =>
					candidate.id === sessionId,
			);
			if (session !== undefined) {
				onClose();
				onOpenSession(session);
			}
			return;
		}

		if (
			key === "sessions" ||
			key === "conversation" ||
			key === "approvals" ||
			key === "trajectory"
		) {
			onClose();
			onNavigate(key);
		}
	};

	return (
		<Drawer
			classNames={{
				body: styles.navigationDrawerBody,
			}}
			open={open}
			placement="left"
			size="min(88vw, 360px)"
			closable={false}
			onClose={onClose}
		>
			<ConfigProvider
				theme={{
					components: {
						Menu: {
							itemActiveBg: "transparent",
							itemSelectedBg: "transparent",
						},
					},
				}}
			>
				<Menu
					className={styles.navigationMenu}
					mode="inline"
					items={items}
					selectedKeys={
						activeScreen === "sessions"
							? ["sessions"]
							: [activeScreen]
					}
					onClick={handleClick}
				/>
			</ConfigProvider>
		</Drawer>
	);
}

export default RemoteNavigationDrawer;

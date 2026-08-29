import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useEventListener, useMemoizedFn } from "ahooks";
import { Button, Dropdown, Tooltip, type MenuProps } from "antd";
import { useTranslation } from "react-i18next";
import {
	CLIENT_PREFERENCES_CHANGED_EVENT,
	dispatchClientPreferencesChanged,
	getCachedClientPreferences,
	updateClientPreferences,
	type ClientPreferences,
} from "@/platform/rpc/client-preferences-api";
import { Icon } from "@/assets/icons";
import { NEW_SESSION_EVENT } from "@/domain/session/session-navigation-history";
import AppUpdateDialog from "@/widgets/app-update/AppUpdateDialog";
import ChangelogDialog from "@/widgets/changelog/ChangelogDialog";
import { shouldShowUpdateButton } from "@/domain/app-update/update-visibility";
import {
	getSessionNavigationSnapshot,
	navigateSessionHistory,
	SESSION_NAVIGATION_EVENT,
	subscribeToSessionNavigation,
} from "@/domain/session/session-navigation-history";
import styles from "./Titlebar.module.css";

type MainTitlebarProps = {
	appReady: boolean;
};

type TitlebarMenuKey = "file" | "edit" | "view" | "help";

const LAST_SEEN_CHANGELOG_VERSION_KEY: string =
	"daedalus.studio.changelog.last-seen-version";
const ENGLISH_DOCUMENTATION_URL: string =
	"https://daedalus-docs.readthedocs.io/en/latest/";
const SIMPLIFIED_CHINESE_DOCUMENTATION_URL: string =
	"https://daedalus-docs.readthedocs.io/zh-cn/latest/";

function getLastSeenChangelogVersion(): string | null {
	try {
		return window.localStorage.getItem(LAST_SEEN_CHANGELOG_VERSION_KEY);
	} catch {
		return null;
	}
}

function setLastSeenChangelogVersion(version: string): void {
	try {
		window.localStorage.setItem(LAST_SEEN_CHANGELOG_VERSION_KEY, version);
	} catch {
		// localStorage 不可用时仍允许用户手动关闭更新日志。
	}
}

function getUpdateButtonLabel(state: AppUpdateState | null): string {
	if (state?.status === "downloading") {
		return state.updateKind === "backend" ? "Updating" : "Downloading";
	}
	if (state?.status === "installing") {
		return "Installing";
	}
	if (state?.status === "downloaded") {
		return state.updateKind === "backend" ? "Updated" : "Installing";
	}
	return "Update";
}

function MainTitlebar({ appReady }: MainTitlebarProps): React.JSX.Element {
	const { t, i18n } = useTranslation();
	const [clientPreferences, setClientPreferences] =
		useState<ClientPreferences>(() => getCachedClientPreferences());
	const [updateState, setUpdateState] = useState<AppUpdateState | null>(null);
	const [updateModalOpen, setUpdateModalOpen] = useState<boolean>(false);
	const [openMenuKey, setOpenMenuKey] = useState<TitlebarMenuKey | null>(
		null,
	);
	const openMenuKeyRef = useRef<TitlebarMenuKey | null>(null);
	const [changelogVersion, setChangelogVersion] = useState<string | null>(
		null,
	);
	const sessionNavigation = useSyncExternalStore(
		subscribeToSessionNavigation,
		getSessionNavigationSnapshot,
		getSessionNavigationSnapshot,
	);
	const showUpdateButton: boolean =
		appReady && shouldShowUpdateButton(updateState);

	useEffect((): (() => void) => {
		if (!appReady) {
			return (): void => undefined;
		}
		let cancelled: boolean = false;
		void window.electronAPI.appInfo
			.getPackageInfo()
			.then((packageInfo: PackageInfo): void => {
				if (
					!cancelled &&
					packageInfo.version.trim().length > 0 &&
					getLastSeenChangelogVersion() !== packageInfo.version
				) {
					setChangelogVersion(packageInfo.version);
				}
			})
			.catch((): void => undefined);
		return (): void => {
			cancelled = true;
		};
	}, [appReady]);

	useEffect((): (() => void) => {
		let cancelled: boolean = false;
		void window.electronAPI.appUpdate
			.getState()
			.then((state: AppUpdateState): void => {
				if (!cancelled) {
					setUpdateState(state);
				}
				if (
					!cancelled &&
					appReady &&
					clientPreferences.autoCheckForUpdates &&
					state.status === "idle"
				) {
					void window.electronAPI.appUpdate
						.check()
						.then((nextState: AppUpdateState): void => {
							if (!cancelled) {
								setUpdateState(nextState);
							}
						});
				}
			});
		const unsubscribe = window.electronAPI.appUpdate.onStateChanged(
			(state: AppUpdateState): void => {
				setUpdateState(state);
			},
		);
		return (): void => {
			cancelled = true;
			unsubscribe();
		};
	}, [appReady, clientPreferences.autoCheckForUpdates]);

	const handleClientPreferencesChanged = useMemoizedFn(
		(event: Event): void => {
			const preferences: ClientPreferences | undefined = (
				event as CustomEvent<ClientPreferences>
			).detail;
			if (preferences !== undefined) {
				setClientPreferences(preferences);
			}
		},
	);

	useEventListener(
		CLIENT_PREFERENCES_CHANGED_EVENT,
		handleClientPreferencesChanged,
	);

	const startDownload = useMemoizedFn(async (): Promise<void> => {
		if (
			!appReady ||
			(updateState?.status !== "available" &&
				updateState?.status !== "error")
		) {
			return;
		}
		const nextState: AppUpdateState =
			await window.electronAPI.appUpdate.download();
		setUpdateState(nextState);
	});

	function handleUpdateClick(): void {
		setUpdateModalOpen(true);
		void startDownload();
	}

	async function handleUpdateModalClose(): Promise<void> {
		setUpdateModalOpen(false);
		if (
			updateState?.updateKind === "backend" &&
			updateState.backend.status === "downloaded"
		) {
			const nextState: AppUpdateState =
				await window.electronAPI.appUpdate.acknowledge();
			setUpdateState(nextState);
		}
	}

	function closeChangelog(): void {
		if (changelogVersion !== null) {
			setLastSeenChangelogVersion(changelogVersion);
		}
		setChangelogVersion(null);
	}

	function openFullChangelog(): void {
		closeChangelog();
		void window.electronAPI.windowControl.openSettings("about");
	}

	const toggleWorkspaceSidebar = useMemoizedFn(async (): Promise<void> => {
		const nextWorkspaceSidebar: ClientPreferences["workspaceSidebar"] = {
			...clientPreferences.workspaceSidebar,
			open: !clientPreferences.workspaceSidebar.open,
		};
		const optimisticPreferences: ClientPreferences = {
			...clientPreferences,
			workspaceSidebar: nextWorkspaceSidebar,
		};
		setClientPreferences(optimisticPreferences);
		dispatchClientPreferencesChanged(optimisticPreferences);
		try {
			const savedPreferences: ClientPreferences =
				await updateClientPreferences({
					workspaceSidebar: nextWorkspaceSidebar,
				});
			setClientPreferences(savedPreferences);
		} catch (error: unknown) {
			console.error("[Titlebar] update workspace sidebar failed", error);
			setClientPreferences(clientPreferences);
			dispatchClientPreferencesChanged(clientPreferences);
		}
	});

	const handleMenuOpenChange = useMemoizedFn(
		(menuKey: TitlebarMenuKey, nextOpen: boolean): void => {
			if (nextOpen) {
				openMenuKeyRef.current = menuKey;
				setOpenMenuKey(menuKey);
				return;
			}
			if (openMenuKeyRef.current === menuKey) {
				openMenuKeyRef.current = null;
				setOpenMenuKey(null);
			}
		},
	);

	const handleMenuTriggerMouseEnter = useMemoizedFn(
		(menuKey: TitlebarMenuKey): void => {
			if (
				openMenuKeyRef.current !== null &&
				openMenuKeyRef.current !== menuKey
			) {
				handleMenuOpenChange(menuKey, true);
			}
		},
	);

	const openDocumentation = useMemoizedFn(async (): Promise<void> => {
		const documentationUrl: string = i18n.language
			.toLowerCase()
			.startsWith("zh")
			? SIMPLIFIED_CHINESE_DOCUMENTATION_URL
			: ENGLISH_DOCUMENTATION_URL;
		try {
			await window.electronAPI.windowControl.openExternal(
				documentationUrl,
			);
		} catch (error: unknown) {
			console.error("[Titlebar] open documentation failed", error);
		}
	});

	const checkForUpdatesFromMenu = useMemoizedFn(async (): Promise<void> => {
		setUpdateModalOpen(true);
		try {
			const nextState: AppUpdateState =
				await window.electronAPI.appUpdate.check();
			setUpdateState(nextState);
		} catch (error: unknown) {
			console.error("[Titlebar] check for updates failed", error);
		}
	});

	const handleFileMenuClick: MenuProps["onClick"] = ({ key }): void => {
		handleMenuOpenChange("file", false);
		if (key === "new-session") {
			window.dispatchEvent(new Event(NEW_SESSION_EVENT));
			return;
		}
		if (key === "settings") {
			void window.electronAPI.windowControl.openSettings("general");
		}
	};

	const handleEditMenuClick: MenuProps["onClick"] = ({ key }): void => {
		handleMenuOpenChange("edit", false);
		const commandByKey: Record<string, string> = {
			undo: "undo",
			redo: "redo",
			cut: "cut",
			copy: "copy",
			paste: "paste",
		};
		const command: string | undefined = commandByKey[key];
		if (command !== undefined) {
			document.execCommand(command);
		}
	};

	const handleViewMenuClick: MenuProps["onClick"] = ({ key }): void => {
		handleMenuOpenChange("view", false);
		if (key === "workspace-sidebar") {
			void toggleWorkspaceSidebar();
			return;
		}
		if (key === "appearance") {
			void window.electronAPI.windowControl.openSettings("appearance");
		}
	};

	const handleHelpMenuClick: MenuProps["onClick"] = ({ key }): void => {
		handleMenuOpenChange("help", false);
		if (key === "documentation") {
			void openDocumentation();
			return;
		}
		if (key === "about") {
			void window.electronAPI.windowControl.openSettings("about");
			return;
		}
		if (key === "check-updates") {
			void checkForUpdatesFromMenu();
		}
	};

	const workspaceSidebarLabel: string = clientPreferences.workspaceSidebar
		.open
		? t("agentPage.workspaceSidebar.close")
		: t("agentPage.workspaceSidebar.open");
	const previousSessionLabel: string = t(
		"agentPage.sessionNavigation.previous",
	);
	const nextSessionLabel: string = t("agentPage.sessionNavigation.next");

	const fileMenuItems: MenuProps["items"] = [
		{
			key: "new-session",
			label: t("titlebar.menu.file.newSession"),
			icon: <Icon name="add" />,
		},
		{ type: "divider" },
		{
			key: "settings",
			label: t("titlebar.menu.file.settings"),
			icon: <Icon name="settings" />,
		},
	];
	const editMenuItems: MenuProps["items"] = [
		{
			key: "undo",
			label: t("titlebar.menu.edit.undo"),
			icon: <Icon name="undo" />,
		},
		{
			key: "redo",
			label: t("titlebar.menu.edit.redo"),
			icon: <Icon name="redo" />,
		},
		{ type: "divider" },
		{
			key: "cut",
			label: t("titlebar.menu.edit.cut"),
			icon: <Icon name="cut" />,
		},
		{
			key: "copy",
			label: t("titlebar.menu.edit.copy"),
			icon: <Icon name="copy" />,
		},
		{
			key: "paste",
			label: t("titlebar.menu.edit.paste"),
			icon: <Icon name="paste" />,
		},
	];
	const viewMenuItems: MenuProps["items"] = [
		{
			key: "workspace-sidebar",
			label: workspaceSidebarLabel,
			icon: <Icon name="layout-left" />,
		},
		{
			key: "appearance",
			label: t("titlebar.menu.view.appearance"),
			icon: <Icon name="appearance" />,
		},
	];
	const helpMenuItems: MenuProps["items"] = [
		{
			key: "documentation",
			label: t("titlebar.menu.help.documentation"),
			icon: <Icon name="book" />,
		},
		{
			key: "check-updates",
			label: t("titlebar.menu.help.checkForUpdates"),
			icon: <Icon name="reload" />,
		},
		{ type: "divider" },
		{
			key: "about",
			label: t("titlebar.menu.help.about"),
			icon: <Icon name="info" />,
		},
	];

	function handleSessionNavigation(direction: "back" | "forward"): void {
		const sessionId: string | null = navigateSessionHistory(direction);
		if (sessionId === null) {
			return;
		}
		window.dispatchEvent(
			new CustomEvent<string>(SESSION_NAVIGATION_EVENT, {
				detail: sessionId,
			}),
		);
	}

	return (
		<div className={styles.root}>
			{appReady ? (
				<div className={styles.menuBar}>
					<Tooltip title={workspaceSidebarLabel}>
						<Button
							type="text"
							shape="circle"
							className={styles.actionButton}
							aria-label={workspaceSidebarLabel}
							aria-pressed={
								clientPreferences.workspaceSidebar.open
							}
							icon={
								<Icon
									name={
										clientPreferences.workspaceSidebar.open
											? "layout-left-toggled"
											: "layout-left"
									}
								/>
							}
							onClick={(): void => {
								void toggleWorkspaceSidebar();
							}}
						/>
					</Tooltip>
					<Tooltip title={previousSessionLabel}>
						<Button
							type="text"
							shape="circle"
							className={styles.actionButton}
							aria-label={previousSessionLabel}
							disabled={!sessionNavigation.canGoBack}
							icon={<Icon name="arrow-left" />}
							onClick={(): void => {
								handleSessionNavigation("back");
							}}
						/>
					</Tooltip>
					<Tooltip title={nextSessionLabel}>
						<Button
							type="text"
							shape="circle"
							className={styles.actionButton}
							aria-label={nextSessionLabel}
							disabled={!sessionNavigation.canGoForward}
							icon={<Icon name="arrow-right" />}
							onClick={(): void => {
								handleSessionNavigation("forward");
							}}
						/>
					</Tooltip>
					<nav
						className={styles.applicationMenus}
						aria-label={t("titlebar.menu.ariaLabel")}
					>
						<Dropdown
							open={openMenuKey === "file"}
							onOpenChange={(nextOpen: boolean): void => {
								handleMenuOpenChange("file", nextOpen);
							}}
							menu={{
								items: fileMenuItems,
								onClick: handleFileMenuClick,
							}}
							trigger={["click"]}
						>
							<Button
								type="text"
								size="small"
								className={styles.menuButton}
								onMouseEnter={(): void => {
									handleMenuTriggerMouseEnter("file");
								}}
							>
								{t("titlebar.menu.file.label")}
							</Button>
						</Dropdown>
						<Dropdown
							open={openMenuKey === "edit"}
							onOpenChange={(nextOpen: boolean): void => {
								handleMenuOpenChange("edit", nextOpen);
							}}
							menu={{
								items: editMenuItems,
								onClick: handleEditMenuClick,
							}}
							trigger={["click"]}
						>
							<Button
								type="text"
								size="small"
								className={styles.menuButton}
								onMouseEnter={(): void => {
									handleMenuTriggerMouseEnter("edit");
								}}
							>
								{t("titlebar.menu.edit.label")}
							</Button>
						</Dropdown>
						<Dropdown
							open={openMenuKey === "view"}
							onOpenChange={(nextOpen: boolean): void => {
								handleMenuOpenChange("view", nextOpen);
							}}
							menu={{
								items: viewMenuItems,
								onClick: handleViewMenuClick,
							}}
							trigger={["click"]}
						>
							<Button
								type="text"
								size="small"
								className={styles.menuButton}
								onMouseEnter={(): void => {
									handleMenuTriggerMouseEnter("view");
								}}
							>
								{t("titlebar.menu.view.label")}
							</Button>
						</Dropdown>
						<Dropdown
							open={openMenuKey === "help"}
							onOpenChange={(nextOpen: boolean): void => {
								handleMenuOpenChange("help", nextOpen);
							}}
							menu={{
								items: helpMenuItems,
								onClick: handleHelpMenuClick,
							}}
							trigger={["click"]}
						>
							<Button
								type="text"
								size="small"
								className={styles.menuButton}
								onMouseEnter={(): void => {
									handleMenuTriggerMouseEnter("help");
								}}
							>
								{t("titlebar.menu.help.label")}
							</Button>
						</Dropdown>
					</nav>
				</div>
			) : null}
			<div className={styles.brandCluster}>
				{showUpdateButton ? (
					<Button
						type="primary"
						size="small"
						className={styles.updateButton}
						loading={updateState?.status === "downloading"}
						onClick={handleUpdateClick}
					>
						{getUpdateButtonLabel(updateState)}
					</Button>
				) : null}
			</div>
			<AppUpdateDialog
				open={updateModalOpen}
				state={updateState}
				onClose={handleUpdateModalClose}
				onDownload={startDownload}
			/>
			<ChangelogDialog
				open={changelogVersion !== null}
				version={changelogVersion}
				onClose={closeChangelog}
				onOpenFull={openFullChangelog}
			/>
		</div>
	);
}

export default MainTitlebar;

import { useEffect, useState, useSyncExternalStore } from "react";
import { useEventListener, useMemoizedFn } from "ahooks";
import { Button, Tooltip } from "antd";
import { useTranslation } from "react-i18next";
import {
	CLIENT_PREFERENCES_CHANGED_EVENT,
	dispatchClientPreferencesChanged,
	getCachedClientPreferences,
	updateClientPreferences,
	type ClientPreferences
} from "@/api/client-preferences-api";
import { Icon } from "@/assets/icons";
import AppUpdateDialog from "@/features/app-update/AppUpdateDialog";
import { shouldShowUpdateButton } from "@/features/app-update/update-visibility";
import {
	getSessionNavigationSnapshot,
	navigateSessionHistory,
	SESSION_NAVIGATION_EVENT,
	subscribeToSessionNavigation
} from "@/shared/lib/session-navigation-history";
import styles from "./Titlebar.module.css";

type MainTitlebarProps = {
	appReady: boolean;
};

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
	const { t } = useTranslation();
	const [clientPreferences, setClientPreferences] = useState<ClientPreferences>(() => getCachedClientPreferences());
	const [updateState, setUpdateState] = useState<AppUpdateState | null>(null);
	const [updateModalOpen, setUpdateModalOpen] = useState<boolean>(false);
	const sessionNavigation = useSyncExternalStore(
		subscribeToSessionNavigation,
		getSessionNavigationSnapshot,
		getSessionNavigationSnapshot
	);
	const showUpdateButton: boolean = appReady && shouldShowUpdateButton(updateState);

	useEffect((): (() => void) => {
		let cancelled: boolean = false;
		void window.electronAPI.appUpdate.getState().then((state: AppUpdateState): void => {
			if (!cancelled) {
				setUpdateState(state);
			}
			if (
				!cancelled
				&& appReady
				&& clientPreferences.autoCheckForUpdates
				&& state.status === "idle"
			) {
				void window.electronAPI.appUpdate.check().then((nextState: AppUpdateState): void => {
					if (!cancelled) {
						setUpdateState(nextState);
					}
				});
			}
		});
		const unsubscribe = window.electronAPI.appUpdate.onStateChanged((state: AppUpdateState): void => {
			setUpdateState(state);
		});
		return (): void => {
			cancelled = true;
			unsubscribe();
		};
	}, [appReady, clientPreferences.autoCheckForUpdates]);

	const handleClientPreferencesChanged = useMemoizedFn((event: Event): void => {
		const preferences: ClientPreferences | undefined = (event as CustomEvent<ClientPreferences>).detail;
		if (preferences !== undefined) {
			setClientPreferences(preferences);
		}
	});

	useEventListener(CLIENT_PREFERENCES_CHANGED_EVENT, handleClientPreferencesChanged);

	const startDownload = useMemoizedFn(async (): Promise<void> => {
		if (!appReady || (updateState?.status !== "available" && updateState?.status !== "error")) {
			return;
		}
		const nextState: AppUpdateState = await window.electronAPI.appUpdate.download();
		setUpdateState(nextState);
	});

	function handleUpdateClick(): void {
		setUpdateModalOpen(true);
		void startDownload();
	}

	async function handleUpdateModalClose(): Promise<void> {
		setUpdateModalOpen(false);
		if (updateState?.updateKind === "backend" && updateState.backend.status === "downloaded") {
			const nextState: AppUpdateState = await window.electronAPI.appUpdate.acknowledge();
			setUpdateState(nextState);
		}
	}

	const toggleWorkspaceSidebar = useMemoizedFn(async (): Promise<void> => {
		const nextWorkspaceSidebar: ClientPreferences["workspaceSidebar"] = {
			...clientPreferences.workspaceSidebar,
			open: !clientPreferences.workspaceSidebar.open
		};
		const optimisticPreferences: ClientPreferences = {
			...clientPreferences,
			workspaceSidebar: nextWorkspaceSidebar
		};
		setClientPreferences(optimisticPreferences);
		dispatchClientPreferencesChanged(optimisticPreferences);
		try {
			const savedPreferences: ClientPreferences = await updateClientPreferences({
				workspaceSidebar: nextWorkspaceSidebar
			});
			setClientPreferences(savedPreferences);
		} catch (error: unknown) {
			console.error("[Titlebar] update workspace sidebar failed", error);
			setClientPreferences(clientPreferences);
			dispatchClientPreferencesChanged(clientPreferences);
		}
	});

	const workspaceSidebarLabel: string = clientPreferences.workspaceSidebar.open
		? t("agentPage.workspaceSidebar.close")
		: t("agentPage.workspaceSidebar.open");
	const previousSessionLabel: string = t("agentPage.sessionNavigation.previous");
	const nextSessionLabel: string = t("agentPage.sessionNavigation.next");

	function handleSessionNavigation(direction: "back" | "forward"): void {
		const sessionId: string | null = navigateSessionHistory(direction);
		if (sessionId === null) {
			return;
		}
		window.dispatchEvent(new CustomEvent<string>(SESSION_NAVIGATION_EVENT, { detail: sessionId }));
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
							aria-pressed={clientPreferences.workspaceSidebar.open}
							icon={<Icon name={clientPreferences.workspaceSidebar.open ? "layout-left-toggled" : "layout-left"} />}
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
				</div>
			) : null}
			<div className={styles.brandCluster}>
				<p className={styles.brandName}>Daedalus Studio</p>
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
			<AppUpdateDialog open={updateModalOpen} state={updateState} onClose={handleUpdateModalClose} onDownload={startDownload} />
		</div>
	);
}

export default MainTitlebar;

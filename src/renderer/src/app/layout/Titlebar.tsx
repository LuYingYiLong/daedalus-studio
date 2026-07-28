import { useEffect, useState } from "react";
import { useEventListener, useMemoizedFn } from "ahooks";
import type { MenuProps } from "antd";
import { Button, Dropdown } from "antd";
import {
	CLIENT_PREFERENCES_CHANGED_EVENT,
	getCachedClientPreferences,
	type ClientPreferences
} from "@/api/client-preferences-api";
import AppUpdateDialog from "@/features/app-update/AppUpdateDialog";
import styles from "./Titlebar.module.css";

function shouldShowUpdateButton(state: AppUpdateState | null): boolean {
	if (state === null) {
		return false;
	}
	if (state.status === "error") {
		return true;
	}
	const hasKnownUpdate: boolean = state.updateKind !== null
		|| state.client.availableVersion !== null
		|| state.backend.availableVersion !== null;
	if (!hasKnownUpdate) {
		return false;
	}
	return state.status === "available"
		|| state.status === "downloading"
		|| state.status === "downloaded"
		|| state.status === "installing";
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

function MainTitlebar(): React.JSX.Element {
	const [clientPreferences, setClientPreferences] = useState<ClientPreferences>(() => getCachedClientPreferences());
	const [updateState, setUpdateState] = useState<AppUpdateState | null>(null);
	const [updateModalOpen, setUpdateModalOpen] = useState<boolean>(false);
	const showUpdateButton: boolean = shouldShowUpdateButton(updateState);

	useEffect((): (() => void) => {
		let cancelled: boolean = false;
		void window.electronAPI.appUpdate.getState().then((state: AppUpdateState): void => {
			if (!cancelled) {
				setUpdateState(state);
			}
			if (!cancelled && clientPreferences.autoCheckForUpdates && (state.status === "idle" || state.status === "not_available" || state.status === "error")) {
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
	}, [clientPreferences.autoCheckForUpdates]);

	const handleClientPreferencesChanged = useMemoizedFn((event: Event): void => {
		const preferences: ClientPreferences | undefined = (event as CustomEvent<ClientPreferences>).detail;
		if (preferences !== undefined) {
			setClientPreferences(preferences);
		}
	});

	useEventListener(CLIENT_PREFERENCES_CHANGED_EVENT, handleClientPreferencesChanged);

	const startDownload = useMemoizedFn(async (): Promise<void> => {
		if (updateState?.status !== "available" && updateState?.status !== "error") {
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

	return (
		<div className={styles.root}>
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

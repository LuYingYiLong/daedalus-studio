import { useEffect, useState } from "react";
import type { MenuProps } from "antd";
import { Alert, Button, Dropdown, Modal, Progress, Space, Typography } from "antd";
import {
	CLIENT_PREFERENCES_CHANGED_EVENT,
	getCachedClientPreferences,
	type ClientPreferences
} from "@/api/client-preferences-api";
import styles from "./Titlebar.module.css";

function shouldShowUpdateButton(state: AppUpdateState | null): boolean {
	if (state === null) {
		return false;
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
		|| state.status === "installing"
		|| state.status === "error";
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

function getModalStatusText(state: AppUpdateState | null): string {
	if (state === null) {
		return "Preparing update...";
	}
	if (state.status === "downloading") {
		return state.backend.status === "downloading" ? "Installing backend update..." : "Downloading update...";
	}
	if (state.status === "downloaded" && state.updateKind === "backend") {
		return "Backend updated. Close this dialog to continue.";
	}
	if (state.status === "downloaded" || state.status === "installing") {
		return "Restarting to install...";
	}
	if (state.status === "error") {
		return "Update failed";
	}
	return "Preparing update...";
}

function getUpdateSummary(state: AppUpdateState | null): string {
	if (state?.updateKind === "combined") {
		return "Daedalus Studio and the backend both have updates.";
	}
	if (state?.updateKind === "backend") {
		return "A Daedalus backend update is available.";
	}
	return "A Daedalus Studio update is available.";
}

function getComponentVersionText(label: string, state: AppUpdateComponentState): string | null {
	if (state.availableVersion === null) {
		return null;
	}
	return `${label}: ${state.currentVersion ?? "unknown"} -> ${state.availableVersion}`;
}

function Titlebar(): React.JSX.Element {
	const [clientPreferences, setClientPreferences] = useState<ClientPreferences>(() => getCachedClientPreferences());
	const [updateState, setUpdateState] = useState<AppUpdateState | null>(null);
	const [updateModalOpen, setUpdateModalOpen] = useState<boolean>(false);
	const showUpdateButton: boolean = shouldShowUpdateButton(updateState);
	const updateProgress: number = Math.round(updateState?.progress ?? 0);
	const isClientRestartState: boolean = updateState?.client.status === "downloaded" || updateState?.client.status === "installing";
	const clientVersionText: string | null = updateState === null ? null : getComponentVersionText("Client", updateState.client);
	const backendVersionText: string | null = updateState === null ? null : getComponentVersionText("Backend", updateState.backend);

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

	useEffect((): (() => void) => {
		function handleClientPreferencesChanged(event: Event): void {
			const preferences: ClientPreferences | undefined = (event as CustomEvent<ClientPreferences>).detail;
			if (preferences !== undefined) {
				setClientPreferences(preferences);
			}
		}

		window.addEventListener(CLIENT_PREFERENCES_CHANGED_EVENT, handleClientPreferencesChanged);
		return (): void => {
			window.removeEventListener(CLIENT_PREFERENCES_CHANGED_EVENT, handleClientPreferencesChanged);
		};
	}, []);

	async function startDownload(): Promise<void> {
		if (updateState?.status !== "available" && updateState?.status !== "error") {
			return;
		}
		const nextState: AppUpdateState = await window.electronAPI.appUpdate.download();
		setUpdateState(nextState);
	}

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
			<Modal
				title="Daedalus Studio update"
				open={updateModalOpen}
				footer={null}
				onCancel={(): void => {
					void handleUpdateModalClose();
				}}
				mask={{ closable: !isClientRestartState }}
				closable={!isClientRestartState}
			>
				<div className={styles.updateModalBody}>
					<Typography.Text>{getUpdateSummary(updateState)}</Typography.Text>
					{clientVersionText !== null ? <Typography.Text type="secondary">{clientVersionText}</Typography.Text> : null}
					{backendVersionText !== null ? <Typography.Text type="secondary">{backendVersionText}</Typography.Text> : null}
					{updateState?.releaseName !== null && updateState?.releaseName !== undefined ? (
						<Typography.Text type="secondary">{updateState.releaseName}</Typography.Text>
					) : null}
					<Typography.Text type="secondary">{getModalStatusText(updateState)}</Typography.Text>
					{updateState?.status === "downloading" || updateState?.status === "downloaded" || updateState?.status === "installing" ? (
						<Progress percent={updateState.status === "downloaded" || updateState.status === "installing" ? 100 : updateProgress} status={updateState.status === "downloaded" ? "success" : "active"} />
					) : null}
					{updateState?.status === "error" ? (
						<Alert
							type="error"
							showIcon={true}
							title="Update failed"
							description={updateState.errorMessage ?? "Failed to download update."}
							action={(
								<Button
									size="small"
									type="primary"
									onClick={(): void => {
										void startDownload();
									}}
								>
									Retry
								</Button>
							)}
						/>
					) : null}
				</div>
			</Modal>
		</div>
	);
}

export default Titlebar;

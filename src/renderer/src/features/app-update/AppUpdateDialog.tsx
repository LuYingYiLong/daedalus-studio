import { Alert, Button, Modal, Progress, Typography } from "antd";
import { useTranslation } from "react-i18next";
import styles from "./AppUpdateDialog.module.css";

export type AppUpdateDialogProps = {
	open: boolean;
	state: AppUpdateState | null;
	onClose: () => Promise<void>;
	onDownload: () => Promise<void>;
};

function getUpdateSummary(state: AppUpdateState | null, t: (key: string) => string): string {
	if (state?.status === "not_available") {
		return t("appUpdate.summary.notAvailable");
	}
	if (state?.status === "unsupported") {
		return t("appUpdate.summary.unsupported");
	}
	if (state?.updateKind === "combined") {
		return t("appUpdate.summary.combined");
	}
	if (state?.updateKind === "backend") {
		return t("appUpdate.summary.backend");
	}
	return t("appUpdate.summary.client");
}

function getUpdateStatusText(state: AppUpdateState | null, t: (key: string) => string): string {
	if (state === null || state.status === "checking") {
		return t("appUpdate.status.checking");
	}
	if (state.status === "downloading") {
		return state.backend.status === "downloading"
			? t("appUpdate.status.installingBackend")
			: t("appUpdate.status.downloading");
	}
	if (state.status === "downloaded" && state.updateKind === "backend") {
		return t("appUpdate.status.backendUpdated");
	}
	if (state.status === "downloaded" || state.status === "installing") {
		return t("appUpdate.status.restarting");
	}
	if (state.status === "error") {
		return t("appUpdate.status.failed");
	}
	return t("appUpdate.status.ready");
}

function getComponentVersionText(label: string, state: AppUpdateComponentState): string | null {
	if (state.availableVersion === null) {
		return null;
	}
	return `${label}: ${state.currentVersion ?? "unknown"} -> ${state.availableVersion}`;
}

function AppUpdateDialog({ open, state, onClose, onDownload }: AppUpdateDialogProps): React.JSX.Element {
	const { t } = useTranslation();
	const updateProgress: number = Math.round(state?.progress ?? 0);
	const isClientRestartState: boolean = state?.client.status === "downloaded" || state?.client.status === "installing";
	const clientVersionText: string | null = state === null ? null : getComponentVersionText(t("appUpdate.components.client"), state.client);
	const backendVersionText: string | null = state === null ? null : getComponentVersionText(t("appUpdate.components.backend"), state.backend);
	const isProgressState: boolean = state?.status === "downloading" || state?.status === "downloaded" || state?.status === "installing";

	return (
		<Modal
			title={t("appUpdate.title")}
			open={open}
			footer={null}
			onCancel={(): void => { void onClose(); }}
			mask={{ closable: !isClientRestartState }}
			closable={!isClientRestartState}
		>
			<div className={styles.content}>
				<Typography.Text>{getUpdateSummary(state, t)}</Typography.Text>
				{clientVersionText !== null ? <Typography.Text type="secondary">{clientVersionText}</Typography.Text> : null}
				{backendVersionText !== null ? <Typography.Text type="secondary">{backendVersionText}</Typography.Text> : null}
				{state?.releaseName !== null && state?.releaseName !== undefined ? <Typography.Text type="secondary">{state.releaseName}</Typography.Text> : null}
				<Typography.Text type="secondary">{getUpdateStatusText(state, t)}</Typography.Text>
				{isProgressState ? (
					<Progress percent={state?.status === "downloaded" || state?.status === "installing" ? 100 : updateProgress} status={state?.status === "downloaded" ? "success" : "active"} />
				) : null}
				{state?.status === "error" ? (
					<Alert
						type="error"
						showIcon={true}
						title={t("appUpdate.status.failed")}
						description={state.errorMessage ?? t("appUpdate.errors.download")}
						action={<Button size="small" type="primary" onClick={(): void => { void onDownload(); }}>{t("appUpdate.actions.retry")}</Button>}
					/>
				) : null}
			</div>
		</Modal>
	);
}

export default AppUpdateDialog;

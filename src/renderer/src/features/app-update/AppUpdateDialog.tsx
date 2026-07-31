import { Alert, Button, Modal, Progress, Typography } from "antd";
import { useTranslation } from "react-i18next";
import styles from "./AppUpdateDialog.module.css";

const APP_RELEASES_URL = "https://github.com/LuYingYiLong/godot-daedalus/releases";

type UpdateErrorEntry = {
	key: "client" | "backend";
	label: string;
	message: string;
};

export type AppUpdateDialogProps = {
	open: boolean;
	state: AppUpdateState | null;
	onClose: () => Promise<void>;
	onDownload: () => Promise<void>;
};

function getUpdateSummary(state: AppUpdateState | null, t: (key: string) => string): string {
	if (state?.status === "error") {
		return t("appUpdate.summary.failed");
	}
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

function getUpdateErrorEntries(state: AppUpdateState | null, t: (key: string) => string): UpdateErrorEntry[] {
	if (state === null) {
		return [];
	}
	const entries: UpdateErrorEntry[] = [];
	if (state.client.status === "error" && state.client.errorMessage !== null) {
		entries.push({
			key: "client",
			label: t("appUpdate.components.client"),
			message: state.client.errorMessage
		});
	}
	if (state.backend.status === "error" && state.backend.errorMessage !== null) {
		entries.push({
			key: "backend",
			label: t("appUpdate.components.backend"),
			message: state.backend.errorMessage
		});
	}
	if (entries.length === 0 && state.errorMessage !== null) {
		entries.push({
			key: "client",
			label: t("appUpdate.status.failed"),
			message: state.errorMessage
		});
	}
	return entries;
}

function getUpdateStatusText(state: AppUpdateState | null, t: (key: string) => string): string {
	if (state === null || state.status === "checking") {
		return t("appUpdate.status.checking");
	}
	if (state.status === "downloading") {
		if (state.backend.status === "downloading") {
			return t("appUpdate.status.installingBackend");
		}
		if (state.client.downloadPhase === "full") {
			return t("appUpdate.status.downloadingFullInstaller");
		}
		if (state.client.downloadPhase === "differential") {
			return t("appUpdate.status.downloadingDifferential");
		}
		return t("appUpdate.status.downloading");
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
	const isFullDownloadFallback: boolean = state?.client.downloadPhase === "full"
		&& state.client.downloadAttempt === 2
		&& (state.client.status === "downloading" || state.client.status === "error");
	const errorEntries: UpdateErrorEntry[] = getUpdateErrorEntries(state, t);

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
				{isFullDownloadFallback ? (
					<Alert
						type="warning"
						showIcon={true}
						title={t("appUpdate.fallback.title")}
						description={(
							<div className={styles.fallbackContent}>
								<Typography.Text>{t("appUpdate.fallback.description")}</Typography.Text>
								{state?.client.downloadFallbackReason !== null && state?.client.downloadFallbackReason !== undefined ? (
									<Typography.Text type="secondary">
										{t("appUpdate.fallback.reason")} {state.client.downloadFallbackReason}
									</Typography.Text>
								) : null}
							</div>
						)}
					/>
				) : null}
				{isProgressState ? (
					<Progress percent={state?.status === "downloaded" || state?.status === "installing" ? 100 : updateProgress} status={state?.status === "downloaded" ? "success" : "active"} />
				) : null}
				{state?.status === "error" ? (
					<Alert
						type="error"
						showIcon={true}
						title={t("appUpdate.status.failed")}
						description={(
							<div className={styles.errorContent}>
								{errorEntries.map((entry: UpdateErrorEntry): React.JSX.Element => (
									<div key={entry.key} className={styles.errorEntry}>
										<Typography.Text strong={true}>{entry.label}</Typography.Text>
										<Typography.Paragraph
											className={styles.errorMessage}
											copyable={{ text: entry.message }}
										>
											{entry.message}
										</Typography.Paragraph>
									</div>
								))}
								<Typography.Text type="secondary">{t("appUpdate.errors.manualDownloadHint")}</Typography.Text>
								<Button
									type="link"
									size="small"
									className={styles.releaseLink}
									href={APP_RELEASES_URL}
									target="_blank"
									rel="noreferrer"
								>
									{t("appUpdate.actions.openReleases")}
								</Button>
							</div>
						)}
						action={<Button size="small" type="primary" onClick={(): void => { void onDownload(); }}>{t("appUpdate.actions.retry")}</Button>}
					/>
				) : null}
			</div>
		</Modal>
	);
}

export default AppUpdateDialog;

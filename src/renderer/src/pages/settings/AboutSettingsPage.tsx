import { App, Button, Card, Descriptions, Spin, Tag, Typography } from "antd";
import { useEffect, useState } from "react";
import { useRequest } from "ahooks";
import { useTranslation } from "react-i18next";
import { createBackendClient } from "@/shared/api/transport/backend-client";
import type { BackendHealthResult } from "@/app/bootstrap";
import { Icon } from "@/assets/icons";
import backendColorfulIconUrl from "@/assets/icons/backend-colorful.svg?url";
import daedalusColorfulIconUrl from "@/assets/icons/icon-colorful.svg";
import AppUpdateDialog from "@/features/app-update/AppUpdateDialog";
import { updateClientPreferences } from "@/api/client-preferences-api";
import { createDefaultOnboardingPreferences } from "../../../../onboarding";
import styles from "./AboutSettingsPage.module.css";

type PackageInfo = {
	name: string;
	version: string;
	description: string;
	license: string;
	author: string;
};

type BackendDetails = {
	status: string;
	port: number | null;
	health: BackendHealthResult | null;
	errorMessage: string | null;
};

type AboutSettingsData = {
	packageInfo: PackageInfo;
	backendDetails: BackendDetails;
};

function getErrorMessage(error: unknown, fallback: string): string {
	return error instanceof Error ? error.message : fallback;
}

function getBackendStatusColor(status: string): string {
	switch (status) {
		case "healthy":
			return "green";
		case "starting":
			return "blue";
		case "unhealthy":
			return "red";
		case "stopped":
			return "default";
		default:
			return "default";
	}
}

function getBackendStatusLabel(status: string, t: (key: string) => string): string {
	switch (status) {
		case "healthy":
			return t("settings.about.backend.status.healthy");
		case "starting":
			return t("settings.about.backend.status.starting");
		case "unhealthy":
			return t("settings.about.backend.status.unhealthy");
		case "stopped":
			return t("settings.about.backend.status.stopped");
		default:
			return t("settings.about.backend.status.unknown");
	}
}

async function loadBackendDetails(fallbackMessage: string): Promise<BackendDetails> {
	const status: string = await window.electronAPI.backend.getStatus().catch((): string => "unknown");
	const port: number | null = await window.electronAPI.backend.getPort().catch((): null => null);

	try {
		const client = await createBackendClient();
		const health = await client.request<BackendHealthResult>("backend.health");
		return {
			status,
			port,
			health,
			errorMessage: null
		};
	} catch (error: unknown) {
		return {
			status,
			port,
			health: null,
			errorMessage: getErrorMessage(error, fallbackMessage)
		};
	}
}

function AboutSettingsPage(): React.JSX.Element {
	const { t } = useTranslation();
	const { message, modal } = App.useApp();
	const [updateState, setUpdateState] = useState<AppUpdateState | null>(null);
	const [isUpdateDialogOpen, setIsUpdateDialogOpen] = useState<boolean>(false);
	const [isResettingOnboarding, setIsResettingOnboarding] = useState<boolean>(false);
	const [isRepairingBackend, setIsRepairingBackend] = useState<boolean>(false);
	const {
		data,
		loading: isLoading,
		error,
		mutate
	} = useRequest(async (): Promise<AboutSettingsData> => {
		const [info, details] = await Promise.all([
			window.electronAPI.appInfo.getPackageInfo(),
			loadBackendDetails(t("settings.about.errors.backendDetails"))
		]);
		return {
			packageInfo: info,
			backendDetails: details
		};
	}, {
		refreshDeps: [t]
	});

	const {
		loading: isBackendRefreshing,
		runAsync: refreshBackendDetails
	} = useRequest(async (): Promise<BackendDetails> => {
		return loadBackendDetails(t("settings.about.errors.backendDetails"));
	}, {
		manual: true,
		onSuccess: (details: BackendDetails): void => {
			mutate((current: AboutSettingsData | undefined): AboutSettingsData | undefined => {
				if (current === undefined) {
					return current;
				}
				return {
					...current,
					backendDetails: details
				};
			});
		}
	});

	useEffect((): (() => void) => {
		return window.electronAPI.backend.onStatusChanged((status: string): void => {
			mutate((current: AboutSettingsData | undefined): AboutSettingsData | undefined => {
				if (current === undefined) {
					return current;
				}
				return {
					...current,
					backendDetails: {
						...current.backendDetails,
						status
					}
				};
			});
		});
	}, [mutate]);

	useEffect((): (() => void) => {
		void window.electronAPI.appUpdate.getState().then(setUpdateState);
		return window.electronAPI.appUpdate.onStateChanged(setUpdateState);
	}, []);

	const {
		loading: isCheckingUpdates,
		runAsync: checkForUpdates
	} = useRequest(async (): Promise<AppUpdateState> => {
		setIsUpdateDialogOpen(true);
		const nextState: AppUpdateState = await window.electronAPI.appUpdate.check();
		setUpdateState(nextState);
		return nextState;
	}, { manual: true });

	async function startUpdateDownload(): Promise<AppUpdateState> {
		const nextState: AppUpdateState = await window.electronAPI.appUpdate.download();
		setUpdateState(nextState);
		return nextState;
	}

	async function updateBackend(): Promise<void> {
		try {
			const nextState: AppUpdateState = await checkForUpdates();
			if (nextState.backend.status !== "available") {
				void message.info(t("settings.about.backend.updateNotAvailable"));
				return;
			}
			await startUpdateDownload();
			await refreshBackendDetails();
		} catch (updateError: unknown) {
			void message.error(getErrorMessage(updateError, t("settings.about.errors.backendUpdate")));
		}
	}

	async function repairBackend(): Promise<void> {
		setIsRepairingBackend(true);
		try {
			const result: BackendBootstrapState = await window.electronAPI.backendBootstrap.repair();
			if (result.status !== "healthy") {
				throw new Error(result.errorMessage ?? t("settings.about.errors.backendRepair"));
			}
			await refreshBackendDetails();
			void message.success(t("settings.about.backend.repairSucceeded"));
		} catch (repairError: unknown) {
			void message.error(getErrorMessage(repairError, t("settings.about.errors.backendRepair")));
			throw repairError;
		} finally {
			setIsRepairingBackend(false);
		}
	}

	function confirmBackendRepair(): void {
		modal.confirm({
			title: t("settings.about.backend.repairConfirmTitle"),
			content: t("settings.about.backend.repairConfirmDescription"),
			okText: t("settings.about.actions.repairBackend"),
			cancelText: t("settings.common.cancel"),
			onOk: repairBackend
		});
	}

	async function closeUpdateDialog(): Promise<void> {
		setIsUpdateDialogOpen(false);
		if (updateState?.updateKind === "backend" && updateState.backend.status === "downloaded") {
			setUpdateState(await window.electronAPI.appUpdate.acknowledge());
		}
	}

	function confirmResetOnboarding(): void {
		modal.confirm({
			title: t("settings.about.onboarding.confirmTitle"),
			content: t("settings.about.onboarding.confirmDescription"),
			okText: t("settings.about.onboarding.resetAndRestart"),
			cancelText: t("settings.common.cancel"),
			async onOk(): Promise<void> {
				setIsResettingOnboarding(true);
				try {
					await updateClientPreferences({ onboarding: createDefaultOnboardingPreferences() });
					await window.electronAPI.windowControl.relaunch();
				} catch (resetError: unknown) {
					setIsResettingOnboarding(false);
					void message.error(getErrorMessage(resetError, t("settings.about.onboarding.resetFailed")));
					throw resetError;
				}
			}
		});
	}

	const gitHubUrl = "https://github.com/LuYingYiLong/daedalus-studio";
	const packageInfo: PackageInfo | null = data?.packageInfo ?? null;
	const backendDetails: BackendDetails | null = data?.backendDetails ?? null;
	const errorMessage: string | null = error === undefined ? null : getErrorMessage(error, t("settings.about.errors.applicationInfo"));
	const backendStatus: string = backendDetails?.status ?? "unknown";
	const backendHealth: BackendHealthResult | null = backendDetails?.health ?? null;
	const backendPort: number | null = backendHealth?.port ?? backendDetails?.port ?? null;
	const unavailableLabel: string = t("settings.about.unavailable");
	const backendStatusLabel: string = getBackendStatusLabel(backendStatus, t);
	const isBackendUpdating: boolean = updateState?.backend.status === "downloading"
		|| updateState?.backend.status === "installing";

	return (
		<section className={styles.page}>
			<header className={styles.header}>
				<Typography.Title level={3} className={styles.title}>{t("settings.about.title")}</Typography.Title>
				<Button icon={<Icon name="reload" />} loading={isCheckingUpdates} onClick={(): void => { void checkForUpdates(); }}>
					{t("settings.about.actions.checkForUpdates")}
				</Button>
			</header>

			<div className={styles.content}>
				{isLoading ? (
					<Card>
						<div className={styles.loading}>
							<Spin />
						</div>
					</Card>
				) : errorMessage !== null ? (
					<Card>
						<Typography.Text type="danger">
							{errorMessage}
						</Typography.Text>
					</Card>
				) : packageInfo !== null ? (
					<>
						<Card className={styles.infoCard}>
							<div className={styles.appHeader}>
								<img
									src={daedalusColorfulIconUrl}
									alt=""
									className={styles.largeIcon}
								/>
								<div className={styles.appInfo}>
									<div className={styles.titleRow}>
										<Typography.Title level={3} className={styles.appName}>
											Daedalus Studio
										</Typography.Title>
										<Tag className={styles.versionTag}>
											v{packageInfo.version || "1.0.0"}
										</Tag>
									</div>
									{packageInfo.description ? (
										<Typography.Text type="secondary" className={styles.description}>
											{packageInfo.description}
										</Typography.Text>
									) : null}
								</div>
							</div>	
						</Card>

						<Card className={styles.backendCard}>
							<div className={styles.backendHeader}>
								<img
									src={backendColorfulIconUrl}
									alt=""
									className={styles.largeIcon}
								/>
								<div className={styles.backendInfo}>
									<div className={styles.titleRow}>
										<Typography.Title level={3} className={styles.appName}>
											Daedalus Backend
										</Typography.Title>
										<Tag color={getBackendStatusColor(backendStatus)} className={styles.versionTag}>
											{backendStatusLabel}
										</Tag>
									</div>
									<Typography.Text type="secondary" className={styles.description}>
										{t("settings.about.backend.description")}
									</Typography.Text>
								</div>
							</div>
						</Card>

						<Card title={t("settings.about.applicationInformation")} className={styles.detailsCard}>
							<Descriptions column={1}>
								<Descriptions.Item label={t("settings.about.fields.version")}>
									<Typography.Text code>
										{packageInfo.version}
									</Typography.Text>
								</Descriptions.Item>
								<Descriptions.Item label={t("settings.about.fields.license")}>
									<Tag color="green">{packageInfo.license}</Tag>
								</Descriptions.Item>
								<Descriptions.Item label={t("settings.about.fields.author")}>
									{packageInfo.author}
								</Descriptions.Item>
							</Descriptions>
						</Card>

						<Card
							title={(
							<div className={styles.cardTitleRow}>
									<span>{t("settings.about.backend.detailsTitle")}</span>
									<div className={styles.backendActions}>
									<Button
										size="small"
										icon={<Icon name="reload" />}
										loading={isBackendRefreshing}
										disabled={isRepairingBackend || isBackendUpdating}
										onClick={(): void => { void refreshBackendDetails(); }}
									>
										{t("settings.about.actions.refresh")}
									</Button>
									<Button
										size="small"
										icon={<Icon name="reload" />}
										loading={isCheckingUpdates || isBackendUpdating}
										disabled={isRepairingBackend}
										onClick={(): void => { void updateBackend(); }}
									>
										{t("settings.about.actions.updateBackend")}
									</Button>
									<Button
										size="small"
										icon={<Icon name="repair" />}
										loading={isRepairingBackend}
										disabled={isCheckingUpdates || isBackendUpdating}
										onClick={confirmBackendRepair}
									>
										{t("settings.about.actions.repairBackend")}
									</Button>
									</div>
								</div>
							)}
							className={styles.detailsCard}
						>
							{backendDetails?.errorMessage ? (
								<Typography.Paragraph type="danger" className={styles.backendError}>
									{backendDetails.errorMessage}
								</Typography.Paragraph>
							) : null}
							<Descriptions column={1}>
								<Descriptions.Item label={t("settings.about.fields.managerStatus")}>
									<Tag color={getBackendStatusColor(backendStatus)}>{backendStatusLabel}</Tag>
								</Descriptions.Item>
								<Descriptions.Item label={t("settings.about.fields.package")}>
									{backendHealth?.name ?? unavailableLabel}
								</Descriptions.Item>
								<Descriptions.Item label={t("settings.about.fields.version")}>
									<Typography.Text code>
										{backendHealth?.version ?? unavailableLabel}
									</Typography.Text>
								</Descriptions.Item>
								<Descriptions.Item label={t("settings.about.fields.runtimeMode")}>
									{backendHealth?.mode ?? unavailableLabel}
								</Descriptions.Item>
								<Descriptions.Item label={t("settings.about.fields.port")}>
									<Typography.Text code>
										{backendPort ?? unavailableLabel}
									</Typography.Text>
								</Descriptions.Item>
								<Descriptions.Item label={t("settings.about.fields.processId")}>
									<Typography.Text code>
										{backendHealth?.pid ?? unavailableLabel}
									</Typography.Text>
								</Descriptions.Item>
								<Descriptions.Item label={t("settings.about.fields.protocol")}>
									{backendHealth?.multiClient ? (
										<div className={styles.tagGroup}>
											<Tag color="blue">v{backendHealth.multiClient.protocolVersion}</Tag>
											<Tag color={backendHealth.multiClient.enabled ? "green" : "default"}>
												{backendHealth.multiClient.enabled ? t("settings.about.protocol.multiClient") : t("settings.about.protocol.singleClient")}
											</Tag>
										</div>
									) : (
										unavailableLabel
									)}
								</Descriptions.Item>
								<Descriptions.Item label={t("settings.about.fields.logPath")}>
									{backendHealth?.logPath ? (
										<Typography.Text code copyable className={styles.pathText}>
											{backendHealth.logPath}
										</Typography.Text>
									) : (
										unavailableLabel
									)}
								</Descriptions.Item>
							</Descriptions>
						</Card>

						<Card title={t("settings.about.sourceCode")} className={styles.githubCard}>
							<Typography.Paragraph>
								<Typography.Link
									href={gitHubUrl}
									target="_blank"
									rel="noopener noreferrer"
									className={styles.githubLink}
								>
									<Icon name="external-link" className={styles.linkIcon} />
									{gitHubUrl}
								</Typography.Link>
							</Typography.Paragraph>
							<Typography.Text type="secondary">
								{t("settings.about.sourceDescription")}
							</Typography.Text>
						</Card>

						<Card title={t("settings.about.onboarding.title")} className={styles.detailsCard}>
							<div className={styles.onboardingRow}>
								<Typography.Text type="secondary">
									{t("settings.about.onboarding.description")}
								</Typography.Text>
								<Button loading={isResettingOnboarding} disabled={isResettingOnboarding} onClick={confirmResetOnboarding}>
									{t("settings.about.onboarding.resetAndRestart")}
								</Button>
							</div>
						</Card>
					</>
				) : null}
			</div>
			<AppUpdateDialog
				open={isUpdateDialogOpen}
				state={updateState}
				onClose={closeUpdateDialog}
				onDownload={async (): Promise<void> => { await startUpdateDownload(); }}
			/>
		</section>
	);
}

export default AboutSettingsPage;

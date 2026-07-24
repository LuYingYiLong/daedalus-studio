import { Button, Card, Descriptions, Spin, Tag, Typography } from "antd";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { createBackendClient } from "@/api/backend-client";
import type { BackendHealthResult } from "@/app/bootstrap";
import { Icon } from "@/assets/icons";
import backendColorfulIconUrl from "@/assets/icons/backend-colorful.svg?url";
import daedalusColorfulIconUrl from "@/assets/icons/icon-colorful.svg";
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
	const [packageInfo, setPackageInfo] = useState<PackageInfo | null>(null);
	const [backendDetails, setBackendDetails] = useState<BackendDetails | null>(null);
	const [isLoading, setIsLoading] = useState<boolean>(true);
	const [isBackendRefreshing, setIsBackendRefreshing] = useState<boolean>(false);
	const [errorMessage, setErrorMessage] = useState<string | null>(null);

	useEffect((): (() => void) => {
		let cancelled: boolean = false;

		async function loadPackageInfo(): Promise<void> {
			try {
				setIsLoading(true);
				setErrorMessage(null);

				const [info, details] = await Promise.all([
					window.electronAPI.appInfo.getPackageInfo(),
					loadBackendDetails(t("settings.about.errors.backendDetails"))
				]);

				if (cancelled) {
					return;
				}

				setPackageInfo(info);
				setBackendDetails(details);
			} catch (error: unknown) {
				if (!cancelled) {
					setErrorMessage(getErrorMessage(error, t("settings.about.errors.applicationInfo")));
				}
			} finally {
				if (!cancelled) {
					setIsLoading(false);
				}
			}
		}

		void loadPackageInfo();

		return (): void => {
			cancelled = true;
		};
	}, [t]);

	useEffect((): (() => void) => {
		return window.electronAPI.backend.onStatusChanged((status: string): void => {
			setBackendDetails((current: BackendDetails | null): BackendDetails | null => {
				if (current === null) {
					return current;
				}
				return {
					...current,
					status
				};
			});
		});
	}, []);

	async function handleRefreshBackendDetails(): Promise<void> {
		try {
			setIsBackendRefreshing(true);
			setBackendDetails(await loadBackendDetails(t("settings.about.errors.backendDetails")));
		} finally {
			setIsBackendRefreshing(false);
		}
	}

	const gitHubUrl = "https://github.com/LuYingYiLong/daedalus-studio";
	const backendStatus: string = backendDetails?.status ?? "unknown";
	const backendHealth: BackendHealthResult | null = backendDetails?.health ?? null;
	const backendPort: number | null = backendHealth?.port ?? backendDetails?.port ?? null;
	const unavailableLabel: string = t("settings.about.unavailable");
	const backendStatusLabel: string = getBackendStatusLabel(backendStatus, t);

	return (
		<section className={styles.page}>
			<header className={styles.header}>
				<Typography.Title level={3} className={styles.title}>{t("settings.about.title")}</Typography.Title>
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
									<Button
										size="small"
										icon={<Icon name="reload" />}
										loading={isBackendRefreshing}
										onClick={(): void => void handleRefreshBackendDetails()}
									>
										{t("settings.about.actions.refresh")}
									</Button>
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
					</>
				) : null}
			</div>
		</section>
	);
}

export default AboutSettingsPage;

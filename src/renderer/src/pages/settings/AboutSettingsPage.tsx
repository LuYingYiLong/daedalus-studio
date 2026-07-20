import { Button, Card, Descriptions, Spin, Tag, Typography } from "antd";
import { useEffect, useState } from "react";
import { createBackendClient } from "@/api/backend-client";
import type { BackendHealthResult } from "@/app/bootstrap";
import { Icon } from "@/assets/icons";
import backendColorfulIconUrl from "@/assets/icons/backend-colorful.svg?url";
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

async function loadBackendDetails(): Promise<BackendDetails> {
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
			errorMessage: getErrorMessage(error, "Failed to load backend details")
		};
	}
}

function AboutSettingsPage(): React.JSX.Element {
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
					loadBackendDetails()
				]);

				if (cancelled) {
					return;
				}

				setPackageInfo(info);
				setBackendDetails(details);
			} catch (error: unknown) {
				if (!cancelled) {
					setErrorMessage(getErrorMessage(error, "Failed to load application information"));
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
	}, []);

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
			setBackendDetails(await loadBackendDetails());
		} finally {
			setIsBackendRefreshing(false);
		}
	}

	const gitHubUrl = "https://github.com/LuYingYiLong/daedalus-studio";
	const backendStatus: string = backendDetails?.status ?? "unknown";
	const backendHealth: BackendHealthResult | null = backendDetails?.health ?? null;
	const backendPort: number | null = backendHealth?.port ?? backendDetails?.port ?? null;

	return (
		<section className={styles.page}>
			<header className={styles.header}>
				<Typography.Title level={3} className={styles.title}>About</Typography.Title>
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
								<Icon
									name="icon-colorful"
									className={styles.largeAppIcon}
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
									className={styles.largeBackendIcon}
								/>
								<div className={styles.backendInfo}>
									<div className={styles.titleRow}>
										<Typography.Title level={3} className={styles.appName}>
											Daedalus Backend
										</Typography.Title>
										<Tag color={getBackendStatusColor(backendStatus)} className={styles.versionTag}>
											{backendStatus}
										</Tag>
									</div>
									<Typography.Text type="secondary" className={styles.description}>
										Local RPC, workflow, MCP, and Godot integration service.
									</Typography.Text>
								</div>
							</div>
						</Card>

						<Card title="Application Information" className={styles.detailsCard}>
							<Descriptions column={1}>
								<Descriptions.Item label="Version">
									<Typography.Text code>
										{packageInfo.version}
									</Typography.Text>
								</Descriptions.Item>
								<Descriptions.Item label="License">
									<Tag color="green">{packageInfo.license}</Tag>
								</Descriptions.Item>
								<Descriptions.Item label="Author">
									{packageInfo.author}
								</Descriptions.Item>
							</Descriptions>
						</Card>

						<Card
							title={(
								<div className={styles.cardTitleRow}>
									<span>Backend Details</span>
									<Button
										size="small"
										icon={<Icon name="reload" />}
										loading={isBackendRefreshing}
										onClick={(): void => void handleRefreshBackendDetails()}
									>
										Refresh
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
								<Descriptions.Item label="Manager Status">
									<Tag color={getBackendStatusColor(backendStatus)}>{backendStatus}</Tag>
								</Descriptions.Item>
								<Descriptions.Item label="Package">
									{backendHealth?.name ?? "Unavailable"}
								</Descriptions.Item>
								<Descriptions.Item label="Version">
									<Typography.Text code>
										{backendHealth?.version ?? "Unavailable"}
									</Typography.Text>
								</Descriptions.Item>
								<Descriptions.Item label="Runtime Mode">
									{backendHealth?.mode ?? "Unavailable"}
								</Descriptions.Item>
								<Descriptions.Item label="Port">
									<Typography.Text code>
										{backendPort ?? "Unavailable"}
									</Typography.Text>
								</Descriptions.Item>
								<Descriptions.Item label="Process ID">
									<Typography.Text code>
										{backendHealth?.pid ?? "Unavailable"}
									</Typography.Text>
								</Descriptions.Item>
								<Descriptions.Item label="Protocol">
									{backendHealth?.multiClient ? (
										<div className={styles.tagGroup}>
											<Tag color="blue">v{backendHealth.multiClient.protocolVersion}</Tag>
											<Tag color={backendHealth.multiClient.enabled ? "green" : "default"}>
												{backendHealth.multiClient.enabled ? "multi-client" : "single-client"}
											</Tag>
										</div>
									) : (
										"Unavailable"
									)}
								</Descriptions.Item>
								<Descriptions.Item label="Log Path">
									{backendHealth?.logPath ? (
										<Typography.Text code copyable className={styles.pathText}>
											{backendHealth.logPath}
										</Typography.Text>
									) : (
										"Unavailable"
									)}
								</Descriptions.Item>
							</Descriptions>
						</Card>

						<Card title="Source Code" className={styles.githubCard}>
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
								Visit our GitHub repository for source code, issues, and contributions.
							</Typography.Text>
						</Card>
					</>
				) : null}
			</div>
		</section>
	);
}

export default AboutSettingsPage;

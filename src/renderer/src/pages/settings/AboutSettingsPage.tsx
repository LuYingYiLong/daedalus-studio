import { Card, Descriptions, Spin, Tag, Typography } from "antd";
import { useEffect, useState } from "react";
import { Icon } from "@/assets/icons";
import styles from "./AboutSettingsPage.module.css";

type PackageInfo = {
	name: string;
	version: string;
	description: string;
	license: string;
	author: string;
};

function AboutSettingsPage(): React.JSX.Element {
	const [packageInfo, setPackageInfo] = useState<PackageInfo | null>(null);
	const [isLoading, setIsLoading] = useState<boolean>(true);
	const [errorMessage, setErrorMessage] = useState<string | null>(null);

	useEffect((): (() => void) => {
		let cancelled: boolean = false;

		async function loadPackageInfo(): Promise<void> {
			try {
				setIsLoading(true);
				setErrorMessage(null);

				const info = await window.electronAPI.appInfo.getPackageInfo();

				if (cancelled) {
					return;
				}

				setPackageInfo(info);
			} catch (error: unknown) {
				if (!cancelled) {
					setErrorMessage(
						error instanceof Error
							? error.message
							: "Failed to load application information"
					);
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

	const gitHubUrl = "https://github.com/LuYingYiLong/daedalus-studio";

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
									name="daedalus_icon"
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

						<Card title="Source Code" className={styles.githubCard}>
							<Typography.Paragraph>
								<Typography.Link
									href={gitHubUrl}
									target="_blank"
									rel="noopener noreferrer"
									className={styles.githubLink}
								>
									<Icon name="external_link" className={styles.linkIcon} />
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

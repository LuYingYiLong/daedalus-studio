import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Alert, Button, Empty, Input, List, Space, Spin, Typography } from "antd";
import { Icon } from "@/assets/icons";
import type { NativeConnectionProfile } from "@/remote/native-bridge";
import remoteColorfulIconUrl from "@/assets/icons/remote-colorful.svg?url";
import styles from "./RemoteConnectPage.module.css";

export type RemoteConnectAppInfo = {
	version: string;
	platform: "android";
	startupError?: string;
	certificateInstallUrl?: string;
	autoConnectAllowed?: boolean;
	devUiActive?: boolean;
};

export type RemoteConnectPageProps = {
	profiles: NativeConnectionProfile[];
	lastProfileId?: string;
	endpoint: string;
	busy: string | null;
	error: string | null;
	appInfo: RemoteConnectAppInfo | null;
	onEndpointChange: (endpoint: string) => void;
	onScan: () => void | Promise<void>;
	onConnectManual: () => void | Promise<void>;
	onConnectProfile: (profileId: string) => void | Promise<void>;
	onOpenCertificateInstall: () => void | Promise<void>;
	onRemoveProfile: (profileId: string) => void | Promise<void>;
};

type ConnectView = "home" | "manual" | "profiles";

function RemoteConnectPage({
	profiles,
	lastProfileId,
	endpoint,
	busy,
	error,
	appInfo,
	onEndpointChange,
	onScan,
	onConnectManual,
	onConnectProfile,
	onOpenCertificateInstall,
	onRemoveProfile,
}: RemoteConnectPageProps): React.JSX.Element {
	const { t } = useTranslation();
	const [view, setView] = useState<ConnectView>("home");

	useEffect((): (() => void) => {
		const handleBack = (): boolean => {
			if (view === "home") return false;
			setView("home");
			return true;
		};
		window.__daedalusRemoteHandleBack = handleBack;
		return (): void => {
			if (window.__daedalusRemoteHandleBack === handleBack) {
				delete window.__daedalusRemoteHandleBack;
			}
		};
	}, [view]);

	return (
		<main className={styles.shell}>
			<div className={styles.content}>
			<section className={styles.hero}>
				<img className={styles.logo} src={remoteColorfulIconUrl} alt="" aria-hidden="true" />
				<Typography.Title level={2}>{t("remote.connectPage.title")}</Typography.Title>
			</section>

			{error !== null ? <Alert type="error" showIcon title={t("remote.connectPage.errorTitle")} description={error} /> : null}
			{appInfo?.startupError === "certificate_not_trusted" && appInfo.certificateInstallUrl ? (
				<Button
					className={styles.installButton}
					block
					onClick={(): void => {
						void onOpenCertificateInstall();
					}}
				>
					{t("remote.connectPage.certificateInstall")}
				</Button>
			) : null}

			{view === "home" ? (
				<Space orientation="vertical" size="middle" className={styles.fullWidth}>
					<Button
						type="primary"
						size="large"
						block
						icon={<Icon name="scan" />}
						loading={busy === "scan"}
						onClick={(): void => {
							void onScan();
						}}
					>
						{t("remote.connectPage.scan")}
					</Button>
					<Button size="large" block onClick={(): void => setView("manual")}>
						{t("remote.connectPage.manual")}
					</Button>
					<Button size="large" block onClick={(): void => setView("profiles")}>
						{t("remote.connectPage.profiles")}
					</Button>
				</Space>
			) : (
				<section className={styles.detailSection}>
					{view === "manual" ? (
						<>
							<Typography.Title level={4}>{t("remote.connectPage.manualTitle")}</Typography.Title>
							<div className={styles.manualRow}>
								<Input
									size="large"
									value={endpoint}
									placeholder={t("remote.connectPage.manualPlaceholder")}
									onChange={(event): void => onEndpointChange(event.target.value)}
								/>
								<Button
									size="large"
									disabled={endpoint.trim().length === 0}
									loading={busy === "manual"}
									onClick={(): void => {
										void onConnectManual();
									}}
								>
									{t("remote.connectPage.connect")}
								</Button>
							</div>
						</>
					) : (
						<>
							<Typography.Title level={4}>{t("remote.connectPage.profilesTitle")}</Typography.Title>
							{busy === "startup" ? (
								<Spin />
							) : profiles.length === 0 ? (
								<Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t("remote.connectPage.emptyProfiles")} />
							) : (
								<List
									dataSource={profiles}
									renderItem={(profile): React.JSX.Element => (
										<List.Item
											className={styles.profileItem}
											actions={[
												<Button
													key="connect"
													type="link"
													loading={busy === profile.id}
													onClick={(): void => {
														void onConnectProfile(profile.id);
													}}
												>
													{t("remote.connectPage.connect")}
												</Button>,
												<Button
													key="remove"
													type="link"
													danger
													onClick={(): void => {
														void onRemoveProfile(profile.id);
													}}
												>
													{t("remote.connectPage.remove")}
												</Button>,
											]}
										>
											<List.Item.Meta
												title={
													<Space>
														{profile.name}
														{lastProfileId === profile.id ? (
														<Typography.Text type="secondary">{t("remote.connectPage.recent")}</Typography.Text>
														) : null}
													</Space>
												}
												description={`${profile.origin} · ${profile.authState === "paired" ? t("remote.connectPage.paired") : t("remote.connectPage.needsPairing")}`}
											/>
										</List.Item>
									)}
								/>
							)}
						</>
					)}
					<Button
						type="primary"
						size="large"
						block
						icon={<Icon name="arrow-left" />}
						onClick={(): void => setView("home")}
					>
						{t("remote.connectPage.back")}
					</Button>
				</section>
			)}

			</div>

			<Typography.Text className={styles.version} type="secondary">
				{t("remote.connectPage.version", { version: appInfo?.version ?? "" })}
				{appInfo?.devUiActive === true ? ` · ${t("remote.connectPage.devResources")}` : ""}
			</Typography.Text>
		</main>
	);
}

export default RemoteConnectPage;

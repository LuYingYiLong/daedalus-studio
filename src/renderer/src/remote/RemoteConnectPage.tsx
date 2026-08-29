import {
	Alert,
	Button,
	Card,
	Empty,
	Input,
	List,
	Space,
	Spin,
	Typography,
} from "antd";
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
	return (
		<main className={styles.shell}>
			<section className={styles.hero}>
				<img
					className={styles.logo}
					src={remoteColorfulIconUrl}
					alt=""
					aria-hidden="true"
				/>
				<Typography.Title level={2}>
					连接 Daedalus Studio
				</Typography.Title>
			</section>

			{error !== null ? (
				<Alert
					type="error"
					showIcon
					title="连接失败"
					description={error}
				/>
			) : null}
			{appInfo?.startupError === "certificate_not_trusted" &&
			appInfo.certificateInstallUrl ? (
				<Button
					className={styles.installButton}
					block
					onClick={(): void => {
						void onOpenCertificateInstall();
					}}
				>
					打开 CA 证书安装说明
				</Button>
			) : null}

			<Space
				orientation="vertical"
				size="middle"
				className={styles.fullWidth}
			>
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
					扫描配对二维码
				</Button>
				<div className={styles.manualRow}>
					<Input
						size="large"
						value={endpoint}
						placeholder="https://192.168.1.10:38190/remote.html#pair=…"
						onChange={(event): void =>
							onEndpointChange(event.target.value)
						}
					/>
					<Button
						size="large"
						disabled={endpoint.trim().length === 0}
						loading={busy === "manual"}
						onClick={(): void => {
							void onConnectManual();
						}}
					>
						连接
					</Button>
				</div>
			</Space>

			<section className={styles.savedSection}>
				<Typography.Title level={4}>已保存的 Studio</Typography.Title>
				{busy === "startup" ? (
					<Spin />
				) : profiles.length === 0 ? (
					<Empty
						image={Empty.PRESENTED_IMAGE_SIMPLE}
						description="暂无已配对设备"
					/>
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
										连接
									</Button>,
									<Button
										key="remove"
										type="link"
										danger
										onClick={(): void => {
											void onRemoveProfile(profile.id);
										}}
									>
										删除
									</Button>,
								]}
							>
								<List.Item.Meta
									title={
										<Space>
											{profile.name}
											{lastProfileId === profile.id ? (
												<Typography.Text type="secondary">
													最近
												</Typography.Text>
											) : null}
										</Space>
									}
									description={`${profile.origin} · ${profile.authState === "paired" ? "已配对" : "需要重新配对"}`}
								/>
							</List.Item>
						)}
					/>
				)}
			</section>

			<Typography.Text className={styles.version} type="secondary">
				Daedalus Remote {appInfo?.version ?? ""}
				{appInfo?.devUiActive === true ? " · ADB 开发资源" : ""}
			</Typography.Text>
		</main>
	);
}

export default RemoteConnectPage;

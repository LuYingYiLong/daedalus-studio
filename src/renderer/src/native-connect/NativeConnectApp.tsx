import { useEffect, useMemo, useRef, useState } from "react";
import { Alert, App, Button, Card, Empty, Input, List, Space, Spin, Typography } from "antd";
import { Icon } from "@/assets/icons";
import {
	hasNativeBridge,
	requestNativeBridge,
	type NativeConnectionProfile,
	type NativeProfilesResult,
} from "@/remote/native-bridge";
import styles from "./NativeConnectApp.module.css";

type AppInfo = {
	version: string;
	platform: "android";
	startupError?: string;
	certificateInstallUrl?: string;
	autoConnectAllowed?: boolean;
};

function errorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

function NativeConnectApp(): React.JSX.Element {
	const { message } = App.useApp();
	const [profiles, setProfiles] = useState<NativeConnectionProfile[]>([]);
	const [lastProfileId, setLastProfileId] = useState<string>();
	const [endpoint, setEndpoint] = useState<string>("");
	const [busy, setBusy] = useState<string | null>("startup");
	const [error, setError] = useState<string | null>(null);
	const [appInfo, setAppInfo] = useState<AppInfo | null>(null);
	const autoConnectAttempted = useRef<boolean>(false);

	const sortedProfiles: NativeConnectionProfile[] = useMemo(
		(): NativeConnectionProfile[] => [...profiles].sort((left, right): number =>
			(right.lastConnectedAt ?? "").localeCompare(left.lastConnectedAt ?? "")),
		[profiles],
	);

	const refreshProfiles = async (): Promise<NativeProfilesResult> => {
		const result = await requestNativeBridge<NativeProfilesResult>("profiles.list");
		setProfiles(result.profiles);
		setLastProfileId(result.lastProfileId);
		return result;
	};

	const connectProfile = async (params: Record<string, unknown>, key: string): Promise<void> => {
		setBusy(key);
		setError(null);
		try {
			await requestNativeBridge("profiles.connect", params, 30_000);
		} catch (connectError: unknown) {
			setError(errorMessage(connectError));
			setBusy(null);
		}
	};

	useEffect((): void => {
		if (!hasNativeBridge()) {
			setBusy(null);
			setError("当前页面未运行在 Daedalus Remote 原生壳中");
			return;
		}
		void Promise.all([
			requestNativeBridge<AppInfo>("app.info"),
			refreshProfiles(),
		]).then(([info, result]): void => {
			setAppInfo(info);
			if (info.startupError) setError(info.startupError);
			setBusy(null);
			if (autoConnectAttempted.current
				|| info.autoConnectAllowed === false
				|| result.lastProfileId === undefined) return;
			autoConnectAttempted.current = true;
			void connectProfile({ profileId: result.lastProfileId }, result.lastProfileId);
		}).catch((startupError: unknown): void => {
			setBusy(null);
			setError(errorMessage(startupError));
		});
	}, []);

	const scan = async (): Promise<void> => {
		setBusy("scan");
		setError(null);
		try {
			const result = await requestNativeBridge<{ url?: string; cancelled?: boolean }>("pairing.scan", {}, 120_000);
			if (result.url !== undefined) await connectProfile({ url: result.url }, "scan-connect");
			else setBusy(null);
		} catch (scanError: unknown) {
			setBusy(null);
			setError(errorMessage(scanError));
		}
	};

	return (
		<main className={styles.shell}>
			<section className={styles.hero}>
				<div className={styles.logo}><Icon name="remote" /></div>
				<Typography.Title level={2}>连接 Daedalus Studio</Typography.Title>
				<Typography.Paragraph type="secondary">
					扫描 Studio 远程访问页生成的二维码，或输入局域网连接地址。
				</Typography.Paragraph>
			</section>

			{error !== null ? <Alert type="error" showIcon title="连接失败" description={error} /> : null}
			{appInfo?.startupError === "certificate_not_trusted" && appInfo.certificateInstallUrl ? (
				<Button
					className={styles.installButton}
					block
					onClick={(): void => {
						void requestNativeBridge("certificate.openInstall", {
							installUrl: appInfo.certificateInstallUrl,
						});
					}}
				>
					打开 CA 证书安装说明
				</Button>
			) : null}

			<Card className={styles.actionCard}>
				<Space direction="vertical" size="middle" className={styles.fullWidth}>
					<Button type="primary" size="large" block icon={<Icon name="scan" />} loading={busy === "scan"} onClick={(): void => { void scan(); }}>
						扫描配对二维码
					</Button>
					<div className={styles.manualRow}>
						<Input size="large" value={endpoint} placeholder="https://192.168.1.10:38190/remote.html#pair=…" onChange={(event): void => setEndpoint(event.target.value)} />
						<Button size="large" disabled={endpoint.trim().length === 0} loading={busy === "manual"} onClick={(): void => { void connectProfile({ url: endpoint.trim() }, "manual"); }}>
							连接
						</Button>
					</div>
				</Space>
			</Card>

			<section className={styles.savedSection}>
				<Typography.Title level={4}>已保存的 Studio</Typography.Title>
				{busy === "startup" ? <Spin /> : sortedProfiles.length === 0 ? (
					<Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无已配对设备" />
				) : (
					<List
						dataSource={sortedProfiles}
						renderItem={(profile): React.JSX.Element => (
							<List.Item
								className={styles.profileItem}
								actions={[
									<Button key="connect" type="link" loading={busy === profile.id} onClick={(): void => { void connectProfile({ profileId: profile.id }, profile.id); }}>连接</Button>,
									<Button key="remove" type="link" danger onClick={(): void => {
										void requestNativeBridge("profiles.remove", { profileId: profile.id }).then(async (): Promise<void> => {
											await refreshProfiles();
											void message.success("已删除本机连接资料");
										});
									}}>删除</Button>,
								]}
							>
								<List.Item.Meta
									title={<Space>{profile.name}{lastProfileId === profile.id ? <Typography.Text type="secondary">最近</Typography.Text> : null}</Space>}
									description={`${profile.origin} · ${profile.authState === "paired" ? "已配对" : "需要重新配对"}`}
								/>
							</List.Item>
						)}
					/>
				)}
			</section>

			<Typography.Text className={styles.version} type="secondary">
				Daedalus Remote {appInfo?.version ?? ""}
			</Typography.Text>
		</main>
	);
}

export default NativeConnectApp;

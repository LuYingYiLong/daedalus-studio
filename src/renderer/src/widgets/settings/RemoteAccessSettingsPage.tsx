import { useEffect, useMemo, useRef, useState } from "react";
import {
	Alert,
	App,
	Button,
	Empty,
	InputNumber,
	Modal,
	QRCode,
	Select,
	Space,
	Switch,
	Tag,
	Typography,
} from "antd";
import { useTranslation } from "react-i18next";
import type {
	RemoteAccessDevice,
	RemoteAccessPairingSession,
	RemoteAccessState,
} from "../../../../contracts/remote-access";
import SettingsItem from "@/ui/SettingsItem";
import SettingsList from "@/ui/SettingsList";
import { Icon } from "@/assets/icons";
import styles from "./RemoteAccessSettingsPage.module.css";

const STATUS_COLORS: Record<RemoteAccessState["status"], string> = {
	disabled: "default",
	starting: "processing",
	running: "success",
	error: "error",
};

function formatDate(value: string | null): string {
	if (value === null) return "-";
	const date: Date = new Date(value);
	return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

function RemoteAccessSettingsPage(): React.JSX.Element {
	const { t } = useTranslation();
	const { message, modal } = App.useApp();
	const [state, setState] = useState<RemoteAccessState | null>(null);
	const [pairing, setPairing] = useState<RemoteAccessPairingSession | null>(
		null,
	);
	const [addressIndex, setAddressIndex] = useState<number>(0);
	const [httpsPort, setHttpsPort] = useState<number>(38190);
	const [bootstrapPort, setBootstrapPort] = useState<number>(38191);
	const [busy, setBusy] = useState<boolean>(false);
	const pairingDeviceIdsRef = useRef<Set<string> | null>(null);

	useEffect((): (() => void) => {
		void window.electronAPI.remoteAccess
			.getState()
			.then((nextState: RemoteAccessState): void => {
				setState(nextState);
				setHttpsPort(nextState.httpsPort);
				setBootstrapPort(nextState.bootstrapPort);
			});
		return window.electronAPI.remoteAccess.onStateChanged(
			(nextState: RemoteAccessState): void => {
				setState(nextState);
				setHttpsPort(nextState.httpsPort);
				setBootstrapPort(nextState.bootstrapPort);
			},
		);
	}, []);

	useEffect((): void => {
		if (pairing === null || pairingDeviceIdsRef.current === null) return;
		const hasNewDevice: boolean = (state?.devices ?? []).some(
			(device: RemoteAccessDevice): boolean =>
				!pairingDeviceIdsRef.current!.has(device.id),
		);
		if (!hasNewDevice) return;
		pairingDeviceIdsRef.current = null;
		setPairing(null);
	}, [pairing, state?.devices]);

	const addressOptions = useMemo(
		() =>
			(state?.addresses ?? []).map((address: string, index: number) => ({
				value: index,
				label: address,
			})),
		[state?.addresses],
	);

	async function changeEnabled(enabled: boolean): Promise<void> {
		setBusy(true);
		pairingDeviceIdsRef.current = null;
		setPairing(null);
		try {
			const nextState: RemoteAccessState =
				await window.electronAPI.remoteAccess.setEnabled(enabled);
			setState(nextState);
			if (nextState.status === "error")
				void message.error(
					nextState.error ?? t("settings.remoteAccess.errors.start"),
				);
		} catch (error: unknown) {
			void message.error(
				error instanceof Error
					? error.message
					: t("settings.remoteAccess.errors.save"),
			);
		} finally {
			setBusy(false);
		}
	}

	async function savePorts(): Promise<void> {
		setBusy(true);
		try {
			const nextState: RemoteAccessState =
				await window.electronAPI.remoteAccess.updatePorts({
					httpsPort,
					bootstrapPort,
				});
			setState(nextState);
			void message.success(t("settings.remoteAccess.ports.saved"));
		} catch (error: unknown) {
			void message.error(
				error instanceof Error
					? error.message
					: t("settings.remoteAccess.errors.save"),
			);
		} finally {
			setBusy(false);
		}
	}

	async function beginPairing(): Promise<void> {
		pairingDeviceIdsRef.current = new Set(
			(state?.devices ?? []).map(
				(device: RemoteAccessDevice): string => device.id,
			),
		);
		setBusy(true);
		try {
			const nextPairing: RemoteAccessPairingSession =
				await window.electronAPI.remoteAccess.beginPairing();
			setPairing(nextPairing);
			setAddressIndex(0);
		} catch (error: unknown) {
			pairingDeviceIdsRef.current = null;
			void message.error(
				error instanceof Error
					? error.message
					: t("settings.remoteAccess.errors.pairing"),
			);
		} finally {
			setBusy(false);
		}
	}

	function revokeDevice(device: RemoteAccessDevice): void {
		modal.confirm({
			title: t("settings.remoteAccess.devices.revokeTitle", {
				name: device.name,
			}),
			content: t("settings.remoteAccess.devices.revokeDescription"),
			okButtonProps: { danger: true },
			onOk: async (): Promise<void> => {
				setState(
					await window.electronAPI.remoteAccess.revokeDevice(
						device.id,
					),
				);
			},
		});
	}

	function revokeAll(): void {
		modal.confirm({
			title: t("settings.remoteAccess.devices.revokeAllTitle"),
			content: t("settings.remoteAccess.devices.revokeAllDescription"),
			okButtonProps: { danger: true },
			onOk: async (): Promise<void> => {
				setState(await window.electronAPI.remoteAccess.revokeAll(true));
				pairingDeviceIdsRef.current = null;
				setPairing(null);
			},
		});
	}

	const installUrl: string | undefined = pairing?.installUrls[addressIndex];
	const pairingUrl: string | undefined = pairing?.pairingUrls[addressIndex];

	return (
		<section className={styles.page}>
			<header className={styles.header}>
				<Typography.Title level={3} className={styles.title}>
					{t("settings.remoteAccess.title")}
				</Typography.Title>
			</header>
			<div className={styles.content}>
				<SettingsList title={t("settings.remoteAccess.service.title")}>
					<SettingsItem
						searchKey="item:remote_access.enabled"
						title={t("settings.remoteAccess.enabled.title")}
						description={t(
							"settings.remoteAccess.enabled.description",
						)}
					>
						<Switch
							loading={busy || state?.status === "starting"}
							checked={state?.enabled ?? false}
							onChange={(checked: boolean): void => {
								void changeEnabled(checked);
							}}
						/>
					</SettingsItem>
					<SettingsItem
						title={t("settings.remoteAccess.addresses.title")}
						description={
							(state?.addresses.length ?? 0) > 0
								? state!.addresses
										.map(
											(address: string): string =>
												`https://${address}:${state!.httpsPort}/remote.html`,
										)
										.join(" · ")
								: t("settings.remoteAccess.addresses.empty")
						}
					>
						<Typography.Text
							copyable={
								state?.certificateFingerprint === null
									? false
									: {
											text:
												state?.certificateFingerprint ??
												"",
										}
							}
							className={styles.fingerprint}
						>
							{state?.certificateFingerprint ?? "-"}
						</Typography.Text>
					</SettingsItem>
					<SettingsItem
						title={t("settings.remoteAccess.ports.title")}
						description={t(
							"settings.remoteAccess.ports.description",
						)}
					>
						<Space wrap>
							<InputNumber
								min={1024}
								max={65535}
								value={httpsPort}
								style={{ width: 150 }}
								suffix="HTTPS/WSS"
								onChange={(value: number | null): void =>
									setHttpsPort(value ?? 38190)
								}
							/>
							<InputNumber
								min={1024}
								max={65535}
								value={bootstrapPort}
								style={{ width: 150 }}
								suffix="HTTP"
								onChange={(value: number | null): void =>
									setBootstrapPort(value ?? 38191)
								}
							/>
							<Button
								disabled={busy || httpsPort === bootstrapPort}
								onClick={(): void => {
									void savePorts();
								}}
							>
								{t("settings.common.save")}
							</Button>
						</Space>
					</SettingsItem>
				</SettingsList>

				<SettingsList title={t("settings.remoteAccess.pairing.title")}>
					<SettingsItem
						searchKey="item:remote_access.pairing"
						title={t("settings.remoteAccess.pairing.actionTitle")}
						description={t(
							"settings.remoteAccess.pairing.description",
						)}
					>
						<Button
							type="primary"
							icon={<Icon name="qrcode" />}
							disabled={state?.status !== "running"}
							loading={busy}
							onClick={(): void => {
								void beginPairing();
							}}
						>
							{t("settings.remoteAccess.pairing.generate")}
						</Button>
					</SettingsItem>
					<Modal
						open={pairing !== null}
						title={t("settings.remoteAccess.pairing.title")}
						footer={null}
						onCancel={(): void => {
							pairingDeviceIdsRef.current = null;
							setPairing(null);
						}}
						width={1024}
					>
						{pairing !== null &&
						installUrl !== undefined &&
						pairingUrl !== undefined ? (
							<div className={styles.pairingPanel}>
								<Select
									value={addressIndex}
									options={addressOptions}
									onChange={setAddressIndex}
									className={styles.addressSelect}
								/>
								<div className={styles.qrGrid}>
									<div className={styles.qrCard}>
										<Typography.Text strong>
											{t(
												"settings.remoteAccess.pairing.installCertificate",
											)}
										</Typography.Text>
										<QRCode
											value={installUrl}
											type="svg"
											size={208}
											marginSize={4}
											bgColor="#ffffff"
											color="#000000"
										/>
										<Typography.Text type="secondary">
											{installUrl}
										</Typography.Text>
									</div>
									<div className={styles.qrCard}>
										<Typography.Text strong>
											{t(
												"settings.remoteAccess.pairing.scanPairing",
											)}
										</Typography.Text>
										<QRCode
											value={pairingUrl}
											type="svg"
											size={280}
											marginSize={4}
											errorLevel="M"
											boostLevel={false}
											bgColor="#ffffff"
											color="#000000"
										/>
										<Typography.Text
											copyable={{ text: pairingUrl }}
										>
											{t(
												"settings.remoteAccess.pairing.copyLink",
											)}
										</Typography.Text>
										<Typography.Text type="secondary">
											{t(
												"settings.remoteAccess.pairing.expires",
												{
													time: formatDate(
														pairing.expiresAt,
													),
												},
											)}
										</Typography.Text>
									</div>
								</div>
								<Typography.Text
									type="secondary"
									className={styles.instructions}
								>
									{t(
										"settings.remoteAccess.pairing.instructions",
									)}
								</Typography.Text>
							</div>
						) : null}
					</Modal>
				</SettingsList>

				<SettingsList title={t("settings.remoteAccess.devices.title")}>
					{(state?.devices.length ?? 0) === 0 ? (
						<Empty
							image={Empty.PRESENTED_IMAGE_SIMPLE}
							description={t(
								"settings.remoteAccess.devices.empty",
							)}
						/>
					) : (
						(state?.devices ?? []).map(
							(device: RemoteAccessDevice): React.JSX.Element => (
								<SettingsItem
									key={device.id}
									searchKey="item:remote_access.devices"
									title={device.name}
									description={t(
										"settings.remoteAccess.devices.lastSeen",
										{
											time: formatDate(device.lastSeenAt),
										},
									)}
								>
									<Button
										danger
										type="text"
										onClick={(): void =>
											revokeDevice(device)
										}
									>
										{t(
											"settings.remoteAccess.devices.revoke",
										)}
									</Button>
								</SettingsItem>
							),
						)
					)}
					<SettingsItem
						title={t(
							"settings.remoteAccess.devices.revokeAllTitle",
						)}
						description={t(
							"settings.remoteAccess.devices.description",
						)}
					>
						<Button
							danger
							disabled={(state?.devices.length ?? 0) === 0}
							onClick={revokeAll}
						>
							{t("settings.remoteAccess.devices.revokeAll")}
						</Button>
					</SettingsItem>
				</SettingsList>
				{state?.error !== null && state?.error !== undefined ? (
					<Alert
						type="error"
						showIcon
						title={t("settings.remoteAccess.errors.start")}
						description={state.error}
					/>
				) : null}
			</div>
		</section>
	);
}

export default RemoteAccessSettingsPage;

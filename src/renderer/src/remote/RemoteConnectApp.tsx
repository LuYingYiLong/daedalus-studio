import { useEffect, useMemo, useRef, useState } from "react";
import { App } from "antd";
import {
	hasNativeBridge,
	requestNativeBridge,
	type NativeConnectionProfile,
	type NativeProfilesResult,
} from "@/remote/native-bridge";
import RemoteConnectPage, { type RemoteConnectAppInfo } from "./RemoteConnectPage";

function errorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

function RemoteConnectApp(): React.JSX.Element {
	const { message } = App.useApp();
	const [profiles, setProfiles] = useState<NativeConnectionProfile[]>([]);
	const [lastProfileId, setLastProfileId] = useState<string>();
	const [endpoint, setEndpoint] = useState<string>("");
	const [busy, setBusy] = useState<string | null>("startup");
	const [error, setError] = useState<string | null>(null);
	const [appInfo, setAppInfo] = useState<RemoteConnectAppInfo | null>(null);
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
			requestNativeBridge<RemoteConnectAppInfo>("app.info"),
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

	const connectSavedProfile = (profileId: string): void => {
		void connectProfile({ profileId }, profileId);
	};

	const connectManual = (): void => {
		void connectProfile({ url: endpoint.trim() }, "manual");
	};

	const openCertificateInstall = (): void => {
		if (appInfo?.certificateInstallUrl === undefined) return;
		void requestNativeBridge("certificate.openInstall", {
			installUrl: appInfo.certificateInstallUrl,
		});
	};

	const removeProfile = async (profileId: string): Promise<void> => {
		try {
			await requestNativeBridge("profiles.remove", { profileId });
			await refreshProfiles();
			message.success("已删除本机连接资料");
		} catch (removeError: unknown) {
			setError(errorMessage(removeError));
		}
	};

	return (
		<RemoteConnectPage
			profiles={sortedProfiles}
			lastProfileId={lastProfileId}
			endpoint={endpoint}
			busy={busy}
			error={error}
			appInfo={appInfo}
			onEndpointChange={setEndpoint}
			onScan={scan}
			onConnectManual={connectManual}
			onConnectProfile={connectSavedProfile}
			onOpenCertificateInstall={openCertificateInstall}
			onRemoveProfile={removeProfile}
		/>
	);
}

export default RemoteConnectApp;

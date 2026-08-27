export type RemoteGatewayStatus = {
	name: string;
	protocolVersion: 3;
	pairingRequired: boolean;
	certificateFingerprint: string;
};

export async function pairFromLocationFragment(): Promise<boolean> {
	const fragment = new URLSearchParams(globalThis.location.hash.slice(1));
	const code: string | null = fragment.get("pair");
	if (code === null || code.length === 0) return false;
	const response: Response = await fetch("/api/v1/pair", {
		method: "POST",
		credentials: "include",
		headers: { "Content-Type": "application/json" },
		cache: "no-store",
		body: JSON.stringify({
			code,
			deviceName: `${navigator.platform || "Android"} · ${navigator.userAgent.includes("Android") ? "Android" : "Mobile"}`,
		}),
	});
	if (!response.ok) {
		const payload = await response.json().catch((): unknown => null) as { error?: string } | null;
		throw new Error(payload?.error ?? `remote_pair_failed_${response.status}`);
	}
	history.replaceState(null, "", `${location.pathname}${location.search}`);
	return true;
}

export async function fetchRemoteGatewayStatus(): Promise<RemoteGatewayStatus> {
	const response: Response = await fetch("/api/v1/status", {
		credentials: "include",
		cache: "no-store",
	});
	if (!response.ok) throw new Error(`remote_gateway_unavailable_${response.status}`);
	return await response.json() as RemoteGatewayStatus;
}

export type RemoteGatewayStatus = {
	name: string;
	protocolVersion: 3;
	remoteUiCompatibilityVersion: 1;
	studioVersion: string;
	pairingRequired: boolean;
	certificateFingerprint: string;
};

let pairingAttempt: Promise<boolean> | null = null;

async function hasAuthenticatedGatewaySession(): Promise<boolean> {
	try {
		return !(await fetchRemoteGatewayStatus()).pairingRequired;
	} catch {
		return false;
	}
}

async function submitPairingCode(code: string): Promise<boolean> {
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
		const errorCode: string = payload?.error ?? `remote_pair_failed_${response.status}`;
		// A successful single-use pairing may finish immediately before a duplicate
		// bootstrap attempt. Only accept that case after the Gateway verifies the Cookie.
		if (errorCode === "remote_pair_code_invalid" && await hasAuthenticatedGatewaySession()) {
			return true;
		}
		throw new Error(errorCode);
	}
	return true;
}

export function pairFromLocationFragment(): Promise<boolean> {
	if (pairingAttempt !== null) return pairingAttempt;
	const fragment = new URLSearchParams(globalThis.location.hash.slice(1));
	const code: string | null = fragment.get("pair");
	if (code === null || code.length === 0) return Promise.resolve(false);

	// Remove the one-time secret before the first await. React effect re-entry can
	// no longer observe it, and concurrent callers share the same request below.
	globalThis.history.replaceState(
		globalThis.history.state,
		"",
		`${globalThis.location.pathname}${globalThis.location.search}`,
	);
	pairingAttempt = submitPairingCode(code);
	return pairingAttempt;
}

export async function fetchRemoteGatewayStatus(): Promise<RemoteGatewayStatus> {
	const response: Response = await fetch("/api/v1/status", {
		credentials: "include",
		cache: "no-store",
	});
	if (!response.ok) throw new Error(`remote_gateway_unavailable_${response.status}`);
	return await response.json() as RemoteGatewayStatus;
}

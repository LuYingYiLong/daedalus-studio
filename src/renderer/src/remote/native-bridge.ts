export const NATIVE_BRIDGE_MESSAGE_LIMIT: number = 16 * 1024;

export type NativeBridgeMethod =
	| "app.info"
	| "profiles.list"
	| "profiles.connect"
	| "profiles.rename"
	| "profiles.remove"
	| "pairing.scan"
	| "pairing.connect"
	| "certificate.openInstall"
	| "shell.showConnections"
	| "remote.ready"
	| "remote.connectionState";

export type NativeConnectionProfile = {
	id: string;
	name: string;
	origin: string;
	certificateFingerprint: string;
	installUrl?: string;
	lastConnectedAt?: string;
	authState: "paired" | "pairing_required" | "unknown";
};

export type NativeProfilesResult = {
	profiles: NativeConnectionProfile[];
	lastProfileId?: string;
};

type NativeBridgeHost = {
	postMessage(message: string): void;
	onmessage?: ((event: MessageEvent<string>) => void) | null;
};

type NativeBridgeResponse = {
	id: string;
	result?: unknown;
	error?: { code: string; message: string };
};

declare global {
	interface Window {
		DaedalusNative?: NativeBridgeHost;
	}
}

const pendingRequests: Map<string, {
	resolve: (value: unknown) => void;
	reject: (reason: Error) => void;
	timer: number;
}> = new Map();

function attachBridgeListener(): void {
	const bridge: NativeBridgeHost | undefined = globalThis.window?.DaedalusNative;
	if (bridge === undefined) return;
	// AndroidX injects this object before an onmessage property exists. Do not
	// require a null sentinel: on real WebView builds its initial value is
	// undefined, while test doubles and browser harnesses may use null.
	bridge.onmessage = (event: MessageEvent<string>): void => {
		if (typeof event.data !== "string" || event.data.length > NATIVE_BRIDGE_MESSAGE_LIMIT) return;
		let response: NativeBridgeResponse;
		try {
			response = JSON.parse(event.data) as NativeBridgeResponse;
		} catch {
			return;
		}
		const pending = pendingRequests.get(response.id);
		if (pending === undefined) return;
		pendingRequests.delete(response.id);
		window.clearTimeout(pending.timer);
		if (response.error !== undefined) {
			pending.reject(new Error(response.error.message || response.error.code));
			return;
		}
		pending.resolve(response.result);
	};
}

export function hasNativeBridge(): boolean {
	return globalThis.window?.DaedalusNative !== undefined;
}

export function createNativeBridgeRequest(
	id: string,
	method: NativeBridgeMethod,
	params: Record<string, unknown> = {},
): string {
	const payload: string = JSON.stringify({ id, method, params });
	if (new TextEncoder().encode(payload).byteLength > NATIVE_BRIDGE_MESSAGE_LIMIT) {
		throw new Error("native_bridge_message_too_large");
	}
	return payload;
}

export async function requestNativeBridge<T>(
	method: NativeBridgeMethod,
	params: Record<string, unknown> = {},
	timeoutMs: number = 15_000,
): Promise<T> {
	const bridge: NativeBridgeHost | undefined = globalThis.window?.DaedalusNative;
	if (bridge === undefined) throw new Error("native_bridge_unavailable");
	attachBridgeListener();
	const id: string = crypto.randomUUID();
	const payload: string = createNativeBridgeRequest(id, method, params);
	return await new Promise<T>((resolve, reject): void => {
		const timer: number = window.setTimeout((): void => {
			pendingRequests.delete(id);
			reject(new Error("native_bridge_timeout"));
		}, timeoutMs);
		pendingRequests.set(id, {
			resolve: (value: unknown): void => resolve(value as T),
			reject,
			timer,
		});
		bridge.postMessage(payload);
	});
}

export function notifyNativeBridge(
	method: Extract<NativeBridgeMethod, "remote.ready" | "remote.connectionState">,
	params: Record<string, unknown>,
): void {
	if (!hasNativeBridge()) return;
	void requestNativeBridge(method, params, 5_000).catch((): void => {});
}

import {
	BackendRpcClient,
	type BackendEvent,
} from "@/platform/rpc/transport/backend-rpc-client";
import type { ClientHelloResult } from "@/platform/rpc/types";
import {
	getPlatformRuntime,
	type BackendTransport,
	type PlatformRuntime,
	type RuntimeClientHello,
} from "@/platform/runtime/platform-runtime";

let backendClient: BackendRpcClient | null = null;
let backendClientPromise: Promise<BackendRpcClient> | null = null;
const backendReconnectListeners: Set<() => void> = new Set();
const backendConnectionStateListeners: Set<(state: "connected" | "disconnected") => void> = new Set();
let capabilityListenerAttached: boolean = false;

function notifyConnectionState(state: "connected" | "disconnected"): void {
	for (const listener of backendConnectionStateListeners) listener(state);
}

async function sendClientHello(client: BackendRpcClient): Promise<void> {
	const hello: RuntimeClientHello = await getPlatformRuntime().getClientHello();
	await client.request<ClientHelloResult>("client.hello", {
		...hello,
	});
}

export function onBackendReconnected(listener: () => void): () => void {
	backendReconnectListeners.add(listener);
	return (): void => {
		backendReconnectListeners.delete(listener);
	};
}

export function onBackendConnectionStateChanged(
	listener: (state: "connected" | "disconnected") => void,
): () => void {
	backendConnectionStateListeners.add(listener);
	return (): void => {
		backendConnectionStateListeners.delete(listener);
	};
}

/** Subscribe to backend events using the shared Studio connection. */
export async function onBackendEvent(
	listener: (event: BackendEvent) => void,
): Promise<() => void> {
	const client = await createBackendClient();
	return client.addEventListener(listener);
}

export async function createBackendClient(): Promise<BackendRpcClient> {
	const runtime: PlatformRuntime = getPlatformRuntime();
	if (!capabilityListenerAttached && runtime.onCapabilitiesChanged !== undefined) {
		capabilityListenerAttached = true;
		runtime.onCapabilitiesChanged((): void => {
			if (backendClient?.isOpen()) {
				void sendClientHello(backendClient).catch(
					(error: unknown): void => {
						console.error(
							"[Daedalus backend] capability update failed",
							error,
						);
					},
				);
			}
		});
	}
	if (backendClient?.isOpen()) {
		return backendClient;
	}

	if (backendClientPromise) {
		return backendClientPromise;
	}

	backendClientPromise = connectBackendClient();

	try {
		backendClient = await backendClientPromise;
		return backendClient;
	} finally {
		backendClientPromise = null;
	}
}

async function connectBackendClient(): Promise<BackendRpcClient> {
	const runtime: PlatformRuntime = getPlatformRuntime();
	const transport: BackendTransport = await runtime.getBackendTransport();
	const client: BackendRpcClient = new BackendRpcClient(
		transport.url,
		{
			authProtocol: transport.authProtocol,
		},
	);

	console.info("[Daedalus backend] connecting", { runtime: runtime.kind });
	client.addConnectionListener(({ reconnected, state }): void => {
		if (state === "disconnected") {
			notifyConnectionState("disconnected");
			return;
		}
		// A WebSocket open event only confirms the Gateway transport. Remote UI
		// must not report a healthy Backend until client.hello also succeeds.
		if (!reconnected) {
			return;
		}
		void sendClientHello(client)
			.then((): void => {
				notifyConnectionState("connected");
				for (const listener of backendReconnectListeners) {
					listener();
				}
			})
			.catch((error: unknown): void => {
				console.error(
					"[Daedalus backend] reconnect hello failed",
					error,
				);
			});
	});
	await client.connect();
	try {
		await sendClientHello(client);
	} catch (error: unknown) {
		client.close();
		throw error;
	}
	notifyConnectionState("connected");
	runtime.onBackendConnected?.(client);

	return client;
}

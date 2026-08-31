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
type CapabilityNegotiation = {
	features: Record<string, unknown>;
	ready: boolean;
	updates: Promise<void>;
};
const capabilityNegotiations = new WeakMap<BackendRpcClient, CapabilityNegotiation>();

function notifyConnectionState(state: "connected" | "disconnected"): void {
	for (const listener of backendConnectionStateListeners) listener(state);
}

async function sendClientHello(client: BackendRpcClient): Promise<void> {
	const runtime = getPlatformRuntime();
	const negotiation: CapabilityNegotiation = { features: {}, ready: false, updates: Promise.resolve() };
	capabilityNegotiations.set(client, negotiation);
	const hello: RuntimeClientHello = await runtime.getClientHello();
	await client.request<ClientHelloResult>("client.hello", {
		...hello,
	});
	if (runtime.getCapabilityUpdate) {
		try {
			const info = await client.request<{ features?: Record<string, unknown> }>("client.info");
			negotiation.features = info.features ?? {};
		} catch { /* 旧 Backend 未声明特性时只更新已有能力 */ }
		if (capabilityNegotiations.get(client) !== negotiation || !client.isOpen()) return;
		negotiation.ready = true;
		await updateClientCapabilities(client);
	}
}

function updateClientCapabilities(client: BackendRpcClient): Promise<void> {
	const runtime = getPlatformRuntime();
	if (!runtime.getCapabilityUpdate) return sendClientHello(client);
	const negotiation = capabilityNegotiations.get(client);
	if (!negotiation?.ready) return Promise.resolve();
	// 串行读取最新状态，防止旧的启用状态覆盖禁用或重连后的协商结果
	negotiation.updates = negotiation.updates.catch(() => {}).then(async () => {
		if (capabilityNegotiations.get(client) !== negotiation || !client.isOpen()) return;
		const capabilities = await runtime.getCapabilityUpdate!(negotiation.features);
		if (capabilityNegotiations.get(client) !== negotiation || !client.isOpen()) return;
		await client.request("client.capabilities.update", { capabilities });
	});
	return negotiation.updates;
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
				void updateClientCapabilities(backendClient).catch(
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
			capabilityNegotiations.delete(client);
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

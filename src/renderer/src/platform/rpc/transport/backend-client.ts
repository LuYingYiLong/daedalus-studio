import { BackendRpcClient } from "@/platform/rpc/transport/backend-rpc-client";
import type { ClientHelloResult } from "@/platform/rpc/types";

const studioCapabilities: Record<string, boolean> = {
	sessionSubscribe: true,
	approval: true,
	inlineDiffView: true,
	editorTools: false,
	editorUndoRedo: false,
	inlineDiffUndo: false
};

let backendClient: BackendRpcClient | null = null;
let backendClientPromise: Promise<BackendRpcClient> | null = null;
const backendReconnectListeners: Set<() => void> = new Set();

async function sendStudioHello(client: BackendRpcClient): Promise<void> {
	await client.request<ClientHelloResult>("client.hello", {
		clientType: "studio",
		clientName: "Daedalus Studio",
		capabilities: studioCapabilities
	});
}

export function onBackendReconnected(listener: () => void): () => void {
	backendReconnectListeners.add(listener);
	return (): void => {
		backendReconnectListeners.delete(listener);
	};
}

export async function createBackendClient(): Promise<BackendRpcClient> {
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
	if (!window.electronAPI?.backend) {
		throw new Error("当前环境没有暴露 electronAPI.backend");
	}

	const connection = await window.electronAPI.backend.getConnectionInfo();
	const client: BackendRpcClient = new BackendRpcClient(`ws://127.0.0.1:${connection.port}`, {
		authProtocol: connection.authProtocol
	});

	console.info("[Daedalus backend] connecting", { port: connection.port });
	client.addConnectionListener(({ reconnected }): void => {
		if (!reconnected) {
			return;
		}
		void sendStudioHello(client).then((): void => {
			for (const listener of backendReconnectListeners) {
				listener();
			}
		}).catch((error: unknown): void => {
			console.error("[Daedalus backend] reconnect hello failed", error);
		});
	});
	await client.connect();
	await sendStudioHello(client);

	return client;
}

import { BackendRpcClient } from "./backend-rpc-client";
import type { ClientHelloResult } from "./types";

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
	await client.connect();
	await client.request<ClientHelloResult>("client.hello", {
		clientType: "studio",
		clientName: "Daedalus Studio",
		capabilities: studioCapabilities
	});

	return client;
}

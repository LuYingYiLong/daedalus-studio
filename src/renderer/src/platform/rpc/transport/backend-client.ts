import { BackendRpcClient } from "@/platform/rpc/transport/backend-rpc-client";
import type { ClientHelloResult } from "@/platform/rpc/types";
import { attachScheduledTaskToolRuntime } from "./scheduled-task-tool-runtime";

const studioCapabilities: Record<string, boolean> = {
	sessionSubscribe: true,
	approval: true,
	inlineDiffView: true,
	editorTools: false,
	editorUndoRedo: false,
	inlineDiffUndo: false,
	browserTools: false,
	scheduledTasks: true
};

let backendClient: BackendRpcClient | null = null;
let backendClientPromise: Promise<BackendRpcClient> | null = null;
const backendReconnectListeners: Set<() => void> = new Set();
let browserSettingsListenerAttached: boolean = false;

async function refreshBrowserCapability(client?: BackendRpcClient): Promise<void> {
	try {
		studioCapabilities.browserTools = (await window.electronAPI.browser.settings.get()).aiCdpEnabled;
	} catch {
		studioCapabilities.browserTools = false;
	}
	if (client?.isOpen()) {
		await client.request("client.capabilities.update", {
			capabilities: { browserTools: studioCapabilities.browserTools, scheduledTasks: true }
		});
	}
}

async function sendStudioHello(client: BackendRpcClient): Promise<void> {
	await refreshBrowserCapability();
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
	if (!browserSettingsListenerAttached && window.electronAPI?.browser?.settings !== undefined) {
		browserSettingsListenerAttached = true;
		window.electronAPI.browser.settings.onChanged((settings): void => {
			studioCapabilities.browserTools = settings.aiCdpEnabled;
			if (backendClient?.isOpen()) {
				void refreshBrowserCapability(backendClient).catch((error: unknown): void => {
					console.error("[Daedalus browser] capability update failed", error);
				});
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
	attachScheduledTaskToolRuntime(client);

	return client;
}

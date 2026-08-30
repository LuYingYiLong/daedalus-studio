import type { BackendRpcClient } from "@/platform/rpc/transport/backend-rpc-client";
import type { WindowCaptureAPI } from "../../../../contracts/window-capture";

export type BackendTransport = {
	url: string;
	authProtocol: string | null;
};

export type RuntimeClientHello = {
	clientType: "studio" | "studio_remote";
	clientName: string;
	capabilities: Record<string, boolean>;
};

export type PlatformSystemRuntime = {
	windowCapture?: WindowCaptureAPI;
	clipboard: {
		writeText: (text: string) => Promise<void>;
		readText: () => Promise<string>;
		readImage: () => Promise<{ dataUrl: string | null; fileName?: string }>;
	};
	openSettings: (page: string) => Promise<void>;
	saveText: (params: { defaultFileName: string; content: string }) => Promise<{ saved: boolean }>;
	savePng: (params: { defaultFileName: string; bytes: Uint8Array }) => Promise<{ saved: boolean }>;
	workspaceFiles: {
		openFile: (params: { workspaceRoot: string; filePath: string }) => Promise<unknown>;
		revealFile: (params: { workspaceRoot: string; filePath: string }) => Promise<unknown>;
		saveFileAs: (params: { workspaceRoot: string; filePath: string }) => Promise<{ saved: boolean }>;
		openLaunchTarget: (params: {
			workspaceRoot: string;
			filePath: string;
			targetId: string;
			godotExecutablePath?: string;
		}) => Promise<unknown>;
	};
};

export type PlatformRuntime = {
	kind: "desktop" | "remote";
	getBackendTransport: () => Promise<BackendTransport>;
	getClientHello: () => Promise<RuntimeClientHello>;
	onCapabilitiesChanged?: (listener: () => void) => () => void;
	onBackendConnected?: (client: BackendRpcClient) => void;
	system?: PlatformSystemRuntime;
};

let platformRuntime: PlatformRuntime | null = null;

export function configurePlatformRuntime(runtime: PlatformRuntime): void {
	platformRuntime = runtime;
}

export function getPlatformRuntime(): PlatformRuntime {
	if (platformRuntime === null) throw new Error("Daedalus platform runtime has not been configured");
	return platformRuntime;
}

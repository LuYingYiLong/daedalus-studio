import type { PlatformRuntime, RuntimeClientHello } from "./platform-runtime";
import { attachScheduledTaskToolRuntime } from "@/platform/rpc/transport/scheduled-task-tool-runtime";

let browserToolsEnabled: boolean = false;

async function getDesktopHello(): Promise<RuntimeClientHello> {
	try {
		browserToolsEnabled = (await window.electronAPI.browser.settings.get()).aiCdpEnabled;
	} catch {
		browserToolsEnabled = false;
	}
	return {
		clientType: "studio",
		clientName: "Daedalus Studio",
		capabilities: {
			sessionSubscribe: true,
			approval: true,
			inlineDiffView: true,
			editorTools: false,
			editorUndoRedo: false,
			inlineDiffUndo: false,
			browserTools: browserToolsEnabled,
			scheduledTasks: true,
		},
	};
}

export const desktopPlatformRuntime: PlatformRuntime = {
	kind: "desktop",
	getBackendTransport: async () => {
		const connection = await window.electronAPI.backend.getConnectionInfo();
		return {
			url: `ws://127.0.0.1:${connection.port}`,
			authProtocol: connection.authProtocol,
		};
	},
	getClientHello: getDesktopHello,
	onCapabilitiesChanged: (listener: () => void): (() => void) => {
		return window.electronAPI.browser.settings.onChanged((settings): void => {
			browserToolsEnabled = settings.aiCdpEnabled;
			listener();
		});
	},
	onBackendConnected: attachScheduledTaskToolRuntime,
	system: {
		clipboard: {
			writeText: async (text: string): Promise<void> => { await window.electronAPI.clipboard.writeText(text); },
			readText: async (): Promise<string> => (await window.electronAPI.clipboard.readText()).text,
			readImage: async () => await window.electronAPI.clipboard.readImage(),
		},
		openSettings: async (page: string): Promise<void> => await window.electronAPI.windowControl.openSettings(page),
		saveText: async (params) => await window.electronAPI.fileExport.saveText(params),
		savePng: async (params) => await window.electronAPI.imageExport.savePng(params),
		workspaceFiles: {
			openFile: async (params) => await window.electronAPI.workspaceFs.openFile(params),
			revealFile: async (params) => await window.electronAPI.workspaceFs.revealFile(params),
			saveFileAs: async (params) => await window.electronAPI.workspaceFs.saveFileAs(params),
			openLaunchTarget: async (params) => await window.electronAPI.workspaceFs.openLaunchTarget({
				...params,
				targetId: params.targetId as Parameters<typeof window.electronAPI.workspaceFs.openLaunchTarget>[0]["targetId"],
			}),
		},
	},
};

import type { PlatformRuntime, RuntimeClientHello } from "./platform-runtime";
import { attachScheduledTaskToolRuntime } from "@/platform/rpc/transport/scheduled-task-tool-runtime";

let browserToolsEnabled: boolean = false;

async function getDesktopHello(): Promise<RuntimeClientHello> {
	let computerObservation = false, computerControl = false;
	try { const state = await window.electronAPI.computerObservation?.getState(); computerObservation = state?.enabled === true && state.available; computerControl = computerObservation && state?.controlEnabled === true && state.controlSupported === true; } catch { /* optional Windows capability */ }
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
			computerObservation,
			computerControl,
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
	getCapabilityUpdate: async (features) => {
		const { capabilities } = await getDesktopHello();
		const updates: Record<string, boolean> = {};
		if (features.externalBrowser === 1) {
			updates.externalBrowser = false;
			try { const state = await window.electronAPI.externalBrowser?.getState(); updates.externalBrowser = state?.enabled === true && state.available; } catch { /* 可选扩展能力失败时关闭 */ }
		}
		if (features.godotRuntimeTest === 1) updates.godotRuntimeTest = true;
		for (const key of ["browserTools", "computerObservation", "computerControl", "scheduledTasks"])
			updates[key] = capabilities[key];
		// 新字段仅出现在已协商的更新中，不放进首次 hello
		if (features.computerGrounding === 1) {
			updates.computerGrounding = false;
			try {
				const state = await window.electronAPI.computerObservation?.getState();
				updates.computerObservation = state?.enabled === true && state.available;
				updates.computerControl = updates.computerObservation && state?.controlEnabled === true && state.controlSupported === true;
				updates.computerGrounding = updates.computerObservation && state?.groundingSupported === true;
			} catch { /* 无法核验 Main 状态时不宣告 grounding */ }
		}
		return updates;
	},
	onCapabilitiesChanged: (listener: () => void): (() => void) => {
		let computerCapability = "";
		let externalCapability = "";
		const disposeExternal = window.electronAPI.externalBrowser?.onState(state => { const value = `${state.enabled}:${state.available}`; if (value !== externalCapability) { externalCapability = value; listener(); } });
		const disposeComputer = window.electronAPI.computerObservation?.onState(state => { const value = `${state.enabled}:${state.available}:${state.controlEnabled}:${state.controlSupported}:${state.groundingSupported}`; if (value !== computerCapability) { computerCapability = value; listener(); } });
		const disposeBrowser = window.electronAPI.browser.settings.onChanged((settings): void => {
			browserToolsEnabled = settings.aiCdpEnabled;
			listener();
		});
		return () => { disposeComputer?.(); disposeBrowser(); disposeExternal?.(); };
	},
	onBackendConnected: attachScheduledTaskToolRuntime,
	system: {
		get windowCapture() { return window.electronAPI.windowCapture; },
		get computerObservation() { return window.electronAPI.computerObservation; },
		get externalBrowser() { return window.electronAPI.externalBrowser; },
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

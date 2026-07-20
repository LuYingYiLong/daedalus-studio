import { contextBridge, ipcRenderer, webUtils } from "electron";

type ClientPreferences = {
	minimizeToTrayOnClose: boolean;
	theme: "system" | "light" | "dark";
	lastComposerModel: {
		providerId: string;
		modelId: string;
	} | null;
};

function getCachedClientPreferences(): ClientPreferences {
	return ipcRenderer.sendSync("client-preferences:get-cached") as ClientPreferences;
}

function resolveRendererTheme(themePreference: ClientPreferences["theme"]): "light" | "dark" {
	if (themePreference === "light" || themePreference === "dark") {
		return themePreference;
	}
	return globalThis.matchMedia?.("(prefers-color-scheme: light)").matches === true ? "light" : "dark";
}

const initialClientPreferences: ClientPreferences = getCachedClientPreferences();

function applyInitialTheme(): void {
	const rootElement: HTMLElement | null = document.documentElement;
	if (rootElement === null) {
		return;
	}
	rootElement.dataset.theme = resolveRendererTheme(initialClientPreferences.theme);
}

applyInitialTheme();
document.addEventListener("readystatechange", applyInitialTheme, { once: true });

contextBridge.exposeInMainWorld("electronAPI", {
	versions: {
		chrome: process.versions.chrome,
		electron: process.versions.electron,
		node: process.versions.node
	},

	backend: {
		getPort: (): Promise<number> => ipcRenderer.invoke("backend:get-port"),
		getStatus: (): Promise<string> => ipcRenderer.invoke("backend:get-status"),
		healthCheck: (): Promise<boolean> => ipcRenderer.invoke("backend:health-check"),
		onStatusChanged: (callback: (status: string) => void): (() => void) => {
			const handler = (_event: Electron.IpcRendererEvent, status: string): void => callback(status);
			ipcRenderer.on("backend:status-changed", handler);
			return () => { ipcRenderer.removeListener("backend:status-changed", handler); };
		}
	},

	clientPreferences: {
		getCached: (): { minimizeToTrayOnClose: boolean; theme: "system" | "light" | "dark"; lastComposerModel: { providerId: string; modelId: string } | null } => {
			return initialClientPreferences;
		},
		get: (): Promise<{ minimizeToTrayOnClose: boolean; theme: "system" | "light" | "dark"; lastComposerModel: { providerId: string; modelId: string } | null }> => {
			return ipcRenderer.invoke("client-preferences:get");
		},
		update: (patch: Partial<{ minimizeToTrayOnClose: boolean; theme: "system" | "light" | "dark"; lastComposerModel: { providerId: string; modelId: string } | null }>): Promise<{ minimizeToTrayOnClose: boolean; theme: "system" | "light" | "dark"; lastComposerModel: { providerId: string; modelId: string } | null }> => {
			return ipcRenderer.invoke("client-preferences:update", patch);
		}
	},

	clipboard: {
		writeText: (text: string): Promise<{ written: true }> => {
			return ipcRenderer.invoke("clipboard:write-text", text);
		}
	},

	terminal: {
		create: (params: { terminalId?: string | null; cwd?: string | null; cols: number; rows: number }): Promise<{ terminalId: string; shell: string; cwd: string; running: boolean }> => {
			return ipcRenderer.invoke("terminal:create", params);
		},
		write: (params: { terminalId: string; data: string }): Promise<{ written: true }> => {
			return ipcRenderer.invoke("terminal:write", params);
		},
		resize: (params: { terminalId: string; cols: number; rows: number }): Promise<{ resized: true }> => {
			return ipcRenderer.invoke("terminal:resize", params);
		},
		kill: (params: { terminalId: string }): Promise<{ killed: true }> => {
			return ipcRenderer.invoke("terminal:kill", params);
		},
		getState: (params?: { terminalId?: string | null }): Promise<{ terminalId: string; shell: string; cwd: string; running: boolean } | null> => {
			return ipcRenderer.invoke("terminal:get-state", params);
		},
		onData: (callback: (event: { terminalId: string; data: string }) => void): (() => void) => {
			const handler = (_event: Electron.IpcRendererEvent, payload: { terminalId: string; data: string }): void => callback(payload);
			ipcRenderer.on("terminal:data", handler);
			return () => { ipcRenderer.removeListener("terminal:data", handler); };
		},
		onExit: (callback: (event: { terminalId: string; exitCode: number; signal: number | string | null }) => void): (() => void) => {
			const handler = (_event: Electron.IpcRendererEvent, payload: { terminalId: string; exitCode: number; signal: number | string | null }): void => callback(payload);
			ipcRenderer.on("terminal:exit", handler);
			return () => { ipcRenderer.removeListener("terminal:exit", handler); };
		}
	},

	sessionFs: {
		openSessionDirectory: (sessionId: string): Promise<{ opened: true }> => {
			return ipcRenderer.invoke("session-fs:open-directory", sessionId);
		}
	},

	workspaceFs: {
		listChildren: (params: { workspaceRoot: string; relativePath?: string }): Promise<{ entries: Array<{ name: string; relativePath: string; resourcePath: string; kind: "file" | "folder" }> }> => {
			return ipcRenderer.invoke("workspace-fs:list-children", params);
		},
		pickWorkspaceDirectory: (): Promise<string | null> => {
			return ipcRenderer.invoke("workspace-fs:pick-directory");
		},
		pickWorkspaceFiles: (params: { workspaceRoot: string }): Promise<Array<{ name: string; relativePath: string; resourcePath: string; kind: "file" | "folder" }> | null> => {
			return ipcRenderer.invoke("workspace-fs:pick-files", params);
		},
		pickWorkspaceFolder: (params: { workspaceRoot: string }): Promise<Array<{ name: string; relativePath: string; resourcePath: string; kind: "file" | "folder" }> | null> => {
			return ipcRenderer.invoke("workspace-fs:pick-folder", params);
		},
		getPathForFile: (file: File): string => {
			return webUtils.getPathForFile(file);
		},
		createEntriesFromPaths: (params: { workspaceRoot: string; paths: string[] }): Promise<Array<{ name: string; relativePath: string; resourcePath: string; kind: "file" | "folder" }>> => {
			return ipcRenderer.invoke("workspace-fs:create-entries-from-paths", params);
		},
		openWorkspaceDirectory: (workspaceRoot: string): Promise<{ opened: true }> => {
			return ipcRenderer.invoke("workspace-fs:open-directory", workspaceRoot);
		},
		listLaunchTargets: (): Promise<Array<{ id: "file-explorer" | "terminal" | "vscode" | "visual-studio" | "github-desktop" | "git-bash"; label: string }>> => {
			return ipcRenderer.invoke("workspace-fs:list-launch-targets");
		},
		openLaunchTarget: (params: { workspaceRoot: string; targetId: "file-explorer" | "terminal" | "vscode" | "visual-studio" | "github-desktop" | "git-bash" }): Promise<{ opened: true; targetId: "file-explorer" | "terminal" | "vscode" | "visual-studio" | "github-desktop" | "git-bash" }> => {
			return ipcRenderer.invoke("workspace-fs:open-launch-target", params);
		}
	},

	skillFs: {
		pickSkillZip: (): Promise<string | null> => {
			return ipcRenderer.invoke("skill-fs:pick-zip");
		},
		pickSkillDirectory: (): Promise<string | null> => {
			return ipcRenderer.invoke("skill-fs:pick-directory");
		}
	},

	checkDiskSpace: (driveLetter: string): Promise<{ drive: string; free: number; total: number } | null> => {
		return ipcRenderer.invoke("electron:checkDiskSpace", driveLetter);
	},

	appInfo: {
		getPackageInfo: (): Promise<{ name: string; version: string; description: string; license: string; author: string }> => {
			return ipcRenderer.invoke("app:get-package-info");
		}
	}
});

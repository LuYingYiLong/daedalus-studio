import { contextBridge, ipcRenderer } from "electron";

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
		openWorkspaceDirectory: (workspaceRoot: string): Promise<{ opened: true }> => {
			return ipcRenderer.invoke("workspace-fs:open-directory", workspaceRoot);
		}
	},

	skillFs: {
		pickSkillZip: (): Promise<string | null> => {
			return ipcRenderer.invoke("skill-fs:pick-zip");
		},
		pickSkillDirectory: (): Promise<string | null> => {
			return ipcRenderer.invoke("skill-fs:pick-directory");
		}
	}
});

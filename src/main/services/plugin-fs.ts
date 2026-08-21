import { BrowserWindow, dialog, ipcMain } from "electron";

export type PluginFsPickPathResult = string | null;

function getSelectedPath(result: Electron.OpenDialogReturnValue): PluginFsPickPathResult {
	return result.canceled ? null : result.filePaths[0] ?? null;
}

async function showPicker(owner: BrowserWindow | undefined, options: Electron.OpenDialogOptions): Promise<PluginFsPickPathResult> {
	const result: Electron.OpenDialogReturnValue = owner === undefined
		? await dialog.showOpenDialog(options)
		: await dialog.showOpenDialog(owner, options);
	return getSelectedPath(result);
}

export function pickPluginDirectory(owner: BrowserWindow | undefined): Promise<PluginFsPickPathResult> {
	return showPicker(owner, {
		title: "Select plugin folder",
		properties: ["openDirectory"],
	});
}

export function pickPluginTarball(owner: BrowserWindow | undefined): Promise<PluginFsPickPathResult> {
	return showPicker(owner, {
		title: "Select plugin package",
		properties: ["openFile"],
		filters: [{ name: "Plugin package", extensions: ["tgz"] }],
	});
}

export function registerPluginFsIpc(): void {
	ipcMain.handle("plugin-fs:pick-directory", async (event): Promise<PluginFsPickPathResult> => {
		return pickPluginDirectory(BrowserWindow.fromWebContents(event.sender) ?? undefined);
	});
	ipcMain.handle("plugin-fs:pick-tarball", async (event): Promise<PluginFsPickPathResult> => {
		return pickPluginTarball(BrowserWindow.fromWebContents(event.sender) ?? undefined);
	});
}

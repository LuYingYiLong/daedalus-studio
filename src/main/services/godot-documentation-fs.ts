import { BrowserWindow, dialog, ipcMain } from "electron";

export type GodotDocumentationSourcePath = string | null;

function getSelectedPath(result: Electron.OpenDialogReturnValue): GodotDocumentationSourcePath {
	return result.canceled ? null : result.filePaths[0] ?? null;
}

async function pickDocumentationDirectory(owner: BrowserWindow | undefined): Promise<GodotDocumentationSourcePath> {
	const options: Electron.OpenDialogOptions = {
		title: "Select godot-docs folder",
		properties: ["openDirectory"]
	};
	const result: Electron.OpenDialogReturnValue = owner === undefined
		? await dialog.showOpenDialog(options)
		: await dialog.showOpenDialog(owner, options);
	return getSelectedPath(result);
}

async function pickDocumentationZip(owner: BrowserWindow | undefined): Promise<GodotDocumentationSourcePath> {
	const options: Electron.OpenDialogOptions = {
		title: "Select godot-docs ZIP",
		properties: ["openFile"],
		filters: [{ name: "ZIP archive", extensions: ["zip"] }]
	};
	const result: Electron.OpenDialogReturnValue = owner === undefined
		? await dialog.showOpenDialog(options)
		: await dialog.showOpenDialog(owner, options);
	return getSelectedPath(result);
}

export function registerGodotDocumentationFsIpc(): void {
	ipcMain.handle("godot-documentation-fs:pick-directory", async (event): Promise<GodotDocumentationSourcePath> => {
		return pickDocumentationDirectory(BrowserWindow.fromWebContents(event.sender) ?? undefined);
	});
	ipcMain.handle("godot-documentation-fs:pick-zip", async (event): Promise<GodotDocumentationSourcePath> => {
		return pickDocumentationZip(BrowserWindow.fromWebContents(event.sender) ?? undefined);
	});
}

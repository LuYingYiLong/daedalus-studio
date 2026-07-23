import { BrowserWindow, dialog, ipcMain } from "electron";

export async function pickGodotExecutable(owner: BrowserWindow | undefined): Promise<string | null> {
	const options: Electron.OpenDialogOptions = {
		title: "Select Godot executable",
		properties: ["openFile"],
		filters: process.platform === "win32"
			? [
				{ name: "Godot executable", extensions: ["exe"] },
				{ name: "All files", extensions: ["*"] }
			]
			: undefined
	};
	const result: Electron.OpenDialogReturnValue = owner === undefined
		? await dialog.showOpenDialog(options)
		: await dialog.showOpenDialog(owner, options);

	if (result.canceled) {
		return null;
	}

	return result.filePaths[0] ?? null;
}

export function registerGodotExecutableDialogIpc(): void {
	ipcMain.handle("godot-executable:pick", async (event): Promise<string | null> => {
		return pickGodotExecutable(BrowserWindow.fromWebContents(event.sender) ?? undefined);
	});
}

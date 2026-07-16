import { BrowserWindow, dialog, ipcMain } from "electron";

export type SkillFsPickPathResult = string | null;

export function getPickedSkillPath(result: Electron.OpenDialogReturnValue): SkillFsPickPathResult {
	if (result.canceled) {
		return null;
	}

	return result.filePaths[0] ?? null;
}

export async function pickSkillZip(owner: BrowserWindow | undefined): Promise<SkillFsPickPathResult> {
	const options: Electron.OpenDialogOptions = {
		title: "Select skill ZIP",
		properties: ["openFile"],
		filters: [
			{ name: "Skill ZIP", extensions: ["zip"] }
		]
	};
	const result: Electron.OpenDialogReturnValue = owner === undefined
		? await dialog.showOpenDialog(options)
		: await dialog.showOpenDialog(owner, options);

	return getPickedSkillPath(result);
}

export async function pickSkillDirectory(owner: BrowserWindow | undefined): Promise<SkillFsPickPathResult> {
	const options: Electron.OpenDialogOptions = {
		title: "Select skill folder",
		properties: ["openDirectory"]
	};
	const result: Electron.OpenDialogReturnValue = owner === undefined
		? await dialog.showOpenDialog(options)
		: await dialog.showOpenDialog(owner, options);

	return getPickedSkillPath(result);
}

export function registerSkillFsIpc(): void {
	ipcMain.handle("skill-fs:pick-zip", async (event): Promise<SkillFsPickPathResult> => {
		return pickSkillZip(BrowserWindow.fromWebContents(event.sender) ?? undefined);
	});
	ipcMain.handle("skill-fs:pick-directory", async (event): Promise<SkillFsPickPathResult> => {
		return pickSkillDirectory(BrowserWindow.fromWebContents(event.sender) ?? undefined);
	});
}

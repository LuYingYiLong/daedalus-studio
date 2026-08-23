import { BrowserWindow, dialog, ipcMain, shell } from "electron";
import { realpath } from "node:fs/promises";
import { basename, join, resolve, sep } from "node:path";
import { getDaedalusDir } from "./backend-binary-store";

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

function isPathInside(root: string, candidate: string): boolean {
	const normalizedRoot = resolve(root);
	const normalizedCandidate = resolve(candidate);
	return normalizedCandidate !== normalizedRoot && normalizedCandidate.startsWith(`${normalizedRoot}${sep}`);
}

export async function openManagedPluginDirectory(owner: BrowserWindow | undefined, directoryName: string): Promise<void> {
	if (owner === undefined) {
		throw new Error("plugin_fs_sender_not_allowed");
	}
	if (typeof directoryName !== "string" || directoryName.length === 0 || basename(directoryName) !== directoryName || /[<>:"/\\|?*]/u.test(directoryName)) {
		throw new Error("plugin_fs_path_invalid");
	}
	const root = resolve(join(getDaedalusDir(), "plugins", "packages"));
	const target = join(root, directoryName);
	if (!isPathInside(root, target)) throw new Error("plugin_fs_path_escape");
	const [realRoot, realTarget] = await Promise.all([
		realpath(root).catch(() => root),
		realpath(target).catch(() => null),
	]);
	if (realTarget === null || !isPathInside(realRoot, realTarget)) {
		throw new Error("plugin_fs_path_escape");
	}
	const error = await shell.openPath(target);
	if (error.length > 0) throw new Error(error);
}

export function registerPluginFsIpc(): void {
	ipcMain.handle("plugin-fs:pick-directory", async (event): Promise<PluginFsPickPathResult> => {
		return pickPluginDirectory(BrowserWindow.fromWebContents(event.sender) ?? undefined);
	});
	ipcMain.handle("plugin-fs:pick-tarball", async (event): Promise<PluginFsPickPathResult> => {
		return pickPluginTarball(BrowserWindow.fromWebContents(event.sender) ?? undefined);
	});
	ipcMain.handle("plugin-fs:open-directory", async (event, directoryName: unknown): Promise<void> => {
		await openManagedPluginDirectory(BrowserWindow.fromWebContents(event.sender) ?? undefined, directoryName as string);
	});
}

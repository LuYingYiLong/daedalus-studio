import { BrowserWindow, dialog, ipcMain, shell } from "electron";
import { readdir, stat } from "node:fs/promises";
import { basename, isAbsolute, relative, resolve, sep } from "node:path";

export type WorkspaceFsEntry = {
	name: string;
	relativePath: string;
	resourcePath: string;
	kind: "file" | "folder";
};

export type WorkspaceFsListChildrenParams = {
	workspaceRoot: string;
	relativePath?: string;
};

export type WorkspaceFsListChildrenResult = {
	entries: WorkspaceFsEntry[];
};

export type WorkspaceFsPickDirectoryResult = string | null;
export type WorkspaceFsPickEntriesParams = {
	workspaceRoot: string;
};
export type WorkspaceFsPickEntriesResult = WorkspaceFsEntry[] | null;
export type WorkspaceFsOpenDirectoryResult = {
	opened: true;
};

function isPathInside(root: string, target: string): boolean {
	const relativePath: string = relative(root, target);
	return relativePath.length === 0 || (!relativePath.startsWith(`..${sep}`) && relativePath !== ".." && !isAbsolute(relativePath));
}

function assertInsideWorkspace(workspaceRoot: string, relativePath: string | undefined): { root: string; target: string; relativePath: string } {
	const root: string = resolve(workspaceRoot);
	const requestedRelativePath: string = relativePath ?? "";
	const target: string = resolve(root, requestedRelativePath);

	if (!isPathInside(root, target)) {
		throw new Error("Path is outside workspace root.");
	}

	const targetRelativePath: string = relative(root, target);
	return {
		root,
		target,
		relativePath: targetRelativePath === "" ? "" : targetRelativePath.replaceAll("\\", "/")
	};
}

function toResourcePath(relativePath: string): string {
	return relativePath.length === 0 ? "res://" : `res://${relativePath}`;
}

export async function createWorkspaceEntryFromAbsolutePath(workspaceRoot: string, selectedPath: string, expectedKind: "file" | "folder"): Promise<WorkspaceFsEntry> {
	const root: string = resolve(workspaceRoot);
	const target: string = resolve(selectedPath);
	if (!isPathInside(root, target)) {
		throw new Error("Selected path is outside workspace root.");
	}

	const targetStats = await stat(target);
	const kind: "file" | "folder" = targetStats.isDirectory() ? "folder" : targetStats.isFile() ? "file" : expectedKind;
	if (kind !== expectedKind) {
		throw new Error(`Selected path is not a ${expectedKind}.`);
	}

	const relativePath: string = relative(root, target).replaceAll("\\", "/");
	return {
		name: basename(target),
		relativePath,
		resourcePath: toResourcePath(relativePath),
		kind
	};
}

export async function listWorkspaceChildren(params: WorkspaceFsListChildrenParams): Promise<WorkspaceFsListChildrenResult> {
	const scopedPath = assertInsideWorkspace(params.workspaceRoot, params.relativePath);
	const dirents = await readdir(scopedPath.target, { withFileTypes: true });
	const entries: WorkspaceFsEntry[] = dirents
		.filter((dirent): boolean => dirent.isDirectory() || dirent.isFile())
		.map((dirent): WorkspaceFsEntry => {
			const relativePath: string = [scopedPath.relativePath, dirent.name]
				.filter((part: string): boolean => part.length > 0)
				.join("/")
				.replaceAll("\\", "/");

			return {
				name: dirent.name,
				relativePath,
				resourcePath: toResourcePath(relativePath),
				kind: dirent.isDirectory() ? "folder" : "file"
			};
		})
		.sort((left: WorkspaceFsEntry, right: WorkspaceFsEntry): number => {
			if (left.kind !== right.kind) {
				return left.kind === "folder" ? -1 : 1;
			}

			return left.name.localeCompare(right.name);
		});

	return { entries };
}

export function getPickedWorkspaceDirectory(result: Electron.OpenDialogReturnValue): WorkspaceFsPickDirectoryResult {
	if (result.canceled) {
		return null;
	}

	return result.filePaths[0] ?? null;
}

export async function pickWorkspaceDirectory(owner: BrowserWindow | undefined): Promise<WorkspaceFsPickDirectoryResult> {
	const options: Electron.OpenDialogOptions = {
		title: "Select Godot project workspace",
		properties: ["openDirectory"]
	};
	const result: Electron.OpenDialogReturnValue = owner === undefined
		? await dialog.showOpenDialog(options)
		: await dialog.showOpenDialog(owner, options);

	return getPickedWorkspaceDirectory(result);
}

export async function pickWorkspaceFiles(owner: BrowserWindow | undefined, params: WorkspaceFsPickEntriesParams): Promise<WorkspaceFsPickEntriesResult> {
	const options: Electron.OpenDialogOptions = {
		title: "Add files from workspace",
		defaultPath: params.workspaceRoot,
		properties: ["openFile", "multiSelections"]
	};
	const result: Electron.OpenDialogReturnValue = owner === undefined
		? await dialog.showOpenDialog(options)
		: await dialog.showOpenDialog(owner, options);
	if (result.canceled) {
		return null;
	}

	return Promise.all(result.filePaths.map((filePath: string): Promise<WorkspaceFsEntry> => {
		return createWorkspaceEntryFromAbsolutePath(params.workspaceRoot, filePath, "file");
	}));
}

export async function pickWorkspaceFolder(owner: BrowserWindow | undefined, params: WorkspaceFsPickEntriesParams): Promise<WorkspaceFsPickEntriesResult> {
	const options: Electron.OpenDialogOptions = {
		title: "Add folder from workspace",
		defaultPath: params.workspaceRoot,
		properties: ["openDirectory"]
	};
	const result: Electron.OpenDialogReturnValue = owner === undefined
		? await dialog.showOpenDialog(options)
		: await dialog.showOpenDialog(owner, options);
	if (result.canceled) {
		return null;
	}
	const selectedPath: string | undefined = result.filePaths[0];
	if (selectedPath === undefined) {
		return null;
	}

	return [await createWorkspaceEntryFromAbsolutePath(params.workspaceRoot, selectedPath, "folder")];
}

export async function openWorkspaceDirectory(
	workspaceRoot: string,
	openPath: (path: string) => Promise<string> = shell.openPath
): Promise<WorkspaceFsOpenDirectoryResult> {
	const root: string = resolve(workspaceRoot);
	const rootStats = await stat(root);
	if (!rootStats.isDirectory()) {
		throw new Error("Workspace root is not a directory.");
	}

	const openError: string = await openPath(root);
	if (openError.trim().length > 0) {
		throw new Error(openError);
	}

	return { opened: true };
}

export function registerWorkspaceFsIpc(): void {
	ipcMain.handle("workspace-fs:list-children", async (_event, params: WorkspaceFsListChildrenParams): Promise<WorkspaceFsListChildrenResult> => {
		return listWorkspaceChildren(params);
	});
	ipcMain.handle("workspace-fs:pick-directory", async (event): Promise<WorkspaceFsPickDirectoryResult> => {
		return pickWorkspaceDirectory(BrowserWindow.fromWebContents(event.sender) ?? undefined);
	});
	ipcMain.handle("workspace-fs:pick-files", async (event, params: WorkspaceFsPickEntriesParams): Promise<WorkspaceFsPickEntriesResult> => {
		return pickWorkspaceFiles(BrowserWindow.fromWebContents(event.sender) ?? undefined, params);
	});
	ipcMain.handle("workspace-fs:pick-folder", async (event, params: WorkspaceFsPickEntriesParams): Promise<WorkspaceFsPickEntriesResult> => {
		return pickWorkspaceFolder(BrowserWindow.fromWebContents(event.sender) ?? undefined, params);
	});
	ipcMain.handle("workspace-fs:open-directory", async (_event, workspaceRoot: string): Promise<WorkspaceFsOpenDirectoryResult> => {
		return openWorkspaceDirectory(workspaceRoot);
	});
}

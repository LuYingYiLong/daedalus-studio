import { BrowserWindow, dialog, ipcMain, shell } from "electron";
import { readdir, stat } from "node:fs/promises";
import { relative, resolve, sep } from "node:path";

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
export type WorkspaceFsOpenDirectoryResult = {
	opened: true;
};

function assertInsideWorkspace(workspaceRoot: string, relativePath: string | undefined): { root: string; target: string; relativePath: string } {
	const root: string = resolve(workspaceRoot);
	const requestedRelativePath: string = relativePath ?? "";
	const target: string = resolve(root, requestedRelativePath);
	const targetRelativePath: string = relative(root, target);
	const escaped: boolean = targetRelativePath.startsWith(`..${sep}`) || targetRelativePath === ".." || resolve(target) === resolve(root, "..");

	if (escaped) {
		throw new Error("Path is outside workspace root.");
	}

	return {
		root,
		target,
		relativePath: targetRelativePath === "" ? "" : targetRelativePath.replaceAll("\\", "/")
	};
}

function toResourcePath(relativePath: string): string {
	return relativePath.length === 0 ? "res://" : `res://${relativePath}`;
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
	ipcMain.handle("workspace-fs:open-directory", async (_event, workspaceRoot: string): Promise<WorkspaceFsOpenDirectoryResult> => {
		return openWorkspaceDirectory(workspaceRoot);
	});
}

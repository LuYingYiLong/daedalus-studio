import { BrowserWindow, dialog, ipcMain, shell } from "electron";
import { access, readdir, stat } from "node:fs/promises";
import { execFile, spawn } from "node:child_process";
import { basename, isAbsolute, join, relative, resolve, sep } from "node:path";

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
export type WorkspaceFsCreateEntriesFromPathsParams = {
	workspaceRoot: string;
	paths: string[];
};
export type WorkspaceFsOpenDirectoryResult = {
	opened: true;
};
export type WorkspaceLaunchTargetId = "file-explorer" | "terminal" | "vscode" | "visual-studio" | "github-desktop" | "git-bash";
export type WorkspaceLaunchTarget = {
	id: WorkspaceLaunchTargetId;
	label: string;
};
export type WorkspaceLaunchTargetResult = {
	opened: true;
	targetId: WorkspaceLaunchTargetId;
};
type ResolvedWorkspaceLaunchTarget = WorkspaceLaunchTarget & {
	command?: string | undefined;
	args?: string[] | undefined;
	useShell?: boolean | undefined;
};
export type WorkspaceLaunchDetectionOptions = {
	platform?: NodeJS.Platform | undefined;
	env?: NodeJS.ProcessEnv | undefined;
	pathExists?: ((path: string) => Promise<boolean>) | undefined;
	findOnPath?: ((command: string) => Promise<string | null>) | undefined;
	readDirectory?: typeof readdir | undefined;
};
export type WorkspaceLaunchSpawnOptions = WorkspaceLaunchDetectionOptions & {
	spawnProcess?: ((command: string, args: string[], options: { cwd: string; detached: true; stdio: "ignore"; windowsHide: false; shell?: boolean | undefined }) => { unref(): void }) | undefined;
};

const BASE_LAUNCH_TARGETS: WorkspaceLaunchTarget[] = [
	{ id: "file-explorer", label: "File Explorer" },
	{ id: "terminal", label: "Terminal" }
];
const OPTIONAL_LAUNCH_TARGET_IDS: WorkspaceLaunchTargetId[] = ["vscode", "visual-studio", "github-desktop", "git-bash"];

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

function getEnvValue(env: NodeJS.ProcessEnv, key: string): string | undefined {
	return env[key] ?? env[key.toUpperCase()] ?? env[key.toLowerCase()];
}

function compactPaths(paths: Array<string | null | undefined>): string[] {
	return paths.filter((path): path is string => path !== null && path !== undefined && path.trim().length > 0);
}

async function defaultPathExists(targetPath: string): Promise<boolean> {
	try {
		await access(targetPath);
		return true;
	} catch {
		return false;
	}
}

async function defaultFindOnPath(command: string, platform: NodeJS.Platform): Promise<string | null> {
	const lookupCommand: string = platform === "win32" ? "where.exe" : "which";
	return new Promise<string | null>((resolveLookup): void => {
		execFile(lookupCommand, [command], { windowsHide: true }, (error, stdout): void => {
			if (error !== null) {
				resolveLookup(null);
				return;
			}

			const match: string | undefined = stdout
				.split(/\r?\n/u)
				.map((line: string): string => line.trim())
				.find((line: string): boolean => line.length > 0);
			resolveLookup(match ?? null);
		});
	});
}

async function findFirstExistingPath(paths: readonly string[], pathExists: (path: string) => Promise<boolean>): Promise<string | null> {
	for (const candidatePath of paths) {
		if (await pathExists(candidatePath)) {
			return candidatePath;
		}
	}

	return null;
}

async function findGitHubDesktopPath(options: Required<Pick<WorkspaceLaunchDetectionOptions, "env" | "pathExists" | "readDirectory">>): Promise<string | null> {
	const localAppData: string | undefined = getEnvValue(options.env, "LOCALAPPDATA");
	if (localAppData === undefined) {
		return null;
	}

	const root: string = join(localAppData, "GitHubDesktop");
	const directPath: string = join(root, "GitHubDesktop.exe");
	if (await options.pathExists(directPath)) {
		return directPath;
	}

	try {
		const entries = await options.readDirectory(root, { withFileTypes: true });
		const appDirs: string[] = entries
			.filter((entry): boolean => entry.isDirectory() && /^app-/u.test(entry.name))
			.map((entry): string => entry.name)
			.sort((left: string, right: string): number => right.localeCompare(left, undefined, { numeric: true }));
		for (const dirName of appDirs) {
			const candidatePath: string = join(root, dirName, "GitHubDesktop.exe");
			if (await options.pathExists(candidatePath)) {
				return candidatePath;
			}
		}
	} catch {
		return null;
	}

	return null;
}

async function resolveWorkspaceLaunchTarget(targetId: WorkspaceLaunchTargetId, options: WorkspaceLaunchDetectionOptions = {}): Promise<ResolvedWorkspaceLaunchTarget | null> {
	const platform: NodeJS.Platform = options.platform ?? process.platform;
	const env: NodeJS.ProcessEnv = options.env ?? process.env;
	const pathExists: (path: string) => Promise<boolean> = options.pathExists ?? defaultPathExists;
	const findOnPath: (command: string) => Promise<string | null> = options.findOnPath ?? ((command: string): Promise<string | null> => defaultFindOnPath(command, platform));
	const readDirectory: typeof readdir = options.readDirectory ?? readdir;
	const localAppData: string | undefined = getEnvValue(env, "LOCALAPPDATA");
	const programFiles: string | undefined = getEnvValue(env, "ProgramFiles");
	const programFilesX86: string | undefined = getEnvValue(env, "ProgramFiles(x86)");

	if (targetId === "file-explorer") {
		return BASE_LAUNCH_TARGETS[0]!;
	}
	if (targetId === "terminal") {
		if (platform === "win32") {
			const pwshPath: string | null = await findOnPath("pwsh.exe");
			if (pwshPath !== null) {
				return { id: "terminal", label: "Terminal", command: pwshPath, args: ["-NoExit"] };
			}
			const powershellPath: string | null = await findOnPath("powershell.exe");
			if (powershellPath !== null) {
				return { id: "terminal", label: "Terminal", command: powershellPath, args: ["-NoExit"] };
			}
			return { id: "terminal", label: "Terminal", command: "cmd.exe", args: ["/K"] };
		}

		const terminalPath: string | null = await findOnPath(platform === "darwin" ? "open" : "x-terminal-emulator");
		return terminalPath === null ? null : { id: "terminal", label: "Terminal", command: terminalPath, args: platform === "darwin" ? ["-a", "Terminal"] : [] };
	}
	if (targetId === "vscode") {
		const codePath: string | null = await findFirstExistingPath(compactPaths([
			localAppData === undefined ? undefined : join(localAppData, "Programs", "Microsoft VS Code", "Code.exe"),
			programFiles === undefined ? undefined : join(programFiles, "Microsoft VS Code", "Code.exe"),
			programFilesX86 === undefined ? undefined : join(programFilesX86, "Microsoft VS Code", "Code.exe"),
			await findOnPath(platform === "win32" ? "code.cmd" : "code")
		]), pathExists);
		return codePath === null ? null : { id: "vscode", label: "Visual Studio Code", command: codePath, args: [], useShell: /\.cmd$/iu.test(codePath) };
	}
	if (targetId === "visual-studio") {
		const editions: string[] = ["Enterprise", "Professional", "Community"];
		const years: string[] = ["2022", "2019"];
		const candidates: string[] = compactPaths([
			...years.flatMap((year: string): string[] => editions.flatMap((edition: string): string[] => compactPaths([
				programFiles === undefined ? undefined : join(programFiles, "Microsoft Visual Studio", year, edition, "Common7", "IDE", "devenv.exe"),
				programFilesX86 === undefined ? undefined : join(programFilesX86, "Microsoft Visual Studio", year, edition, "Common7", "IDE", "devenv.exe")
			])))
		]);
		const visualStudioPath: string | null = await findFirstExistingPath(candidates, pathExists);
		return visualStudioPath === null ? null : { id: "visual-studio", label: "Visual Studio", command: visualStudioPath, args: [] };
	}
	if (targetId === "github-desktop") {
		const githubDesktopPath: string | null = await findGitHubDesktopPath({ env, pathExists, readDirectory });
		return githubDesktopPath === null ? null : { id: "github-desktop", label: "GitHub Desktop", command: githubDesktopPath, args: [] };
	}
	if (targetId === "git-bash") {
		const gitBashPath: string | null = await findFirstExistingPath(compactPaths([
			programFiles === undefined ? undefined : join(programFiles, "Git", "git-bash.exe"),
			programFilesX86 === undefined ? undefined : join(programFilesX86, "Git", "git-bash.exe"),
			localAppData === undefined ? undefined : join(localAppData, "Programs", "Git", "git-bash.exe"),
			await findOnPath("git-bash.exe")
		]), pathExists);
		return gitBashPath === null ? null : { id: "git-bash", label: "Git Bash", command: gitBashPath, args: [] };
	}

	return null;
}

export async function listWorkspaceLaunchTargets(options: WorkspaceLaunchDetectionOptions = {}): Promise<WorkspaceLaunchTarget[]> {
	const targets: WorkspaceLaunchTarget[] = [...BASE_LAUNCH_TARGETS];
	for (const targetId of OPTIONAL_LAUNCH_TARGET_IDS) {
		const target: ResolvedWorkspaceLaunchTarget | null = await resolveWorkspaceLaunchTarget(targetId, options);
		if (target !== null) {
			targets.push({ id: target.id, label: target.label });
		}
	}

	return targets;
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

export async function createWorkspaceEntriesFromAbsolutePaths(params: WorkspaceFsCreateEntriesFromPathsParams): Promise<WorkspaceFsEntry[]> {
	const entries: WorkspaceFsEntry[] = [];
	const seenPaths: Set<string> = new Set();
	for (const selectedPath of params.paths) {
		const target: string = resolve(selectedPath);
		if (seenPaths.has(target)) {
			continue;
		}
		seenPaths.add(target);

		const root: string = resolve(params.workspaceRoot);
		if (!isPathInside(root, target)) {
			throw new Error("Selected path is outside workspace root.");
		}

		const targetStats = await stat(target);
		if (!targetStats.isDirectory() && !targetStats.isFile()) {
			continue;
		}

		entries.push(await createWorkspaceEntryFromAbsolutePath(
			params.workspaceRoot,
			target,
			targetStats.isDirectory() ? "folder" : "file"
		));
	}

	return entries;
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

export async function openWorkspaceLaunchTarget(
	workspaceRoot: string,
	targetId: WorkspaceLaunchTargetId,
	options: WorkspaceLaunchSpawnOptions = {}
): Promise<WorkspaceLaunchTargetResult> {
	const root: string = resolve(workspaceRoot);
	const rootStats = await stat(root);
	if (!rootStats.isDirectory()) {
		throw new Error("Workspace root is not a directory.");
	}

	if (targetId === "file-explorer") {
		await openWorkspaceDirectory(root);
		return { opened: true, targetId };
	}

	const target: ResolvedWorkspaceLaunchTarget | null = await resolveWorkspaceLaunchTarget(targetId, options);
	if (target === null || target.command === undefined) {
		throw new Error("Launch target is not available.");
	}

	const spawnProcess = options.spawnProcess ?? ((command: string, args: string[], spawnOptions: { cwd: string; detached: true; stdio: "ignore"; windowsHide: false; shell?: boolean | undefined }) => {
		return spawn(command, args, spawnOptions) as { unref(): void };
	});
	const args: string[] = target.id === "terminal"
		? target.args?.[0] === "-d"
			? ["-d", root]
			: target.args?.[0] === "-a"
				? [...target.args, root]
				: target.args ?? []
		: target.id === "git-bash"
			? [`--cd=${root}`]
			: [...(target.args ?? []), root];
	const child = spawnProcess(target.command, args, {
		cwd: root,
		detached: true,
		stdio: "ignore",
		windowsHide: false,
		shell: target.useShell
	});
	child.unref();

	return { opened: true, targetId };
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
	ipcMain.handle("workspace-fs:create-entries-from-paths", async (_event, params: WorkspaceFsCreateEntriesFromPathsParams): Promise<WorkspaceFsEntry[]> => {
		return createWorkspaceEntriesFromAbsolutePaths(params);
	});
	ipcMain.handle("workspace-fs:open-directory", async (_event, workspaceRoot: string): Promise<WorkspaceFsOpenDirectoryResult> => {
		return openWorkspaceDirectory(workspaceRoot);
	});
	ipcMain.handle("workspace-fs:list-launch-targets", async (): Promise<WorkspaceLaunchTarget[]> => {
		return listWorkspaceLaunchTargets();
	});
	ipcMain.handle("workspace-fs:open-launch-target", async (_event, params: { workspaceRoot: string; targetId: WorkspaceLaunchTargetId }): Promise<WorkspaceLaunchTargetResult> => {
		return openWorkspaceLaunchTarget(params.workspaceRoot, params.targetId);
	});
}

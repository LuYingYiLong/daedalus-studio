import { app, BrowserWindow, dialog, ipcMain, shell } from "electron";
import { existsSync } from "node:fs";
import { access, lstat, readFile, readdir, realpath, rename, rm, stat, writeFile } from "node:fs/promises";
import { execFile, spawn, type ChildProcess } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { basename, dirname, extname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { TextDecoder } from "node:util";
import { createWorkspaceMediaUrl, getWorkspaceMediaDescriptor, getWorkspaceMediaMaxByteSize, type WorkspaceMediaUrlResult } from "./workspace-media";
import { backendManager } from "./backend-manager";

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
export type WorkspaceFsSearchParams = {
	workspaceRoot: string;
	query: string;
	maxResults?: number;
};
export type WorkspaceFsSearchResult = {
	entries: WorkspaceFsEntry[];
	truncated: boolean;
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
export type WorkspaceFsFileParams = {
	workspaceRoot: string;
	filePath: string;
};
export type WorkspaceFsOpenFileResult = {
	opened: true;
};
export type WorkspaceFsRevealFileResult = {
	revealed: true;
};
export type WorkspaceFsSaveFileAsResult = {
	saved: true;
	filePath: string;
} | {
	saved: false;
};
export type WorkspaceFsFileRevision = {
	byteSize: number;
	modifiedAtMs: number;
	sha256: string;
};
export type WorkspaceFsReadTextFileResult = WorkspaceFsFileRevision & {
	readable: boolean;
	binary: boolean;
	oversized: boolean;
	relativePath: string;
	content?: string;
};
export type WorkspaceFsCreateMediaUrlResult = WorkspaceMediaUrlResult;
export type WorkspaceFsWriteTextFileParams = WorkspaceFsFileParams & {
	content: string;
	expectedSha256: string;
	expectedModifiedAtMs: number;
};
export type WorkspaceFsWriteTextFileResult = WorkspaceFsFileRevision & {
	saved: true;
	relativePath: string;
};
export type WorkspaceFsSaveTextFileAsParams = WorkspaceFsFileParams & {
	content: string;
};
export type WorkspaceLaunchTargetId = "file-explorer" | "terminal" | "vscode" | "visual-studio" | "github-desktop" | "git-bash" | "godot";
export type WorkspaceLaunchTarget = {
	id: WorkspaceLaunchTargetId;
	label: string;
};
export type WorkspaceLaunchTargetResult = {
	opened: true;
	targetId: WorkspaceLaunchTargetId;
};
export type WorkspaceGodotRuntimeTestStopResult = {
	stopped: boolean;
};
type ResolvedWorkspaceLaunchTarget = WorkspaceLaunchTarget & {
	command?: string | undefined;
	args?: string[] | undefined;
	useShell?: boolean | undefined;
};
export type WorkspaceLaunchDetectionOptions = {
	platform?: NodeJS.Platform | undefined;
	env?: NodeJS.ProcessEnv | undefined;
	godotExecutablePath?: string | null | undefined;
	godotRunMode?: "editor" | "project" | "scene" | undefined;
	godotScenePath?: string | undefined;
	godotRuntimeTest?: {
		testSessionId: string;
		testSessionToken: string;
		backendUrl?: string | undefined;
		backendDevDir?: string | undefined;
	} | undefined;
	pathExists?: ((path: string) => Promise<boolean>) | undefined;
	findOnPath?: ((command: string) => Promise<string | null>) | undefined;
	runCommand?: ((command: string, args: string[]) => Promise<string | null>) | undefined;
	readDirectory?: typeof readdir | undefined;
};
export type WorkspaceLaunchSpawnOptions = WorkspaceLaunchDetectionOptions & {
	filePath?: string;
	spawnProcess?: ((command: string, args: string[], options: { cwd: string; detached: boolean; stdio: "ignore"; windowsHide: false; shell?: boolean | undefined }) => WorkspaceLaunchChildProcess) | undefined;
};

type WorkspaceLaunchChildProcess = Pick<ChildProcess, "unref"> & Partial<Pick<ChildProcess, "exitCode" | "kill" | "killed" | "once" | "pid">>;

type ManagedGodotRuntimeProcess = {
	child: WorkspaceLaunchChildProcess;
	workspaceRoot: string;
};

const BASE_LAUNCH_TARGETS: WorkspaceLaunchTarget[] = [
	{ id: "file-explorer", label: "File Explorer" },
	{ id: "terminal", label: "Terminal" }
];
const OPTIONAL_LAUNCH_TARGET_IDS: WorkspaceLaunchTargetId[] = ["vscode", "visual-studio", "github-desktop", "git-bash", "godot"];
const MAX_EDITABLE_TEXT_BYTES: number = 2 * 1024 * 1024;
const DEFAULT_SEARCH_RESULT_LIMIT: number = 500;
const MAX_SEARCH_RESULT_LIMIT: number = 1000;
const MAX_SEARCH_QUERY_CHARS: number = 200;
const MAX_SEARCHED_ENTRIES: number = 50_000;
const UTF8_DECODER: TextDecoder = new TextDecoder("utf-8", { fatal: true });
const WORKSPACE_ENTRY_NAME_COLLATOR: Intl.Collator = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" });
const GODOT_RUNTIME_TEST_SESSION_PATTERN: RegExp = /^godot-test-[A-Za-z0-9-]{1,160}$/u;
const managedGodotRuntimeProcesses: Map<string, ManagedGodotRuntimeProcess> = new Map();

function forgetManagedGodotRuntimeProcess(testSessionId: string, child: WorkspaceLaunchChildProcess): void {
	if (managedGodotRuntimeProcesses.get(testSessionId)?.child === child) {
		managedGodotRuntimeProcesses.delete(testSessionId);
	}
}

function terminateManagedGodotRuntimeProcess(testSessionId: string): boolean {
	const managed: ManagedGodotRuntimeProcess | undefined = managedGodotRuntimeProcesses.get(testSessionId);
	if (managed === undefined) return false;
	managedGodotRuntimeProcesses.delete(testSessionId);
	if (managed.child.exitCode !== null && managed.child.exitCode !== undefined) return true;
	if (managed.child.killed === true || managed.child.kill === undefined) return true;
	try {
		managed.child.kill();
	} catch {
		// The process may have exited between the state check and kill.
	}
	return true;
}

export function stopGodotRuntimeTestProcess(testSessionId: string): WorkspaceGodotRuntimeTestStopResult {
	if (!GODOT_RUNTIME_TEST_SESSION_PATTERN.test(testSessionId)) {
		throw new Error("Invalid Godot runtime test session id.");
	}
	return { stopped: terminateManagedGodotRuntimeProcess(testSessionId) };
}

export function stopAllGodotRuntimeTestProcesses(): void {
	for (const testSessionId of [...managedGodotRuntimeProcesses.keys()]) {
		terminateManagedGodotRuntimeProcess(testSessionId);
	}
}

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

function assertWorkspaceFile(workspaceRoot: string, filePath: string): { root: string; target: string; relativePath: string } {
	const root: string = resolve(workspaceRoot);
	const target: string = resolve(isAbsolute(filePath) ? filePath : join(root, filePath));
	if (!isPathInside(root, target)) {
		throw new Error("File is outside workspace root.");
	}

	const targetRelativePath: string = relative(root, target);
	return {
		root,
		target,
		relativePath: targetRelativePath.replaceAll("\\", "/")
	};
}

async function resolveWorkspaceFile(params: WorkspaceFsFileParams): Promise<{ root: string; target: string; relativePath: string }> {
	const resolvedFile = await resolveWorkspaceEntry(params);
	const fileStats = await stat(resolvedFile.target);
	if (!fileStats.isFile()) {
		throw new Error("Workspace resource is not a file.");
	}
	return resolvedFile;
}

async function resolveWorkspaceOpenableEntry(params: WorkspaceFsFileParams): Promise<{ root: string; target: string; relativePath: string }> {
	const resolvedEntry = await resolveWorkspaceEntry(params);
	const entryStats = await stat(resolvedEntry.target);
	if (!entryStats.isFile() && !entryStats.isDirectory()) {
		throw new Error("Workspace resource is not a file or directory.");
	}
	return resolvedEntry;
}

async function resolveWorkspaceEntry(params: WorkspaceFsFileParams): Promise<{ root: string; target: string; relativePath: string }> {
	const resolvedEntry = assertWorkspaceFile(params.workspaceRoot, params.filePath);
	const [rootRealPath, targetRealPath] = await Promise.all([realpath(resolvedEntry.root), realpath(resolvedEntry.target)]);
	if (!isPathInside(rootRealPath, targetRealPath)) {
		throw new Error("Workspace resource resolves outside workspace root.");
	}
	return {
		root: rootRealPath,
		target: targetRealPath,
		relativePath: relative(rootRealPath, targetRealPath).replaceAll("\\", "/")
	};
}

function hashBytes(bytes: Uint8Array): string {
	return createHash("sha256").update(bytes).digest("hex");
}

function decodeEditableText(bytes: Buffer): { binary: boolean; content?: string } {
	if (bytes.includes(0)) {
		return { binary: true };
	}
	try {
		return { binary: false, content: UTF8_DECODER.decode(bytes) };
	} catch {
		return { binary: true };
	}
}

async function inspectWorkspaceTextFile(params: WorkspaceFsFileParams, includeContent: boolean): Promise<WorkspaceFsReadTextFileResult> {
	const resolvedFile = await resolveWorkspaceFile(params);
	const beforeStats = await stat(resolvedFile.target);
	if (beforeStats.size > MAX_EDITABLE_TEXT_BYTES) {
		return {
			readable: false,
			binary: false,
			oversized: true,
			byteSize: beforeStats.size,
			modifiedAtMs: beforeStats.mtimeMs,
			sha256: "",
			relativePath: resolvedFile.relativePath
		};
	}
	const bytes: Buffer = await readFile(resolvedFile.target);
	const afterStats = await stat(resolvedFile.target);
	const decoded = decodeEditableText(bytes);
	return {
		readable: !decoded.binary,
		binary: decoded.binary,
		oversized: false,
		byteSize: bytes.byteLength,
		modifiedAtMs: afterStats.mtimeMs,
		sha256: hashBytes(bytes),
		relativePath: resolvedFile.relativePath,
		...(includeContent && decoded.content !== undefined ? { content: decoded.content } : {})
	};
}

function encodeEditableText(content: string): Buffer {
	const bytes: Buffer = Buffer.from(content, "utf8");
	if (bytes.byteLength > MAX_EDITABLE_TEXT_BYTES) {
		throw new Error("Workspace text file exceeds the 2 MiB editor limit.");
	}
	if (bytes.includes(0)) {
		throw new Error("Workspace text file contains binary NUL bytes.");
	}
	return bytes;
}

export async function readWorkspaceTextFile(params: WorkspaceFsFileParams): Promise<WorkspaceFsReadTextFileResult> {
	return inspectWorkspaceTextFile(params, true);
}

export async function statWorkspaceFile(params: WorkspaceFsFileParams): Promise<WorkspaceFsReadTextFileResult> {
	return inspectWorkspaceTextFile(params, false);
}

export async function createWorkspaceMediaFileUrl(params: WorkspaceFsFileParams): Promise<WorkspaceFsCreateMediaUrlResult> {
	const resolvedFile = await resolveWorkspaceFile(params);
	const fileStats = await stat(resolvedFile.target);
	const descriptor = getWorkspaceMediaDescriptor(resolvedFile.relativePath);
	const baseResult: WorkspaceFsCreateMediaUrlResult = {
		supported: false,
		byteSize: fileStats.size,
		modifiedAtMs: fileStats.mtimeMs,
		relativePath: resolvedFile.relativePath
	};
	if (descriptor === null || fileStats.size > getWorkspaceMediaMaxByteSize()) return baseResult;
	return {
		...baseResult,
		supported: true,
		kind: descriptor.kind,
		mimeType: descriptor.mimeType,
		url: createWorkspaceMediaUrl({
			target: resolvedFile.target,
			relativePath: resolvedFile.relativePath,
			descriptor,
			byteSize: fileStats.size,
			modifiedAtMs: fileStats.mtimeMs
		})
	};
}

export async function writeWorkspaceTextFile(params: WorkspaceFsWriteTextFileParams): Promise<WorkspaceFsWriteTextFileResult> {
	const resolvedFile = await resolveWorkspaceFile(params);
	const current = await statWorkspaceFile({ workspaceRoot: resolvedFile.root, filePath: resolvedFile.target });
	if (!current.readable || current.sha256 !== params.expectedSha256 || current.modifiedAtMs !== params.expectedModifiedAtMs) {
		throw new Error("workspace_file_conflict: The file changed outside Daedalus Studio.");
	}
	const bytes: Buffer = encodeEditableText(params.content);
	const temporaryPath: string = join(dirname(resolvedFile.target), `.${basename(resolvedFile.target)}.daedalus-${randomUUID()}.tmp`);
	try {
		await writeFile(temporaryPath, bytes, { flag: "wx" });
		await rename(temporaryPath, resolvedFile.target);
	} catch (error: unknown) {
		await rm(temporaryPath, { force: true });
		throw error;
	}
	const savedStats = await stat(resolvedFile.target);
	return {
		saved: true,
		byteSize: bytes.byteLength,
		modifiedAtMs: savedStats.mtimeMs,
		sha256: hashBytes(bytes),
		relativePath: resolvedFile.relativePath
	};
}

function toResourcePath(relativePath: string): string {
	return relativePath.length === 0 ? "res://" : `res://${relativePath}`;
}

function resolveGodotSceneCliPath(workspaceRoot: string, scenePath: string | undefined): string {
	if (scenePath === undefined || scenePath.trim().length === 0) {
		throw new Error("Godot scene path is required.");
	}

	const root: string = resolve(workspaceRoot);
	const normalizedScenePath: string = scenePath.startsWith("res://") ? scenePath.slice("res://".length) : scenePath;
	const target: string = resolve(root, normalizedScenePath);
	if (!isPathInside(root, target)) {
		throw new Error("Godot scene path is outside workspace root.");
	}

	const extension: string = extname(target).toLowerCase();
	if (extension !== ".tscn" && extension !== ".scn") {
		throw new Error("Godot scene path must point to a .tscn or .scn file.");
	}

	const relativeScenePath: string = relative(root, target).replaceAll("\\", "/");
	return relativeScenePath;
}

async function readGodotMainSceneCliPath(workspaceRoot: string): Promise<string | null> {
	const root: string = resolve(workspaceRoot);
	const projectPath: string = join(root, "project.godot");
	let content: string;
	try {
		content = await readFile(projectPath, "utf8");
	} catch {
		return null;
	}

	let section = "";
	let mainScenePath: string | null = null;
	for (const line of content.split(/\r?\n/)) {
		const sectionMatch: RegExpMatchArray | null = line.match(/^\s*\[([^\]]+)\]\s*$/);
		if (sectionMatch !== null) {
			section = sectionMatch[1] ?? "";
			continue;
		}

		const settingMatch: RegExpMatchArray | null = line.match(/^\s*([^=]+?)\s*=\s*"([^"]+)"\s*$/);
		if (settingMatch === null) {
			continue;
		}

		const key: string = (settingMatch[1] ?? "").trim();
		if ((section === "application" && key === "run/main_scene") || key === "application/run/main_scene") {
			mainScenePath = settingMatch[2] ?? "";
			break;
		}
	}

	if (mainScenePath === null || !mainScenePath.startsWith("res://")) {
		return null;
	}

	try {
		return resolveGodotSceneCliPath(root, mainScenePath);
	} catch {
		return null;
	}
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

async function defaultRunCommand(command: string, args: string[]): Promise<string | null> {
	return new Promise<string | null>((resolveCommand): void => {
		execFile(command, args, { windowsHide: true }, (error, stdout): void => {
			resolveCommand(error === null ? stdout : null);
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

async function findVisualStudioPath(options: Required<Pick<WorkspaceLaunchDetectionOptions, "env" | "pathExists" | "findOnPath" | "runCommand">>): Promise<string | null> {
	const programFiles: string | undefined = getEnvValue(options.env, "ProgramFiles");
	const programFilesX86: string | undefined = getEnvValue(options.env, "ProgramFiles(x86)");
	const vswherePath: string | null = await findFirstExistingPath(compactPaths([
		programFilesX86 === undefined ? undefined : join(programFilesX86, "Microsoft Visual Studio", "Installer", "vswhere.exe"),
		programFiles === undefined ? undefined : join(programFiles, "Microsoft Visual Studio", "Installer", "vswhere.exe"),
		await options.findOnPath("vswhere.exe")
	]), options.pathExists);

	if (vswherePath !== null) {
		const output: string | null = await options.runCommand(vswherePath, [
			"-latest",
			"-products",
			"*",
			"-requires",
			"Microsoft.VisualStudio.Component.CoreEditor",
			"-property",
			"installationPath"
		]);
		const installPath: string | undefined = output
			?.split(/\r?\n/u)
			.map((line: string): string => line.trim())
			.find((line: string): boolean => line.length > 0);
		if (installPath !== undefined) {
			const devenvPath: string = join(installPath, "Common7", "IDE", "devenv.exe");
			if (await options.pathExists(devenvPath)) {
				return devenvPath;
			}
		}
	}

	const editions: string[] = ["Enterprise", "Professional", "Community", "Preview"];
	const years: string[] = ["2022", "2019", "2017"];
	const candidates: string[] = compactPaths(
		years.flatMap((year: string): Array<string | undefined> =>
			editions.flatMap((edition: string): Array<string | undefined> => [
				programFiles === undefined
					? undefined
					: join(programFiles, "Microsoft Visual Studio", year, edition, "Common7", "IDE", "devenv.exe"),
				programFilesX86 === undefined
					? undefined
					: join(programFilesX86, "Microsoft Visual Studio", year, edition, "Common7", "IDE", "devenv.exe")
			])
		)
	);
	return findFirstExistingPath(candidates, options.pathExists);
}

async function resolveWorkspaceLaunchTarget(targetId: WorkspaceLaunchTargetId, options: WorkspaceLaunchDetectionOptions = {}): Promise<ResolvedWorkspaceLaunchTarget | null> {
	const platform: NodeJS.Platform = options.platform ?? process.platform;
	const env: NodeJS.ProcessEnv = options.env ?? process.env;
	const pathExists: (path: string) => Promise<boolean> = options.pathExists ?? defaultPathExists;
	const findOnPath: (command: string) => Promise<string | null> = options.findOnPath ?? ((command: string): Promise<string | null> => defaultFindOnPath(command, platform));
	const runCommand: (command: string, args: string[]) => Promise<string | null> = options.runCommand ?? defaultRunCommand;
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
		if (platform !== "win32") {
			return null;
		}
		const visualStudioPath: string | null = await findVisualStudioPath({ env, pathExists, findOnPath, runCommand });
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
	if (targetId === "godot") {
		const godotExecutablePath: string = options.godotExecutablePath?.trim() ?? "";
		const godotExecutableExists: boolean = godotExecutablePath.length > 0 && await pathExists(godotExecutablePath);
		if (!godotExecutableExists) {
			return null;
		}
		return { id: "godot", label: "Godot", command: godotExecutablePath, args: [] };
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

			return WORKSPACE_ENTRY_NAME_COLLATOR.compare(left.name, right.name);
		});

	return { entries };
}

export async function searchWorkspaceEntries(params: WorkspaceFsSearchParams): Promise<WorkspaceFsSearchResult> {
	const query: string = params.query.trim().toLocaleLowerCase();
	if (query.length === 0 || query.length > MAX_SEARCH_QUERY_CHARS) {
		return { entries: [], truncated: false };
	}
	const requestedLimit: number = params.maxResults ?? DEFAULT_SEARCH_RESULT_LIMIT;
	const limit: number = Math.max(1, Math.min(MAX_SEARCH_RESULT_LIMIT, Math.floor(requestedLimit)));
	const rootRealPath: string = await realpath(resolve(params.workspaceRoot));
	const rootStats = await stat(rootRealPath);
	if (!rootStats.isDirectory()) {
		throw new Error("Workspace root is not a directory.");
	}

	const results: WorkspaceFsEntry[] = [];
	const pendingDirectories: string[] = [rootRealPath];
	let visitedEntries: number = 0;
	let truncated: boolean = false;
	while (pendingDirectories.length > 0 && visitedEntries < MAX_SEARCHED_ENTRIES) {
		const directoryPath: string = pendingDirectories.shift()!;
		const dirents = await readdir(directoryPath, { withFileTypes: true });
		for (const dirent of dirents) {
			visitedEntries += 1;
			if (visitedEntries > MAX_SEARCHED_ENTRIES) {
				truncated = true;
				break;
			}
			if (dirent.isSymbolicLink() || (!dirent.isDirectory() && !dirent.isFile())) {
				continue;
			}
			const absolutePath: string = join(directoryPath, dirent.name);
			const entryStats = await lstat(absolutePath);
			if (entryStats.isSymbolicLink()) {
				continue;
			}
			const relativePath: string = relative(rootRealPath, absolutePath).replaceAll("\\", "/");
			if (dirent.isDirectory()) {
				pendingDirectories.push(absolutePath);
			}
			if (relativePath.toLocaleLowerCase().includes(query)) {
				results.push({
					name: dirent.name,
					relativePath,
					resourcePath: toResourcePath(relativePath),
					kind: dirent.isDirectory() ? "folder" : "file"
				});
				if (results.length >= limit) {
					truncated = true;
					pendingDirectories.length = 0;
					break;
				}
			}
		}
	}
	if (pendingDirectories.length > 0) {
		truncated = true;
	}
	return {
		entries: results.sort((left: WorkspaceFsEntry, right: WorkspaceFsEntry): number => {
			if (left.kind !== right.kind) {
				return left.kind === "folder" ? -1 : 1;
			}
			return left.relativePath.localeCompare(right.relativePath);
		}),
		truncated
	};
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

export async function openWorkspaceFile(
	params: WorkspaceFsFileParams,
	openPath: (path: string) => Promise<string> = shell.openPath
): Promise<WorkspaceFsOpenFileResult> {
	const resolvedEntry = await resolveWorkspaceOpenableEntry(params);
	const openError: string = await openPath(resolvedEntry.target);
	if (openError.trim().length > 0) {
		throw new Error(openError);
	}
	return { opened: true };
}

export async function revealWorkspaceFile(
	params: WorkspaceFsFileParams,
	revealFile: (path: string) => void = shell.showItemInFolder
): Promise<WorkspaceFsRevealFileResult> {
	const resolvedFile = await resolveWorkspaceFile(params);
	revealFile(resolvedFile.target);
	return { revealed: true };
}

export async function saveWorkspaceFileAs(
	owner: BrowserWindow | undefined,
	params: WorkspaceFsFileParams
): Promise<WorkspaceFsSaveFileAsResult> {
	const resolvedFile = await resolveWorkspaceFile(params);
	const result: Electron.SaveDialogReturnValue = owner === undefined
		? await dialog.showSaveDialog({
			title: "Save workspace file as",
			defaultPath: basename(resolvedFile.target)
		})
		: await dialog.showSaveDialog(owner, {
			title: "Save workspace file as",
			defaultPath: basename(resolvedFile.target)
		});
	if (result.canceled || result.filePath === undefined) {
		return { saved: false };
	}

	await writeFile(result.filePath, await readFile(resolvedFile.target));
	return { saved: true, filePath: result.filePath };
}

export async function saveWorkspaceTextFileAs(
	owner: BrowserWindow | undefined,
	params: WorkspaceFsSaveTextFileAsParams
): Promise<WorkspaceFsSaveFileAsResult> {
	const resolvedFile = await resolveWorkspaceFile(params);
	const bytes: Buffer = encodeEditableText(params.content);
	const result: Electron.SaveDialogReturnValue = owner === undefined
		? await dialog.showSaveDialog({ title: "Save workspace file as", defaultPath: basename(resolvedFile.target) })
		: await dialog.showSaveDialog(owner, { title: "Save workspace file as", defaultPath: basename(resolvedFile.target) });
	if (result.canceled || result.filePath === undefined) {
		return { saved: false };
	}
	await writeFile(result.filePath, bytes, { flag: "w" });
	return { saved: true, filePath: result.filePath };
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
		if (options.filePath === undefined) {
			await openWorkspaceDirectory(root);
		} else {
			const resolvedEntry = await resolveWorkspaceEntry({ workspaceRoot: root, filePath: options.filePath });
			const entryStats = await stat(resolvedEntry.target);
			if (entryStats.isDirectory()) {
				await openWorkspaceDirectory(resolvedEntry.target);
			} else {
				await revealWorkspaceFile({ workspaceRoot: root, filePath: resolvedEntry.target });
			}
		}
		return { opened: true, targetId };
	}
	const resolvedEntry = options.filePath === undefined ? null : await resolveWorkspaceEntry({ workspaceRoot: root, filePath: options.filePath });

	const target: ResolvedWorkspaceLaunchTarget | null = await resolveWorkspaceLaunchTarget(targetId, options);
	if (target === null || target.command === undefined) {
		throw new Error("Launch target is not available.");
	}

	const spawnProcess = options.spawnProcess ?? ((command: string, args: string[], spawnOptions: { cwd: string; detached: boolean; stdio: "ignore"; windowsHide: false; shell?: boolean | undefined }): WorkspaceLaunchChildProcess => {
		return spawn(command, args, spawnOptions);
	});
	const godotRunMode: "editor" | "project" | "scene" = options.godotRunMode ?? "editor";
	const godotProjectScenePath: string | null = target.id === "godot" && godotRunMode === "project"
		? await readGodotMainSceneCliPath(root)
		: null;
	const args: string[] = target.id === "terminal"
		? target.args?.[0] === "-d"
			? ["-d", root]
			: target.args?.[0] === "-a"
				? [...target.args, root]
				: target.args ?? []
		: target.id === "git-bash"
			? [`--cd=${root}`]
		: target.id === "godot"
			? godotRunMode === "scene"
				? ["--path", root, resolveGodotSceneCliPath(root, options.godotScenePath)]
				: godotRunMode === "project"
					? godotProjectScenePath === null
						? ["--path", root]
						: ["--path", root, godotProjectScenePath]
					: ["--editor", "--path", root]
			: [...(target.args ?? []), target.id === "vscode" || target.id === "visual-studio" ? resolvedEntry?.target ?? root : root];
	if (options.godotRuntimeTest !== undefined && target.id !== "godot") {
		throw new Error("Godot runtime test arguments are only valid for the Godot launch target.");
	}
	if (target.id === "godot" && options.godotRuntimeTest !== undefined) {
		if (godotRunMode !== "project") throw new Error("Godot runtime tests must launch the visible project window.");
		if (!GODOT_RUNTIME_TEST_SESSION_PATTERN.test(options.godotRuntimeTest.testSessionId)) throw new Error("Invalid Godot runtime test session id.");
		if (!/^[A-Za-z0-9_-]{32,256}$/u.test(options.godotRuntimeTest.testSessionToken)) throw new Error("Invalid Godot runtime test session token.");
		args.push(
			"--",
			`--daedalus-runtime-test=${options.godotRuntimeTest.testSessionId}`,
			`--daedalus-runtime-token=${options.godotRuntimeTest.testSessionToken}`,
		);
		const backendUrl: string | undefined = options.godotRuntimeTest.backendUrl?.trim();
		const backendDevDir: string | undefined = options.godotRuntimeTest.backendDevDir?.trim();
		if ((backendUrl === undefined) !== (backendDevDir === undefined)) {
			throw new Error("Godot runtime development Backend metadata must be complete.");
		}
		if (backendUrl !== undefined && backendDevDir !== undefined) {
			if (!/^ws:\/\/(?:127\.0\.0\.1|localhost):(?:[1-9]\d{0,4})$/u.test(backendUrl)) {
				throw new Error("Godot runtime development Backend URL must be a loopback WebSocket endpoint.");
			}
			const backendPort: number = Number.parseInt(backendUrl.slice(backendUrl.lastIndexOf(":") + 1), 10);
			if (backendPort > 65535 || !isAbsolute(backendDevDir)) {
				throw new Error("Godot runtime development Backend metadata is invalid.");
			}
			args.push(
				`--daedalus-backend-url=${backendUrl}`,
				`--daedalus-backend-dev-dir=${resolve(backendDevDir)}`,
			);
		}
	}
	if (options.godotRuntimeTest !== undefined) {
		for (const [testSessionId, managed] of managedGodotRuntimeProcesses) {
			if (managed.workspaceRoot === root) terminateManagedGodotRuntimeProcess(testSessionId);
		}
	}
	const managedRuntimeTest: boolean = target.id === "godot" && options.godotRuntimeTest !== undefined;
	const child = spawnProcess(target.command, args, {
		cwd: root,
		detached: !managedRuntimeTest,
		stdio: "ignore",
		windowsHide: false,
		shell: target.useShell
	});
	if (managedRuntimeTest) {
		const testSessionId: string = options.godotRuntimeTest!.testSessionId;
		if (child.kill !== undefined) {
			managedGodotRuntimeProcesses.set(testSessionId, { child, workspaceRoot: root });
			child.once?.("exit", (): void => forgetManagedGodotRuntimeProcess(testSessionId, child));
			child.once?.("error", (): void => forgetManagedGodotRuntimeProcess(testSessionId, child));
		}
	} else {
		child.unref();
	}

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
	ipcMain.handle("workspace-fs:open-file", async (_event, params: WorkspaceFsFileParams): Promise<WorkspaceFsOpenFileResult> => {
		return openWorkspaceFile(params);
	});
	ipcMain.handle("workspace-fs:reveal-file", async (_event, params: WorkspaceFsFileParams): Promise<WorkspaceFsRevealFileResult> => {
		return revealWorkspaceFile(params);
	});
	ipcMain.handle("workspace-fs:save-file-as", async (event, params: WorkspaceFsFileParams): Promise<WorkspaceFsSaveFileAsResult> => {
		return saveWorkspaceFileAs(BrowserWindow.fromWebContents(event.sender) ?? undefined, params);
	});
	ipcMain.handle("workspace-fs:read-text-file", async (_event, params: WorkspaceFsFileParams): Promise<WorkspaceFsReadTextFileResult> => {
		return readWorkspaceTextFile(params);
	});
	ipcMain.handle("workspace-fs:stat-file", async (_event, params: WorkspaceFsFileParams): Promise<WorkspaceFsReadTextFileResult> => {
		return statWorkspaceFile(params);
	});
	ipcMain.handle("workspace-fs:create-media-url", async (_event, params: WorkspaceFsFileParams): Promise<WorkspaceFsCreateMediaUrlResult> => {
		return createWorkspaceMediaFileUrl(params);
	});
	ipcMain.handle("workspace-fs:write-text-file", async (_event, params: WorkspaceFsWriteTextFileParams): Promise<WorkspaceFsWriteTextFileResult> => {
		return writeWorkspaceTextFile(params);
	});
	ipcMain.handle("workspace-fs:save-text-file-as", async (event, params: WorkspaceFsSaveTextFileAsParams): Promise<WorkspaceFsSaveFileAsResult> => {
		return saveWorkspaceTextFileAs(BrowserWindow.fromWebContents(event.sender) ?? undefined, params);
	});
	ipcMain.handle("workspace-fs:search", async (_event, params: WorkspaceFsSearchParams): Promise<WorkspaceFsSearchResult> => {
		return searchWorkspaceEntries(params);
	});
	ipcMain.handle("workspace-fs:list-launch-targets", async (_event, params?: { godotExecutablePath?: string | null }): Promise<WorkspaceLaunchTarget[]> => {
		return listWorkspaceLaunchTargets({
			godotExecutablePath: params?.godotExecutablePath
		});
	});
	ipcMain.handle("workspace-fs:open-launch-target", async (_event, params: { workspaceRoot: string; targetId: WorkspaceLaunchTargetId; filePath?: string; godotExecutablePath?: string | null; godotRunMode?: "editor" | "project" | "scene"; godotScenePath?: string; godotRuntimeTest?: { testSessionId: string; testSessionToken: string } }): Promise<WorkspaceLaunchTargetResult> => {
		const developmentBackendDir: string = resolve(app.getAppPath(), "..", "daedalus-backend");
		const developmentRuntime = params.godotRuntimeTest !== undefined
			&& !app.isPackaged
			&& existsSync(developmentBackendDir)
			? {
				backendUrl: `ws://127.0.0.1:${backendManager.getPort()}`,
				backendDevDir: developmentBackendDir,
			}
			: {};
		return openWorkspaceLaunchTarget(params.workspaceRoot, params.targetId, {
			filePath: params.filePath,
			godotExecutablePath: params.godotExecutablePath,
			godotRunMode: params.godotRunMode,
			godotScenePath: params.godotScenePath,
			godotRuntimeTest: params.godotRuntimeTest === undefined
				? undefined
				: { ...params.godotRuntimeTest, ...developmentRuntime },
		});
	});
	ipcMain.handle("workspace-fs:stop-godot-runtime-test", (_event, testSessionId: string): WorkspaceGodotRuntimeTestStopResult => {
		return stopGodotRuntimeTestProcess(testSessionId);
	});
}

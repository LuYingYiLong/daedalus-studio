import { app, BrowserWindow, dialog, ipcMain, shell } from "electron";
import type { OpenDialogOptions, OpenDialogReturnValue, SaveDialogOptions, SaveDialogReturnValue } from "electron";
import { stat } from "node:fs/promises";
import { homedir } from "node:os";
import { extname, isAbsolute, join, relative, resolve, sep } from "node:path";

export type SessionFsOpenDirectoryResult = {
	opened: true;
};

export type SessionFsOpenDirectoryOptions = {
	homeDirectory?: string;
	openPath?: (path: string) => Promise<string>;
};

export type SessionFsPickExportDestinationParams = {
	sessionId: string;
	title: string;
	dialogTitle?: string;
	buttonLabel?: string;
};

export type SessionFsPickExportDestinationOptions = {
	documentsDirectory?: string;
	showSaveDialog?: (
		owner: BrowserWindow | undefined,
		options: SaveDialogOptions
	) => Promise<SaveDialogReturnValue>;
};

export type SessionFsPickImportSourceParams = {
	dialogTitle?: string;
	buttonLabel?: string;
};

export type SessionFsPickImportSourceOptions = {
	documentsDirectory?: string;
	showOpenDialog?: (
		owner: BrowserWindow | undefined,
		options: OpenDialogOptions
	) => Promise<OpenDialogReturnValue>;
};

const SESSION_ID_PATTERN: RegExp = /^session-[A-Za-z0-9_-]+$/u;

function sanitizeExportFileName(title: string, sessionId: string): string {
	const normalizedTitle: string = title
		.normalize("NFKC")
		.replace(/[<>:"/\\|?*\u0000-\u001f]/gu, " ")
		.replace(/\s+/gu, " ")
		.trim()
		.replace(/[. ]+$/gu, "")
		.slice(0, 80);
	return `${normalizedTitle.length > 0 ? normalizedTitle : sessionId}-${sessionId}.sqlite`;
}

function ensureSqliteExtension(filePath: string): string {
	return extname(filePath).toLocaleLowerCase() === ".sqlite" ? filePath : `${filePath}.sqlite`;
}

async function showSessionExportSaveDialog(
	owner: BrowserWindow | undefined,
	options: SaveDialogOptions
): Promise<SaveDialogReturnValue> {
	return owner === undefined ? dialog.showSaveDialog(options) : dialog.showSaveDialog(owner, options);
}

async function showSessionImportOpenDialog(
	owner: BrowserWindow | undefined,
	options: OpenDialogOptions
): Promise<OpenDialogReturnValue> {
	return owner === undefined ? dialog.showOpenDialog(options) : dialog.showOpenDialog(owner, options);
}

function isPathInside(root: string, target: string): boolean {
	const relativePath: string = relative(root, target);
	return relativePath.length === 0 || (!relativePath.startsWith(`..${sep}`) && relativePath !== ".." && !isAbsolute(relativePath));
}

export function getSessionStorageRoot(homeDirectory: string = homedir()): string {
	return resolve(homeDirectory, ".daedalus", "sessions");
}

export function resolveSessionDirectory(sessionId: string, homeDirectory: string = homedir()): string {
	if (!SESSION_ID_PATTERN.test(sessionId)) {
		throw new Error("Invalid session id.");
	}

	const sessionsRoot: string = getSessionStorageRoot(homeDirectory);
	const sessionDirectory: string = resolve(join(sessionsRoot, sessionId));
	if (!isPathInside(sessionsRoot, sessionDirectory)) {
		throw new Error("Session directory is outside the sessions root.");
	}

	return sessionDirectory;
}

export async function openSessionDirectory(
	sessionId: string,
	options: SessionFsOpenDirectoryOptions = {}
): Promise<SessionFsOpenDirectoryResult> {
	const sessionDirectory: string = resolveSessionDirectory(sessionId, options.homeDirectory);
	const directoryStats = await stat(sessionDirectory);
	if (!directoryStats.isDirectory()) {
		throw new Error("Session path is not a directory.");
	}

	const openPath = options.openPath ?? shell.openPath;
	const openError: string = await openPath(sessionDirectory);
	if (openError.trim().length > 0) {
		throw new Error(openError);
	}

	return { opened: true };
}

export async function pickSessionExportDestination(
	params: SessionFsPickExportDestinationParams,
	owner?: BrowserWindow,
	options: SessionFsPickExportDestinationOptions = {}
): Promise<string | null> {
	if (!SESSION_ID_PATTERN.test(params.sessionId)) {
		throw new Error("Invalid session id.");
	}
	if (typeof params.title !== "string" || params.title.length > 500) {
		throw new Error("Invalid session title.");
	}
	if (params.dialogTitle !== undefined && (typeof params.dialogTitle !== "string" || params.dialogTitle.length > 120)) {
		throw new Error("Invalid export dialog title.");
	}
	if (params.buttonLabel !== undefined && (typeof params.buttonLabel !== "string" || params.buttonLabel.length > 40)) {
		throw new Error("Invalid export button label.");
	}
	const documentsDirectory: string = options.documentsDirectory ?? app.getPath("documents");
	const showSaveDialog = options.showSaveDialog ?? showSessionExportSaveDialog;
	const result: SaveDialogReturnValue = await showSaveDialog(owner, {
		title: params.dialogTitle?.trim() || "Export session data",
		defaultPath: join(documentsDirectory, sanitizeExportFileName(params.title, params.sessionId)),
		buttonLabel: params.buttonLabel?.trim() || "Export",
		filters: [{ name: "SQLite Database", extensions: ["sqlite"] }],
		properties: ["createDirectory", "showOverwriteConfirmation"]
	});
	if (result.canceled || typeof result.filePath !== "string" || result.filePath.trim().length === 0) {
		return null;
	}
	return resolve(ensureSqliteExtension(result.filePath));
}

export async function pickSessionImportSource(
	params: SessionFsPickImportSourceParams = {},
	owner?: BrowserWindow,
	options: SessionFsPickImportSourceOptions = {}
): Promise<string | null> {
	if (params.dialogTitle !== undefined && (typeof params.dialogTitle !== "string" || params.dialogTitle.length > 120)) {
		throw new Error("Invalid import dialog title.");
	}
	if (params.buttonLabel !== undefined && (typeof params.buttonLabel !== "string" || params.buttonLabel.length > 40)) {
		throw new Error("Invalid import button label.");
	}
	const documentsDirectory: string = options.documentsDirectory ?? app.getPath("documents");
	const showOpenDialog = options.showOpenDialog ?? showSessionImportOpenDialog;
	const result: OpenDialogReturnValue = await showOpenDialog(owner, {
		title: params.dialogTitle?.trim() || "Import session data",
		defaultPath: documentsDirectory,
		buttonLabel: params.buttonLabel?.trim() || "Import",
		filters: [{ name: "SQLite Database", extensions: ["sqlite", "db", "sqlite3"] }],
		properties: ["openFile"]
	});
	if (result.canceled || result.filePaths.length === 0 || typeof result.filePaths[0] !== "string") {
		return null;
	}
	return resolve(result.filePaths[0]);
}

export function registerSessionFsIpc(): void {
	ipcMain.handle("session-fs:open-directory", async (_event, sessionId: string): Promise<SessionFsOpenDirectoryResult> => {
		return openSessionDirectory(sessionId);
	});
	ipcMain.handle("session-fs:pick-export-destination", async (event, params: SessionFsPickExportDestinationParams): Promise<string | null> => {
		return pickSessionExportDestination(params, BrowserWindow.fromWebContents(event.sender) ?? undefined);
	});
	ipcMain.handle("session-fs:pick-import-source", async (event, params?: SessionFsPickImportSourceParams): Promise<string | null> => {
		return pickSessionImportSource(params ?? {}, BrowserWindow.fromWebContents(event.sender) ?? undefined);
	});
}

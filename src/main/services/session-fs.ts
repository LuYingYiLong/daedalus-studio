import { app, BrowserWindow, dialog, ipcMain, shell } from "electron";
import type { OpenDialogOptions, OpenDialogReturnValue, SaveDialogOptions, SaveDialogReturnValue } from "electron";
import { stat } from "node:fs/promises";
import { homedir } from "node:os";
import { fileURLToPath } from "node:url";
import { extname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { createFlowArtifactMediaUrl } from "./workspace-media";

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
	kind?: "session" | "flow";
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

function ensureFlowExtension(filePath: string): string {
	return filePath.toLocaleLowerCase().endsWith(".daedalus-flow") ? filePath : `${filePath}.daedalus-flow`;
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

export async function pickSessionExportDestination(params: SessionFsPickExportDestinationParams, owner?: BrowserWindow, options: SessionFsPickExportDestinationOptions = {}): Promise<string | null> {
	return pickDocumentExportDestination(params, owner, options, "session");
}

export async function pickFlowExportDestination(params: { flowId: string; title: string; dialogTitle?: string; buttonLabel?: string }, owner?: BrowserWindow, options: SessionFsPickExportDestinationOptions = {}): Promise<string | null> {
	return pickDocumentExportDestination({ ...params, sessionId: params.flowId }, owner, options, "flow");
}

async function pickDocumentExportDestination(params: SessionFsPickExportDestinationParams, owner: BrowserWindow | undefined, options: SessionFsPickExportDestinationOptions, kind: "session" | "flow"): Promise<string | null> {
	if (!(kind === "flow" ? /^flow-[A-Za-z0-9_-]+$/u : SESSION_ID_PATTERN).test(params.sessionId)) {
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
		title: params.dialogTitle?.trim() || (kind === "flow" ? "Export Flow data" : "Export session data"),
		defaultPath: join(documentsDirectory, kind === "flow" ? sanitizeExportFileName(params.title, params.sessionId).replace(/\.sqlite$/u, ".daedalus-flow") : sanitizeExportFileName(params.title, params.sessionId)),
		buttonLabel: params.buttonLabel?.trim() || "Export",
		filters: [kind === "flow" ? { name: "Daedalus Flow", extensions: ["daedalus-flow"] } : { name: "SQLite Database", extensions: ["sqlite"] }],
		properties: ["createDirectory", "showOverwriteConfirmation"]
	});
	if (result.canceled || typeof result.filePath !== "string" || result.filePath.trim().length === 0) {
		return null;
	}
	return resolve(kind === "flow" ? ensureFlowExtension(result.filePath) : ensureSqliteExtension(result.filePath));
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
		filters: [params.kind === "flow" ? { name: "Daedalus Flow", extensions: ["daedalus-flow"] } : { name: "SQLite Database", extensions: ["sqlite", "db", "sqlite3"] }],
		properties: ["openFile"]
	});
	if (result.canceled || result.filePaths.length === 0 || typeof result.filePaths[0] !== "string") {
		return null;
	}
	return resolve(result.filePaths[0]);
}

export function registerSessionFsIpc(): void {
	const assertMainFrame = (event: Electron.IpcMainInvokeEvent): BrowserWindow => {
		const owner = BrowserWindow.fromWebContents(event.sender);
		if (owner === null || owner.isDestroyed() || event.senderFrame !== owner.webContents.mainFrame)
			throw new Error("session_fs_sender_invalid");
		const senderUrl = new URL(event.senderFrame.url);
		const devUrl = process.env.ELECTRON_RENDERER_URL;
		const validOrigin = devUrl
			? senderUrl.origin === new URL(devUrl).origin
			: senderUrl.protocol === "file:" && resolve(fileURLToPath(senderUrl)) === resolve(join(__dirname, "../renderer/index.html"));
		if (!validOrigin) throw new Error("session_fs_sender_invalid");
		return owner;
	};
	ipcMain.handle("session-fs:open-directory", async (event, sessionId: string): Promise<SessionFsOpenDirectoryResult> => {
		assertMainFrame(event);
		return openSessionDirectory(sessionId);
	});
	ipcMain.handle("flow-fs:pick-export-destination", async (event, params: Parameters<typeof pickFlowExportDestination>[0]): Promise<string | null> => {
		return pickFlowExportDestination(params, assertMainFrame(event));
	});
	ipcMain.handle("session-fs:pick-export-destination", async (event, params: SessionFsPickExportDestinationParams): Promise<string | null> => {
		return pickSessionExportDestination(params, assertMainFrame(event));
	});
	ipcMain.handle("session-fs:pick-import-source", async (event, params?: SessionFsPickImportSourceParams): Promise<string | null> => {
		return pickSessionImportSource(params ?? {}, assertMainFrame(event));
	});
	ipcMain.handle("flow-fs:artifact-media-url", async (event, params: { artifactId: string; mimeType: string; byteSize: number }): Promise<string> => {
		assertMainFrame(event);
		return createFlowArtifactMediaUrl(params);
	});
}

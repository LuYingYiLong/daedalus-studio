import { ipcMain, shell } from "electron";
import { stat } from "node:fs/promises";
import { homedir } from "node:os";
import { isAbsolute, join, relative, resolve, sep } from "node:path";

export type SessionFsOpenDirectoryResult = {
	opened: true;
};

export type SessionFsOpenDirectoryOptions = {
	homeDirectory?: string;
	openPath?: (path: string) => Promise<string>;
};

const SESSION_ID_PATTERN: RegExp = /^session-[A-Za-z0-9_-]+$/u;

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

export function registerSessionFsIpc(): void {
	ipcMain.handle("session-fs:open-directory", async (_event, sessionId: string): Promise<SessionFsOpenDirectoryResult> => {
		return openSessionDirectory(sessionId);
	});
}

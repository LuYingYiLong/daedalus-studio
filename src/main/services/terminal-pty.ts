import { BrowserWindow, ipcMain } from "electron";
import { execFile } from "node:child_process";
import { access, stat } from "node:fs/promises";
import { resolve } from "node:path";
import type { IDisposable, IPty, IPtyForkOptions, IWindowsPtyForkOptions } from "node-pty";

export type TerminalCreateParams = {
	terminalId?: string | null;
	cwd?: string | null;
	cols: number;
	rows: number;
};

export type TerminalWriteParams = {
	terminalId: string;
	data: string;
};

export type TerminalResizeParams = {
	terminalId: string;
	cols: number;
	rows: number;
};

export type TerminalKillParams = {
	terminalId: string;
};

export type TerminalGetStateParams = {
	terminalId?: string | null;
};

export type TerminalState = {
	terminalId: string;
	shell: string;
	cwd: string;
	running: boolean;
};

export type TerminalDataEvent = {
	terminalId: string;
	data: string;
};

export type TerminalExitEvent = {
	terminalId: string;
	exitCode: number;
	signal: number | string | null;
};

export type TerminalPtyProcess = Pick<IPty, "write" | "resize" | "kill" | "onData" | "onExit">;
export type TerminalSpawnOptions = IPtyForkOptions | IWindowsPtyForkOptions;
export type TerminalSpawnPty = (file: string, args: string[], options: TerminalSpawnOptions) => TerminalPtyProcess | Promise<TerminalPtyProcess>;

export type TerminalPtyServiceOptions = {
	platform?: NodeJS.Platform;
	env?: NodeJS.ProcessEnv;
	findOnPath?: (command: string) => Promise<string | null>;
	pathExists?: (targetPath: string) => Promise<boolean>;
	pathIsDirectory?: (targetPath: string) => Promise<boolean>;
	spawnPty?: TerminalSpawnPty;
	sendEvent?: (channel: "terminal:data" | "terminal:exit", payload: TerminalDataEvent | TerminalExitEvent) => void;
};

type ActiveTerminal = TerminalState & {
	ptyProcess: TerminalPtyProcess;
	dataDisposable: IDisposable | null;
	exitDisposable: IDisposable | null;
};

const SINGLETON_TERMINAL_ID: string = "primary";
const TERMINAL_ID_PATTERN: RegExp = /^[A-Za-z0-9:_-]{1,80}$/u;
const DEFAULT_COLS: number = 80;
const DEFAULT_ROWS: number = 24;
const MIN_COLS: number = 10;
const MIN_ROWS: number = 4;
const MAX_COLS: number = 500;
const MAX_ROWS: number = 200;

function getEnvValue(env: NodeJS.ProcessEnv, key: string): string | undefined {
	return env[key] ?? env[key.toUpperCase()] ?? env[key.toLowerCase()];
}

function normalizeDimension(value: number, fallback: number, min: number, max: number): number {
	if (!Number.isFinite(value)) {
		return fallback;
	}
	return Math.min(max, Math.max(min, Math.trunc(value)));
}

async function defaultPathExists(targetPath: string): Promise<boolean> {
	try {
		await access(targetPath);
		return true;
	} catch {
		return false;
	}
}

async function defaultPathIsDirectory(targetPath: string): Promise<boolean> {
	try {
		const targetStats = await stat(targetPath);
		return targetStats.isDirectory();
	} catch {
		return false;
	}
}

async function defaultFindOnPath(command: string, platform: NodeJS.Platform, env: NodeJS.ProcessEnv): Promise<string | null> {
	const lookupCommand: string = platform === "win32" ? "where.exe" : "which";
	return new Promise<string | null>((resolveLookup): void => {
		execFile(lookupCommand, [command], { env, windowsHide: true }, (error, stdout): void => {
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

async function defaultSpawnPty(file: string, args: string[], options: TerminalSpawnOptions): Promise<TerminalPtyProcess> {
	const ptyModule: typeof import("node-pty") = await import("node-pty");
	return ptyModule.spawn(file, args, options);
}

function broadcastTerminalEvent(channel: "terminal:data" | "terminal:exit", payload: TerminalDataEvent | TerminalExitEvent): void {
	for (const browserWindow of BrowserWindow.getAllWindows()) {
		if (browserWindow.isDestroyed()) {
			continue;
		}
		browserWindow.webContents.send(channel, payload);
	}
}

export function resolveTerminalHomeDirectory(env: NodeJS.ProcessEnv = process.env, fallbackCwd: string = process.cwd()): string {
	const homeDrive: string | undefined = getEnvValue(env, "HOMEDRIVE");
	const homePath: string | undefined = getEnvValue(env, "HOMEPATH");
	if (homeDrive !== undefined && homePath !== undefined && `${homeDrive}${homePath}`.trim().length > 0) {
		return resolve(`${homeDrive}${homePath}`);
	}

	const userProfile: string | undefined = getEnvValue(env, "USERPROFILE");
	if (userProfile !== undefined && userProfile.trim().length > 0) {
		return resolve(userProfile);
	}

	const home: string | undefined = getEnvValue(env, "HOME");
	if (home !== undefined && home.trim().length > 0) {
		return resolve(home);
	}

	return resolve(fallbackCwd);
}

export async function resolveDefaultTerminalShell(options: Pick<TerminalPtyServiceOptions, "platform" | "env" | "findOnPath"> = {}): Promise<string> {
	const platform: NodeJS.Platform = options.platform ?? process.platform;
	const env: NodeJS.ProcessEnv = options.env ?? process.env;
	const findOnPath: (command: string) => Promise<string | null> = options.findOnPath
		?? ((command: string): Promise<string | null> => defaultFindOnPath(command, platform, env));

	if (platform === "win32") {
		return await findOnPath("pwsh.exe")
			?? await findOnPath("powershell.exe")
			?? "powershell.exe";
	}

	const shell: string | undefined = getEnvValue(env, "SHELL");
	if (shell !== undefined && shell.trim().length > 0) {
		return shell;
	}

	return platform === "darwin" ? "/bin/zsh" : "/bin/bash";
}

export async function resolveTerminalCwd(
	requestedCwd: string | null | undefined,
	options: Pick<TerminalPtyServiceOptions, "env" | "pathIsDirectory"> = {}
): Promise<string> {
	const env: NodeJS.ProcessEnv = options.env ?? process.env;
	const pathIsDirectory: (targetPath: string) => Promise<boolean> = options.pathIsDirectory ?? defaultPathIsDirectory;
	const candidates: string[] = [
		requestedCwd ?? "",
		resolveTerminalHomeDirectory(env),
		getEnvValue(env, "USERPROFILE") ?? "",
		getEnvValue(env, "HOME") ?? "",
		process.cwd()
	];

	for (const candidate of candidates) {
		if (candidate.trim().length === 0) {
			continue;
		}
		const resolvedCandidate: string = resolve(candidate);
		if (await pathIsDirectory(resolvedCandidate)) {
			return resolvedCandidate;
		}
	}

	return resolve(process.cwd());
}

export function getTerminalShellArgs(platform: NodeJS.Platform): string[] {
	return platform === "win32" ? ["-NoLogo"] : [];
}

function normalizeTerminalId(value: string | null | undefined): string {
	const terminalId: string = value?.trim() ?? "";
	if (terminalId.length === 0) {
		return SINGLETON_TERMINAL_ID;
	}
	if (!TERMINAL_ID_PATTERN.test(terminalId)) {
		throw new Error("Invalid terminal id.");
	}
	return terminalId;
}

export class TerminalPtyService {
	private readonly platform: NodeJS.Platform;
	private readonly env: NodeJS.ProcessEnv;
	private readonly findOnPath: (command: string) => Promise<string | null>;
	private readonly pathIsDirectory: (targetPath: string) => Promise<boolean>;
	private readonly spawnPty: TerminalSpawnPty;
	private readonly sendEvent: (channel: "terminal:data" | "terminal:exit", payload: TerminalDataEvent | TerminalExitEvent) => void;
	private readonly activeTerminals: Map<string, ActiveTerminal> = new Map();

	public constructor(options: TerminalPtyServiceOptions = {}) {
		this.platform = options.platform ?? process.platform;
		this.env = options.env ?? process.env;
		this.findOnPath = options.findOnPath ?? ((command: string): Promise<string | null> => defaultFindOnPath(command, this.platform, this.env));
		this.pathIsDirectory = options.pathIsDirectory ?? defaultPathIsDirectory;
		this.spawnPty = options.spawnPty ?? defaultSpawnPty;
		this.sendEvent = options.sendEvent ?? broadcastTerminalEvent;
	}

	public async create(params: TerminalCreateParams): Promise<TerminalState> {
		const terminalId: string = normalizeTerminalId(params.terminalId);
		const existingTerminal: ActiveTerminal | undefined = this.activeTerminals.get(terminalId);
		if (existingTerminal !== undefined) {
			return this.toState(existingTerminal);
		}

		const cols: number = normalizeDimension(params.cols, DEFAULT_COLS, MIN_COLS, MAX_COLS);
		const rows: number = normalizeDimension(params.rows, DEFAULT_ROWS, MIN_ROWS, MAX_ROWS);
		const shell: string = await resolveDefaultTerminalShell({
			platform: this.platform,
			env: this.env,
			findOnPath: this.findOnPath
		});
		const cwd: string = await resolveTerminalCwd(params.cwd, {
			env: this.env,
			pathIsDirectory: this.pathIsDirectory
		});
		const args: string[] = getTerminalShellArgs(this.platform);
		const ptyProcess: TerminalPtyProcess = await this.spawnPty(shell, args, {
			name: "xterm-256color",
			cols,
			rows,
			cwd,
			env: {
				...this.env,
				TERM: "xterm-256color",
				COLORTERM: "truecolor"
			},
			useConptyDll: this.platform === "win32"
		});

		const nextTerminal: ActiveTerminal = {
			terminalId,
			shell,
			cwd,
			running: true,
			ptyProcess,
			dataDisposable: null,
			exitDisposable: null
		};
		nextTerminal.dataDisposable = ptyProcess.onData((data: string): void => {
			this.sendEvent("terminal:data", {
				terminalId: nextTerminal.terminalId,
				data
			});
		});
		nextTerminal.exitDisposable = ptyProcess.onExit((event): void => {
			this.disposeTerminalListeners(nextTerminal);
			if (this.activeTerminals.get(nextTerminal.terminalId) === nextTerminal) {
				this.activeTerminals.delete(nextTerminal.terminalId);
			}
			this.sendEvent("terminal:exit", {
				terminalId: nextTerminal.terminalId,
				exitCode: event.exitCode,
				signal: event.signal ?? null
			});
		});
		this.activeTerminals.set(nextTerminal.terminalId, nextTerminal);

		return this.toState(nextTerminal);
	}

	public write(params: TerminalWriteParams): { written: true } {
		const terminal: ActiveTerminal = this.assertActiveTerminal(params.terminalId);
		terminal.ptyProcess.write(params.data);
		return { written: true };
	}

	public resize(params: TerminalResizeParams): { resized: true } {
		const terminal: ActiveTerminal = this.assertActiveTerminal(params.terminalId);
		const cols: number = normalizeDimension(params.cols, DEFAULT_COLS, MIN_COLS, MAX_COLS);
		const rows: number = normalizeDimension(params.rows, DEFAULT_ROWS, MIN_ROWS, MAX_ROWS);
		terminal.ptyProcess.resize(cols, rows);
		return { resized: true };
	}

	public kill(params: TerminalKillParams): { killed: true } {
		const terminalId: string = normalizeTerminalId(params.terminalId);
		const terminal: ActiveTerminal | undefined = this.activeTerminals.get(terminalId);
		if (terminal === undefined) {
			return { killed: true };
		}

		this.activeTerminals.delete(terminal.terminalId);
		this.disposeTerminalListeners(terminal);
		terminal.running = false;
		terminal.ptyProcess.kill();
		this.sendEvent("terminal:exit", {
			terminalId: terminal.terminalId,
			exitCode: 0,
			signal: "killed"
		});
		return { killed: true };
	}

	public getState(params: TerminalGetStateParams = {}): TerminalState | null {
		const terminalId: string = normalizeTerminalId(params.terminalId);
		const terminal: ActiveTerminal | undefined = this.activeTerminals.get(terminalId);
		return terminal === undefined ? null : this.toState(terminal);
	}

	public dispose(): void {
		for (const terminal of this.activeTerminals.values()) {
			this.disposeTerminalListeners(terminal);
			terminal.running = false;
			terminal.ptyProcess.kill();
		}
		this.activeTerminals.clear();
	}

	private assertActiveTerminal(terminalId: string): ActiveTerminal {
		const normalizedTerminalId: string = normalizeTerminalId(terminalId);
		const terminal: ActiveTerminal | undefined = this.activeTerminals.get(normalizedTerminalId);
		if (terminal === undefined) {
			throw new Error("Terminal is not running.");
		}
		return terminal;
	}

	private disposeTerminalListeners(terminal: ActiveTerminal): void {
		terminal.dataDisposable?.dispose();
		terminal.exitDisposable?.dispose();
		terminal.dataDisposable = null;
		terminal.exitDisposable = null;
	}

	private toState(terminal: ActiveTerminal): TerminalState {
		return {
			terminalId: terminal.terminalId,
			shell: terminal.shell,
			cwd: terminal.cwd,
			running: terminal.running
		};
	}
}

export const terminalPtyService: TerminalPtyService = new TerminalPtyService();

export function registerTerminalPtyIpc(service: TerminalPtyService = terminalPtyService): void {
	ipcMain.handle("terminal:create", async (_event, params: TerminalCreateParams): Promise<TerminalState> => {
		return service.create(params);
	});
	ipcMain.handle("terminal:write", (_event, params: TerminalWriteParams): { written: true } => {
		return service.write(params);
	});
	ipcMain.handle("terminal:resize", (_event, params: TerminalResizeParams): { resized: true } => {
		return service.resize(params);
	});
	ipcMain.handle("terminal:kill", (_event, params: TerminalKillParams): { killed: true } => {
		return service.kill(params);
	});
	ipcMain.handle("terminal:get-state", (_event, params?: TerminalGetStateParams): TerminalState | null => {
		return service.getState(params ?? {});
	});
}

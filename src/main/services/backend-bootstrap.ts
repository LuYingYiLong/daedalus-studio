import { BrowserWindow, app, ipcMain } from "electron";
import { existsSync } from "node:fs";
import { spawn } from "node:child_process";
import { mkdir, readdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve, sep } from "node:path";
import {
	backendManager,
	getDaedalusDir,
	getManagedBackendCurrentPath,
	getManagedBackendVersionsDir,
	type BackendLaunchTarget
} from "./backend-manager";
import { createLogger } from "./logger";

const logger = createLogger("backend-bootstrap");

const BACKEND_PACKAGE_NAME: string = "daedalus-backend";
const INSTALL_TIMEOUT_MS: number = 120000;
const NPM_VIEW_TIMEOUT_MS: number = 20000;
const MAX_BACKEND_VERSIONS: number = 3;

export type BackendBootstrapStatus =
	| "idle"
	| "checking"
	| "installing"
	| "starting"
	| "healthy"
	| "error"
	| "unsupported";

export type BackendBootstrapPhase =
	| "detect"
	| "resolve_latest"
	| "install"
	| "write_metadata"
	| "start"
	| "health_check"
	| "ready"
	| "error";

export type BackendBootstrapState = {
	status: BackendBootstrapStatus;
	phase: BackendBootstrapPhase;
	packaged: boolean;
	firstRun: boolean;
	progress: number;
	backendVersion: string | null;
	port: number;
	errorCode: string | null;
	errorMessage: string | null;
	suggestedAction: string | null;
};

type BackendCurrentFile = {
	version: string;
	path: string;
	previousVersion?: string;
	updatedAt: string;
};

type BackendBootstrapMarker = {
	backendBootstrapCompleted?: unknown;
	backendBootstrapCompletedAt?: unknown;
	backendVersion?: unknown;
};

type CommandResult = {
	exitCode: number;
	stdout: string;
	stderr: string;
	timedOut: boolean;
};

type RunPrepareOptions = {
	forceInstall: boolean;
};

function createInitialState(): BackendBootstrapState {
	return {
		status: "idle",
		phase: "detect",
		packaged: app?.isPackaged === true,
		firstRun: true,
		progress: 0,
		backendVersion: null,
		port: backendManager.getPort(),
		errorCode: null,
		errorMessage: null,
		suggestedAction: null
	};
}

function getBootstrapMarkerPath(): string {
	return join(getDaedalusDir(), "client", "bootstrap.json");
}

function assertInside(parentDir: string, childPath: string): string {
	const resolvedParent: string = resolve(parentDir);
	const resolvedChild: string = resolve(childPath);
	if (resolvedChild !== resolvedParent && !resolvedChild.startsWith(`${resolvedParent}${sep}`)) {
		throw new Error(`Refusing to operate outside managed directory: ${resolvedChild}`);
	}
	return resolvedChild;
}

async function readJsonFile<T>(filePath: string): Promise<T | null> {
	try {
		const text: string = await readFile(filePath, "utf8");
		return JSON.parse(text) as T;
	} catch {
		return null;
	}
}

async function writeJsonFile(filePath: string, value: unknown): Promise<void> {
	await mkdir(dirname(filePath), { recursive: true });
	const tempPath: string = `${filePath}.${process.pid}.${Date.now()}.tmp`;
	await writeFile(tempPath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
	await rename(tempPath, filePath);
}

async function readBootstrapMarker(): Promise<BackendBootstrapMarker | null> {
	return readJsonFile<BackendBootstrapMarker>(getBootstrapMarkerPath());
}

async function hasCompletedBackendBootstrap(): Promise<boolean> {
	const marker: BackendBootstrapMarker | null = await readBootstrapMarker();
	return marker?.backendBootstrapCompleted === true;
}

async function writeCompletedBackendBootstrap(version: string | null): Promise<void> {
	await writeJsonFile(getBootstrapMarkerPath(), {
		backendBootstrapCompleted: true,
		backendBootstrapCompletedAt: new Date().toISOString(),
		backendVersion: version
	});
}

async function readCurrentBackend(): Promise<BackendCurrentFile | null> {
	return readJsonFile<BackendCurrentFile>(getManagedBackendCurrentPath());
}

function getMarkedBackendMissingMessage(current: BackendCurrentFile): string | null {
	if (typeof current.version !== "string" || current.version.trim().length === 0) {
		return "Daedalus Studio has a managed backend marker, but it does not contain a backend version.";
	}
	if (typeof current.path !== "string" || current.path.trim().length === 0) {
		return `Daedalus Studio is configured to use backend ${current.version}, but the installation path is missing.`;
	}

	let versionDir: string;
	try {
		versionDir = assertInside(getManagedBackendVersionsDir(), current.path);
	} catch {
		return `Daedalus Studio is configured to use backend ${current.version}, but the marked path is outside the managed backend directory.`;
	}

	const entryPath: string = join(versionDir, "node_modules", BACKEND_PACKAGE_NAME, "src", "main.ts");
	if (!existsSync(entryPath)) {
		return `Daedalus Studio is configured to use backend ${current.version}, but that backend installation was not found.`;
	}
	return null;
}

async function getMarkedBackendMissingError(): Promise<{ version: string | null; message: string } | null> {
	const current: BackendCurrentFile | null = await readCurrentBackend();
	if (current === null) {
		return null;
	}

	const message: string | null = getMarkedBackendMissingMessage(current);
	if (message === null) {
		return null;
	}
	return {
		version: typeof current.version === "string" && current.version.trim().length > 0 ? current.version.trim() : null,
		message
	};
}

function getNpmCommand(): string {
	return process.platform === "win32" ? "npm.cmd" : "npm";
}

function createNpmCommandEnv(): NodeJS.ProcessEnv {
	const env: NodeJS.ProcessEnv = { ...process.env };
	for (const key of Object.keys(env)) {
		if (key.toLowerCase() === "npm_config_dry_run") {
			delete env[key];
		}
	}
	env.npm_config_dry_run = "false";
	return env;
}

function buildInvocation(command: string, args: readonly string[]): { command: string; args: string[] } {
	if (process.platform !== "win32" || (!command.endsWith(".cmd") && !command.endsWith(".bat"))) {
		return { command, args: [...args] };
	}

	const comspec: string = process.env.COMSPEC ?? "cmd.exe";
	const commandLine: string = [command, ...args].map(quoteWindowsCommandPart).join(" ");
	return { command: comspec, args: ["/d", "/s", "/c", commandLine] };
}

function quoteWindowsCommandPart(value: string): string {
	if (!/[ \t&()^"]/u.test(value)) {
		return value;
	}
	return `"${value.replaceAll("\"", "\\\"")}"`;
}

function runCommand(command: string, args: readonly string[], options: {
	cwd?: string;
	env?: NodeJS.ProcessEnv;
	timeoutMs?: number;
} = {}): Promise<CommandResult> {
	return new Promise<CommandResult>((resolveCommand): void => {
		const invocation = buildInvocation(command, args);
		const child = spawn(invocation.command, invocation.args, {
			cwd: options.cwd,
			env: options.env ?? process.env,
			windowsHide: true,
			stdio: ["ignore", "pipe", "pipe"]
		});
		let stdout: string = "";
		let stderr: string = "";
		let settled: boolean = false;
		let timedOut: boolean = false;
		const timeout = options.timeoutMs === undefined
			? null
			: setTimeout((): void => {
				if (settled) {
					return;
				}
				timedOut = true;
				child.kill("SIGTERM");
			}, options.timeoutMs);

		child.stdout.setEncoding("utf8");
		child.stderr.setEncoding("utf8");
		child.stdout.on("data", (chunk: string): void => {
			stdout += chunk;
		});
		child.stderr.on("data", (chunk: string): void => {
			stderr += chunk;
		});
		child.on("error", (error: Error): void => {
			if (settled) {
				return;
			}
			settled = true;
			if (timeout !== null) {
				clearTimeout(timeout);
			}
			resolveCommand({ exitCode: 1, stdout, stderr: `${stderr}${error.message}`, timedOut });
		});
		child.on("exit", (code: number | null): void => {
			if (settled) {
				return;
			}
			settled = true;
			if (timeout !== null) {
				clearTimeout(timeout);
			}
			resolveCommand({ exitCode: code ?? 1, stdout, stderr, timedOut });
		});
	});
}

export async function fetchLatestManagedBackendVersion(): Promise<string> {
	const result: CommandResult = await runCommand(getNpmCommand(), ["view", BACKEND_PACKAGE_NAME, "version"], {
		env: createNpmCommandEnv(),
		timeoutMs: NPM_VIEW_TIMEOUT_MS
	});
	if (result.exitCode !== 0) {
		throw new Error(result.timedOut
			? "Timed out reading latest backend version from npm."
			: result.stderr.trim() || result.stdout.trim() || "Could not read latest backend version from npm.");
	}

	const version: string = result.stdout.trim().split(/\s+/)[0] ?? "";
	if (version.length === 0) {
		throw new Error("npm returned an empty backend version.");
	}
	return version;
}

async function readInstalledBackendVersion(versionDir: string): Promise<string> {
	const manifestText: string = await readFile(join(versionDir, "node_modules", BACKEND_PACKAGE_NAME, "package.json"), "utf8");
	const manifest = JSON.parse(manifestText) as { version?: unknown };
	if (typeof manifest.version !== "string" || manifest.version.trim().length === 0) {
		throw new Error("Installed backend package has no version.");
	}
	return manifest.version.trim();
}

async function pruneBackendVersions(currentVersion: string, previousVersion: string | undefined): Promise<void> {
	const versionsDir: string = getManagedBackendVersionsDir();
	const entries = await readdir(versionsDir, { withFileTypes: true }).catch(() => []);
	const keep: Set<string> = new Set([currentVersion, ...(previousVersion === undefined ? [] : [previousVersion])]);
	const versions: string[] = entries
		.filter((entry): boolean => entry.isDirectory() && !entry.name.endsWith(".staging"))
		.map((entry): string => entry.name)
		.sort()
		.reverse();

	for (const version of versions) {
		if (keep.has(version)) {
			continue;
		}
		if (keep.size < MAX_BACKEND_VERSIONS) {
			keep.add(version);
			continue;
		}
		await rm(assertInside(versionsDir, join(versionsDir, version)), { recursive: true, force: true });
	}
}

export async function cleanupManagedBackendPreviousVersion(currentVersion: string, previousVersion: string | null): Promise<void> {
	if (previousVersion === null || previousVersion === currentVersion) {
		return;
	}

	const current: BackendCurrentFile | null = await readCurrentBackend();
	if (current === null || current.version !== currentVersion || current.previousVersion !== previousVersion) {
		return;
	}

	const versionsDir: string = getManagedBackendVersionsDir();
	await rm(assertInside(versionsDir, join(versionsDir, previousVersion)), {
		recursive: true,
		force: true,
		maxRetries: 8,
		retryDelay: 250
	});
	await writeJsonFile(getManagedBackendCurrentPath(), {
		version: current.version,
		path: current.path,
		updatedAt: current.updatedAt
	} satisfies BackendCurrentFile);
}

function resolveBackendPackageSpec(versionSpec: string): string {
	if (versionSpec === "latest") {
		return `${BACKEND_PACKAGE_NAME}@latest`;
	}
	if (versionSpec.match(/^\d+\.\d+\.\d+(?:[-+].*)?$/) === null) {
		throw new Error(`Invalid backend version: ${versionSpec}`);
	}
	return `${BACKEND_PACKAGE_NAME}@${versionSpec}`;
}

export async function installManagedBackendPackage(versionSpec: string = "latest"): Promise<{ version: string; path: string; previousVersion: string | undefined }> {
	const versionsDir: string = getManagedBackendVersionsDir();
	await mkdir(versionsDir, { recursive: true });

	const packageSpec: string = resolveBackendPackageSpec(versionSpec);
	const stagingName: string = versionSpec === "latest"
		? `${(await fetchLatestManagedBackendVersion())}.staging`
		: `${versionSpec}.staging`;
	const stagingDir: string = assertInside(versionsDir, join(versionsDir, stagingName));
	const previous: BackendCurrentFile | null = await readCurrentBackend();

	await rm(stagingDir, { recursive: true, force: true });
	await mkdir(stagingDir, { recursive: true });

	const installResult: CommandResult = await runCommand(getNpmCommand(), ["install", "--prefix", stagingDir, "--prefer-online", packageSpec], {
		env: createNpmCommandEnv(),
		timeoutMs: INSTALL_TIMEOUT_MS
	});
	if (installResult.exitCode !== 0) {
		await rm(stagingDir, { recursive: true, force: true });
		throw new Error(installResult.timedOut
			? `Timed out installing ${packageSpec}.`
			: installResult.stderr.trim() || installResult.stdout.trim() || `Failed to install ${packageSpec}.`);
	}

	const installedVersion: string = await readInstalledBackendVersion(stagingDir);
	const versionDir: string = assertInside(versionsDir, join(versionsDir, installedVersion));
	await rm(versionDir, { recursive: true, force: true });
	await rename(stagingDir, versionDir);

	const current: BackendCurrentFile = {
		version: installedVersion,
		path: versionDir,
		...(previous === null ? {} : { previousVersion: previous.version }),
		updatedAt: new Date().toISOString()
	};
	await writeJsonFile(getManagedBackendCurrentPath(), current);
	await pruneBackendVersions(installedVersion, previous?.version);
	return { version: installedVersion, path: versionDir, previousVersion: previous?.version };
}

function broadcastBackendBootstrapEvent(payload: BackendBootstrapState): void {
	for (const browserWindow of BrowserWindow?.getAllWindows?.() ?? []) {
		if (browserWindow.isDestroyed()) {
			continue;
		}
		browserWindow.webContents.send("backend-bootstrap:state-changed", payload);
	}
}

function getErrorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

export class BackendBootstrapService {
	private mainWindow: BrowserWindow | null = null;
	private state: BackendBootstrapState = createInitialState();
	private preparePromise: Promise<BackendBootstrapState> | null = null;
	private initialized: boolean = false;
	private readonly stateListeners: Set<(state: BackendBootstrapState) => void> = new Set();

	attachWindow(mainWindow: BrowserWindow): void {
		this.mainWindow = mainWindow;
	}

	getState(): BackendBootstrapState {
		return { ...this.state };
	}

	onDidChangeState(listener: (state: BackendBootstrapState) => void): () => void {
		this.stateListeners.add(listener);
		return (): void => {
			this.stateListeners.delete(listener);
		};
	}

	registerIpc(): void {
		if (this.initialized) {
			return;
		}
		this.initialized = true;
		if (typeof ipcMain?.handle !== "function") {
			return;
		}
		ipcMain.handle("backend-bootstrap:get-state", (): BackendBootstrapState => this.getState());
		ipcMain.handle("backend-bootstrap:prepare", async (): Promise<BackendBootstrapState> => await this.prepare());
		ipcMain.handle("backend-bootstrap:repair", async (): Promise<BackendBootstrapState> => await this.repair());
		ipcMain.handle("backend-bootstrap:retry-start", async (): Promise<BackendBootstrapState> => await this.retryStart());
	}

	async prepare(): Promise<BackendBootstrapState> {
		if (this.state.status === "healthy") {
			return this.getState();
		}
		if (this.preparePromise !== null) {
			return await this.preparePromise;
		}

		this.preparePromise = this.runAndCaptureErrors((): Promise<BackendBootstrapState> => this.runPrepare({ forceInstall: false }));
		try {
			return await this.preparePromise;
		} finally {
			this.preparePromise = null;
		}
	}

	async repair(): Promise<BackendBootstrapState> {
		if (this.preparePromise !== null) {
			return await this.preparePromise;
		}

		this.preparePromise = this.runAndCaptureErrors((): Promise<BackendBootstrapState> => this.runPrepare({ forceInstall: true }));
		try {
			return await this.preparePromise;
		} finally {
			this.preparePromise = null;
		}
	}

	async retryStart(): Promise<BackendBootstrapState> {
		if (this.preparePromise !== null) {
			return await this.preparePromise;
		}

		this.preparePromise = this.runAndCaptureErrors((): Promise<BackendBootstrapState> => this.runStartOnly());
		try {
			return await this.preparePromise;
		} finally {
			this.preparePromise = null;
		}
	}

	private async runPrepare(options: RunPrepareOptions): Promise<BackendBootstrapState> {
		const packaged: boolean = app?.isPackaged === true;
		const firstRunCompleted: boolean = await hasCompletedBackendBootstrap();
		this.updateState({
			status: "checking",
			phase: "detect",
			packaged,
			firstRun: !firstRunCompleted,
			progress: 5,
			errorCode: null,
			errorMessage: null,
			suggestedAction: null
		});

		if (!packaged) {
			return await this.startDevelopmentBackend();
		}

		const markedBackendError: { version: string | null; message: string } | null = options.forceInstall ? null : await getMarkedBackendMissingError();
		if (markedBackendError !== null) {
			return this.fail({
				status: "error",
				phase: "detect",
				progress: 100,
				errorCode: "marked_backend_missing",
				errorMessage: markedBackendError.message,
				suggestedAction: "Use Repair backend to reinstall the managed backend."
			});
		}

		let launchTarget: Pick<BackendLaunchTarget, "kind" | "version"> | null = backendManager.getLaunchTargetInfo();
		if (options.forceInstall || (launchTarget === null && !firstRunCompleted)) {
			const installed = await this.installBackend();
			launchTarget = { kind: "managed", version: installed.version };
			await writeCompletedBackendBootstrap(installed.version);
			backendManager.stop();
		}

		if (launchTarget === null) {
			return this.fail({
				status: "error",
				phase: "detect",
				progress: 100,
				errorCode: "backend_missing",
				errorMessage: "Daedalus backend is missing or damaged.",
				suggestedAction: "Use Repair backend to install a fresh managed backend."
			});
		}

		const startState: BackendBootstrapState = await this.startPackagedBackend();
		if (startState.status === "healthy" && !firstRunCompleted) {
			await writeCompletedBackendBootstrap(startState.backendVersion ?? launchTarget.version);
		}
		return startState;
	}

	private async installBackend(): Promise<{ version: string }> {
		this.updateState({
			status: "checking",
			phase: "resolve_latest",
			progress: 15,
			errorCode: null,
			errorMessage: null,
			suggestedAction: null
		});

		try {
			this.updateState({
				status: "installing",
				phase: "install",
				progress: 25
			});
			const result: { version: string; path: string; previousVersion: string | undefined } = await installManagedBackendPackage();
			this.updateState({
				status: "installing",
				phase: "write_metadata",
				progress: 60,
				backendVersion: result.version
			});
			return { version: result.version };
		} catch (error: unknown) {
			logger.error("Failed to install managed backend", error instanceof Error ? error : undefined);
			return this.rejectAfterFailure(error, {
				status: "error",
				phase: "install",
				progress: 100,
				errorCode: "install_failed",
				errorMessage: getErrorMessage(error),
				suggestedAction: "Check your npm registry or network access, then retry install."
			});
		}
	}

	private async startDevelopmentBackend(): Promise<BackendBootstrapState> {
		try {
			return await this.startBackend();
		} catch {
			return this.fail({
				status: "unsupported",
				phase: "health_check",
				progress: 100,
				errorCode: "dev_backend_unavailable",
				errorMessage: `Development backend did not become healthy on port ${backendManager.getPort()}.`,
				suggestedAction: "Run `npm run dev` in D:\\godot-daedalus_backend, then retry."
			});
		}
	}

	private async startPackagedBackend(): Promise<BackendBootstrapState> {
		try {
			return await this.startBackend();
		} catch (error: unknown) {
			return this.fail({
				status: "error",
				phase: "health_check",
				progress: 100,
				errorCode: "health_failed",
				errorMessage: getErrorMessage(error),
				suggestedAction: "Restart backend, or repair the managed backend installation."
			});
		}
	}

	private async runStartOnly(): Promise<BackendBootstrapState> {
		backendManager.stop();
		return app?.isPackaged === true ? await this.startPackagedBackend() : await this.startDevelopmentBackend();
	}

	private async startBackend(): Promise<BackendBootstrapState> {
		const mainWindow: BrowserWindow = this.requireMainWindow();
		this.updateState({
			status: "starting",
			phase: "start",
			progress: Math.max(this.state.progress, 65),
			errorCode: null,
			errorMessage: null,
			suggestedAction: null
		});
		await backendManager.start(mainWindow);
		this.updateState({
			status: "starting",
			phase: "health_check",
			progress: 75
		});
		await backendManager.waitUntilHealthy();
		const launchTarget: Pick<BackendLaunchTarget, "kind" | "version"> | null = app?.isPackaged === true ? backendManager.getLaunchTargetInfo() : null;
		this.updateState({
			status: "healthy",
			phase: "ready",
			progress: 100,
			backendVersion: app?.isPackaged === true ? launchTarget?.version ?? this.state.backendVersion : null,
			errorCode: null,
			errorMessage: null,
			suggestedAction: null
		});
		return this.getState();
	}

	private requireMainWindow(): BrowserWindow {
		if (this.mainWindow === null || this.mainWindow.isDestroyed()) {
			throw new Error("Main window is not ready.");
		}
		return this.mainWindow;
	}

	private fail(patch: {
		status: "error" | "unsupported";
		phase: BackendBootstrapPhase;
		progress: number;
		errorCode: string;
		errorMessage: string;
		suggestedAction: string;
	}): BackendBootstrapState {
		this.updateState({
			...patch,
			packaged: app?.isPackaged === true
		});
		return this.getState();
	}

	private rejectAfterFailure<T>(error: unknown, patch: Parameters<BackendBootstrapService["fail"]>[0]): Promise<T> {
		this.fail(patch);
		return Promise.reject(error);
	}

	private async runAndCaptureErrors(task: () => Promise<BackendBootstrapState>): Promise<BackendBootstrapState> {
		try {
			return await task();
		} catch (error: unknown) {
			if (this.state.status === "error" || this.state.status === "unsupported") {
				return this.getState();
			}
			return this.fail({
				status: app?.isPackaged === true ? "error" : "unsupported",
				phase: "error",
				progress: 100,
				errorCode: "bootstrap_failed",
				errorMessage: getErrorMessage(error),
				suggestedAction: app?.isPackaged === true
					? "Retry startup or repair the managed backend installation."
					: "Run `npm run dev` in D:\\godot-daedalus_backend, then retry."
			});
		}
	}

	private updateState(patch: Partial<BackendBootstrapState>): void {
		this.state = {
			...this.state,
			...patch,
			port: backendManager.getPort()
		};
		const nextState: BackendBootstrapState = this.getState();
		broadcastBackendBootstrapEvent(nextState);
		for (const listener of this.stateListeners) {
			listener(nextState);
		}
	}
}

export const backendBootstrapService: BackendBootstrapService = new BackendBootstrapService();

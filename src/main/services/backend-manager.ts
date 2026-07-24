import { app, BrowserWindow, ipcMain } from "electron";
import { randomBytes } from "node:crypto";
import { ChildProcess, spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve, sep } from "node:path";
import WebSocket from "ws";
import {
	BACKEND_PROTOCOL_VERSION,
	parseBackendPayloadManifest,
	type BackendPayloadManifestV1
} from "./backend-binary-manifest";
import {
	getBundledBackendDir,
	getManagedBackendCurrentPath,
	getManagedBackendVersionsDir,
	inspectBundledBackend,
	inspectInstalledBackend,
	type InstalledBackendBinary,
	type BackendCurrentFileV2
} from "./backend-binary-store";
import { createLogger } from "./logger";
import { BackendStatus } from "./types";

const logger = createLogger("backend-manager");

const DEV_PORT: number = 38181;
const PROD_PORT: number = 38180;
const HEALTH_CHECK_INTERVAL: number = 5000;
const HEALTH_CHECK_TIMEOUT: number = 2500;
const MAX_RESTART_ATTEMPTS: number = 5;
const RESTART_DELAY: number = 2000;
const RESTART_HEALTH_TIMEOUT: number = 20000;
const RESTART_HEALTH_POLL_INTERVAL: number = 500;
const GRACEFUL_SHUTDOWN_TIMEOUT: number = 5000;
const AUTH_PROTOCOL_PREFIX: string = "daedalus-auth.";

type ProcessManagerConfig = {
	readonly maxRestartAttempts: number;
	readonly restartDelay: number;
	readonly healthCheckInterval: number;
	readonly healthCheckTimeout: number;
};

export type BackendLaunchTarget = {
	readonly kind: "bundled" | "managed";
	readonly cwd: string;
	readonly executablePath: string;
	readonly args: string[];
	readonly version: string;
	readonly protocolVersion: number;
	readonly buildId: string;
	readonly nodeVersion: string;
};

export type BackendConnectionInfo = {
	port: number;
	authProtocol: string | null;
};

type BackendHealthResult = {
	name?: unknown;
	version?: unknown;
	buildId?: unknown;
	distribution?: unknown;
	runtime?: {
		nodeVersion?: unknown;
		platform?: unknown;
		arch?: unknown;
	};
	multiClient?: {
		protocolVersion?: unknown;
	};
};

type RpcResponse = {
	type?: unknown;
	id?: unknown;
	ok?: unknown;
	result?: unknown;
	error?: {
		message?: unknown;
	};
};

function isInside(parentDir: string, childPath: string): boolean {
	const resolvedParent: string = resolve(parentDir);
	const resolvedChild: string = resolve(childPath);
	return resolvedChild === resolvedParent || resolvedChild.startsWith(`${resolvedParent}${sep}`);
}

function parseCurrentFileSync(currentPath: string): BackendCurrentFileV2 | null {
	if (!existsSync(currentPath)) {
		return null;
	}
	try {
		const value: unknown = JSON.parse(readFileSync(currentPath, "utf8"));
		if (typeof value !== "object" || value === null || Array.isArray(value)) {
			return null;
		}
		const record = value as Record<string, unknown>;
		if (
			record.schemaVersion !== 2
			|| record.distribution !== "binary"
			|| typeof record.version !== "string"
			|| typeof record.executablePath !== "string"
			|| typeof record.manifestPath !== "string"
			|| typeof record.protocolVersion !== "number"
			|| typeof record.updatedAt !== "string"
		) {
			return null;
		}
		if (
			!isInside(getManagedBackendVersionsDir(), record.executablePath)
			|| !isInside(getManagedBackendVersionsDir(), record.manifestPath)
		) {
			return null;
		}
		return {
			schemaVersion: 2,
			distribution: "binary",
			version: record.version,
			executablePath: resolve(record.executablePath),
			manifestPath: resolve(record.manifestPath),
			protocolVersion: record.protocolVersion,
			updatedAt: record.updatedAt,
			...(typeof record.previousVersion === "string"
				? { previousVersion: record.previousVersion }
				: {})
		};
	} catch {
		return null;
	}
}

export function resolveManagedBackendLaunchTarget(
	currentPath: string = getManagedBackendCurrentPath()
): BackendLaunchTarget | null {
	const current: BackendCurrentFileV2 | null = parseCurrentFileSync(currentPath);
	if (
		current === null
		|| !existsSync(current.executablePath)
		|| !existsSync(current.manifestPath)
	) {
		return null;
	}
	try {
		const manifest: BackendPayloadManifestV1 = parseBackendPayloadManifest(
			JSON.parse(readFileSync(current.manifestPath, "utf8")) as unknown
		);
		if (
			manifest.version !== current.version
			|| manifest.protocolVersion !== current.protocolVersion
			|| manifest.executable.fileName !== "daedalus-backend.exe"
			|| dirname(current.executablePath) !== dirname(current.manifestPath)
		) {
			return null;
		}
		return {
			kind: "managed",
			cwd: dirname(current.executablePath),
			executablePath: current.executablePath,
			args: ["serve"],
			version: current.version,
			protocolVersion: current.protocolVersion,
			buildId: manifest.buildId,
			nodeVersion: manifest.nodeVersion
		};
	} catch {
		return null;
	}
}

function resolveBundledBackendLaunchTarget(): BackendLaunchTarget | null {
	const bundleDir: string = getBundledBackendDir();
	const manifestPath: string = join(bundleDir, "backend-manifest.json");
	const executablePath: string = join(bundleDir, "daedalus-backend.exe");
	if (!existsSync(manifestPath) || !existsSync(executablePath)) {
		return null;
	}
	try {
		const manifest: BackendPayloadManifestV1 = parseBackendPayloadManifest(
			JSON.parse(readFileSync(manifestPath, "utf8")) as unknown
		);
		return {
			kind: "bundled",
			cwd: bundleDir,
			executablePath,
			args: ["serve"],
			version: manifest.version,
			protocolVersion: manifest.protocolVersion,
			buildId: manifest.buildId,
			nodeVersion: manifest.nodeVersion
		};
	} catch {
		return null;
	}
}

class BackendManager {
	private process: ChildProcess | null = null;
	private readonly port: number;
	private status: BackendStatus = "stopped";
	private healthTimer: ReturnType<typeof setInterval> | null = null;
	private mainWindow: BrowserWindow | null = null;
	private restartAttempts: number = 0;
	private restartTimer: ReturnType<typeof setTimeout> | null = null;
	private isShuttingDown: boolean = false;
	private readonly config: ProcessManagerConfig;
	private readonly statusListeners: Set<(status: BackendStatus) => void> = new Set();
	private authToken: string | null = null;
	private connectionId: string | null = null;
	private activeTarget: BackendLaunchTarget | null = null;

	public constructor() {
		this.port = app?.isPackaged === true ? PROD_PORT : DEV_PORT;
		this.config = {
			maxRestartAttempts: MAX_RESTART_ATTEMPTS,
			restartDelay: RESTART_DELAY,
			healthCheckInterval: HEALTH_CHECK_INTERVAL,
			healthCheckTimeout: HEALTH_CHECK_TIMEOUT
		};
	}

	public async start(mainWindow: BrowserWindow): Promise<void> {
		this.mainWindow = mainWindow;
		this.isShuttingDown = false;
		if (app?.isPackaged === true && this.authToken === null) {
			this.authToken = randomBytes(32).toString("base64url");
			this.connectionId = randomBytes(32).toString("base64url");
		}

		if (this.status === "starting" || this.status === "healthy") {
			this.startHealthCheck();
			return;
		}
		this.setStatus("starting");

		if (!app.isPackaged) {
			logger.info(`Development mode: expecting the backend on ws://127.0.0.1:${this.port}`);
		} else {
			const launchTarget: BackendLaunchTarget | null = this.resolveBackendLaunchTarget();
			if (launchTarget === null) {
				this.setStatus("unhealthy");
				throw new Error("No verified packaged backend is available.");
			}
			await this.spawnProcess(launchTarget);
		}
		this.startHealthCheck();
	}

	public resolveBackendLaunchTarget(): BackendLaunchTarget | null {
		const managed: BackendLaunchTarget | null = resolveManagedBackendLaunchTarget();
		if (managed !== null) {
			return managed;
		}
		return resolveBundledBackendLaunchTarget();
	}

	public hasLaunchTarget(): boolean {
		return this.resolveBackendLaunchTarget() !== null;
	}

	public getLaunchTargetInfo(): Pick<BackendLaunchTarget, "kind" | "version" | "protocolVersion"> | null {
		const target: BackendLaunchTarget | null = this.resolveBackendLaunchTarget();
		return target === null
			? null
			: {
				kind: target.kind,
				version: target.version,
				protocolVersion: target.protocolVersion
			};
	}

	public stop(): void {
		void this.stopAndWait();
	}

	public async stopAndWait(): Promise<void> {
		this.isShuttingDown = true;
		this.stopHealthCheck();
		this.clearRestartTimer();
		this.restartAttempts = 0;
		const processToStop: ChildProcess | null = this.process;
		if (processToStop === null) {
			this.setStatus("stopped");
			return;
		}

		await this.requestGracefulShutdown().catch((): void => {});
		const exited: boolean = await this.waitForProcessExit(processToStop, GRACEFUL_SHUTDOWN_TIMEOUT);
		if (!exited && this.process === processToStop) {
			logger.warn("Backend graceful shutdown timed out; terminating the process.");
			processToStop.kill();
			await this.waitForProcessExit(processToStop, 1000);
		}
		if (this.process === processToStop) {
			this.process = null;
		}
		this.activeTarget = null;
		this.setStatus("stopped");
	}

	public getPort(): number {
		return this.port;
	}

	public getConnectionInfo(): BackendConnectionInfo {
		return {
			port: this.port,
			authProtocol: this.authToken === null ? null : `${AUTH_PROTOCOL_PREFIX}${this.authToken}`
		};
	}

	public getStatus(): BackendStatus {
		return this.status;
	}

	public onDidChangeStatus(listener: (status: BackendStatus) => void): () => void {
		this.statusListeners.add(listener);
		return (): void => {
			this.statusListeners.delete(listener);
		};
	}

	public registerIpc(): void {
		ipcMain.handle("backend:get-port", (): number => this.port);
		ipcMain.handle("backend:get-connection-info", (): BackendConnectionInfo => this.getConnectionInfo());
		ipcMain.handle("backend:get-status", (): BackendStatus => this.status);
		ipcMain.handle("backend:health-check", async (): Promise<boolean> => await this.ping());
		ipcMain.handle("backend:restart", async (): Promise<void> => await this.restartAndWaitHealthy());
	}

	public async restart(): Promise<void> {
		await this.stopAndWait();
		this.isShuttingDown = false;
		this.setStatus("starting");
		if (app.isPackaged) {
			const launchTarget: BackendLaunchTarget | null = this.resolveBackendLaunchTarget();
			if (launchTarget === null) {
				this.setStatus("unhealthy");
				throw new Error("No packaged backend is available.");
			}
			await this.spawnProcess(launchTarget);
		}
		this.startHealthCheck();
	}

	public async restartAndWaitHealthy(): Promise<void> {
		await this.restart();
		await this.waitUntilHealthy(RESTART_HEALTH_TIMEOUT);
	}

	public async startAndWaitHealthy(
		mainWindow: BrowserWindow,
		timeoutMs: number = RESTART_HEALTH_TIMEOUT
	): Promise<void> {
		await this.start(mainWindow);
		await this.waitUntilHealthy(timeoutMs);
	}

	public async waitUntilHealthy(timeoutMs: number = RESTART_HEALTH_TIMEOUT): Promise<void> {
		const deadline: number = Date.now() + timeoutMs;
		while (Date.now() < deadline) {
			if (await this.ping()) {
				this.setStatus("healthy");
				this.restartAttempts = 0;
				return;
			}
			await new Promise((resolveWait): void => {
				setTimeout(resolveWait, RESTART_HEALTH_POLL_INTERVAL);
			});
		}
		this.setStatus("unhealthy");
		throw new Error("Timed out waiting for backend to become healthy.");
	}

	private async spawnProcess(launchTarget: BackendLaunchTarget): Promise<void> {
		const inspected: InstalledBackendBinary = launchTarget.kind === "managed"
			? await inspectInstalledBackend(launchTarget.cwd)
			: await inspectBundledBackend();
		if (
			inspected.executablePath !== launchTarget.executablePath
			|| inspected.version !== launchTarget.version
			|| inspected.manifest.protocolVersion !== launchTarget.protocolVersion
			|| inspected.manifest.buildId !== launchTarget.buildId
			|| inspected.manifest.nodeVersion !== launchTarget.nodeVersion
		) {
			throw new Error("Backend launch target changed after it was selected.");
		}
		if (this.authToken !== null && this.connectionId === null) {
			throw new Error("Backend runtime connection ID is unavailable.");
		}
		logger.info("Starting backend binary", {
			kind: launchTarget.kind,
			cwd: launchTarget.cwd,
			executablePath: launchTarget.executablePath,
			version: launchTarget.version,
			protocolVersion: launchTarget.protocolVersion,
			port: this.port
		});
		this.activeTarget = launchTarget;
		const child: ChildProcess = spawn(launchTarget.executablePath, launchTarget.args, {
			cwd: launchTarget.cwd,
			env: {
				...process.env,
				PORT: String(this.port),
				...(this.authToken === null
					? {}
					: {
						DAEDALUS_BACKEND_AUTH_TOKEN: this.authToken,
						DAEDALUS_BACKEND_CONNECTION_ID: this.connectionId!,
						DAEDALUS_STUDIO_PID: String(process.pid)
					})
			},
			windowsHide: true,
			stdio: "pipe"
		});
		this.process = child;
		child.stdout?.on("data", (data: Buffer): void => {
			logger.info(data.toString().trim());
		});
		child.stderr?.on("data", (data: Buffer): void => {
			logger.error("Backend error output", undefined, { output: data.toString().trim() });
		});
		child.on("exit", (code: number | null): void => {
			logger.info("Backend process exited", { code });
			if (this.process === child) {
				this.process = null;
			}
			if (this.isShuttingDown) {
				this.setStatus("stopped");
				return;
			}
			this.handleProcessCrash();
		});
		child.on("error", (error: Error): void => {
			logger.error("Backend process error", error);
			if (this.process === child) {
				this.process = null;
			}
			if (!this.isShuttingDown) {
				this.handleProcessCrash();
			}
		});
	}

	private handleProcessCrash(): void {
		if (this.restartAttempts >= this.config.maxRestartAttempts) {
			logger.error("Backend reached the restart limit.", undefined, {
				attempts: this.restartAttempts,
				maxAttempts: this.config.maxRestartAttempts
			});
			this.setStatus("unhealthy");
			return;
		}
		this.restartAttempts += 1;
		const delay: number = this.config.restartDelay * (2 ** (this.restartAttempts - 1));
		logger.warn("Backend crashed; scheduling restart.", {
			attempt: this.restartAttempts,
			maxAttempts: this.config.maxRestartAttempts,
			delay
		});
		this.setStatus("starting");
		this.restartTimer = setTimeout(async (): Promise<void> => {
			if (this.isShuttingDown) {
				return;
			}
			try {
				const launchTarget: BackendLaunchTarget | null = this.resolveBackendLaunchTarget();
				if (launchTarget === null) {
					this.setStatus("unhealthy");
					return;
				}
				await this.spawnProcess(launchTarget);
			} catch (error: unknown) {
				logger.error("Backend process failed to restart", error as Error);
				this.handleProcessCrash();
			}
		}, delay);
	}

	private clearRestartTimer(): void {
		if (this.restartTimer !== null) {
			clearTimeout(this.restartTimer);
			this.restartTimer = null;
		}
	}

	private startHealthCheck(): void {
		this.stopHealthCheck();
		this.healthTimer = setInterval(async (): Promise<void> => {
			const ok: boolean = await this.ping();
			if (ok) {
				this.setStatus("healthy");
				this.restartAttempts = 0;
			} else {
				this.setStatus("unhealthy");
			}
		}, this.config.healthCheckInterval);
	}

	private stopHealthCheck(): void {
		if (this.healthTimer !== null) {
			clearInterval(this.healthTimer);
			this.healthTimer = null;
		}
	}

	private async requestRpc<TResult>(
		method: string,
		timeoutMs: number = this.config.healthCheckTimeout
	): Promise<TResult> {
		return await new Promise<TResult>((resolveRequest, rejectRequest): void => {
			const id: string = `studio-main-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
			const ws: WebSocket = new WebSocket(`ws://127.0.0.1:${this.port}`, {
				headers: this.authToken === null
					? {}
					: { Authorization: `Bearer ${this.authToken}` }
			});
			let settled: boolean = false;
			const finish = (error: Error | null, result?: TResult): void => {
				if (settled) {
					return;
				}
				settled = true;
				clearTimeout(timeout);
				ws.close();
				if (error !== null) {
					rejectRequest(error);
				} else {
					resolveRequest(result as TResult);
				}
			};
			const timeout: ReturnType<typeof setTimeout> = setTimeout((): void => {
				finish(new Error(`Timed out waiting for ${method}.`));
			}, timeoutMs);
			ws.on("open", (): void => {
				ws.send(JSON.stringify({
					protocolVersion: BACKEND_PROTOCOL_VERSION,
					type: "request",
					id,
					method
				}));
			});
			ws.on("message", (data: WebSocket.RawData): void => {
				try {
					const response: RpcResponse = JSON.parse(data.toString()) as RpcResponse;
					if (response.type !== "response" || response.id !== id || typeof response.ok !== "boolean") {
						return;
					}
					if (response.ok) {
						finish(null, response.result as TResult);
					} else {
						finish(new Error(
							typeof response.error?.message === "string"
								? response.error.message
								: `${method} failed.`
						));
					}
				} catch (error: unknown) {
					finish(error instanceof Error ? error : new Error(`Invalid ${method} response.`));
				}
			});
			ws.on("error", (error: Error): void => {
				finish(error);
			});
		});
	}

	private async ping(): Promise<boolean> {
		try {
			const health: BackendHealthResult = await this.requestRpc<BackendHealthResult>("backend.health");
			const expected: BackendLaunchTarget | null = this.activeTarget;
			return health.name === "godot-daedalus-backend"
				&& health.multiClient?.protocolVersion === BACKEND_PROTOCOL_VERSION
				&& health.runtime?.platform === process.platform
				&& health.runtime?.arch === process.arch
				&& (expected === null || (
					health.distribution === "sea"
					&& health.version === expected.version
					&& health.buildId === expected.buildId
					&& health.runtime?.nodeVersion === expected.nodeVersion
					&& health.multiClient.protocolVersion === expected.protocolVersion
				));
		} catch {
			return false;
		}
	}

	private async requestGracefulShutdown(): Promise<void> {
		if (this.process === null) {
			return;
		}
		await this.requestRpc("backend.shutdown", 2000);
	}

	private async waitForProcessExit(child: ChildProcess, timeoutMs: number): Promise<boolean> {
		if (child.exitCode !== null) {
			return true;
		}
		return await new Promise<boolean>((resolveWait): void => {
			let settled: boolean = false;
			const finish = (exited: boolean): void => {
				if (settled) {
					return;
				}
				settled = true;
				clearTimeout(timeout);
				resolveWait(exited);
			};
			const timeout: ReturnType<typeof setTimeout> = setTimeout((): void => {
				finish(false);
			}, timeoutMs);
			child.once("exit", (): void => {
				finish(true);
			});
		});
	}

	private setStatus(status: BackendStatus): void {
		if (this.status !== status) {
			logger.debug("Status changed", { from: this.status, to: status });
		}
		this.status = status;
		this.mainWindow?.webContents.send("backend:status-changed", status);
		for (const listener of this.statusListeners) {
			listener(status);
		}
	}
}

export const backendManager = new BackendManager();

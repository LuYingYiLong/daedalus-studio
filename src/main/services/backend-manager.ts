import { app, BrowserWindow, ipcMain, shell } from "electron";
import { ChildProcess, spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
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
// 打包版首次冷启动会初始化本地索引和自定义 MCP；给慢磁盘、代理环境留出真实的启动窗口。
const RESTART_HEALTH_TIMEOUT: number = 45_000;
const RESTART_HEALTH_POLL_INTERVAL: number = 500;
const GRACEFUL_SHUTDOWN_TIMEOUT: number = 5000;
const AUTH_PROTOCOL_PREFIX: string = "daedalus-auth.";
const RUNTIME_ACQUIRE_TIMEOUT: number = 15_000;
const MAX_RUNTIME_ACQUIRE_OUTPUT_BYTES: number = 64 * 1024;

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

export type BackendDiagnostics = {
	status: BackendStatus;
	port: number;
	name: string | null;
	version: string | null;
	processId: number | null;
	logPath: string | null;
};

export type BackendLogTail = {
	path: string | null;
	content: string;
	truncated: boolean;
};

type BackendHealthResult = {
	name?: unknown;
	version?: unknown;
	pid?: unknown;
	logPath?: unknown;
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
	clients?: {
		total?: unknown;
		byType?: {
			godot_editor_bridge?: unknown;
		};
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
	private runtimeLeaseSocket: WebSocket | null = null;
	private runtimeLeasePromise: Promise<void> | null = null;
	private connectionInfoPromise: Promise<BackendConnectionInfo> | null = null;

	public constructor() {
		const e2ePort: number = Number(process.env.DAEDALUS_E2E_BACKEND_PORT);
		this.port = app?.isPackaged === true
			? PROD_PORT
			: Number.isInteger(e2ePort) && e2ePort >= 1024 && e2ePort <= 65535
				? e2ePort
				: DEV_PORT;
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
			await this.ensureRuntimeLease();
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
			await this.requestGracefulShutdown().catch((): void => {});
			this.closeRuntimeLease();
			this.authToken = null;
			this.connectionId = null;
			this.activeTarget = null;
			this.setStatus("stopped");
			return;
		}

		await this.requestGracefulShutdown().catch((): void => {});
		this.closeRuntimeLease();
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
		this.authToken = null;
		this.connectionId = null;
		this.setStatus("stopped");
	}

	public detach(): void {
		this.isShuttingDown = true;
		this.stopHealthCheck();
		this.clearRestartTimer();
		this.closeRuntimeLease();
		this.process = null;
		this.activeTarget = null;
		this.authToken = null;
		this.connectionId = null;
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

	public async getReadyConnectionInfo(): Promise<BackendConnectionInfo> {
		if (!app.isPackaged) {
			return this.getConnectionInfo();
		}
		if (await this.ping()) {
			this.setStatus("healthy");
			await this.ensureRuntimeLease();
			return this.getConnectionInfo();
		}
		if (this.connectionInfoPromise !== null) {
			return await this.connectionInfoPromise;
		}

		this.connectionInfoPromise = (async (): Promise<BackendConnectionInfo> => {
			if (this.status === "starting") {
				await this.waitUntilHealthy();
			} else {
				await this.restartAndWaitHealthy();
			}
			await this.ensureRuntimeLease();
			return this.getConnectionInfo();
		})();
		try {
			return await this.connectionInfoPromise;
		} finally {
			this.connectionInfoPromise = null;
		}
	}

	public getStatus(): BackendStatus {
		return this.status;
	}

	public async getConnectedGodotClientCount(): Promise<number> {
		const health: BackendHealthResult = await this.requestRpc<BackendHealthResult>("backend.health");
		const count: unknown = health.clients?.byType?.godot_editor_bridge;
		return typeof count === "number" && Number.isSafeInteger(count) && count > 0 ? count : 0;
	}

	public async getDiagnostics(): Promise<BackendDiagnostics> {
		const health: BackendHealthResult = await this.requestRpc<BackendHealthResult>("backend.health");
		return {
			status: this.status,
			port: this.port,
			name: typeof health.name === "string" ? health.name : null,
			version: typeof health.version === "string" ? health.version : null,
			processId: typeof health.pid === "number" && Number.isSafeInteger(health.pid) ? health.pid : null,
			logPath: typeof health.logPath === "string" && health.logPath.length > 0 ? health.logPath : null
		};
	}

	public async getLogTail(): Promise<BackendLogTail> {
		const diagnostics: BackendDiagnostics = await this.getDiagnostics();
		if (diagnostics.logPath === null) {
			return { path: null, content: "", truncated: false };
		}
		const maxBytes: number = 64 * 1024;
		const logBuffer: Buffer = await readFile(diagnostics.logPath);
		const truncated: boolean = logBuffer.byteLength > maxBytes;
		const content: string = logBuffer.subarray(Math.max(0, logBuffer.byteLength - maxBytes)).toString("utf8");
		return { path: diagnostics.logPath, content, truncated };
	}

	public onDidChangeStatus(listener: (status: BackendStatus) => void): () => void {
		this.statusListeners.add(listener);
		return (): void => {
			this.statusListeners.delete(listener);
		};
	}

	public registerIpc(): void {
		ipcMain.handle("backend:get-port", (): number => this.port);
		ipcMain.handle(
			"backend:get-connection-info",
			async (): Promise<BackendConnectionInfo> => await this.getReadyConnectionInfo()
		);
		ipcMain.handle("backend:get-status", (): BackendStatus => this.status);
		ipcMain.handle("backend:health-check", async (): Promise<boolean> => await this.ping());
		ipcMain.handle("backend:get-diagnostics", async (): Promise<BackendDiagnostics> => await this.getDiagnostics());
		ipcMain.handle("backend:get-log-tail", async (): Promise<BackendLogTail> => await this.getLogTail());
		ipcMain.handle("backend:open-log", async (): Promise<{ opened: boolean; path: string | null }> => {
			const diagnostics: BackendDiagnostics = await this.getDiagnostics();
			if (diagnostics.logPath === null) {
				return { opened: false, path: null };
			}
			const openError: string = await shell.openPath(diagnostics.logPath);
			if (openError.length > 0) {
				throw new Error(openError);
			}
			return { opened: true, path: diagnostics.logPath };
		});
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
			await this.ensureRuntimeLease();
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
		logger.info("Acquiring shared backend runtime", {
			kind: launchTarget.kind,
			cwd: launchTarget.cwd,
			executablePath: launchTarget.executablePath,
			version: launchTarget.version,
			protocolVersion: launchTarget.protocolVersion,
			port: this.port
		});
		const child: ChildProcess = spawn(launchTarget.executablePath, [
			"runtime",
			"acquire",
			"--client",
			"studio",
			"--json"
		], {
			cwd: launchTarget.cwd,
			env: {
				...process.env,
				...(process.platform === "win32"
					&& !(process.env.DAEDALUS_WINDOWS_SANDBOX_HELPER?.trim())
					&& existsSync(join(launchTarget.cwd, "daedalus-windows-sandbox-helper.exe"))
					? { DAEDALUS_WINDOWS_SANDBOX_HELPER: join(launchTarget.cwd, "daedalus-windows-sandbox-helper.exe") }
					: {}),
				NODE_USE_SYSTEM_CA: process.env.NODE_USE_SYSTEM_CA ?? "1"
			},
			windowsHide: true,
			stdio: "pipe"
		});
		const output: { stdout: string; stderr: string } = await new Promise((resolveAcquire, rejectAcquire): void => {
			let stdout: string = "";
			let stderr: string = "";
			let settled: boolean = false;
			const timeout: ReturnType<typeof setTimeout> = setTimeout((): void => {
				child.kill();
				finish(new Error("Timed out acquiring the shared backend runtime."));
			}, RUNTIME_ACQUIRE_TIMEOUT);
			const finish = (error: Error | null): void => {
				if (settled) {
					return;
				}
				settled = true;
				clearTimeout(timeout);
				if (error !== null) {
					rejectAcquire(error);
				} else {
					resolveAcquire({ stdout, stderr });
				}
			};
			const append = (current: string, data: Buffer): string => {
				const next: string = current + data.toString("utf8");
				if (Buffer.byteLength(next, "utf8") > MAX_RUNTIME_ACQUIRE_OUTPUT_BYTES) {
					child.kill();
					finish(new Error("Shared runtime command produced too much output."));
				}
				return next;
			};
			child.stdout?.on("data", (data: Buffer): void => {
				stdout = append(stdout, data);
			});
			child.stderr?.on("data", (data: Buffer): void => {
				stderr = append(stderr, data);
			});
			child.once("error", (error: Error): void => finish(error));
			child.once("exit", (code: number | null): void => {
				finish(code === 0
					? null
					: new Error(stderr.trim() || `Shared runtime command exited with code ${code}.`)
				);
			});
		});
		const result: unknown = JSON.parse(output.stdout.trim()) as unknown;
		if (typeof result !== "object" || result === null || Array.isArray(result)) {
			throw new Error("Shared runtime command returned an invalid response.");
		}
		const record = result as {
			ok?: unknown;
			authProtocol?: unknown;
			connection?: {
				connectionId?: unknown;
				port?: unknown;
				version?: unknown;
				buildId?: unknown;
			};
		};
		if (
			record.ok !== true
			|| typeof record.authProtocol !== "string"
			|| !record.authProtocol.startsWith(AUTH_PROTOCOL_PREFIX)
			|| typeof record.connection?.connectionId !== "string"
			|| record.connection.port !== this.port
			|| record.connection.version !== launchTarget.version
			|| record.connection.buildId !== launchTarget.buildId
		) {
			throw new Error("Shared runtime identity does not match the selected backend.");
		}
		this.authToken = record.authProtocol.slice(AUTH_PROTOCOL_PREFIX.length);
		this.connectionId = record.connection.connectionId;
		this.activeTarget = launchTarget;
	}

	private async ensureRuntimeLease(): Promise<void> {
		if (!app.isPackaged || this.isShuttingDown) {
			return;
		}
		if (this.runtimeLeaseSocket?.readyState === WebSocket.OPEN) {
			return;
		}
		if (this.runtimeLeasePromise !== null) {
			return await this.runtimeLeasePromise;
		}

		this.runtimeLeasePromise = this.openRuntimeLease();
		try {
			await this.runtimeLeasePromise;
		} finally {
			this.runtimeLeasePromise = null;
		}
	}

	private async openRuntimeLease(): Promise<void> {
		if (this.authToken === null) {
			throw new Error("Backend runtime authentication is unavailable.");
		}

		const socket = new WebSocket(
			`ws://127.0.0.1:${this.port}`,
			`${AUTH_PROTOCOL_PREFIX}${this.authToken}`
		);
		this.runtimeLeaseSocket = socket;

		await new Promise<void>((resolveOpen, rejectOpen): void => {
			let settled: boolean = false;
			const timeout: ReturnType<typeof setTimeout> = setTimeout((): void => {
				if (!settled) {
					socket.terminate();
					finish(new Error("Timed out establishing the Studio backend runtime lease."));
				}
			}, HEALTH_CHECK_TIMEOUT);
			const finish = (error: Error | null): void => {
				if (settled) {
					return;
				}
				settled = true;
				clearTimeout(timeout);
				if (error === null) {
					resolveOpen();
				} else {
					if (this.runtimeLeaseSocket === socket) {
						this.runtimeLeaseSocket = null;
					}
					rejectOpen(error);
				}
			};

			socket.once("open", (): void => finish(null));
			socket.on("error", (error: Error): void => {
				if (!settled) {
					finish(error);
					return;
				}
				logger.warn("Backend runtime lease socket error.", { message: error.message });
			});
			socket.once("close", (): void => {
				if (this.runtimeLeaseSocket === socket) {
					this.runtimeLeaseSocket = null;
				}
				if (!settled) {
					finish(new Error("Backend runtime lease closed before it was ready."));
				}
			});
		});
	}

	private closeRuntimeLease(): void {
		const socket: WebSocket | null = this.runtimeLeaseSocket;
		this.runtimeLeaseSocket = null;
		if (socket === null || socket.readyState === WebSocket.CLOSED) {
			return;
		}
		if (socket.readyState === WebSocket.CONNECTING) {
			socket.terminate();
			return;
		}
		socket.close(1000, "Daedalus Studio is releasing the backend runtime");
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
				await this.ensureRuntimeLease();
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
				void this.ensureRuntimeLease().catch((error: unknown): void => {
					logger.warn("Failed to restore the Studio backend runtime lease.", {
						message: error instanceof Error ? error.message : String(error)
					});
				});
			} else {
				const wasHealthy: boolean = this.status === "healthy";
				this.setStatus("unhealthy");
				if (wasHealthy && !this.isShuttingDown) {
					this.handleProcessCrash();
				}
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
		if (this.authToken === null) {
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
		const mainWindow: BrowserWindow | null = this.mainWindow;
		if (mainWindow !== null && !mainWindow.isDestroyed() && !mainWindow.webContents.isDestroyed()) {
			mainWindow.webContents.send("backend:status-changed", status);
		}
		for (const listener of this.statusListeners) {
			listener(status);
		}
	}
}

export const backendManager = new BackendManager();

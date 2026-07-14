import { app, BrowserWindow, ipcMain } from "electron";
import { join } from "node:path";
import { existsSync } from "node:fs";
import WebSocket from "ws";
import { ChildProcess, spawn } from "node:child_process";
import { BackendStatus } from "./types";
import { createLogger } from "./logger";

const logger = createLogger("backend-manager");

const DEV_PORT: number = 38181;
const PROD_PORT: number = 38180;

const HEALTH_CHECK_INTERVAL: number = 5000;
const HEALTH_CHECK_TIMEOUT: number = 2000;
const MAX_RESTART_ATTEMPTS: number = 5;
const RESTART_DELAY: number = 2000;

type ProcessManagerConfig = {
	readonly maxRestartAttempts: number;
	readonly restartDelay: number;
	readonly healthCheckInterval: number;
	readonly healthCheckTimeout: number;
};

class BackendManager {
	private process: ChildProcess | null = null;
	private port: number;
	private status: BackendStatus = "stopped";
	private healthTimer: ReturnType<typeof setInterval> | null = null;
	private mainWindow: BrowserWindow | null = null;
	private restartAttempts: number = 0;
	private restartTimer: ReturnType<typeof setTimeout> | null = null;
	private isShuttingDown: boolean = false;
	private readonly config: ProcessManagerConfig;

	constructor() {
		this.port = app.isPackaged ? PROD_PORT : DEV_PORT;
		this.config = {
			maxRestartAttempts: MAX_RESTART_ATTEMPTS,
			restartDelay: RESTART_DELAY,
			healthCheckInterval: HEALTH_CHECK_INTERVAL,
			healthCheckTimeout: HEALTH_CHECK_TIMEOUT
		};
	}

	async start(mainWindow: BrowserWindow): Promise<void> {
		this.mainWindow = mainWindow;
		this.isShuttingDown = false;
		this.setStatus("starting");

		if (!app.isPackaged) {
			logger.info(`Development mode — expecting the backend to run on ws://localhost:${this.port}`);
		} else {
			const backendPath: string = this.validateBackendPath();
			if (!backendPath) {
				logger.error("Backend path verification failed", undefined, { appPath: app.getAppPath() });
				this.setStatus("unhealthy");
				return;
			}
			await this.spawnProcess();
		}

		this.startHealthCheck();
	}

	private validateBackendPath(): string {
		const backendPath: string = join(app.getAppPath(), "backend");

		if (!existsSync(backendPath)) {
			logger.error("Backend directory doesn't exist", undefined, { backendPath });
			return "";
		}

		const entryPath: string = join(backendPath, "main.js");
		if (!existsSync(entryPath)) {
			logger.error("Backend entry file doesn't exist", undefined, { entryPath });
			return "";
		}

		logger.info("Backend path verification successful", { backendPath, entryPath });
		return backendPath;
	}

	stop(): void {
		this.isShuttingDown = true;
		this.stopHealthCheck();
		this.clearRestartTimer();
		this.restartAttempts = 0;

		if (this.process) {
			logger.info("正在停止后端进程");
			this.process.kill();
			this.process = null;
		}

		this.setStatus("stopped");
	}

	getPort(): number {
		return this.port;
	}

	registerIpc(): void {
		ipcMain.handle("backend:get-port", (): number => this.port);
		ipcMain.handle("backend:get-status", (): BackendStatus => this.status);
		ipcMain.handle("backend:health-check", async (): Promise<boolean> => await this.ping());
		ipcMain.handle("backend:restart", async (): Promise<void> => await this.restart());
	}

	async restart(): Promise<void> {
		logger.info("手动重启后端");

		if (this.process) {
			this.process.kill();
			this.process = null;
		}

		this.stopHealthCheck();
		this.restartAttempts = 0;
		this.clearRestartTimer();

		this.setStatus("starting");

		if (app.isPackaged) {
			await this.spawnProcess();
		}

		this.startHealthCheck();
	}

	private async spawnProcess(): Promise<void> {
		const backendPath: string = join(app.getAppPath(), "backend");
		const entry: string = join(backendPath, "main.js");

		logger.info("Starting the backend process", { backendPath, entry, port: this.port });

		this.process = spawn(process.execPath, [entry], {
			cwd: backendPath,
			env: { ...process.env, PORT: String(this.port) },
			stdio: "pipe"
		});

		this.process.stdout?.on("data", (data: Buffer): void => {
			logger.info(data.toString().trim());
		});

		this.process.stderr?.on("data", (data: Buffer): void => {
			logger.error("Backend error output", undefined, { output: data.toString().trim() });
		});

		this.process.on("exit", (code: number | null): void => {
			logger.info("Backend process exited", { code });

			this.process = null;

			if (this.isShuttingDown) {
				this.setStatus("stopped");
				return;
			}

			this.handleProcessCrash();
		});

		this.process.on("error", (error: Error): void => {
			logger.error("Backend process error", error);
			this.process = null;
			this.handleProcessCrash();
		});
	}

	private handleProcessCrash(): void {
		if (this.restartAttempts >= this.config.maxRestartAttempts) {
			logger.error("Backend process restart failed, reached the maximum number of retries", undefined, {
				attempts: this.restartAttempts,
				maxAttempts: this.config.maxRestartAttempts
			});
			this.setStatus("unhealthy");
			this.restartAttempts = 0;
			return;
		}

		this.restartAttempts += 1;

		logger.warn("The backend process crashed, getting ready to restart.", {
			attempt: this.restartAttempts,
			maxAttempts: this.config.maxRestartAttempts
		});

		this.setStatus("starting");

		this.restartTimer = setTimeout(async (): Promise<void> => {
			if (this.isShuttingDown) {
				return;
			}

			try {
				await this.spawnProcess();
			} catch (error: unknown) {
				logger.error("Backend process failed to restart", error as Error);
				this.handleProcessCrash();
			}
		}, this.config.restartDelay);
	}

	private clearRestartTimer(): void {
		if (this.restartTimer) {
			clearTimeout(this.restartTimer);
			this.restartTimer = null;
		}
	}

	private startHealthCheck(): void {
		this.stopHealthCheck();

		logger.debug("Start health check", { interval: this.config.healthCheckInterval });

		this.healthTimer = setInterval(async (): Promise<void> => {
			const ok: boolean = await this.ping();

			if (ok) {
				if (this.status !== "healthy") {
					logger.info("Health check passed");
				}
				this.setStatus("healthy");
				this.restartAttempts = 0;
			} else {
				if (this.status !== "unhealthy") {
					logger.warn("Health check failed");
				}
				this.setStatus("unhealthy");
			}
		}, this.config.healthCheckInterval);
	}

	private stopHealthCheck(): void {
		if (this.healthTimer) {
			clearInterval(this.healthTimer);
			this.healthTimer = null;
			logger.debug("Health check has stopped");
		}
	}

	private async ping(): Promise<boolean> {
		return new Promise((resolve: (value: boolean) => void): void => {
			const ws: WebSocket = new WebSocket(`ws://localhost:${this.port}`);
			const timeout: ReturnType<typeof setTimeout> = setTimeout((): void => {
				ws.close();
				resolve(false);
			}, this.config.healthCheckTimeout);

			ws.on("open", (): void => {
				ws.send(JSON.stringify({
					protocolVersion: 2,
					type: "request",
					id: "studio-hello",
					method: "client.hello",
					params: {
						protocolVersion: 2,
						clientType: "studio",
						clientName: "Daedalus Studio",
						capabilities: {
							sessionSubscribe: true,
							approval: true,
							inlineDiffView: true,
							editorTools: false,
							editorUndoRedo: false,
							inlineDiffUndo: false
						}
					}
				}));
				ws.send(JSON.stringify({
					protocolVersion: 2,
					type: "request",
					id: "health",
					method: "ping"
				}));
			});

			ws.on("message", (): void => {
				clearTimeout(timeout);
				ws.close();
				resolve(true);
			});

			ws.on("error", (): void => {
				clearTimeout(timeout);
				resolve(false);
			});
		});
	}

	private setStatus(status: BackendStatus): void {
		if (this.status !== status) {
			logger.debug("Status Change", { from: this.status, to: status });
		}
		this.status = status;
		this.mainWindow?.webContents.send("backend:status-changed", status);
	}
}

export const backendManager = new BackendManager();

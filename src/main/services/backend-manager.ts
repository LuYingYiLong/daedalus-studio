import { app, BrowserWindow, ipcMain } from "electron";
import { join } from "node:path";
import WebSocket from "ws";
import { ChildProcess, spawn } from "node:child_process";
import { BackendStatus } from "./types";

const DEV_PORT: number = 38181;
const PROD_PORT: number = 38180;

class BackendManager {
	private process: ChildProcess | null = null;
	private port: number;
	private status: BackendStatus = "stopped";
	private healthTimer: ReturnType<typeof setInterval> | null = null;
	private mainWindow: BrowserWindow | null = null;

	constructor() {
		this.port = app.isPackaged ? PROD_PORT : DEV_PORT;
	}

	// 启动后端（开发模式只声明端口，不启动进程）
	async start(mainWindow: BrowserWindow): Promise<void> {
		this.mainWindow = mainWindow;
		this.setStatus("starting");

		if (!app.isPackaged) {
			// 开发模式：用户手动 npm run dev 启动后端
			console.log(`[backend] Dev mode — expecting backend on ws://localhost:${this.port}`);
		} else {
			// 生产模式：启动子进程
			await this.spawnProcess();
		}

		this.startHealthCheck();
	}

	// 停止后端
	stop(): void {
		this.stopHealthCheck();
		if (this.process) {
			this.process.kill();
			this.process = null;
		}
		this.setStatus("stopped");
	}

	getPort(): number {
		return this.port;
	}

	// 注册 IPC 处理器
	registerIpc(): void {
		ipcMain.handle("backend:get-port", () => this.port);
		ipcMain.handle("backend:get-status", () => this.status);
        ipcMain.handle("backend:health-check", async () => await this.ping());
	}

	// 启动子进程
	private async spawnProcess(): Promise<void> {
		const backendPath: string = join(app.getAppPath(), "backend");
		const entry: string = join(backendPath, "main.js");

		this.process = spawn(process.execPath, [entry], {
			cwd: backendPath,
			env: { ...process.env, PORT: String(this.port) },
			stdio: "pipe"
		});

		this.process.stdout?.on("data", (data: Buffer) => {
			console.log(`[backend] ${data.toString().trim()}`);
		})

		this.process.stderr?.on("data", (data: Buffer) => {
            console.error(`[backend:err] ${data.toString().trim()}`);
        });

        this.process.on("exit", (code: number | null) => {
            console.log(`[backend] exited with code ${code}`);
            this.process = null;
            this.setStatus("stopped");
        });
	}

	// 启动健康检查
    private startHealthCheck(): void {
        this.healthTimer = setInterval(async () => {
            const ok = await this.ping();
            this.setStatus(ok ? "healthy" : "unhealthy");
        }, 5000);
    }

	// 停止健康检查
    private stopHealthCheck(): void {
        if (this.healthTimer) {
            clearInterval(this.healthTimer);
            this.healthTimer = null;
        }
    }

	private async ping(): Promise<boolean> {
        return new Promise((resolve) => {
            const ws = new WebSocket(`ws://localhost:${this.port}`);
            const timeout = setTimeout(() => {
                ws.close();
                resolve(false);
            }, 2000);

			ws.onopen = () => {
				ws.send(JSON.stringify({
					type: "request",
					id: "studio-hello",
					method: "client.hello",
					params: {
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
				ws.send(JSON.stringify({ type: "request", id: "health", method: "ping" }));
			};

            ws.onmessage = () => {
                clearTimeout(timeout);
                ws.close();
                resolve(true);
            };

            ws.onerror = () => {
                clearTimeout(timeout);
                resolve(false);
            };
        });
    }

	private setStatus(status: BackendStatus): void {
		this.status = status;
		this.mainWindow?.webContents.send("backend:status-changed", status);
	}
}

export const backendManager = new BackendManager();

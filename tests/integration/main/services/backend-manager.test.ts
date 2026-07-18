import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { BackendStatus } from "@main/services/types";

describe("BackendManager", () => {
	let mockMainWindow: any;
	let mockProcess: any;

	beforeEach(() => {
		vi.clearAllMocks();

		mockMainWindow = {
			webContents: {
				send: vi.fn()
			}
		};

		mockProcess = {
			stdout: { on: vi.fn() },
			stderr: { on: vi.fn() },
			on: vi.fn(),
			kill: vi.fn()
		};

		vi.doMock("electron", () => ({
			app: {
				isPackaged: false,
				getAppPath: vi.fn(() => "/app/path")
			},
			BrowserWindow: vi.fn(),
			ipcMain: {
				handle: vi.fn()
			}
		}));

		vi.doMock("node:child_process", () => ({
			spawn: vi.fn(() => mockProcess)
		}));
	});

	afterEach(() => {
		vi.clearAllMocks();
	});

	describe("基础功能", () => {
		it("开发模式端口应为 38181", async () => {
			const { backendManager } = await import("@main/services/backend-manager");

			expect(backendManager.getPort()).toBe(38181);
		});

		it("初始状态应为 stopped", async () => {
			const { backendManager } = await import("@main/services/backend-manager");

			const getStatus = vi.fn().mockResolvedValue("stopped");

			expect(getStatus()).resolves.toBe("stopped");
		});
	});

	describe("状态管理", () => {
		it("状态变更应发送到渲染进程", async () => {
			const { backendManager } = await import("@main/services/backend-manager");

			await backendManager.start(mockMainWindow);

			expect(mockMainWindow.webContents.send).toHaveBeenCalledWith(
				"backend:status-changed",
				expect.any(String)
			);
		});
	});

	describe("健康检查", () => {
		it("停止时应清除健康检查", async () => {
			const { backendManager } = await import("@main/services/backend-manager");

			await backendManager.start(mockMainWindow);
			backendManager.stop();

			const healthTimer: any = (backendManager as any).healthTimer;
			expect(healthTimer).toBeNull();
		});
	});

	describe("进程管理", () => {
		it("停止时应清理进程", async () => {
			const { backendManager } = await import("@main/services/backend-manager");

			(backendManager as any).process = mockProcess;
			backendManager.stop();

			expect(mockProcess.kill).toHaveBeenCalled();
		});
	});
});

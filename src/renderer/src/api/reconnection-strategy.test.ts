import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { ReconnectionManager, DEFAULT_RECONNECT_CONFIG } from "./reconnection-strategy";

describe("ReconnectionManager", () => {
	let manager: ReconnectionManager;
	const mockCallback = vi.fn();

	beforeEach(() => {
		manager = new ReconnectionManager();
		vi.clearAllMocks();
		vi.useFakeTimers();
	});

	afterEach(() => {
		manager.destroy();
		vi.useRealTimers();
	});

	describe("基础功能", () => {
		it("应正确初始化", () => {
			expect(manager.getAttempt()).toBe(0);
			expect(manager.isExhausted()).toBe(false);
		});

		it("重置后应清除状态", () => {
			manager.scheduleReconnect(mockCallback);
			manager.reset();

			expect(manager.getAttempt()).toBe(0);
			expect(manager.isExhausted()).toBe(false);
		});
	});

	describe("重连调度", () => {
		it("首次重连应使用初始延迟", () => {
			manager.scheduleReconnect(mockCallback);

			expect(mockCallback).not.toHaveBeenCalled();

			vi.advanceTimersByTime(1100);

			expect(mockCallback).toHaveBeenCalledTimes(1);
		});

		it("多次重连应使用指数退避", () => {
			for (let i = 0; i < 3; i++) {
				manager.scheduleReconnect(mockCallback);
				vi.advanceTimersByTime(30000);
			}

			expect(manager.getAttempt()).toBe(3);
			expect(mockCallback).toHaveBeenCalledTimes(3);
		});

		it("应达到最大尝试次数上限", () => {
			for (let i = 0; i < 15; i++) {
				manager.scheduleReconnect(mockCallback);
				vi.advanceTimersByTime(30000);
			}

			expect(manager.getAttempt()).toBe(10);
			expect(manager.isExhausted()).toBe(true);
			expect(mockCallback).toHaveBeenCalledTimes(10);
		});

		it("重置后应重新开始计数", () => {
			for (let i = 0; i < 5; i++) {
				manager.scheduleReconnect(mockCallback);
				vi.advanceTimersByTime(30000);
			}

			manager.reset();

			for (let i = 0; i < 3; i++) {
				manager.scheduleReconnect(mockCallback);
				vi.advanceTimersByTime(30000);
			}

			expect(mockCallback).toHaveBeenCalledTimes(8);
		});
	});

	describe("自定义配置", () => {
		it("应使用自定义配置", () => {
			const customConfig = {
				maxAttempts: 3,
				initialDelay: 500,
				maxDelay: 5000,
				backoffMultiplier: 3
			};
			const customManager = new ReconnectionManager(customConfig);

			for (let i = 0; i < 5; i++) {
				customManager.scheduleReconnect(mockCallback);
				vi.advanceTimersByTime(10000);
			}

			expect(mockCallback).toHaveBeenCalledTimes(3);
			customManager.destroy();
		});
	});

	describe("日志回调", () => {
		it("应调用日志回调", () => {
			const logCallback = vi.fn();
			const logManager = new ReconnectionManager(DEFAULT_RECONNECT_CONFIG, logCallback);

			logManager.scheduleReconnect(mockCallback);
			vi.advanceTimersByTime(1000);

			expect(logCallback).toHaveBeenCalledWith(
				"调度重连",
				{ attempt: 1, delay: expect.any(Number) }
			);

			logManager.destroy();
		});

		it("重置时应记录日志", () => {
			const logCallback = vi.fn();
			const logManager = new ReconnectionManager(DEFAULT_RECONNECT_CONFIG, logCallback);

			logManager.reset();

			expect(logCallback).toHaveBeenCalledWith("重连策略已重置");

			logManager.destroy();
		});
	});
});

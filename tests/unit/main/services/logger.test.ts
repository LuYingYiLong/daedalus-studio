import { describe, it, expect, vi, beforeEach } from "vitest";
import { createLogger, setGlobalLevel, LogLevel } from "@main/services/logger";

describe("Logger", () => {
	let mockTransport: (entry: unknown) => void;
	let logger = createLogger("test");

	beforeEach(() => {
		mockTransport = vi.fn();
		logger = createLogger("test-category");
		logger.addTransport(mockTransport);
	});

	describe("级别控制", () => {
		it("INFO 级别应记录 INFO 及以上", () => {
			logger.setLevel(LogLevel.INFO);

			logger.debug("debug message");
			logger.info("info message");
			logger.warn("warn message");
			logger.error("error message");

			expect(mockTransport).toHaveBeenCalledTimes(3);
		});

		it("DEBUG 级别应记录所有消息", () => {
			logger.setLevel(LogLevel.DEBUG);

			logger.debug("debug message");
			logger.info("info message");
			logger.warn("warn message");
			logger.error("error message");

			expect(mockTransport).toHaveBeenCalledTimes(4);
		});

		it("ERROR 级别只记录 ERROR", () => {
			logger.setLevel(LogLevel.ERROR);

			logger.debug("debug message");
			logger.info("info message");
			logger.warn("warn message");
			logger.error("error message");

			expect(mockTransport).toHaveBeenCalledTimes(1);
		});

		it("应支持全局级别设置", () => {
			setGlobalLevel(LogLevel.WARN);

			const newLogger = createLogger("new-test");
			newLogger.addTransport(mockTransport);

			newLogger.debug("debug");
			newLogger.info("info");
			newLogger.warn("warn");
			newLogger.error("error");

			expect(mockTransport).toHaveBeenCalledTimes(2);
		});
	});

	describe("日志格式", () => {
		it("应包含基本字段", () => {
			logger.setLevel(LogLevel.INFO);
			logger.info("test message");

			expect(mockTransport).toHaveBeenCalledWith(
				expect.objectContaining({
					level: LogLevel.INFO,
					category: "test-category",
					message: "test message",
					timestamp: expect.any(String)
				})
			);
		});

		it("应包含上下文", () => {
			logger.setLevel(LogLevel.INFO);
			const context = { userId: "123", action: "test" };
			logger.info("test message", context);

			expect(mockTransport).toHaveBeenCalledWith(
				expect.objectContaining({
					context
				})
			);
		});

		it("应包含错误", () => {
			logger.setLevel(LogLevel.ERROR);
			const error = new Error("test error");
			logger.error("error message", error);

			expect(mockTransport).toHaveBeenCalledWith(
				expect.objectContaining({
					error
				})
			);
		});

		it("warn 应支持错误和上下文", () => {
			logger.setLevel(LogLevel.WARN);
			const error = new Error("test warning");
			const context = { code: "WARN_001" };
			logger.warn("warn message", context, error);

			expect(mockTransport).toHaveBeenCalledWith(
				expect.objectContaining({
					error,
					context
				})
			);
		});
	});

	describe("Transport 管理", () => {
		it("应支持多个 transport", () => {
			const testLogger = createLogger("multi-test");
			testLogger.setLevel(LogLevel.INFO);

			const transport1 = vi.fn();
			const transport2 = vi.fn();

			testLogger.addTransport(transport1);
			testLogger.addTransport(transport2);

			testLogger.info("test");

			expect(transport1).toHaveBeenCalled();
			expect(transport2).toHaveBeenCalled();
		});

		it("应支持移除 transport", () => {
			const testLogger = createLogger("remove-test");
			testLogger.setLevel(LogLevel.INFO);

			const remove = testLogger.addTransport(mockTransport);

			remove();
			testLogger.info("test");

			expect(mockTransport).not.toHaveBeenCalled();
		});

		it("transport 错误不应影响其他 transport", () => {
			const testLogger = createLogger("error-test");
			testLogger.setLevel(LogLevel.INFO);

			const badTransport = (): void => {
				throw new Error("transport error");
			};
			const goodTransport = vi.fn();

			testLogger.addTransport(badTransport);
			testLogger.addTransport(goodTransport);

			testLogger.info("test");

			expect(goodTransport).toHaveBeenCalled();
		});
	});
});

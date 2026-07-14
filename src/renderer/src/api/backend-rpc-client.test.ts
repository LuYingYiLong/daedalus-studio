import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { BackendRpcClient } from "./backend-rpc-client";

describe("BackendRpcClient", () => {
	let client: BackendRpcClient;
	let mockWebSocketInstance: any;
	let originalWebSocket: any;

	beforeEach(() => {
		vi.clearAllMocks();
		vi.useFakeTimers();

		let eventHandlers: Record<string, Function[]> = {};

		mockWebSocketInstance = {
			readyState: 0,
			send: vi.fn(),
			close: vi.fn(),
			addEventListener: vi.fn((event: string, handler: Function): void => {
				if (!eventHandlers[event]) {
					eventHandlers[event] = [];
				}
				eventHandlers[event].push(handler);
			}),
			removeEventListener: vi.fn(),
			_trigger: (event: string, data?: any): void => {
				if (eventHandlers[event]) {
					for (const handler of eventHandlers[event]) {
						if (data) {
							handler({ data });
						} else {
							handler();
						}
					}
				}
			},
			_setReadyState: (state: number): void => {
				mockWebSocketInstance.readyState = state;
			},
			_resetEvents: (): void => {
				eventHandlers = {};
			}
		};

		originalWebSocket = global.WebSocket;
		global.WebSocket = vi.fn(() => mockWebSocketInstance) as any;

		client = new BackendRpcClient("ws://localhost:38181", {
			enableReconnect: false,
			connectionTimeout: 1000
		});
	});

	afterEach(() => {
		client.close();
		vi.useRealTimers();
		global.WebSocket = originalWebSocket;
	});

	const simulateOpen = (): void => {
		mockWebSocketInstance._setReadyState(1);
		mockWebSocketInstance._trigger("open");
	};

	const simulateMessage = (data: unknown): void => {
		mockWebSocketInstance._trigger("message", JSON.stringify(data));
	};

	const simulateClose = (): void => {
		mockWebSocketInstance._setReadyState(3);
		mockWebSocketInstance._trigger("close");
	};

	const simulateError = (): void => {
		mockWebSocketInstance._trigger("error");
	};

	describe("连接管理", () => {
		it("应成功建立连接", async () => {
			const connectPromise = client.connect();

			simulateOpen();

			await connectPromise;

			expect(client.isOpen()).toBe(true);
		});

		it("连接失败应拒绝", async () => {
			const connectPromise = client.connect();

			simulateError();

			await expect(connectPromise).rejects.toThrow();
		});

		it("连接超时应拒绝", async () => {
			const connectPromise = client.connect();

			vi.advanceTimersByTime(1000);

			await expect(connectPromise).rejects.toThrow("连接超时");
		});

		it("应支持手动关闭", () => {
			client.connect();
			client.close();

			expect(mockWebSocketInstance.close).toHaveBeenCalled();
		});

		it("获取状态应正确", () => {
			expect(client.getState()).toBe("disconnected");

			client.connect();
			expect(client.getState()).toBe("connecting");

			client.close();
			expect(client.getState()).toBe("disconnected");
		});
	});

	describe("请求处理", () => {
		beforeEach(async () => {
			const connectPromise = client.connect();
			simulateOpen();
			await connectPromise;
		});

		it("应发送请求并处理响应", async () => {
			const requestPromise = client.request("test.method", { param: "value" });

			expect(mockWebSocketInstance.send).toHaveBeenCalled();

			simulateMessage({
				type: "response",
				id: "studio-1-1",
				ok: true,
				result: { data: "success" }
			});

			await expect(requestPromise).resolves.toEqual({ data: "success" });
		});

		it("应处理错误响应", async () => {
			const requestPromise = client.request("test.method");

			simulateMessage({
				type: "response",
				id: "studio-1-1",
				ok: false,
				error: { code: "ERR_001", message: "Test error" }
			});

			await expect(requestPromise).rejects.toThrow("ERR_001: Test error");
		});

		it("连接关闭时请求应失败", async () => {
			const requestPromise = client.request("test.method");

			simulateClose();

			await expect(requestPromise).rejects.toThrow("连接已关闭");
		});
	});

	describe("事件处理", () => {
		beforeEach(async () => {
			const connectPromise = client.connect();
			simulateOpen();
			await connectPromise;
		});

		it("应接收并分发事件", () => {
			const eventListener = vi.fn();
			client.addEventListener(eventListener);

			simulateMessage({
				type: "event",
				id: "event-1",
				event: "test.event",
				data: { value: "test" }
			});

			expect(eventListener).toHaveBeenCalledWith(
				expect.objectContaining({
					event: "test.event",
					data: { value: "test" }
				})
			);
		});

		it("应支持移除事件监听器", () => {
			const eventListener = vi.fn();
			const remove = client.addEventListener(eventListener);

			remove();

			simulateMessage({
				type: "event",
				id: "event-1",
				event: "test.event",
				data: {}
			});

			expect(eventListener).not.toHaveBeenCalled();
		});

		it("应支持多个事件监听器", () => {
			const listener1 = vi.fn();
			const listener2 = vi.fn();

			client.addEventListener(listener1);
			client.addEventListener(listener2);

			simulateMessage({
				type: "event",
				id: "event-1",
				event: "test.event",
				data: {}
			});

			expect(listener1).toHaveBeenCalled();
			expect(listener2).toHaveBeenCalled();
		});
	});

	describe("client.hello 特殊处理", () => {
		beforeEach(async () => {
			const connectPromise = client.connect();
			simulateOpen();
			await connectPromise;
		});

		it("client.hello 应自动添加 protocolVersion", () => {
			client.request("client.hello", { clientType: "test" });

			const sentData = JSON.parse(mockWebSocketInstance.send.mock.calls[0][0]);
			expect(sentData.params).toHaveProperty("protocolVersion", 2);
		});

		it("其他方法不应添加 protocolVersion", () => {
			client.request("other.method", { param: "value" });

			const sentData = JSON.parse(mockWebSocketInstance.send.mock.calls[0][0]);
			expect(sentData.params).toEqual({ param: "value" });
		});
	});
});

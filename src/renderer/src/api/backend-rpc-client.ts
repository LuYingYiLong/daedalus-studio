import type { ReconnectConfig } from "./reconnection-strategy";
import { ReconnectionManager, DEFAULT_RECONNECT_CONFIG } from "./reconnection-strategy";

type BackendRequest = {
	protocolVersion: 2;
	type: "request";
	id: string;
	method: string;
	params?: unknown;
};

type BackendResponse =
	| {
		type: "response";
		id: string;
		ok: true;
		result: unknown;
	}
	| {
		type: "response";
		id: string;
		ok: false;
		error: {
			code: string;
			message: string;
		};
	};

export type BackendEvent = {
	type: "event";
	id: string;
	event: string;
	data?: unknown;
};

type PendingRequest = {
	resolve: (value: unknown) => void;
	reject: (reason?: unknown) => void;
};

type BackendEventListener = (event: BackendEvent) => void;

type ConnectionState = "disconnected" | "connecting" | "connected" | "reconnecting";

type ClientConfig = {
	readonly enableReconnect: boolean;
	readonly reconnectConfig: ReconnectConfig;
	readonly connectionTimeout: number;
};

const DEFAULT_CLIENT_CONFIG: ClientConfig = {
	enableReconnect: true,
	reconnectConfig: DEFAULT_RECONNECT_CONFIG,
	connectionTimeout: 10000
};

function createRequestParams(method: string, params: unknown): unknown {
	if (method !== "client.hello") {
		return params;
	}

	return {
		...(typeof params === "object" && params !== null && !Array.isArray(params) ? params : {}),
		protocolVersion: 2
	};
}

function isBackendResponse(message: unknown): message is BackendResponse {
	return typeof message === "object"
		&& message !== null
		&& (message as { type?: unknown }).type === "response"
		&& typeof (message as { id?: unknown }).id === "string"
		&& typeof (message as { ok?: unknown }).ok === "boolean";
}

function isBackendEvent(message: unknown): message is BackendEvent {
	return typeof message === "object"
		&& message !== null
		&& (message as { type?: unknown }).type === "event"
		&& typeof (message as { event?: unknown }).event === "string";
}

export class BackendRpcClient {
	private readonly url: string;
	private readonly config: ClientConfig;
	private socket: WebSocket | null = null;
	private requestIndex: number = 0;
	private readonly pendingRequests: Map<string, PendingRequest> = new Map();
	private readonly eventListeners: Set<BackendEventListener> = new Set();
	private state: ConnectionState = "disconnected";
	private reconnectManager: ReconnectionManager | null = null;
	private manualClose: boolean = false;
	private connectResolve: (() => void) | null = null;
	private connectReject: ((error: Error) => void) | null = null;
	private connectionTimer: ReturnType<typeof setTimeout> | null = null;

	constructor(url: string, config?: Partial<ClientConfig>) {
		this.url = url;
		this.config = { ...DEFAULT_CLIENT_CONFIG, ...config };

		if (this.config.enableReconnect) {
			this.reconnectManager = new ReconnectionManager(
				this.config.reconnectConfig,
				(message: string, context?: Record<string, unknown>): void => {
					console.debug(`[Daedalus backend:reconnect] ${message}`, context ?? "");
				}
			);
		}
	}

	connect(): Promise<void> {
		if (this.socket?.readyState === WebSocket.OPEN) {
			return Promise.resolve();
		}

		if (this.state === "connecting" || this.state === "reconnecting") {
			return new Promise((resolve, reject): void => {
				this.connectResolve = resolve;
				this.connectReject = reject;
			});
		}

		this.manualClose = false;
		const reconnectAttempt: number = this.reconnectManager?.getAttempt() ?? 0;
		this.state = reconnectAttempt > 0 ? "reconnecting" : "connecting";

		console.info(`[Daedalus backend] ${this.state === "reconnecting" ? "重连" : "连接"}中`, {
			url: this.url,
			attempt: this.reconnectManager?.getAttempt() ?? 0
		});

		return this.createConnection();
	}

	private createConnection(): Promise<void> {
		return new Promise((resolve, reject): void => {
			const socket: WebSocket = new WebSocket(this.url);
			this.socket = socket;
			this.connectResolve = resolve;
			this.connectReject = reject;

			socket.addEventListener("open", this.handleOpen);
			socket.addEventListener("message", (event: MessageEvent): void => this.handleMessage(event.data));
			socket.addEventListener("error", this.handleError);
			socket.addEventListener("close", this.handleClose);

			this.connectionTimer = setTimeout((): void => {
				this.handleConnectionTimeout();
			}, this.config.connectionTimeout);
		});
	}

	private handleOpen = (): void => {
		this.clearConnectionTimer();

		if (this.connectionTimer) {
			clearTimeout(this.connectionTimer);
			this.connectionTimer = null;
		}

		this.state = "connected";
		this.reconnectManager?.reset();

		console.info("[Daedalus backend] 连接已建立", { url: this.url });

		if (this.connectResolve) {
			this.connectResolve();
			this.connectResolve = null;
			this.connectReject = null;
		}
	};

	private handleError = (): void => {
		this.clearConnectionTimer();

		const error: Error = new Error(`无法连接后端：${this.url}`);

		console.error("[Daedalus backend] 连接错误", { url: this.url, error });

		if (this.connectReject) {
			this.connectReject(error);
			this.connectReject = null;
			this.connectResolve = null;
		}
	};

	private handleClose = (): void => {
		this.clearConnectionTimer();
		this.socket = null;
		this.rejectPendingRequests(new Error("后端连接已关闭"));

		const wasManualClose: boolean = this.manualClose;

		console.debug("[Daedalus backend] 连接已关闭", { manualClose: wasManualClose });

		if (!wasManualClose && this.config.enableReconnect && this.reconnectManager) {
			this.state = "reconnecting";

			if (this.reconnectManager.isExhausted()) {
				console.error("[Daedalus backend] 重连失败，已达最大尝试次数");
				this.state = "disconnected";
				return;
			}

			this.reconnectManager.scheduleReconnect((): void => {
				this.connect().catch((error: Error): void => {
					console.error("[Daedalus backend] 重连失败", error);
				});
			});
		} else {
			this.state = "disconnected";
		}
	};

	private handleConnectionTimeout(): void {
		this.clearConnectionTimer();

		console.warn("[Daedalus backend] 连接超时", { url: this.url, timeout: this.config.connectionTimeout });

		this.socket?.close();
		this.state = "disconnected";

		if (this.connectReject) {
			this.connectReject(new Error(`连接超时：${this.config.connectionTimeout}ms`));
			this.connectReject = null;
			this.connectResolve = null;
		}
	}

	private clearConnectionTimer(): void {
		if (this.connectionTimer) {
			clearTimeout(this.connectionTimer);
			this.connectionTimer = null;
		}
	}

	request<TResult>(method: string, params?: unknown): Promise<TResult> {
		const id: string = `studio-${Date.now()}-${this.requestIndex += 1}`;

		return this.requestWithId<TResult>(id, method, params);
	}

	requestWithId<TResult>(id: string, method: string, params?: unknown): Promise<TResult> {
		const socket: WebSocket | null = this.socket;

		if (!socket || socket.readyState !== WebSocket.OPEN) {
			return Promise.reject(new Error("后端连接尚未打开"));
		}

		const request: BackendRequest = {
			protocolVersion: 2,
			type: "request",
			id,
			method
		};

		const requestParams: unknown = createRequestParams(method, params);

		if (requestParams !== undefined) {
			request.params = requestParams;
		}

		return new Promise<TResult>((resolve, reject): void => {
			this.pendingRequests.set(id, {
				resolve: (value: unknown): void => resolve(value as TResult),
				reject
			});
			socket.send(JSON.stringify(request));
		});
	}

	addEventListener(listener: BackendEventListener): () => void {
		this.eventListeners.add(listener);

		return (): void => {
			this.eventListeners.delete(listener);
		};
	}

	close(): void {
		this.manualClose = true;
		this.reconnectManager?.destroy();
		this.clearConnectionTimer();

		this.socket?.close();
		this.socket = null;
		this.state = "disconnected";
		this.rejectPendingRequests(new Error("后端连接已手动关闭"));
	}

	isOpen(): boolean {
		return this.state === "connected" && this.socket?.readyState === WebSocket.OPEN;
	}

	getState(): ConnectionState {
		return this.state;
	}

	private handleMessage(rawMessage: string): void {
		let message: unknown;

		try {
			message = JSON.parse(rawMessage) as unknown;
		} catch (error: unknown) {
			console.warn("[Daedalus backend] 收到无法解析的消息", error, rawMessage);
			return;
		}

		if (isBackendEvent(message)) {
			console.debug("[Daedalus backend:event]", message.event, message.data);
			for (const listener of this.eventListeners) {
				listener(message);
			}
			return;
		}

		if (!isBackendResponse(message)) {
			console.warn("[Daedalus backend] 收到未知消息", message);
			return;
		}

		const pendingRequest: PendingRequest | undefined = this.pendingRequests.get(message.id);

		if (!pendingRequest) {
			console.debug("[Daedalus backend] 收到未匹配响应", message);
			return;
		}

		this.pendingRequests.delete(message.id);

		if (message.ok) {
			pendingRequest.resolve(message.result);
			return;
		}

		pendingRequest.reject(new Error(`${message.error.code}: ${message.error.message}`));
	}

	private rejectPendingRequests(error: Error): void {
		for (const pendingRequest of this.pendingRequests.values()) {
			pendingRequest.reject(error);
		}

		this.pendingRequests.clear();
	}

}

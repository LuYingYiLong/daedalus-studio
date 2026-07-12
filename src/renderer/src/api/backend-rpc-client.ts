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
	private socket: WebSocket | null = null;
	private requestIndex: number = 0;
	private readonly pendingRequests: Map<string, PendingRequest> = new Map();
	private readonly eventListeners: Set<BackendEventListener> = new Set();

	constructor(url: string) {
		this.url = url;
	}

	connect(): Promise<void> {
		if (this.socket?.readyState === WebSocket.OPEN) {
			return Promise.resolve();
		}

		return new Promise((resolve, reject): void => {
			const socket: WebSocket = new WebSocket(this.url);
			this.socket = socket;

			socket.addEventListener("open", (): void => {
				resolve();
			}, { once: true });

			socket.addEventListener("message", (event: MessageEvent<string>): void => {
				this.handleMessage(event.data);
			});

			socket.addEventListener("error", (): void => {
				reject(new Error(`无法连接后端：${this.url}`));
			}, { once: true });

			socket.addEventListener("close", (): void => {
				this.rejectPendingRequests(new Error("后端连接已关闭"));
				this.socket = null;
			});
		});
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
		this.socket?.close();
		this.socket = null;
		this.rejectPendingRequests(new Error("后端连接已手动关闭"));
	}

	isOpen(): boolean {
		return this.socket?.readyState === WebSocket.OPEN;
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

import type { ReconnectConfig } from "./reconnection-strategy";
import {
	ReconnectionManager,
	DEFAULT_RECONNECT_CONFIG,
} from "./reconnection-strategy";

type BackendRequest = {
	protocolVersion: 3;
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
	protocolVersion?: 3;
	type: "event";
	eventId?: string;
	/** Synthetic test/timeline events only. Runtime transport requires eventId/requestId/runId/sequence/createdAt. */
	id?: string;
	event: string;
	sessionId?: string;
	requestId?: string;
	runId?: string;
	sequence?: number;
	createdAt?: string;
	data?: unknown;
};

type PendingRequest = {
	resolve: (value: unknown) => void;
	reject: (reason?: unknown) => void;
};

type BackendEventListener = (event: BackendEvent) => void;

export type BackendConnectionEvent = {
	reconnected: boolean;
	state: "connected" | "disconnected";
};

type BackendConnectionListener = (event: BackendConnectionEvent) => void;

type ConnectionState =
	| "disconnected"
	| "connecting"
	| "connected"
	| "reconnecting";

export class BackendRpcError extends Error {
	readonly code: string;

	constructor(code: string, message: string) {
		super(`${code}: ${message}`);
		this.name = "BackendRpcError";
		this.code = code;
	}
}

export class BackendConnectionError extends Error {
	readonly code:
		| "backend_connection_failed"
		| "backend_connection_closed"
		| "backend_connection_timeout"
		| "backend_connection_not_open"
		| "backend_connection_manually_closed";

	constructor(code: BackendConnectionError["code"], message: string) {
		super(message);
		this.name = "BackendConnectionError";
		this.code = code;
	}
}

type ClientConfig = {
	readonly enableReconnect: boolean;
	readonly reconnectConfig: ReconnectConfig;
	readonly connectionTimeout: number;
	readonly authProtocol: string | null;
};

const DEFAULT_CLIENT_CONFIG: ClientConfig = {
	enableReconnect: true,
	reconnectConfig: DEFAULT_RECONNECT_CONFIG,
	connectionTimeout: 10000,
	authProtocol: null,
};

const MAX_REMEMBERED_EVENT_IDS: number = 8192;

function createRequestParams(method: string, params: unknown): unknown {
	if (method !== "client.hello") {
		return params;
	}

	return {
		...(typeof params === "object" &&
		params !== null &&
		!Array.isArray(params)
			? params
			: {}),
		protocolVersion: 3,
	};
}

function isBackendResponse(message: unknown): message is BackendResponse {
	return (
		typeof message === "object" &&
		message !== null &&
		(message as { type?: unknown }).type === "response" &&
		typeof (message as { id?: unknown }).id === "string" &&
		typeof (message as { ok?: unknown }).ok === "boolean"
	);
}

function isBackendEvent(message: unknown): message is BackendEvent {
	return (
		typeof message === "object" &&
		message !== null &&
		(message as { protocolVersion?: unknown }).protocolVersion === 3 &&
		(message as { type?: unknown }).type === "event" &&
		typeof (message as { eventId?: unknown }).eventId === "string" &&
		typeof (message as { event?: unknown }).event === "string" &&
		typeof (message as { sessionId?: unknown }).sessionId === "string" &&
		typeof (message as { requestId?: unknown }).requestId === "string" &&
		typeof (message as { runId?: unknown }).runId === "string" &&
		typeof (message as { sequence?: unknown }).sequence === "number" &&
		typeof (message as { createdAt?: unknown }).createdAt === "string"
	);
}

export class BackendRpcClient {
	private readonly url: string;
	private readonly config: ClientConfig;
	private socket: WebSocket | null = null;
	private requestIndex: number = 0;
	private readonly pendingRequests: Map<string, PendingRequest> = new Map();
	private readonly receivedEventIds: Set<string> = new Set();
	private readonly eventListeners: Set<BackendEventListener> = new Set();
	private readonly connectionListeners: Set<BackendConnectionListener> =
		new Set();
	private hasConnectedOnce: boolean = false;
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
					console.debug(
						`[Daedalus backend:reconnect] ${message}`,
						context ?? "",
					);
				},
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
		const reconnectAttempt: number =
			this.reconnectManager?.getAttempt() ?? 0;
		this.state = reconnectAttempt > 0 ? "reconnecting" : "connecting";

		console.info(
			`[Daedalus backend] ${this.state === "reconnecting" ? "reconnecting" : "connecting"}`,
			{
				url: this.url,
				attempt: this.reconnectManager?.getAttempt() ?? 0,
			},
		);

		return this.createConnection();
	}

	private createConnection(): Promise<void> {
		return new Promise((resolve, reject): void => {
			const socket: WebSocket =
				this.config.authProtocol === null
					? new WebSocket(this.url)
					: new WebSocket(this.url, this.config.authProtocol);
			this.socket = socket;
			this.connectResolve = resolve;
			this.connectReject = reject;

			socket.addEventListener("open", this.handleOpen);
			socket.addEventListener("message", (event: MessageEvent): void =>
				this.handleMessage(event.data),
			);
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

		const reconnected: boolean = this.hasConnectedOnce;
		this.hasConnectedOnce = true;
		this.state = "connected";
		this.reconnectManager?.reset();

		console.info("[Daedalus backend] Connection established", {
			url: this.url,
		});

		if (this.connectResolve) {
			this.connectResolve();
			this.connectResolve = null;
			this.connectReject = null;
		}
		for (const listener of this.connectionListeners) {
			listener({ reconnected, state: "connected" });
		}
	};

	private handleError = (): void => {
		this.clearConnectionTimer();

		const error: BackendConnectionError = new BackendConnectionError(
			"backend_connection_failed",
			`Can't connect to the backend: ${this.url}`,
		);

		console.error("[Daedalus backend] Connection error", {
			url: this.url,
			error,
		});

		if (this.connectReject) {
			this.connectReject(error);
			this.connectReject = null;
			this.connectResolve = null;
		}
	};

	private handleClose = (): void => {
		this.clearConnectionTimer();
		this.socket = null;
		this.rejectPendingRequests(
			new BackendConnectionError(
				"backend_connection_closed",
				"Backend connection has been closed",
			),
		);

		const wasManualClose: boolean = this.manualClose;
		for (const listener of this.connectionListeners) {
			listener({ reconnected: false, state: "disconnected" });
		}

		console.debug("[Daedalus backend] Connection closed", {
			manualClose: wasManualClose,
		});

		if (
			!wasManualClose &&
			this.config.enableReconnect &&
			this.reconnectManager
		) {
			this.state = "reconnecting";

			if (this.reconnectManager.isExhausted()) {
				console.error(
					"[Daedalus backend] Reconnect failed, maximum number of attempts reached",
				);
				this.state = "disconnected";
				return;
			}

			this.reconnectManager.scheduleReconnect((): void => {
				// The scheduled backoff is no longer an in-flight connection. Reset
				// the state so connect() creates a fresh WebSocket instead of waiting
				// on the socket that already closed.
				this.state = "disconnected";
				this.connect().catch((error: Error): void => {
					console.error("[Daedalus backend] Reconnect failed", error);
				});
			});
		} else {
			this.state = "disconnected";
		}
	};

	private handleConnectionTimeout(): void {
		this.clearConnectionTimer();

		console.warn("[Daedalus backend] Connection timed out", {
			url: this.url,
			timeout: this.config.connectionTimeout,
		});

		this.socket?.close();
		this.state = "disconnected";

		if (this.connectReject) {
			this.connectReject(
				new BackendConnectionError(
					"backend_connection_timeout",
					`Connection timed out: ${this.config.connectionTimeout}ms`,
				),
			);
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
		const id: string = `studio-${Date.now()}-${(this.requestIndex += 1)}`;

		return this.requestWithId<TResult>(id, method, params);
	}

	requestWithId<TResult>(
		id: string,
		method: string,
		params?: unknown,
	): Promise<TResult> {
		const socket: WebSocket | null = this.socket;

		if (!socket || socket.readyState !== WebSocket.OPEN) {
			return Promise.reject(
				new BackendConnectionError(
					"backend_connection_not_open",
					"Backend connection hasn't been opened yet",
				),
			);
		}

		const request: BackendRequest = {
			protocolVersion: 3,
			type: "request",
			id,
			method,
		};

		const requestParams: unknown = createRequestParams(method, params);

		if (requestParams !== undefined) {
			request.params = requestParams;
		}

		return new Promise<TResult>((resolve, reject): void => {
			this.pendingRequests.set(id, {
				resolve: (value: unknown): void => resolve(value as TResult),
				reject,
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

	addConnectionListener(listener: BackendConnectionListener): () => void {
		this.connectionListeners.add(listener);
		return (): void => {
			this.connectionListeners.delete(listener);
		};
	}

	close(): void {
		this.manualClose = true;
		this.reconnectManager?.destroy();
		this.clearConnectionTimer();

		this.socket?.close();
		this.socket = null;
		this.state = "disconnected";
		this.rejectPendingRequests(
			new BackendConnectionError(
				"backend_connection_manually_closed",
				"Backend connection has been manually closed",
			),
		);
	}

	isOpen(): boolean {
		return (
			this.state === "connected" &&
			this.socket?.readyState === WebSocket.OPEN
		);
	}

	getState(): ConnectionState {
		return this.state;
	}

	private handleMessage(rawMessage: string): void {
		let message: unknown;

		try {
			message = JSON.parse(rawMessage) as unknown;
		} catch (error: unknown) {
			console.warn(
				"[Daedalus backend] Received an unparseable message",
				error,
				rawMessage,
			);
			return;
		}

		if (isBackendEvent(message)) {
			const eventId: string = message.eventId ?? "";
			if (eventId.length > 0 && this.receivedEventIds.has(eventId)) {
				console.debug("[Daedalus backend:event] duplicate ignored", {
					eventId,
					event: message.event,
				});
				return;
			}
			if (eventId.length > 0) {
				this.receivedEventIds.add(eventId);
				if (this.receivedEventIds.size > MAX_REMEMBERED_EVENT_IDS) {
					const oldestEventId: string | undefined =
						this.receivedEventIds.values().next().value;
					if (oldestEventId !== undefined) {
						this.receivedEventIds.delete(oldestEventId);
					}
				}
			}
			console.debug(
				"[Daedalus backend:event]",
				message.event,
				message.event.startsWith("computer.") ? { sessionId: message.sessionId, requestId: message.requestId, runId: message.runId } : message.data,
			);
			for (const listener of this.eventListeners) {
				listener(message);
			}
			return;
		}

		if (!isBackendResponse(message)) {
			console.warn(
				"[Daedalus backend] Received an unknown message",
				message,
			);
			return;
		}

		const pendingRequest: PendingRequest | undefined =
			this.pendingRequests.get(message.id);

		if (!pendingRequest) {
			console.debug(
				"[Daedalus backend] Received an unmatched response",
				message,
			);
			return;
		}

		this.pendingRequests.delete(message.id);

		if (message.ok) {
			pendingRequest.resolve(message.result);
			return;
		}

		pendingRequest.reject(
			new BackendRpcError(message.error.code, message.error.message),
		);
	}

	private rejectPendingRequests(error: Error): void {
		for (const pendingRequest of this.pendingRequests.values()) {
			pendingRequest.reject(error);
		}

		this.pendingRequests.clear();
	}
}

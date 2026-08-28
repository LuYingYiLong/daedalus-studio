import { createServer as createHttpServer, type IncomingMessage, type Server as HttpServer, type ServerResponse } from "node:http";
import { createServer as createHttpsServer, type Server as HttpsServer } from "node:https";
import { readFile, stat } from "node:fs/promises";
import { extname, resolve, sep } from "node:path";
import type { Socket } from "node:net";
import WebSocket, { WebSocketServer, type RawData } from "ws";
import type { BackendConnectionInfo } from "./backend-manager";

const REMOTE_COOKIE_NAME: string = "__Host-daedalus_remote";
const MAX_REQUEST_BYTES: number = 1024 * 1024;
const MAX_PAIR_BODY_BYTES: number = 16 * 1024;
const MAX_MESSAGES_PER_MINUTE: number = 120;
const MAX_MESSAGE_BURST: number = 60;
const DISCONNECTED_IDLE_GRACE_MS: number = 60_000;
const CONNECTED_IDLE_TIMEOUT_MS: number = 30 * 60_000;
const HEARTBEAT_INTERVAL_MS: number = 30_000;

export const REMOTE_RPC_METHODS: ReadonlySet<string> = new Set([
	"backend.health",
	"client.hello",
	"workspace.list",
	"workspace.info",
	"provider.current.get",
	"provider.modelSelection.get",
	"provider.models.list",
	"session.list",
	"session.create",
	"session.open",
	"session.subscribe",
	"session.unsubscribe",
	"session.timeline",
	"session.timeline.index",
	"session.workbench.get",
	"session.model.set",
	"session.save",
	"session.context.estimate",
	"ai.chat",
	"ai.cancel",
	"agent.run.retry",
	"ai.toolBudget.continue",
	"ai.toolBudget.stop",
	"plan.get",
	"plan.clarify",
	"plan.revise",
	"plan.approve",
	"approval.list",
	"approval.mode.set",
	"approval.approve",
	"approval.reject",
	"session.trace.summary",
	"session.trace.page",
	"session.trace.detail",
]);

export type RemoteGatewayDevice = {
	id: string;
	name: string;
};

export type RemoteGatewayPairResult = {
	device: RemoteGatewayDevice;
	token: string;
};

export type RemoteGatewayOptions = {
	addresses: string[];
	httpsPort: number;
	bootstrapPort: number;
	serverCertificatePem: string;
	serverPrivateKeyPem: string;
	caCertificatePem: string;
	certificateFingerprint: string;
	studioVersion: string;
	assetsDirectory: string;
	getBackendConnectionInfo: () => Promise<BackendConnectionInfo>;
	authenticate: (credential: string, origin: string) => Promise<RemoteGatewayDevice | null>;
	pair: (code: string, deviceName: string, origin: string) => Promise<RemoteGatewayPairResult | null>;
	onDeviceSeen: (deviceId: string) => void;
};

type RemoteRequest = {
	type: "request";
	id: string;
	method: string;
	params?: unknown;
};

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function isPrivateIpv4(address: string): boolean {
	const parts: number[] = address.split(".").map(Number);
	if (parts.length !== 4
		|| parts.some((part: number): boolean => !Number.isInteger(part) || part < 0 || part > 255)) {
		return false;
	}
	return parts[0] === 10
		|| (parts[0] === 172 && (parts[1] ?? 0) >= 16 && (parts[1] ?? 0) <= 31)
		|| (parts[0] === 192 && parts[1] === 168);
}

function normalizeRemoteAddress(address: string | undefined): string {
	return (address ?? "").replace(/^::ffff:/u, "");
}

function isAllowedRemoteAddress(address: string | undefined): boolean {
	return isPrivateIpv4(normalizeRemoteAddress(address));
}

function sendJson(response: ServerResponse, status: number, value: unknown): void {
	const body: string = JSON.stringify(value);
	response.writeHead(status, {
		"Content-Type": "application/json; charset=utf-8",
		"Content-Length": Buffer.byteLength(body),
		"Cache-Control": "no-store",
		"X-Content-Type-Options": "nosniff",
	});
	response.end(body);
}

function getCookie(request: IncomingMessage, name: string): string | null {
	for (const item of (request.headers.cookie ?? "").split(";")) {
		const [key, ...valueParts] = item.trim().split("=");
		if (key !== name) continue;
		try {
			return decodeURIComponent(valueParts.join("="));
		} catch {
			return null;
		}
	}
	return null;
}

function getContentType(path: string): string {
	switch (extname(path).toLowerCase()) {
		case ".html": return "text/html; charset=utf-8";
		case ".js": return "text/javascript; charset=utf-8";
		case ".css": return "text/css; charset=utf-8";
		case ".json": return "application/json; charset=utf-8";
		case ".webmanifest": return "application/manifest+json; charset=utf-8";
		case ".svg": return "image/svg+xml";
		case ".png": return "image/png";
		case ".woff2": return "font/woff2";
		default: return "application/octet-stream";
	}
}

function parseRemoteRequest(data: RawData): RemoteRequest | null {
	try {
		const value: unknown = JSON.parse(data.toString());
		return isRecord(value)
			&& value.type === "request"
			&& typeof value.id === "string"
			&& typeof value.method === "string"
			? value as RemoteRequest
			: null;
	} catch {
		return null;
	}
}

export function validateRemoteRequest(request: RemoteRequest): string | null {
	if (!REMOTE_RPC_METHODS.has(request.method)) return "remote_method_not_allowed";
	if (request.method === "ai.chat" && isRecord(request.params)) {
		const mode: unknown = request.params.mode;
		if (mode !== "ask" && mode !== "agent" && mode !== "plan") {
			return "remote_chat_mode_not_allowed";
		}
		if (Array.isArray(request.params.additionalContext)
			&& request.params.additionalContext.length > 0) {
			return "remote_attachments_not_allowed";
		}
	}
	if (request.method === "session.create" && isRecord(request.params)) {
		if (typeof request.params.workspaceId !== "string" || request.params.workspaceId.length === 0) {
			return "remote_workspace_required";
		}
		const chatMode: unknown = request.params.chatMode;
		if (chatMode !== undefined
			&& chatMode !== "ask"
			&& chatMode !== "agent"
			&& chatMode !== "plan") {
			return "remote_chat_mode_not_allowed";
		}
		if (request.params.workspaceLaunch !== undefined) {
			return "remote_workspace_launch_not_allowed";
		}
		if (request.params.temporary === true || request.params.scheduledTaskOrigin !== undefined) {
			return "remote_session_kind_not_allowed";
		}
		if (request.params.approvalMode === "full-trust") {
			return "remote_full_trust_confirmation_required";
		}
	}
	return null;
}

export function createRemoteHello(request: RemoteRequest, device: RemoteGatewayDevice): RemoteRequest {
	return {
		...request,
		params: {
			protocolVersion: 3,
			clientType: "studio_remote",
			clientName: device.name,
			capabilities: {
				remoteControl: true,
				sessionSubscribe: true,
				approval: true,
				inlineDiffView: false,
				browserTools: false,
				scheduledTasks: false,
			},
		},
	};
}

function sendRpcError(socket: WebSocket, id: string, code: string): void {
	if (socket.readyState !== WebSocket.OPEN) return;
	socket.send(JSON.stringify({
		type: "response",
		id,
		ok: false,
		error: {
			code,
			message: code,
		},
	}));
}

function isRunStartEvent(event: string): boolean {
	return event === "agent.run.started"
		|| event === "assistant.message.delta"
		|| event === "agent.tool.started"
		|| event === "agent.tool.approval_required";
}

function isRunTerminalEvent(event: string): boolean {
	return event === "agent.run.completed"
		|| event === "agent.run.failed"
		|| event === "agent.run.cancelled"
		|| event === "assistant.message.completed";
}

export class RemoteRequestRateLimiter {
	private availableTokens: number;
	private lastRefillAt: number;
	private readonly refillPerMillisecond: number;

	public constructor(
		private readonly capacity: number = MAX_MESSAGE_BURST,
		refillPerMinute: number = MAX_MESSAGES_PER_MINUTE,
		startedAt: number = Date.now(),
	) {
		this.availableTokens = capacity;
		this.lastRefillAt = startedAt;
		this.refillPerMillisecond = refillPerMinute / 60_000;
	}

	public consume(now: number = Date.now()): boolean {
		const elapsed: number = Math.max(0, now - this.lastRefillAt);
		this.availableTokens = Math.min(
			this.capacity,
			this.availableTokens + elapsed * this.refillPerMillisecond,
		);
		this.lastRefillAt = Math.max(this.lastRefillAt, now);
		if (this.availableTokens < 1) return false;
		this.availableTokens -= 1;
		return true;
	}
}

export class RemoteDeviceProxy {
	private upstream: WebSocket | null = null;
	private upstreamSetup: Promise<void> | null = null;
	private downstream: WebSocket | null = null;
	private readonly queuedMessages: string[] = [];
	private closeTimer: ReturnType<typeof setTimeout> | null = null;
	private idleTimer: ReturnType<typeof setTimeout> | null = null;
	private activeRun: boolean = false;
	private readonly requestRateLimiter: RemoteRequestRateLimiter =
		new RemoteRequestRateLimiter();
	private readonly pendingMethods: Map<string, string> = new Map();
	private readonly knownWorkspaceIds: Set<string> = new Set();
	private disposed: boolean = false;

	public constructor(
		private readonly device: RemoteGatewayDevice,
		private readonly getBackendConnectionInfo: () => Promise<BackendConnectionInfo>,
		private readonly onDisposable: () => void,
	) {}

	public attach(socket: WebSocket): void {
		if (this.disposed) {
			socket.close(1011, "remote_proxy_disposed");
			return;
		}
		this.clearCloseTimer();
		this.touchIdleTimer();
		if (this.downstream !== null && this.downstream.readyState < WebSocket.CLOSING) {
			this.downstream.close(4000, "remote_connection_replaced");
			this.queuedMessages.length = 0;
			this.pendingMethods.clear();
		}
		this.downstream = socket;
		socket.on("message", (data: RawData): void => this.handleDownstreamMessage(socket, data));
		socket.on("close", (): void => {
			if (this.downstream === socket) this.downstream = null;
			this.scheduleCloseIfIdle();
		});
		socket.on("error", (): void => {});
		void this.ensureUpstream().catch((): void => this.closeDownstreamForBackendFailure(socket));
	}

	public close(code: number = 1001, reason: string = "remote_gateway_stopped"): void {
		if (this.disposed) return;
		this.disposed = true;
		this.clearCloseTimer();
		this.clearIdleTimer();
		if (this.downstream !== null && this.downstream.readyState < WebSocket.CLOSING) {
			this.downstream.close(code, reason);
			this.downstream.terminate();
		}
		if (this.upstream !== null && this.upstream.readyState < WebSocket.CLOSING) {
			this.upstream.close(code, reason);
			this.upstream.terminate();
		}
		this.downstream = null;
		this.upstream = null;
		this.queuedMessages.length = 0;
		this.pendingMethods.clear();
		this.onDisposable();
	}

	private ensureUpstream(): Promise<void> {
		if (this.disposed) return Promise.reject(new Error("remote_proxy_disposed"));
		if (this.upstream !== null
			&& (this.upstream.readyState === WebSocket.OPEN
				|| this.upstream.readyState === WebSocket.CONNECTING)) {
			return Promise.resolve();
		}
		if (this.upstreamSetup !== null) return this.upstreamSetup;

		const setup: Promise<void> = this.createUpstream();
		this.upstreamSetup = setup;
		void setup.finally((): void => {
			if (this.upstreamSetup === setup) this.upstreamSetup = null;
		}).catch((): void => {});
		return setup;
	}

	private async createUpstream(): Promise<void> {
		const connection: BackendConnectionInfo = await this.getBackendConnectionInfo();
		if (this.disposed) throw new Error("remote_proxy_disposed");
		if (this.upstream !== null
			&& (this.upstream.readyState === WebSocket.OPEN
				|| this.upstream.readyState === WebSocket.CONNECTING)) return;
		const protocols: string[] | undefined = connection.authProtocol === null
			? undefined
			: [connection.authProtocol];
		const upstream = new WebSocket(`ws://127.0.0.1:${connection.port}`, protocols);
		this.upstream = upstream;
		upstream.on("open", (): void => {
			if (this.upstream !== upstream || this.disposed) return;
			for (const message of this.queuedMessages.splice(0)) upstream.send(message);
		});
		upstream.on("message", (data: RawData): void => {
			if (this.upstream !== upstream || this.disposed) return;
			const payload: string = data.toString();
			this.touchIdleTimer();
			this.trackResponseState(payload);
			this.trackRunState(payload);
			if (this.downstream?.readyState === WebSocket.OPEN) {
				// Backend v3 is a JSON text protocol. Forwarding Node Buffers without
				// normalization turns them into Blob messages in browser WebSockets.
				this.downstream.send(payload);
			}
		});
		upstream.on("close", (): void => {
			if (this.upstream !== upstream || this.disposed) return;
			this.upstream = null;
			if (this.downstream?.readyState === WebSocket.OPEN) {
				this.downstream.close(1011, "backend_connection_closed");
			}
			this.scheduleCloseIfIdle();
		});
		upstream.on("error", (): void => {});
	}

	private handleDownstreamMessage(socket: WebSocket, data: RawData): void {
		if (this.downstream !== socket || this.disposed) return;
		this.touchIdleTimer();
		const request: RemoteRequest | null = parseRemoteRequest(data);
		if (request === null) {
			this.downstream?.close(1008, "remote_request_invalid");
			return;
		}
		if (!this.consumeRateLimit()) {
			sendRpcError(this.downstream!, request.id, "remote_rate_limited");
			return;
		}
		const validationError: string | null = validateRemoteRequest(request);
		if (validationError !== null) {
			sendRpcError(this.downstream!, request.id, validationError);
			return;
		}
		if (request.method === "session.create"
			&& isRecord(request.params)
			&& typeof request.params.workspaceId === "string"
			&& !this.knownWorkspaceIds.has(request.params.workspaceId)) {
			sendRpcError(this.downstream!, request.id, "remote_workspace_not_registered");
			return;
		}
		const forwarded: RemoteRequest = request.method === "client.hello"
			? createRemoteHello(request, this.device)
			: request;
		const message: string = JSON.stringify(forwarded);
		this.pendingMethods.set(forwarded.id, forwarded.method);
		if (this.upstream?.readyState === WebSocket.OPEN) {
			this.upstream.send(message);
			return;
		}
		this.queuedMessages.push(message);
		void this.ensureUpstream().catch((): void => this.closeDownstreamForBackendFailure(socket));
	}

	private closeDownstreamForBackendFailure(socket: WebSocket): void {
		if (this.downstream === socket && socket.readyState === WebSocket.OPEN) {
			socket.close(1011, "backend_unavailable");
		}
	}

	private trackResponseState(data: string): void {
		try {
			const value: unknown = JSON.parse(data);
			if (!isRecord(value) || value.type !== "response" || typeof value.id !== "string") return;
			const method: string | undefined = this.pendingMethods.get(value.id);
			this.pendingMethods.delete(value.id);
			if (method !== "workspace.list" || value.ok !== true || !isRecord(value.result)) return;
			const workspaces: unknown = value.result.workspaces;
			if (!Array.isArray(workspaces)) return;
			this.knownWorkspaceIds.clear();
			for (const workspace of workspaces) {
				if (isRecord(workspace) && typeof workspace.id === "string") {
					this.knownWorkspaceIds.add(workspace.id);
				}
			}
		} catch {
			// Invalid upstream messages are ignored here and still validated by the renderer client.
		}
	}

	private consumeRateLimit(): boolean {
		return this.requestRateLimiter.consume();
	}

	private trackRunState(data: string): void {
		try {
			const value: unknown = JSON.parse(data);
			if (!isRecord(value) || value.type !== "event" || typeof value.event !== "string") return;
			if (isRunStartEvent(value.event)) this.activeRun = true;
			if (isRunTerminalEvent(value.event)) {
				this.activeRun = false;
				this.scheduleCloseIfIdle();
			}
		} catch {
			// Backend protocol validation remains authoritative.
		}
	}

	private scheduleCloseIfIdle(): void {
		if (this.downstream !== null || this.activeRun || this.closeTimer !== null) return;
		this.closeTimer = setTimeout((): void => this.close(), DISCONNECTED_IDLE_GRACE_MS);
		this.closeTimer.unref();
	}

	private clearCloseTimer(): void {
		if (this.closeTimer === null) return;
		clearTimeout(this.closeTimer);
		this.closeTimer = null;
	}

	private touchIdleTimer(): void {
		this.clearIdleTimer();
		this.idleTimer = setTimeout((): void => {
			this.idleTimer = null;
			if (this.activeRun) {
				this.touchIdleTimer();
				return;
			}
			if (this.downstream !== null && this.downstream.readyState < WebSocket.CLOSING) {
				this.downstream.close(4002, "remote_connection_idle");
			}
		}, CONNECTED_IDLE_TIMEOUT_MS);
		this.idleTimer.unref();
	}

	private clearIdleTimer(): void {
		if (this.idleTimer === null) return;
		clearTimeout(this.idleTimer);
		this.idleTimer = null;
	}
}

export class RemoteGateway {
	private readonly httpsServers: HttpsServer[] = [];
	private readonly websocketServers: WebSocketServer[] = [];
	private readonly heartbeatTimers: Array<ReturnType<typeof setInterval>> = [];
	private readonly bootstrapServers: HttpServer[] = [];
	private readonly deviceProxies: Map<string, RemoteDeviceProxy> = new Map();
	private readonly pairingAttempts: Map<string, number[]> = new Map();
	private bootstrapTimer: ReturnType<typeof setTimeout> | null = null;

	public constructor(private readonly options: RemoteGatewayOptions) {}

	public async start(): Promise<void> {
		try {
			await Promise.all(this.options.addresses.map(async (address: string): Promise<void> => {
			const server: HttpsServer = createHttpsServer({
				cert: this.options.serverCertificatePem,
				key: this.options.serverPrivateKeyPem,
			}, (request: IncomingMessage, response: ServerResponse): void => {
				void this.handleHttpsRequest(address, request, response);
			});
			const websocketServer = new WebSocketServer({
				noServer: true,
				maxPayload: MAX_REQUEST_BYTES,
				perMessageDeflate: false,
			});
			this.websocketServers.push(websocketServer);
			const alive: WeakMap<WebSocket, boolean> = new WeakMap();
			const heartbeatTimer = setInterval((): void => {
				for (const client of websocketServer.clients) {
					if (alive.get(client) === false) {
						client.terminate();
						continue;
					}
					alive.set(client, false);
					client.ping();
				}
			}, HEARTBEAT_INTERVAL_MS);
			heartbeatTimer.unref();
			this.heartbeatTimers.push(heartbeatTimer);
			server.on("upgrade", (request: IncomingMessage, socket: Socket, head: Buffer): void => {
				void this.handleUpgrade(address, request, socket, head, websocketServer, alive);
			});
			await this.listen(server, address, this.options.httpsPort);
			this.httpsServers.push(server);
			}));
		} catch (error: unknown) {
			await this.stop();
			throw error;
		}
	}

	public async beginBootstrap(expiresAt: number): Promise<void> {
		await this.stopBootstrap();
		try {
			await Promise.all(this.options.addresses.map(async (address: string): Promise<void> => {
			const server: HttpServer = createHttpServer((request: IncomingMessage, response: ServerResponse): void => {
				this.handleBootstrapRequest(address, request, response);
			});
			await this.listen(server, address, this.options.bootstrapPort);
			this.bootstrapServers.push(server);
			}));
		} catch (error: unknown) {
			await this.stopBootstrap();
			throw error;
		}
		this.bootstrapTimer = setTimeout((): void => {
			void this.stopBootstrap();
		}, Math.max(1, expiresAt - Date.now()));
		this.bootstrapTimer.unref();
	}

	public closeDevice(deviceId: string): void {
		this.deviceProxies.get(deviceId)?.close(4001, "remote_device_revoked");
	}

	public async stop(): Promise<void> {
		await this.stopBootstrap();
		for (const timer of this.heartbeatTimers.splice(0)) clearInterval(timer);
		for (const proxy of [...this.deviceProxies.values()]) proxy.close();
		await Promise.all(this.websocketServers.splice(0).map(async (server: WebSocketServer): Promise<void> => {
			await new Promise<void>((resolveClose): void => server.close((): void => resolveClose()));
		}));
		await Promise.all(this.httpsServers.splice(0).map(async (server: HttpsServer): Promise<void> => {
			await new Promise<void>((resolveClose): void => {
				server.close((): void => resolveClose());
			});
		}));
	}

	private async handleHttpsRequest(address: string, request: IncomingMessage, response: ServerResponse): Promise<void> {
		if (!this.isValidHttpsRequest(address, request) || !isAllowedRemoteAddress(request.socket.remoteAddress)) {
			sendJson(response, 403, { error: "remote_origin_not_allowed" });
			return;
		}
		const url = new URL(request.url ?? "/", `https://${address}:${this.options.httpsPort}`);
		if (url.pathname === "/api/v1/status" && request.method === "GET") {
			const credential: string | null = getCookie(request, REMOTE_COOKIE_NAME);
			const pairedDevice: RemoteGatewayDevice | null = credential === null
				? null
				: await this.options.authenticate(credential, `https://${address}:${this.options.httpsPort}`);
			sendJson(response, 200, {
				name: "Daedalus Studio Remote",
				protocolVersion: 3,
				remoteUiCompatibilityVersion: 1,
				studioVersion: this.options.studioVersion,
				pairingRequired: pairedDevice === null,
				certificateFingerprint: this.options.certificateFingerprint,
			});
			return;
		}
		if (url.pathname === "/api/v1/pair" && request.method === "POST") {
			await this.handlePair(address, request, response);
			return;
		}
		if (url.pathname.startsWith("/api/")) {
			sendJson(response, 404, { error: "remote_endpoint_not_found" });
			return;
		}
		await this.serveStatic(url.pathname, response);
	}

	private async handlePair(address: string, request: IncomingMessage, response: ServerResponse): Promise<void> {
		const remoteAddress: string = normalizeRemoteAddress(request.socket.remoteAddress);
		if (!this.consumePairingAttempt(remoteAddress)) {
			sendJson(response, 429, { error: "remote_pair_rate_limited" });
			return;
		}
		let body: string;
		try {
			body = await this.readBody(request, MAX_PAIR_BODY_BYTES);
		} catch {
			sendJson(response, 413, { error: "remote_pair_body_too_large" });
			return;
		}
		let payload: unknown;
		try {
			payload = JSON.parse(body) as unknown;
		} catch {
			sendJson(response, 400, { error: "remote_pair_invalid" });
			return;
		}
		if (!isRecord(payload)
			|| typeof payload.code !== "string"
			|| typeof payload.deviceName !== "string") {
			sendJson(response, 400, { error: "remote_pair_invalid" });
			return;
		}
		const result: RemoteGatewayPairResult | null = await this.options.pair(
			payload.code,
			payload.deviceName.trim().slice(0, 80),
			`https://${address}:${this.options.httpsPort}`,
		);
		if (result === null) {
			sendJson(response, 401, { error: "remote_pair_code_invalid" });
			return;
		}
		response.setHeader(
			"Set-Cookie",
			`${REMOTE_COOKIE_NAME}=${encodeURIComponent(`${result.device.id}.${result.token}`)}; Path=/; Max-Age=31536000; HttpOnly; Secure; SameSite=Strict`,
		);
		sendJson(response, 200, { paired: true, device: result.device });
	}

	private async handleUpgrade(
		address: string,
		request: IncomingMessage,
		socket: Socket,
		head: Buffer,
		websocketServer: WebSocketServer,
		alive: WeakMap<WebSocket, boolean>,
	): Promise<void> {
		const expectedOrigin: string = `https://${address}:${this.options.httpsPort}`;
		const url = new URL(request.url ?? "/", expectedOrigin);
		if (url.pathname !== "/api/v1/rpc"
			|| request.headers.origin !== expectedOrigin
			|| !this.isValidHttpsRequest(address, request)
			|| !isAllowedRemoteAddress(request.socket.remoteAddress)) {
			socket.destroy();
			return;
		}
		const credential: string | null = getCookie(request, REMOTE_COOKIE_NAME);
		const device: RemoteGatewayDevice | null = credential === null
			? null
			: await this.options.authenticate(credential, expectedOrigin);
		if (device === null) {
			socket.write("HTTP/1.1 401 Unauthorized\r\nConnection: close\r\n\r\n");
			socket.destroy();
			return;
		}
		this.options.onDeviceSeen(device.id);
		websocketServer.handleUpgrade(request, socket, head, (downstream: WebSocket): void => {
			alive.set(downstream, true);
			downstream.on("pong", (): void => {
				alive.set(downstream, true);
			});
			let proxy: RemoteDeviceProxy | undefined = this.deviceProxies.get(device.id);
			if (proxy === undefined) {
				proxy = new RemoteDeviceProxy(
					device,
					this.options.getBackendConnectionInfo,
					(): void => {
						this.deviceProxies.delete(device.id);
					},
				);
				this.deviceProxies.set(device.id, proxy);
			}
			proxy.attach(downstream);
		});
	}

	private handleBootstrapRequest(address: string, request: IncomingMessage, response: ServerResponse): void {
		if (!this.isValidBootstrapHost(address, request)
			|| !isAllowedRemoteAddress(request.socket.remoteAddress)) {
			response.writeHead(403).end();
			return;
		}
		const url = new URL(request.url ?? "/", `http://${address}:${this.options.bootstrapPort}`);
		if (url.pathname === "/ca.crt") {
			const body: string = this.options.caCertificatePem;
			response.writeHead(200, {
				"Content-Type": "application/x-x509-ca-cert",
				"Content-Disposition": "attachment; filename=daedalus-studio-remote-ca.crt",
				"Content-Length": Buffer.byteLength(body),
				"Cache-Control": "no-store",
			});
			response.end(body);
			return;
		}
		const body: string = `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Daedalus Studio Remote</title><style>body{font-family:system-ui,sans-serif;max-width:42rem;margin:0 auto;padding:2rem;line-height:1.6}a{display:inline-block;padding:.75rem 1rem;background:#1677ff;color:#fff;border-radius:.5rem;text-decoration:none}code{word-break:break-all}</style><h1>Daedalus Studio Remote</h1><p>先安装并信任此电脑生成的本地证书，然后回到 Studio 扫描配对二维码。</p><p><a href="/ca.crt">下载根证书</a></p><p>SHA-256 指纹：<code>${this.options.certificateFingerprint}</code></p><p>此页面不包含配对令牌或会话数据。</p></html>`;
		response.writeHead(200, {
			"Content-Type": "text/html; charset=utf-8",
			"Content-Length": Buffer.byteLength(body),
			"Cache-Control": "no-store",
			"Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'",
			"Referrer-Policy": "no-referrer",
			"X-Content-Type-Options": "nosniff",
			"X-Frame-Options": "DENY",
		});
		response.end(body);
	}

	private async serveStatic(pathname: string, response: ServerResponse): Promise<void> {
		const requestedPath: string = pathname === "/" ? "/remote.html" : pathname;
		let decodedPath: string;
		try {
			decodedPath = decodeURIComponent(requestedPath);
		} catch {
			response.writeHead(400).end();
			return;
		}
		const root: string = resolve(this.options.assetsDirectory);
		const filePath: string = resolve(root, `.${decodedPath}`);
		if (filePath !== root && !filePath.startsWith(`${root}${sep}`)) {
			response.writeHead(403).end();
			return;
		}
		try {
			if (!(await stat(filePath)).isFile()) throw new Error("not_file");
			const body: Buffer = await readFile(filePath);
			const isHtmlOrWorker: boolean = filePath.endsWith(".html") || filePath.endsWith("remote-sw.js");
			response.writeHead(200, {
				"Content-Type": getContentType(filePath),
				"Content-Length": body.byteLength,
				"Cache-Control": isHtmlOrWorker ? "no-store" : "public, max-age=31536000, immutable",
				"Content-Security-Policy": "default-src 'self'; connect-src 'self'; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline'; font-src 'self' data:; script-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'",
				"Referrer-Policy": "no-referrer",
				"X-Content-Type-Options": "nosniff",
				"X-Frame-Options": "DENY",
			});
			response.end(body);
		} catch {
			response.writeHead(404, { "Cache-Control": "no-store" }).end();
		}
	}

	private isValidHttpsRequest(address: string, request: IncomingMessage): boolean {
		const expectedOrigin: string = `https://${address}:${this.options.httpsPort}`;
		return request.headers.host === `${address}:${this.options.httpsPort}`
			&& (request.headers.origin === undefined || request.headers.origin === expectedOrigin);
	}

	private isValidBootstrapHost(address: string, request: IncomingMessage): boolean {
		return request.headers.host === `${address}:${this.options.bootstrapPort}`;
	}

	private consumePairingAttempt(address: string): boolean {
		const cutoff: number = Date.now() - 60_000;
		const attempts: number[] = (this.pairingAttempts.get(address) ?? [])
			.filter((timestamp: number): boolean => timestamp >= cutoff);
		attempts.push(Date.now());
		this.pairingAttempts.set(address, attempts);
		return attempts.length <= 5;
	}

	private async readBody(request: IncomingMessage, maxBytes: number): Promise<string> {
		const chunks: Buffer[] = [];
		let size: number = 0;
		for await (const chunk of request) {
			const buffer: Buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
			size += buffer.byteLength;
			if (size > maxBytes) throw new Error("body_too_large");
			chunks.push(buffer);
		}
		return Buffer.concat(chunks).toString("utf8");
	}

	private async listen(server: HttpServer | HttpsServer, host: string, port: number): Promise<void> {
		await new Promise<void>((resolveListen, rejectListen): void => {
			const handleError = (error: Error): void => rejectListen(error);
			server.once("error", handleError);
			server.listen(port, host, (): void => {
				server.off("error", handleError);
				resolveListen();
			});
		});
	}

	private async stopBootstrap(): Promise<void> {
		if (this.bootstrapTimer !== null) {
			clearTimeout(this.bootstrapTimer);
			this.bootstrapTimer = null;
		}
		await Promise.all(this.bootstrapServers.splice(0).map(async (server: HttpServer): Promise<void> => {
			await new Promise<void>((resolveClose): void => {
				server.close((): void => resolveClose());
			});
		}));
	}
}

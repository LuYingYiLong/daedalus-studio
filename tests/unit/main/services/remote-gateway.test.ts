import { once } from "node:events";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { IncomingMessage } from "node:http";
import type { Socket } from "node:net";
import WebSocket, { WebSocketServer } from "ws";
import {
	REMOTE_RPC_METHODS,
	RemoteDeviceProxy,
	RemoteGateway,
	type RemoteGatewayOptions,
	RemoteRequestRateLimiter,
	createRemoteHello,
	isPrivateIpv4,
	validateRemoteRequest,
} from "@main/services/remote-gateway";

const servers: WebSocketServer[] = [];

async function createWebSocketServer(): Promise<{ port: number; server: WebSocketServer }> {
	const server = new WebSocketServer({ host: "127.0.0.1", port: 0 });
	servers.push(server);
	await once(server, "listening");
	const address = server.address();
	if (address === null || typeof address === "string") throw new Error("test_websocket_address_unavailable");
	return { port: address.port, server };
}

afterEach(async () => {
	await Promise.all(servers.splice(0).map(async (server: WebSocketServer): Promise<void> => {
		for (const client of server.clients) client.terminate();
		await new Promise<void>((resolve): void => server.close((): void => resolve()));
	}));
});

describe("remote gateway policy", () => {
	it("does not resurrect a proxy when authentication completes after stop", async () => {
		let authenticate!: (value: { id: string; name: string }) => void;
		const seen = vi.fn();
		const gateway = new RemoteGateway({
			addresses: [], httpsPort: 38190,
			authenticate: () => new Promise((resolve) => { authenticate = resolve; }),
			onDeviceSeen: seen,
		} as unknown as RemoteGatewayOptions);
		const socket = { destroyed: false, destroy: vi.fn(), write: vi.fn() };
		const websocketServer = { handleUpgrade: vi.fn() };
		const handler = gateway as unknown as { handleUpgrade(...args: unknown[]): Promise<void> };
		const pending = handler.handleUpgrade("192.168.1.2", {
			url: "/api/v1/rpc", headers: { host: "192.168.1.2:38190", origin: "https://192.168.1.2:38190", cookie: "__Host-daedalus_remote=test" },
			socket: { remoteAddress: "192.168.1.3" },
		} as unknown as IncomingMessage, socket as unknown as Socket, Buffer.alloc(0), websocketServer, new WeakMap());
		const stopping = gateway.stop();
		expect(gateway.stop()).toBe(stopping);
		await stopping;
		authenticate({ id: "device", name: "test" });
		await pending;
		expect(socket.destroy).toHaveBeenCalled();
		expect(websocketServer.handleUpgrade).not.toHaveBeenCalled();
		expect(seen).not.toHaveBeenCalled();
	});

	it("terminates both sides even if a close handshake was already started", () => {
		const proxy = new RemoteDeviceProxy({ id: "device", name: "test" }, async () => ({ port: 1, authProtocol: null }), vi.fn());
		const closing = () => ({ readyState: WebSocket.CLOSING, terminate: vi.fn(), close: vi.fn() });
		const downstream = closing(); const upstream = closing();
		Object.assign(proxy, { downstream, upstream });
		proxy.close(); proxy.close();
		expect(downstream.terminate).toHaveBeenCalledOnce();
		expect(upstream.terminate).toHaveBeenCalledOnce();
	});

	it("refills request capacity continuously instead of locking a device for a full minute", () => {
		const limiter = new RemoteRequestRateLimiter(2, 60, 0);
		expect(limiter.consume(0)).toBe(true);
		expect(limiter.consume(0)).toBe(true);
		expect(limiter.consume(0)).toBe(false);
		expect(limiter.consume(500)).toBe(false);
		expect(limiter.consume(1_000)).toBe(true);
		expect(limiter.consume(1_500)).toBe(false);
		expect(limiter.consume(2_000)).toBe(true);
	});

	it("accepts only private IPv4 addresses", () => {
		expect(isPrivateIpv4("10.1.2.3")).toBe(true);
		expect(isPrivateIpv4("172.16.0.1")).toBe(true);
		expect(isPrivateIpv4("172.31.255.254")).toBe(true);
		expect(isPrivateIpv4("192.168.50.2")).toBe(true);
		expect(isPrivateIpv4("127.0.0.1")).toBe(false);
		expect(isPrivateIpv4("8.8.8.8")).toBe(false);
		expect(isPrivateIpv4("172.32.0.1")).toBe(false);
	});

	it("keeps desktop-only and destructive RPC outside the allowlist", () => {
		for (const method of [
			"backend.shutdown",
			"session.fork",
			"session.worktree.create",
			"workspace.file.write",
			"terminal.execute",
			"browser.navigate",
			"provider.config.set",
			"plugin.install",
			"computer.tool.result",
			"computer.access.revoked",
			"session.computerObservation.get",
			"client.capabilities.update",
			"grounding.prepare",
			"grounding.validate",
		]) {
			expect(REMOTE_RPC_METHODS.has(method)).toBe(false);
			expect(validateRemoteRequest({ type: "request", id: "denied", method, params: {} })).toBe("remote_method_not_allowed");
		}
	});

	it("rejects unsupported chat modes, context and unbound session creation", () => {
		expect(validateRemoteRequest({ type: "request", id: "1", method: "ai.chat", params: { mode: "goal" } })).toBe("remote_chat_mode_not_allowed");
		expect(validateRemoteRequest({ type: "request", id: "2", method: "ai.chat", params: { mode: "ask", additionalContext: [{}] } })).toBe("remote_attachments_not_allowed");
		expect(validateRemoteRequest({ type: "request", id: "3", method: "session.create", params: { title: "Test" } })).toBe("remote_workspace_required");
		expect(validateRemoteRequest({ type: "request", id: "4", method: "session.create", params: { title: "Test", workspaceId: "workspace-a", workspaceLaunch: "vscode" } })).toBe("remote_workspace_launch_not_allowed");
		expect(validateRemoteRequest({ type: "request", id: "5", method: "session.create", params: { title: "Test", workspaceId: "workspace-a", temporary: true } })).toBe("remote_session_kind_not_allowed");
		expect(validateRemoteRequest({ type: "request", id: "6", method: "session.create", params: { title: "Test", workspaceId: "workspace-a", scheduledTaskOrigin: {} } })).toBe("remote_session_kind_not_allowed");
		expect(validateRemoteRequest({ type: "request", id: "7", method: "session.create", params: { title: "Test", workspaceId: "workspace-a", approvalMode: "full-trust" } })).toBe("remote_full_trust_confirmation_required");
	});

	it("overwrites a forged hello with the paired device identity", () => {
		const hello = createRemoteHello({
			type: "request",
			id: "hello",
			method: "client.hello",
			params: { clientType: "studio", clientName: "Forged", capabilities: { computerObservation: true, computerGrounding: true } },
		}, { id: "device-a", name: "Pixel" });
		expect(hello.params).toMatchObject({
			clientType: "studio_remote",
			clientName: "Pixel",
			capabilities: {
				remoteControl: true,
				browserTools: false,
				computerObservation: false,
				computerGrounding: false,
				scheduledTasks: false,
			},
		});
	});

	it("coalesces attach and first-message upstream setup into one Backend connection", async () => {
		const backend = await createWebSocketServer();
		let backendConnectionCount: number = 0;
		backend.server.on("connection", (socket: WebSocket): void => {
			backendConnectionCount += 1;
			socket.on("message", (data): void => {
				const request = JSON.parse(data.toString()) as { id: string };
				socket.send(JSON.stringify({ type: "response", id: request.id, ok: true, result: {} }));
			});
		});

		const downstream = await createWebSocketServer();
		const proxy = new RemoteDeviceProxy(
			{ id: "device-a", name: "Pixel" },
			async () => {
				await new Promise<void>((resolve): void => {
					setTimeout(resolve, 20);
				});
				return { port: backend.port, authProtocol: null };
			},
			(): void => {},
		);
		downstream.server.on("connection", (socket: WebSocket): void => proxy.attach(socket));

		const client = new WebSocket(`ws://127.0.0.1:${downstream.port}`);
		await once(client, "open");
		client.send(JSON.stringify({ type: "request", id: "hello", method: "client.hello", params: {} }));
		await once(client, "message");
		await new Promise<void>((resolve): void => {
			setTimeout(resolve, 40);
		});

		expect(backendConnectionCount).toBe(1);
		client.close();
		proxy.close();
	});
});

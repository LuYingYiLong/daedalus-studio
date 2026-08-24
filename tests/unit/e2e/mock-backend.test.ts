import { WebSocket } from "ws";
import { afterEach, describe, expect, it } from "vitest";
import { MockBackend, type MockRpcRequest } from "../../e2e/fixtures/mock-backend";

type RpcResponse = {
	type: "response";
	id: string;
	ok: boolean;
	result?: unknown;
	error?: { code: string; message: string };
};

type EventEnvelope = {
	protocolVersion: number;
	type: "event";
	eventId: string;
	event: string;
	sessionId: string;
	requestId: string;
	runId: string;
	sequence: number;
	createdAt: string;
	data: unknown;
};

const backends: MockBackend[] = [];
const sockets: WebSocket[] = [];

function createBackend(): MockBackend {
	const backend: MockBackend = new MockBackend({ port: 0 });
	backends.push(backend);
	return backend;
}

async function connect(backend: MockBackend): Promise<WebSocket> {
	const socket: WebSocket = new WebSocket(`ws://127.0.0.1:${backend.getPort()}`);
	sockets.push(socket);
	await new Promise<void>((resolve, reject): void => {
		socket.once("open", () => resolve());
		socket.once("error", reject);
	});
	return socket;
}

async function request(socket: WebSocket, id: string, method: string, params?: unknown): Promise<RpcResponse> {
	return await new Promise<RpcResponse>((resolve, reject): void => {
		const handleMessage = (raw: WebSocket.RawData): void => {
			try {
				const response: RpcResponse = JSON.parse(raw.toString()) as RpcResponse;
				if (response.type !== "response" || response.id !== id) return;
				socket.off("message", handleMessage);
				resolve(response);
			} catch (error: unknown) {
				socket.off("message", handleMessage);
				reject(error);
			}
		};
		socket.on("message", handleMessage);
		socket.send(JSON.stringify({ protocolVersion: 3, type: "request", id, method, params }));
	});
}

async function waitForEvent(socket: WebSocket): Promise<EventEnvelope> {
	return await new Promise<EventEnvelope>((resolve, reject): void => {
		const handleMessage = (raw: WebSocket.RawData): void => {
			try {
				const envelope: unknown = JSON.parse(raw.toString());
				if (typeof envelope !== "object" || envelope === null || (envelope as { type?: unknown }).type !== "event") return;
				socket.off("message", handleMessage);
				resolve(envelope as EventEnvelope);
			} catch (error: unknown) {
				socket.off("message", handleMessage);
				reject(error);
			}
		};
		socket.on("message", handleMessage);
	});
}

afterEach(async (): Promise<void> => {
		for (const socket of sockets.splice(0)) {
			if (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING) socket.close();
		}
		for (const backend of backends.splice(0)) await backend.stop();
});

describe("MockBackend protocol contract", () => {
	it("preserves request IDs, records requests, and exposes waitForRequest", async () => {
		const backend: MockBackend = createBackend();
		backend.setHandler("contract.echo", ({ params }: MockRpcRequest) => ({ params, accepted: true }));
		await backend.start();
		const socket: WebSocket = await connect(backend);
		const responsePromise: Promise<RpcResponse> = request(socket, "contract-request-1", "contract.echo", { value: 42 });
		const recorded: MockRpcRequest = await backend.waitForRequest("contract.echo");
		const response: RpcResponse = await responsePromise;

		expect(recorded.id).toBe("contract-request-1");
		expect(recorded.params).toEqual({ value: 42 });
		expect(response).toEqual({
			type: "response",
			id: "contract-request-1",
			ok: true,
			result: { params: { value: 42 }, accepted: true },
		});
	});

	it("fails unknown RPCs and supports deterministic delay and error controls", async () => {
		const backend: MockBackend = createBackend();
		backend.setHandler("contract.delayed", () => ({ delayed: true }));
		backend.setResponseDelay("contract.delayed", 35);
		backend.setResponseError("contract.error", "contract_error", "controlled failure");
		await backend.start();
		const socket: WebSocket = await connect(backend);

		const unknown: RpcResponse = await request(socket, "contract-request-unknown", "contract.missing");
		expect(unknown).toEqual({
			type: "response",
			id: "contract-request-unknown",
			ok: false,
			error: { code: "e2e_unregistered_rpc", message: "Unregistered E2E RPC: contract.missing" },
		});

		const startedAt: number = Date.now();
		const delayed: RpcResponse = await request(socket, "contract-request-delayed", "contract.delayed");
		expect(Date.now() - startedAt).toBeGreaterThanOrEqual(25);
		expect(delayed.result).toEqual({ delayed: true });

		const failed: RpcResponse = await request(socket, "contract-request-error", "contract.error");
		expect(failed).toEqual({
			type: "response",
			id: "contract-request-error",
			ok: false,
			error: { code: "contract_error", message: "controlled failure" },
		});
	});

	it("emits complete event envelopes with monotonic session sequences", async () => {
		const backend: MockBackend = createBackend();
		await backend.start();
		const socket: WebSocket = await connect(backend);

		const firstEvent: Promise<EventEnvelope> = waitForEvent(socket);
		backend.sendEvent("contract.first", { value: 1 }, { sessionId: "contract-session", runId: "contract-run" });
		const first: EventEnvelope = await firstEvent;
		const secondEvent: Promise<EventEnvelope> = waitForEvent(socket);
		backend.sendEvent("contract.second", { value: 2 }, { sessionId: "contract-session", runId: "contract-run" });
		const second: EventEnvelope = await secondEvent;

		expect(first).toMatchObject({
			protocolVersion: 3,
			type: "event",
			event: "contract.first",
			sessionId: "contract-session",
			runId: "contract-run",
			sequence: 1,
		});
		expect(first.eventId).toBe("e2e-event-contract-session-1");
		expect(second).toMatchObject({ event: "contract.second", sessionId: "contract-session", sequence: 2 });
		expect(second.eventId).toBe("e2e-event-contract-session-2");
	});
});

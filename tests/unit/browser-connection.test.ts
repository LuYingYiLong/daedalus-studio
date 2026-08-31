import { afterEach, describe, expect, it, vi } from "vitest";
import { NativeConnection } from "../../src/browser-extension/native-connection";
import type {
	ChromeApi,
	NativePort,
} from "../../src/browser-extension/chrome-api";
import {
	browserPackets,
	BrowserPacketReader,
} from "../../src/contracts/browser-wire";
import { BrowserHostClient } from "../../src/main/services/browser/browser-host-client";
import { subscribeExternalBrowserState } from "../../src/renderer/src/features/external-browser/subscribe-external-browser-state";
import type { ExternalBrowserState } from "../../src/contracts/external-browser";

class FakePort implements NativePort {
	readonly messages: unknown[] = [];
	private listeners: ((value: unknown) => void)[] = [];
	private disconnects: (() => void)[] = [];
	postMessage = vi.fn((value: unknown) => {
		this.messages.push(value);
	});
	disconnect = vi.fn();
	onMessage = {
		addListener: (listener: (value: unknown) => void) => {
			this.listeners.push(listener);
		},
	};
	onDisconnect = {
		addListener: (listener: () => void) => {
			this.disconnects.push(listener);
		},
	};
	receive(value: unknown): void {
		for (const packet of browserPackets(value))
			for (const listener of this.listeners) listener(packet);
	}
	lost(): void {
		for (const listener of this.disconnects) listener();
	}
}
function deferred<T>() {
	let resolve!: (value: T) => void;
	const promise = new Promise<T>((done) => {
		resolve = done;
	});
	return { promise, resolve };
}
function harness(
	request = vi.fn(
		async (
			_row: Record<string, unknown>,
			_check: () => void,
		): Promise<unknown> => ({}),
	),
) {
	const ports: FakePort[] = [];
	const get = vi.fn(
		async (key: string): Promise<Record<string, unknown>> =>
			key === "enabled" ? { enabled: false } : { instance: "fixture-instance" },
	);
	const api: Pick<ChromeApi, "runtime" | "storage" | "action"> = {
		runtime: {
			connectNative: vi.fn(() => {
				const port = new FakePort();
				ports.push(port);
				return port;
			}),
			getURL: (path) => `chrome-extension://fixture/${path}`,
			onMessage: { addListener: vi.fn() },
		},
		storage: { local: { get, set: vi.fn(async () => {}) } },
		action: { setBadgeText: vi.fn(async () => {}) },
	};
	const invalidate = vi.fn();
	const connection = new NativeConnection(
		api,
		"development",
		"Microsoft Edge",
		request,
		invalidate,
	);
	const ack = (port = ports.at(-1)!) =>
		port.receive({ kind: "hello_ack", version: 1, id: "fixture-instance" });
	return { connection, ports, api, get, request, invalidate, ack };
}
afterEach(() => {
	vi.clearAllTimers();
	vi.useRealTimers();
});

describe("extension connection lifecycle", () => {
	it("does not equate an enabled checkbox or NativePort with Studio acknowledgement", async () => {
		vi.useFakeTimers();
		const h = harness();
		await h.connection.connect();
		expect(h.ports).toHaveLength(0);
		await h.connection.setEnabled(true);
		expect(h.connection.state()).toMatchObject({
			enabled: true,
			connected: false,
			connecting: true,
		});
		expect(h.api.action.setBadgeText).not.toHaveBeenCalledWith({ text: "ON" });
		h.ack();
		expect(h.connection.state()).toEqual({
			enabled: true,
			connected: true,
			connecting: false,
			error: null,
		});
		expect(h.api.action.setBadgeText).toHaveBeenCalledWith({ text: "ON" });
	});
	it("reports a missing host and connects after Studio becomes available, without restoring leases", async () => {
		vi.useFakeTimers();
		const h = harness();
		await h.connection.setEnabled(true);
		h.api.runtime.lastError = {
			message: "Specified native messaging host not found.",
		};
		h.ports[0].lost();
		expect(h.connection.state()).toMatchObject({
			connected: false,
			error: "browser_native_host_missing",
		});
		delete h.api.runtime.lastError;
		await h.connection.connect();
		h.ack();
		expect(h.ports).toHaveLength(2);
		expect(h.connection.state().connected).toBe(true);
		expect(h.request).not.toHaveBeenCalled();
		expect(h.invalidate).toHaveBeenCalled();
		// 旧 Port 的迟到回调不得清除新连接
		h.ports[0].lost();
		expect(h.connection.state().connected).toBe(true);
	});
	it("times out unacknowledged hosts and refuses requests before a valid acknowledgement", async () => {
		vi.useFakeTimers();
		const h = harness();
		await h.connection.setEnabled(true);
		await vi.advanceTimersByTimeAsync(5000);
		expect(h.connection.state().error).toBe("browser_handshake_timeout");
		expect(h.ports[0].disconnect).toHaveBeenCalled();
		await h.connection.connect();
		h.ports[1].receive({ id: "untrusted-request", operation: "connect" });
		expect(h.connection.state().error).toBe("browser_handshake_invalid");
		expect(h.request).not.toHaveBeenCalled();
	});
	it("refuses a mismatched acknowledgement and provides bounded failure codes", async () => {
		vi.useFakeTimers();
		const h = harness();
		await h.connection.setEnabled(true);
		h.ports[0].receive({
			kind: "hello_ack",
			version: 1,
			id: "another-instance",
		});
		expect(h.connection.state().connected).toBe(false);
		expect(h.connection.state().error).toBe("browser_handshake_invalid");
		await h.connection.connect();
		h.api.runtime.lastError = {
			message: "Access to the specified native messaging host is forbidden.",
		};
		h.ports[1].lost();
		expect(h.connection.state().error).toBe("browser_native_host_forbidden");
	});
	it("disabling while local storage is pending prevents a late native connection", async () => {
		vi.useFakeTimers();
		const h = harness();
		const storage = deferred<Record<string, unknown>>();
		h.get.mockImplementation(async () => storage.promise);
		const enabling = h.connection.setEnabled(true);
		await Promise.resolve();
		await Promise.resolve();
		await Promise.resolve();
		await h.connection.setEnabled(false);
		storage.resolve({ instance: "fixture-instance" });
		await enabling;
		expect(h.ports).toHaveLength(0);
		expect(h.connection.state()).toMatchObject({
			enabled: false,
			connected: false,
		});
	});
	it("explicitly invalidates on disable even when Port.disconnect emits no local event", async () => {
		vi.useFakeTimers();
		const h = harness();
		await h.connection.setEnabled(true);
		h.ack();
		h.invalidate.mockClear();
		await h.connection.setEnabled(false);
		expect(h.invalidate).toHaveBeenCalledOnce();
		expect(h.ports[0].disconnect).toHaveBeenCalledOnce();
		expect(h.connection.state()).toMatchObject({
			enabled: false,
			connected: false,
			connecting: false,
		});
		await h.connection.connect();
		expect(h.ports).toHaveLength(1);
	});
	it("does not deliver an old asynchronous action result to a reconnected Studio", async () => {
		vi.useFakeTimers();
		const result = deferred<unknown>();
		let checkConnection!: () => void;
		const h = harness(
			vi.fn(async (_row, check) => {
				checkConnection = check;
				return result.promise;
			}),
		);
		await h.connection.setEnabled(true);
		h.ack();
		h.ports[0].receive({ id: "pending-action" });
		h.ports[0].lost();
		await h.connection.connect();
		h.ack();
		expect(() => checkConnection()).toThrow("browser_connection_stale");
		result.resolve({ dispatched: true });
		await Promise.resolve();
		await Promise.resolve();
		const reader = new BrowserPacketReader();
		expect(h.ports[1].messages.map((p) => reader.accept(p))).toEqual([
			{
				kind: "hello",
				version: 1,
				id: "fixture-instance",
				name: "Microsoft Edge",
			},
		]);
	});
});

describe("Studio connection state", () => {
	const disconnected: ExternalBrowserState = {
		available: true,
		enabled: false,
		connections: [],
		defaultConnectionId: null,
		active: null,
		error: null,
	};
	it("acknowledges a validated extension handshake through the original peer", () => {
		const changed = vi.fn();
		const host = new BrowserHostClient(
			"fixture",
			"development",
			changed,
			vi.fn(),
		);
		const testHost = host as unknown as {
			write(value: unknown): void;
			receive(value: Record<string, unknown>): void;
		};
		const write = vi.spyOn(testHost, "write").mockImplementation(() => {});
		for (const packet of browserPackets({
			kind: "hello",
			version: 1,
			id: "fixture-instance",
			name: "Microsoft Edge",
		}))
			testHost.receive({ peer: 7, packet });
		const reader = new BrowserPacketReader();
		expect(
			write.mock.calls.map(([row]) => {
				const message = row as { peer: number; packet: unknown };
				expect(message.peer).toBe(7);
				return reader.accept(message.packet);
			}),
		).toEqual([{ kind: "hello_ack", version: 1, id: "fixture-instance" }]);
		expect(host.peers.get(7)?.name).toBe("Microsoft Edge");
		expect(changed).toHaveBeenCalledOnce();
	});
	it("does not overwrite a new connection event with an older IPC snapshot", async () => {
		const initial = deferred<ExternalBrowserState>();
		let event!: (state: ExternalBrowserState) => void;
		const listener = vi.fn(),
			off = vi.fn();
		const unsubscribe = subscribeExternalBrowserState(
			{
				getState: () => initial.promise,
				onState: (callback) => {
					event = callback;
					return off;
				},
			},
			listener,
		);
		const connected = {
			...disconnected,
			enabled: true,
			connections: [{ id: "edge", name: "Microsoft Edge" }],
		};
		event(connected);
		initial.resolve(disconnected);
		await Promise.resolve();
		expect(listener).toHaveBeenCalledExactlyOnceWith(connected);
		unsubscribe();
		event(disconnected);
		expect(listener).toHaveBeenCalledOnce();
		expect(off).toHaveBeenCalledOnce();
	});
	it("initializes from a snapshot when no newer event arrived", async () => {
		const listener = vi.fn();
		const off = subscribeExternalBrowserState(
			{ getState: async () => disconnected, onState: () => () => {} },
			listener,
		);
		await Promise.resolve();
		expect(listener).toHaveBeenCalledExactlyOnceWith(disconnected);
		off();
	});
});

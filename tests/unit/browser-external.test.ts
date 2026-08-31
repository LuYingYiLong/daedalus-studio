import { describe, it, expect } from "vitest";
import {
	browserPackets,
	BrowserPacketReader,
	BROWSER_WIRE_LIMIT,
} from "../../src/contracts/browser-wire";
import {
	normalizeExternalBrowserUrl,
	parseBrowserScope,
	sameBrowserScope,
} from "../../src/contracts/external-browser";
import { BrowserHostFrames } from "../../src/main/services/browser/browser-host-client";
import { BrowserNetworkIdle } from "../../src/contracts/browser-network-idle";
describe("external browser transport boundaries", () => {
	it("reports network idle only after completion and a quiet interval, with bounded redirect identities", () => {
		let now = 0;
		const network = new BrowserNetworkIdle(() => now);
		expect(network.isIdle()).toBe(false);
		network.accept("Network.requestWillBeSent", "redirect");
		network.accept("Network.requestWillBeSent", "redirect");
		now = 1000;
		expect(network.isIdle()).toBe(false);
		network.accept("Network.loadingFinished", "redirect");
		now = 1499;
		expect(network.isIdle()).toBe(false);
		now = 1500;
		expect(network.isIdle()).toBe(true);
		network.accept("Network.requestWillBeSent", "failure");
		network.accept("Network.loadingFailed", "failure");
		now += 500;
		expect(network.isIdle()).toBe(true);
		for (let id = 0; id < 1025; id++)
			network.accept("Network.requestWillBeSent", String(id));
		for (let id = 0; id < 1025; id++)
			network.accept("Network.loadingFinished", String(id));
		now += 1000;
		expect(network.isIdle()).toBe(false);
	});
	it("round trips chunked screenshots, including UTF-8, without broadening frame limits", () => {
		const value = { png: "x".repeat(2000000), text: "中文🙂".repeat(1000) },
			reader = new BrowserPacketReader();
		let result: unknown;
		for (const packet of browserPackets(value)) result = reader.accept(packet);
		expect(result).toEqual(value);
		expect(() => browserPackets("x".repeat(BROWSER_WIRE_LIMIT))).toThrow(
			"too_large",
		);
	});
	it("rejects missing, duplicate, stale, overlong and reordered chunks", () => {
		const packets = browserPackets("x".repeat(300000));
		expect(() => new BrowserPacketReader().accept(packets[1])).toThrow();
		const reader = new BrowserPacketReader();
		reader.accept(packets[0], 0);
		expect(() => reader.accept(packets[1], 10001)).toThrow();
		reader.clear();
		reader.accept(packets[0]);
		expect(() => reader.accept(packets[0])).toThrow();
		expect(() => reader.accept({ ...packets[0], count: 999 })).toThrow();
	});
	it("parses binary framing with partial headers and rejects unbounded allocation", () => {
		const json = Buffer.from('{"ready":true}'),
			header = Buffer.alloc(4);
		header.writeUInt32LE(json.length);
		const frames = new BrowserHostFrames();
		expect(frames.push(header.subarray(0, 2))).toEqual([]);
		expect(frames.push(Buffer.concat([header.subarray(2), json]))).toEqual([
			{ ready: true },
		]);
		const oversized = Buffer.alloc(4);
		oversized.writeUInt32LE(1024 * 1024);
		expect(() => frames.push(oversized)).toThrow();
	});
	it("preserves complete URLs and rejects credentials, internal schemes and forged scopes", () => {
		expect(
			normalizeExternalBrowserUrl("HTTPS://Example.test:443/form?a=1#draft"),
		).toBe("https://example.test/form?a=1#draft");
		for (const url of [
			"file:///secret",
			"chrome://settings",
			"javascript:alert(1)",
			"https://user:secret@example.test/",
		])
			expect(() => normalizeExternalBrowserUrl(url)).toThrow();
		const scope = {
			connectionId: "conn",
			sessionId: "session",
			requestId: "turn",
			runId: "run",
			generation: "one",
		};
		expect(parseBrowserScope(scope)).toEqual(scope);
		expect(() => parseBrowserScope({ ...scope, trusted: true })).toThrow();
		expect(sameBrowserScope(scope, { ...scope, generation: "two" })).toBe(
			false,
		);
	});
});

import { describe, expect, it, vi } from "vitest";
import { safeSendToWebContents } from "@main/services/safe-web-contents-send";

describe("safe renderer event delivery", () => {
	it("does not send to a disposed frame", () => {
		const send = vi.fn();
		const contents = {
			isDestroyed: () => false,
			mainFrame: { isDestroyed: () => true },
			send,
		} as never;

		expect(safeSendToWebContents(contents, "event", { value: 1 })).toBe(false);
		expect(send).not.toHaveBeenCalled();
	});

	it("converts a send race into a dropped event", () => {
		const contents = {
			isDestroyed: () => false,
			mainFrame: { isDestroyed: () => false },
			send: vi.fn(() => { throw new Error("disposed"); }),
		} as never;

		expect(safeSendToWebContents(contents, "event")).toBe(false);
	});
});

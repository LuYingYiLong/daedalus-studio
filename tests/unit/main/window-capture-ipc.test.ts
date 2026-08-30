import { describe, expect, it, vi } from "vitest";
import type { BrowserWindow, IpcMainInvokeEvent } from "electron";
vi.mock("electron", () => ({
	BrowserWindow: {},
	desktopCapturer: {},
	ipcMain: {},
}));
import {
	assertCaptureSender,
	validateCaptureRequest,
} from "../../../src/main/services/window-capture/window-capture-ipc";

describe("capture IPC boundary", () => {
	it("only accepts Windows Studio main top-level frame", () => {
		const frame = {};
		const contents = { mainFrame: frame };
		const main = {
			isDestroyed: () => false,
			webContents: contents,
		} as unknown as BrowserWindow;
		const event = { sender: contents, senderFrame: frame } as Pick<
			IpcMainInvokeEvent,
			"sender" | "senderFrame"
		>;
		expect(() => assertCaptureSender("win32", event, main)).not.toThrow();
		for (const os of ["darwin", "linux"])
			expect(() => assertCaptureSender(os, event, main)).toThrow("unsupported");
		expect(() =>
			assertCaptureSender(
				"win32",
				{ ...event, senderFrame: {} as never },
				main,
			),
		).toThrow("sender_not_allowed");
		expect(() =>
			assertCaptureSender("win32", { ...event, sender: {} as never }, main),
		).toThrow("sender_not_allowed");
		expect(() => assertCaptureSender("win32", event, null)).toThrow(
			"sender_not_allowed",
		);
	});
	it("rejects paths, handles, arrays, extra properties and unbounded input", () => {
		for (const input of [
			null,
			[],
			{ pickerId: "../x" },
			{ pickerId: "x".repeat(81) },
			{ pickerId: "x", types: ["screen"] },
			{ pickerId: "x", sourceId: 123 },
		]) {
			expect(() => validateCaptureRequest(input, false)).toThrow(
				"invalid_request",
			);
		}
		expect(
			validateCaptureRequest(
				{ pickerId: "picker-1", sourceId: "uuid-1" },
				true,
			),
		).toEqual({ pickerId: "picker-1", sourceId: "uuid-1" });
	});
});

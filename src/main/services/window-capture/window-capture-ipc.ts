import {
	BrowserWindow,
	desktopCapturer,
	ipcMain,
	type IpcMainInvokeEvent,
	type WebContents,
} from "electron";
import { WindowCaptureService } from "./window-capture-service";

export function validateCaptureRequest(
	value: unknown,
	capture: boolean,
): { pickerId: string; sourceId?: string } {
	if (typeof value !== "object" || value === null || Array.isArray(value))
		throw new Error("window_capture_invalid_request");
	const input = value as Record<string, unknown>;
	const keys = capture ? ["pickerId", "sourceId"] : ["pickerId"];
	if (
		Object.keys(input).length !== keys.length ||
		keys.some(
			(key) =>
				typeof input[key] !== "string" ||
				!/^[a-zA-Z0-9-]{1,80}$/.test(input[key] as string),
		)
	) {
		throw new Error("window_capture_invalid_request");
	}
	return input as { pickerId: string; sourceId?: string };
}

export function assertCaptureSender(
	platform: string,
	event: Pick<IpcMainInvokeEvent, "sender" | "senderFrame">,
	main: BrowserWindow | null,
): void {
	if (platform !== "win32") throw new Error("window_capture_unsupported");
	if (
		!main ||
		main.isDestroyed() ||
		event.sender !== main.webContents ||
		event.senderFrame !== main.webContents.mainFrame
	) {
		throw new Error("window_capture_sender_not_allowed");
	}
}

export function registerWindowCaptureIpc(
	getMainWindow: () => BrowserWindow | null,
): void {
	const service = new WindowCaptureService({
		getSources: (options) => desktopCapturer.getSources(options),
		getOwnSourceIds: () =>
			BrowserWindow.getAllWindows()
				.filter((window) => !window.isDestroyed())
				.map((window) => window.getMediaSourceId()),
	});
	const observed = new WeakSet<WebContents>();
	const guard = (event: IpcMainInvokeEvent): void => {
		assertCaptureSender(process.platform, event, getMainWindow());
		if (!observed.has(event.sender)) {
			observed.add(event.sender);
			event.sender.on("destroyed", () => service.release());
			event.sender.on("render-process-gone", () => service.release());
			event.sender.on(
				"did-start-navigation",
				(_event, _url, _inPlace, isMainFrame) => {
					if (isMainFrame) service.release();
				},
			);
		}
	};
	ipcMain.handle("window-capture:list", (event, input: unknown) => {
		guard(event);
		return service.list(validateCaptureRequest(input, false).pickerId);
	});
	ipcMain.handle("window-capture:capture", (event, input: unknown) => {
		guard(event);
		const params = validateCaptureRequest(input, true);
		return service.capture(params.pickerId, params.sourceId!);
	});
	ipcMain.handle("window-capture:release", (event, input: unknown) => {
		guard(event);
		service.release(validateCaptureRequest(input, false).pickerId);
	});
}

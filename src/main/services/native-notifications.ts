import { app, BrowserWindow, ipcMain, nativeImage, Notification } from "electron";

export type NativeNotificationKind = "run_completed" | "approval_required" | "clarification_required";

export type NativeNotificationPayload = {
	kind: NativeNotificationKind;
	sessionId?: string | null;
	requestId?: string | null;
	title: string;
	body: string;
	dedupeKey: string;
};

export type NativeNotificationResult = {
	shown: boolean;
	reason?: "foreground" | "deduped" | "unsupported" | "invalid" | "no_window" | "failed";
};

const ATTENTION_OVERLAY_SVG: string = [
	"<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"16\" height=\"16\" viewBox=\"0 0 16 16\">",
	"<circle cx=\"8\" cy=\"8\" r=\"8\" fill=\"#faad14\"/>",
	"<path d=\"M8 3.2c.5 0 .9.4.9.9v4.6a.9.9 0 0 1-1.8 0V4.1c0-.5.4-.9.9-.9Zm0 9.8a1.1 1.1 0 1 1 0-2.2A1.1 1.1 0 0 1 8 13Z\" fill=\"#141414\"/>",
	"</svg>"
].join("");

function isNativeNotificationPayload(value: unknown): value is NativeNotificationPayload {
	if (typeof value !== "object" || value === null || Array.isArray(value)) {
		return false;
	}

	const payload = value as Partial<NativeNotificationPayload>;
	return (payload.kind === "run_completed" || payload.kind === "approval_required" || payload.kind === "clarification_required")
		&& typeof payload.title === "string"
		&& payload.title.trim().length > 0
		&& typeof payload.body === "string"
		&& payload.body.trim().length > 0
		&& typeof payload.dedupeKey === "string"
		&& payload.dedupeKey.trim().length > 0;
}

export class NativeNotificationService {
	private mainWindow: BrowserWindow | null = null;
	private readonly shownDedupeKeys: Set<string> = new Set();
	private readonly overlayIcon = nativeImage.createFromDataURL(`data:image/svg+xml;charset=utf-8,${encodeURIComponent(ATTENTION_OVERLAY_SVG)}`);
	private bounceId: number | null = null;

	registerIpc(): void {
		ipcMain.handle("native-notification:show", (_event, payload: unknown): NativeNotificationResult => {
			return this.show(payload);
		});
		ipcMain.handle("native-notification:clear-attention", (): { cleared: true } => {
			this.clearAttention();
			return { cleared: true };
		});
	}

	attachWindow(mainWindow: BrowserWindow): void {
		this.mainWindow = mainWindow;
		mainWindow.on("focus", (): void => this.clearAttention());
		mainWindow.on("show", (): void => this.clearAttention());
		mainWindow.on("restore", (): void => this.clearAttention());
		mainWindow.on("closed", (): void => {
			if (this.mainWindow === mainWindow) {
				this.mainWindow = null;
			}
		});
	}

	private show(payload: unknown): NativeNotificationResult {
		if (!isNativeNotificationPayload(payload)) {
			return { shown: false, reason: "invalid" };
		}
		if (this.shownDedupeKeys.has(payload.dedupeKey)) {
			return { shown: false, reason: "deduped" };
		}

		const mainWindow = this.mainWindow;
		if (mainWindow === null || mainWindow.isDestroyed()) {
			return { shown: false, reason: "no_window" };
		}
		if (this.isForeground(mainWindow)) {
			return { shown: false, reason: "foreground" };
		}
		if (!Notification.isSupported()) {
			this.requestAttention(mainWindow);
			this.shownDedupeKeys.add(payload.dedupeKey);
			return { shown: false, reason: "unsupported" };
		}

		try {
			const notification = new Notification({
				title: payload.title.trim(),
				body: payload.body.trim(),
				silent: false
			});
			notification.on("click", (): void => {
				this.showWindow(mainWindow);
				this.clearAttention();
			});
			notification.show();
			this.requestAttention(mainWindow);
			this.shownDedupeKeys.add(payload.dedupeKey);
			return { shown: true };
		} catch (error: unknown) {
			console.error("[NativeNotification] failed to show notification", error);
			this.requestAttention(mainWindow);
			this.shownDedupeKeys.add(payload.dedupeKey);
			return { shown: false, reason: "failed" };
		}
	}

	private isForeground(mainWindow: BrowserWindow): boolean {
		return mainWindow.isVisible() && !mainWindow.isMinimized() && mainWindow.isFocused();
	}

	private requestAttention(mainWindow: BrowserWindow): void {
		if (process.platform === "darwin") {
			this.bounceId = app.dock?.bounce("informational") ?? null;
			app.dock?.setBadge("!");
			return;
		}

		mainWindow.flashFrame(true);
		if (process.platform === "win32") {
			mainWindow.setOverlayIcon(this.overlayIcon, "Daedalus needs attention");
		}
	}

	clearAttention(): void {
		this.shownDedupeKeys.clear();

		const mainWindow = this.mainWindow;
		if (mainWindow !== null && !mainWindow.isDestroyed()) {
			mainWindow.flashFrame(false);
			if (process.platform === "win32") {
				mainWindow.setOverlayIcon(null, "");
			}
		}

		if (process.platform === "darwin") {
			if (this.bounceId !== null) {
				app.dock?.cancelBounce(this.bounceId);
				this.bounceId = null;
			}
			app.dock?.setBadge("");
		}
	}

	private showWindow(mainWindow: BrowserWindow): void {
		if (mainWindow.isMinimized()) {
			mainWindow.restore();
		}
		mainWindow.show();
		mainWindow.focus();
	}
}

export const nativeNotificationService = new NativeNotificationService();

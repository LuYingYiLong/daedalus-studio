import { app, BrowserWindow, ipcMain, Menu, nativeImage, Tray, type MenuItemConstructorOptions } from "electron";
import type { ClientPreferences } from "./client-preferences-store";

type ClientPreferencesReader = {
	getCachedPreferences(): ClientPreferences;
};

export type TrayRecentSession = {
	id: string;
	title: string;
};

const TRAY_ICON_SVG: string = [
	"<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"32\" height=\"32\" viewBox=\"0 0 32 32\">",
	"<circle cx=\"16\" cy=\"16\" r=\"15\" fill=\"#f2f2f2\"/>",
	"<path d=\"M21.8 4.7 17.7 16.2 28 10.2 18.9 17.1 23.1 27.4 15.7 18.9 6 27.3l5.1-10.5L4 12.1l8.7 1.7L21.8 4.7z\" fill=\"#262626\"/>",
	"<circle cx=\"16\" cy=\"16\" r=\"3\" fill=\"#f2f2f2\"/>",
	"</svg>"
].join("");

export function shouldMinimizeToTrayOnClose(preferences: ClientPreferences, isQuitting: boolean): boolean {
	return preferences.minimizeToTrayOnClose && !isQuitting;
}

function normalizeTrayRecentSessions(value: unknown): TrayRecentSession[] {
	if (!Array.isArray(value)) {
		return [];
	}

	const sessions: TrayRecentSession[] = [];
	const seenIds: Set<string> = new Set();
	for (const item of value) {
		if (typeof item !== "object" || item === null || Array.isArray(item)) {
			continue;
		}

		const record = item as Record<string, unknown>;
		const id: string = typeof record.id === "string" ? record.id.trim() : "";
		const title: string = typeof record.title === "string" ? record.title.trim() : "";
		if (id.length === 0 || seenIds.has(id)) {
			continue;
		}

		seenIds.add(id);
		sessions.push({
			id,
			title: title.length === 0 ? "Untitled session" : title
		});
		if (sessions.length >= 3) {
			break;
		}
	}

	return sessions;
}

export class WindowLifecycleController {
	private tray: Tray | null = null;
	private isQuitting: boolean = false;
	private mainWindow: BrowserWindow | null = null;
	private recentSessions: TrayRecentSession[] = [];

	constructor(private readonly preferencesReader: ClientPreferencesReader) {}

	registerIpc(): void {
		ipcMain.handle("tray:update-recent-sessions", (_event, sessions: unknown): { updated: true } => {
			this.recentSessions = normalizeTrayRecentSessions(sessions);
			this.updateTrayMenu();
			return { updated: true };
		});
	}

	attachWindow(mainWindow: BrowserWindow): void {
		this.mainWindow = mainWindow;
		mainWindow.on("close", (event): void => {
			if (!shouldMinimizeToTrayOnClose(this.preferencesReader.getCachedPreferences(), this.isQuitting)) {
				return;
			}

			event.preventDefault();
			this.ensureTray(mainWindow);
			mainWindow.hide();
		});
	}

	markQuitting(): void {
		this.isQuitting = true;
	}

	quit(): void {
		this.markQuitting();
		app.quit();
	}

	private ensureTray(mainWindow: BrowserWindow): void {
		if (this.tray !== null) {
			return;
		}

		const icon = nativeImage.createFromDataURL(`data:image/svg+xml;charset=utf-8,${encodeURIComponent(TRAY_ICON_SVG)}`);
		this.tray = new Tray(icon);
		this.tray.setToolTip("Daedalus Studio");
		this.updateTrayMenu();
		this.tray.on("click", (): void => this.showWindow(mainWindow));
	}

	private updateTrayMenu(): void {
		if (this.tray === null) {
			return;
		}

		const template: MenuItemConstructorOptions[] = [];
		if (this.recentSessions.length > 0) {
			template.push({
				label: "Recent",
				enabled: false
			});
			for (const session of this.recentSessions) {
				template.push({
					label: session.title,
					click: (): void => this.sendTrayCommand("tray:open-session", session.id)
				});
			}
			template.push({ type: "separator" });
		}

		template.push(
			{
				label: "New chat",
				click: (): void => this.sendTrayCommand("tray:new-chat")
			},
			{ type: "separator" },
			{
				label: "Exit",
				click: (): void => this.quit()
			}
		);

		this.tray.setContextMenu(Menu.buildFromTemplate(template));
	}

	private sendTrayCommand(channel: "tray:new-chat" | "tray:open-session", sessionId?: string): void {
		if (this.mainWindow === null) {
			return;
		}

		this.showWindow(this.mainWindow);
		if (sessionId === undefined) {
			this.mainWindow.webContents.send(channel);
			return;
		}

		this.mainWindow.webContents.send(channel, sessionId);
	}

	private showWindow(mainWindow: BrowserWindow): void {
		if (mainWindow.isMinimized()) {
			mainWindow.restore();
		}
		mainWindow.show();
		mainWindow.focus();
	}
}

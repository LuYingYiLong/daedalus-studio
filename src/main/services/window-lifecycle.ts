import { app, BrowserWindow, Menu, nativeImage, Tray } from "electron";
import type { ClientPreferences } from "./client-preferences-store";

type ClientPreferencesReader = {
	getCachedPreferences(): ClientPreferences;
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

export class WindowLifecycleController {
	private tray: Tray | null = null;
	private isQuitting: boolean = false;

	constructor(private readonly preferencesReader: ClientPreferencesReader) {}

	attachWindow(mainWindow: BrowserWindow): void {
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
		this.tray.setContextMenu(Menu.buildFromTemplate([
			{
				label: "Show Daedalus Studio",
				click: (): void => this.showWindow(mainWindow)
			},
			{ type: "separator" },
			{
				label: "Quit",
				click: (): void => this.quit()
			}
		]));
		this.tray.on("click", (): void => this.showWindow(mainWindow));
	}

	private showWindow(mainWindow: BrowserWindow): void {
		if (mainWindow.isMinimized()) {
			mainWindow.restore();
		}
		mainWindow.show();
		mainWindow.focus();
	}
}

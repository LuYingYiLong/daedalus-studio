import { app, BrowserWindow, ipcMain, nativeTheme, shell, type BrowserWindowConstructorOptions } from "electron";
import { join } from "node:path";
import { backendManager } from "./services/backend-manager";
import { backendBootstrapService } from "./services/backend-bootstrap";
import { registerWorkspaceFsIpc } from "./services/workspace-fs";
import { registerSessionFsIpc } from "./services/session-fs";
import { registerSkillFsIpc } from "./services/skill-fs";
import { registerSkillsCliIpc } from "./services/skills-cli";
import { registerClipboardIpc } from "./services/clipboard";
import { registerGodotExecutableDialogIpc } from "./services/godot-executable-dialog";
import { clientPreferencesService } from "./services/client-preferences";
import { WindowLifecycleController } from "./services/window-lifecycle";
import { registerSystemInfoIpc } from "./services/system-info";
import { registerTerminalPtyIpc, terminalPtyService } from "./services/terminal-pty";
import { appUpdateService } from "./services/app-update";
import { nativeNotificationService } from "./services/native-notifications";
import { getWindowThemeColors, resolveWindowTheme, type WindowThemeColors } from "./services/window-theme";
import type { ClientPreferences } from "./services/client-preferences";
import { configureAppIdentity, getAppIconPath } from "./services/app-identity";
import { godotProjectsService } from "./services/godot-projects";
import { sessionLayoutService } from "./services/session-layout";

backendManager.registerIpc();
backendBootstrapService.registerIpc();
registerWorkspaceFsIpc();
registerSessionFsIpc();
registerSkillFsIpc();
registerSkillsCliIpc();
registerClipboardIpc();
registerGodotExecutableDialogIpc();
clientPreferencesService.registerIpc();
registerSystemInfoIpc();
registerTerminalPtyIpc();
appUpdateService.registerIpc();
nativeNotificationService.registerIpc();
godotProjectsService.registerIpc();
sessionLayoutService.registerIpc();

configureAppIdentity();

const windowLifecycleController = new WindowLifecycleController(clientPreferencesService);
let mainWindow: BrowserWindow | null = null;
let settingsWindow: BrowserWindow | null = null;
const SETTINGS_PAGE_KEYS: readonly string[] = [
	"provider",
	"default_model",
	"general",
	"search",
	"statistics",
	"personalization",
	"mcp_servers",
	"skills",
	"godot_projects",
	"archived_sessions",
	"about"
];
windowLifecycleController.registerIpc();
appUpdateService.setBeforeClientInstall(async (): Promise<void> => {
	windowLifecycleController.markQuitting();
	terminalPtyService.dispose();
	backendManager.detach();
});

function getWindowIconPath(): string | undefined {
	if (process.platform === "darwin") {
		return undefined;
	}

	return getAppIconPath() ?? undefined;
}

function getCurrentWindowThemeColors(preferences: ClientPreferences): WindowThemeColors {
	return getWindowThemeColors(resolveWindowTheme(preferences.theme, nativeTheme.shouldUseDarkColors));
}

function getWindowBackgroundColor(colors: WindowThemeColors): string {
	return process.platform === "win32" || process.platform === "darwin" ? "#00000000" : colors.backgroundColor;
}

function getNativeWindowMaterialOptions(): Partial<BrowserWindowConstructorOptions> {
	if (process.platform === "win32") {
		return {
			backgroundMaterial: "acrylic"
		};
	}

	if (process.platform === "darwin") {
		return {
			vibrancy: "under-window",
			visualEffectState: "active"
		};
	}

	return {};
}

function applyWindowTheme(mainWindow: BrowserWindow, preferences: ClientPreferences): void {
	const colors: WindowThemeColors = getCurrentWindowThemeColors(preferences);
	mainWindow.setBackgroundColor(getWindowBackgroundColor(colors));
	if (process.platform !== "darwin") {
		mainWindow.setTitleBarOverlay({
			color: colors.titleBarOverlayColor,
			symbolColor: colors.symbolColor,
			height: 36
		});
	}
}

function applyWindowThemeToAllWindows(): void {
	const preferences: ClientPreferences = clientPreferencesService.getCachedPreferences();
	for (const browserWindow of BrowserWindow.getAllWindows()) {
		applyWindowTheme(browserWindow, preferences);
	}
}

function isSettingsPageKey(value: unknown): value is string {
	return typeof value === "string" && SETTINGS_PAGE_KEYS.includes(value);
}

function loadRendererWindow(browserWindow: BrowserWindow, view: "main" | "settings", settingsPage?: string): void {
	if (!app.isPackaged && process.env.ELECTRON_RENDERER_URL) {
		const rendererUrl: URL = new URL(process.env.ELECTRON_RENDERER_URL);
		rendererUrl.searchParams.set("view", view);
		if (settingsPage !== undefined) {
			rendererUrl.searchParams.set("page", settingsPage);
		}
		void browserWindow.loadURL(rendererUrl.toString());
		return;
	}

	void browserWindow.loadFile(join(__dirname, "../renderer/index.html"), {
		query: settingsPage === undefined ? { view } : { view, page: settingsPage }
	});
}

function openSettingsWindow(page: string = "provider"): void {
	if (mainWindow === null || mainWindow.isDestroyed()) {
		return;
	}

	if (settingsWindow !== null && !settingsWindow.isDestroyed()) {
		if (settingsWindow.isMinimized()) {
			settingsWindow.restore();
		}
		settingsWindow.show();
		settingsWindow.focus();
		settingsWindow.webContents.send("window:open-settings", page);
		return;
	}

	const colors: WindowThemeColors = getCurrentWindowThemeColors(clientPreferencesService.getCachedPreferences());
	settingsWindow = new BrowserWindow({
		width: 1080,
		height: 648,
		minWidth: 820,
		minHeight: 580,
		parent: mainWindow,
		backgroundColor: getWindowBackgroundColor(colors),
		icon: getWindowIconPath(),
		show: false,
		...getNativeWindowMaterialOptions(),
		webPreferences: {
			preload: join(__dirname, "../preload/index.js"),
			contextIsolation: true,
			nodeIntegration: false,
			sandbox: false
		},
		titleBarStyle: "hidden",
		...(process.platform !== "darwin" ? {
			titleBarOverlay: {
				color: colors.titleBarOverlayColor,
				symbolColor: colors.symbolColor,
				height: 36
			}
		} : {})
	});
	applyWindowTheme(settingsWindow, clientPreferencesService.getCachedPreferences());
	settingsWindow.once("ready-to-show", () => settingsWindow?.show());
	settingsWindow.webContents.setWindowOpenHandler(({ url }) => {
		void shell.openExternal(url);
		return { action: "deny" };
	});
	settingsWindow.on("closed", () => {
		settingsWindow = null;
	});
	loadRendererWindow(settingsWindow, "settings", page);
}

ipcMain.handle("window:open-settings", (_event, page?: unknown): void => {
	openSettingsWindow(isSettingsPageKey(page) ? page : "provider");
});

function createWindow(): void {
	const colors: WindowThemeColors = getCurrentWindowThemeColors(clientPreferencesService.getCachedPreferences());
	mainWindow = new BrowserWindow({
		width: 1300,
		height: 760,
		minWidth: 900,
		minHeight: 620,
		backgroundColor: getWindowBackgroundColor(colors),
		icon: getWindowIconPath(),
		show: false,
		...getNativeWindowMaterialOptions(),
		webPreferences: {
			preload: join(__dirname, "../preload/index.js"),
			contextIsolation: true,
			nodeIntegration: false,
			sandbox: false
		},

		// 自定义标题栏
		titleBarStyle: "hidden",
		...(process.platform != "darwin" ? {
			titleBarStyle: "hidden",
			titleBarOverlay: {
				color: colors.titleBarOverlayColor,
				symbolColor: colors.symbolColor,
				height: 36
			}
		} : {})
	});
	applyWindowTheme(mainWindow, clientPreferencesService.getCachedPreferences());

	if (!app.isPackaged) {
		mainWindow.webContents.openDevTools({ mode: "detach" });
	}

	backendBootstrapService.attachWindow(mainWindow);
	windowLifecycleController.attachWindow(mainWindow);
	nativeNotificationService.attachWindow(mainWindow);

	mainWindow.once("ready-to-show", () => {
		if (mainWindow === null) {
			return;
		}
		applyWindowTheme(mainWindow, clientPreferencesService.getCachedPreferences());
		mainWindow.show();
	});

	mainWindow.webContents.setWindowOpenHandler(({ url }) => {
		void shell.openExternal(url);
		return { action: "deny" };
	});

	mainWindow.on("closed", () => {
		mainWindow = null;
		if (settingsWindow !== null && !settingsWindow.isDestroyed()) {
			settingsWindow.close();
		}
		windowLifecycleController.quit();
	});
	loadRendererWindow(mainWindow, "main");
}

app.whenReady().then(async () => {
	const preferences: ClientPreferences = await clientPreferencesService.load();
	clientPreferencesService.onDidChange((): void => {
		applyWindowThemeToAllWindows();
		windowLifecycleController.syncTrayWithPreferences();
	});
	nativeTheme.on("updated", (): void => {
		applyWindowThemeToAllWindows();
	});
	createWindow();
	let checkedStartupUpdates: boolean = false;
	const checkStartupUpdates = (state: ReturnType<typeof backendBootstrapService.getState>): void => {
		if (!checkedStartupUpdates && state.status === "healthy") {
			checkedStartupUpdates = true;
			void appUpdateService.checkForUpdatesIfEnabled(preferences.autoCheckForUpdates);
		}
	};
	backendBootstrapService.onDidChangeState(checkStartupUpdates);
	void backendBootstrapService.prepare().then(checkStartupUpdates);
	void godotProjectsService.startupMaintenance();

	app.on("activate", () => {
		if (BrowserWindow.getAllWindows().length === 0) {
			createWindow();
		}
	});
});

app.on("before-quit", () => {
	windowLifecycleController.markQuitting();
	terminalPtyService.dispose();
	backendManager.detach();
});

app.on("window-all-closed", () => {
	if (process.platform !== "darwin") {
		app.quit();
	}
});

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

const hasSingleInstanceLock: boolean = app.requestSingleInstanceLock();
const windowLifecycleController = new WindowLifecycleController(clientPreferencesService);
let mainWindow: BrowserWindow | null = null;
let settingsWindow: BrowserWindow | null = null;
const rendererReadyWindows: WeakSet<BrowserWindow> = new WeakSet();
const rendererShellReadyWindows: WeakSet<BrowserWindow> = new WeakSet();
const rendererRevealRequestedWindows: WeakSet<BrowserWindow> = new WeakSet();
const rendererReadyFallbackTimers: Map<number, ReturnType<typeof setTimeout>> = new Map();
const RENDERER_READY_FALLBACK_MS: number = 3_500;
const SETTINGS_WINDOW_PREWARM_DELAY_MS: number = 750;
let settingsWindowPrewarmTimer: ReturnType<typeof setTimeout> | null = null;
let allowSettingsWindowClose: boolean = false;
let pendingSettingsPage: string = "provider";
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

function clearRendererReadyFallback(browserWindow: BrowserWindow): void {
	const fallbackTimer: ReturnType<typeof setTimeout> | undefined = rendererReadyFallbackTimers.get(browserWindow.id);
	if (fallbackTimer === undefined) {
		return;
	}
	clearTimeout(fallbackTimer);
	rendererReadyFallbackTimers.delete(browserWindow.id);
}

function revealRendererWindow(browserWindow: BrowserWindow): void {
	if (browserWindow.isDestroyed()) {
		return;
	}
	clearRendererReadyFallback(browserWindow);
	applyWindowTheme(browserWindow, clientPreferencesService.getCachedPreferences());
	if (browserWindow.isMinimized()) {
		browserWindow.restore();
	}
	browserWindow.show();
	browserWindow.focus();
}

function trackRendererWindow(browserWindow: BrowserWindow): void {
	browserWindow.once("closed", (): void => {
		clearRendererReadyFallback(browserWindow);
	});
}

function requestRendererWindowReveal(browserWindow: BrowserWindow): void {
	if (browserWindow.isDestroyed()) {
		return;
	}
	rendererRevealRequestedWindows.add(browserWindow);
	if (
		rendererReadyWindows.has(browserWindow)
		|| rendererShellReadyWindows.has(browserWindow)
	) {
		revealRendererWindow(browserWindow);
		return;
	}
	if (rendererReadyFallbackTimers.has(browserWindow.id)) {
		return;
	}
	const fallbackTimer: ReturnType<typeof setTimeout> = setTimeout((): void => {
		if (!browserWindow.isDestroyed() && rendererRevealRequestedWindows.has(browserWindow)) {
			revealRendererWindow(browserWindow);
		}
	}, RENDERER_READY_FALLBACK_MS);
	rendererReadyFallbackTimers.set(browserWindow.id, fallbackTimer);
}

function activateMainWindow(): void {
	if (mainWindow === null || mainWindow.isDestroyed()) {
		return;
	}
	requestRendererWindowReveal(mainWindow);
}

function markRendererWindowReady(browserWindow: BrowserWindow): void {
	if (browserWindow.isDestroyed()) {
		return;
	}
	rendererReadyWindows.add(browserWindow);
	clearRendererReadyFallback(browserWindow);
	if (rendererRevealRequestedWindows.has(browserWindow)) {
		revealRendererWindow(browserWindow);
	}
}

function broadcastClientPreferencesChanged(preferences: ClientPreferences): void {
	for (const browserWindow of BrowserWindow.getAllWindows()) {
		if (!browserWindow.isDestroyed()) {
			browserWindow.webContents.send("client-preferences:changed", preferences);
		}
	}
}

ipcMain.on("window:renderer-ready", (event): void => {
	const browserWindow: BrowserWindow | null = BrowserWindow.fromWebContents(event.sender);
	if (browserWindow !== null) {
		markRendererWindowReady(browserWindow);
		if (browserWindow === mainWindow) {
			scheduleSettingsWindowPrewarm();
		}
		if (browserWindow === settingsWindow) {
			setImmediate((): void => {
				if (settingsWindow !== null && !settingsWindow.isDestroyed()) {
					settingsWindow.webContents.send("window:open-settings", pendingSettingsPage);
				}
			});
		}
	}
});

ipcMain.on("window:renderer-shell-ready", (event): void => {
	const browserWindow: BrowserWindow | null = BrowserWindow.fromWebContents(event.sender);
	if (browserWindow === null || browserWindow.isDestroyed()) {
		return;
	}
	rendererShellReadyWindows.add(browserWindow);
	if (rendererRevealRequestedWindows.has(browserWindow)) {
		revealRendererWindow(browserWindow);
	}
});

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

function createSettingsWindow(page: string): BrowserWindow | null {
	if (mainWindow === null || mainWindow.isDestroyed()) {
		return null;
	}
	pendingSettingsPage = page;

	if (settingsWindow !== null && !settingsWindow.isDestroyed()) {
		if (rendererReadyWindows.has(settingsWindow)) {
			settingsWindow.webContents.send("window:open-settings", page);
		}
		return settingsWindow;
	}

	const colors: WindowThemeColors = getCurrentWindowThemeColors(clientPreferencesService.getCachedPreferences());
	settingsWindow = new BrowserWindow({
		width: 1080,
		height: 648,
		minWidth: 820,
		minHeight: 580,
		skipTaskbar: false,
		backgroundColor: getWindowBackgroundColor(colors),
		title: "Settings",
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
	trackRendererWindow(settingsWindow);
	settingsWindow.webContents.setWindowOpenHandler(({ url }) => {
		void shell.openExternal(url);
		return { action: "deny" };
	});
	settingsWindow.on("close", (event): void => {
		if (
			!allowSettingsWindowClose
			&& mainWindow !== null
			&& !mainWindow.isDestroyed()
		) {
			event.preventDefault();
			if (settingsWindow !== null) {
				rendererRevealRequestedWindows.delete(settingsWindow);
			}
			settingsWindow?.hide();
		}
	});
	settingsWindow.on("closed", () => {
		settingsWindow = null;
	});
	loadRendererWindow(settingsWindow, "settings", page);
	return settingsWindow;
}

function openSettingsWindow(page: string = "provider"): void {
	const browserWindow: BrowserWindow | null = createSettingsWindow(page);
	if (browserWindow !== null) {
		requestRendererWindowReveal(browserWindow);
	}
}

function scheduleSettingsWindowPrewarm(): void {
	if (
		settingsWindowPrewarmTimer !== null
		|| (settingsWindow !== null && !settingsWindow.isDestroyed())
	) {
		return;
	}
	settingsWindowPrewarmTimer = setTimeout((): void => {
		settingsWindowPrewarmTimer = null;
		if (
			mainWindow !== null
			&& !mainWindow.isDestroyed()
			&& (settingsWindow === null || settingsWindow.isDestroyed())
		) {
			createSettingsWindow("provider");
		}
	}, SETTINGS_WINDOW_PREWARM_DELAY_MS);
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
	trackRendererWindow(mainWindow);
	requestRendererWindowReveal(mainWindow);

	mainWindow.webContents.setWindowOpenHandler(({ url }) => {
		void shell.openExternal(url);
		return { action: "deny" };
	});

	mainWindow.on("closed", () => {
		mainWindow = null;
		if (settingsWindowPrewarmTimer !== null) {
			clearTimeout(settingsWindowPrewarmTimer);
			settingsWindowPrewarmTimer = null;
		}
		if (settingsWindow !== null && !settingsWindow.isDestroyed()) {
			allowSettingsWindowClose = true;
			settingsWindow.close();
		}
		windowLifecycleController.quit();
	});
	loadRendererWindow(mainWindow, "main");
}

if (!hasSingleInstanceLock) {
	app.quit();
} else {
	app.on("second-instance", (): void => {
		activateMainWindow();
	});

	void app.whenReady().then(async (): Promise<void> => {
		const preferences: ClientPreferences = await clientPreferencesService.load();
		clientPreferencesService.onDidChange((nextPreferences: ClientPreferences): void => {
			applyWindowThemeToAllWindows();
			broadcastClientPreferencesChanged(nextPreferences);
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
				return;
			}
			activateMainWindow();
		});
	});

	app.on("before-quit", () => {
		allowSettingsWindowClose = true;
		windowLifecycleController.markQuitting();
		terminalPtyService.dispose();
		backendManager.detach();
	});

	app.on("window-all-closed", () => {
		if (process.platform !== "darwin") {
			app.quit();
		}
	});
}

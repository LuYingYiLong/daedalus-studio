import { app, BrowserWindow, nativeTheme, shell, type BrowserWindowConstructorOptions } from "electron";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { backendManager } from "./services/backend-manager";
import { backendBootstrapService } from "./services/backend-bootstrap";
import { registerWorkspaceFsIpc } from "./services/workspace-fs";
import { registerSessionFsIpc } from "./services/session-fs";
import { registerSkillFsIpc } from "./services/skill-fs";
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

backendManager.registerIpc();
backendBootstrapService.registerIpc();
registerWorkspaceFsIpc();
registerSessionFsIpc();
registerSkillFsIpc();
registerClipboardIpc();
registerGodotExecutableDialogIpc();
clientPreferencesService.registerIpc();
registerSystemInfoIpc();
registerTerminalPtyIpc();
appUpdateService.registerIpc();
nativeNotificationService.registerIpc();

const windowLifecycleController = new WindowLifecycleController(clientPreferencesService);
windowLifecycleController.registerIpc();

function getWindowIconPath(): string | undefined {
	if (process.platform === "darwin") {
		return undefined;
	}

	const iconPath: string = app.isPackaged
		? join(process.resourcesPath, "icon.ico")
		: join(app.getAppPath(), "build/icon.ico");

	return existsSync(iconPath) ? iconPath : undefined;
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

function createWindow(): void {
	const colors: WindowThemeColors = getCurrentWindowThemeColors(clientPreferencesService.getCachedPreferences());
	const mainWindow: BrowserWindow = new BrowserWindow({
		width: 1200,
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
		applyWindowTheme(mainWindow, clientPreferencesService.getCachedPreferences());
		mainWindow.show();
	});

	mainWindow.webContents.setWindowOpenHandler(({ url }) => {
		void shell.openExternal(url);
		return { action: "deny" };
	});

	if (!app.isPackaged && process.env.ELECTRON_RENDERER_URL) {
		void mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL);
	} else {
		void mainWindow.loadFile(join(__dirname, "../renderer/index.html"));
	}
}

app.whenReady().then(async () => {
	if (process.platform === "win32") {
		app.setAppUserModelId("com.luyingyilong.daedalus-studio");
	}

	const preferences: ClientPreferences = await clientPreferencesService.load();
	clientPreferencesService.onDidChange((): void => {
		applyWindowThemeToAllWindows();
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

	app.on("activate", () => {
		if (BrowserWindow.getAllWindows().length === 0) {
			createWindow();
		}
	});
});

app.on("before-quit", () => {
	windowLifecycleController.markQuitting();
	terminalPtyService.dispose();
});

app.on("window-all-closed", () => {
	if (process.platform !== "darwin") {
		app.quit();
	}
});

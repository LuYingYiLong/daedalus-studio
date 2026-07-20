import { app, BrowserWindow, shell } from "electron";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { backendManager } from "./services/backend-manager";
import { registerWorkspaceFsIpc } from "./services/workspace-fs";
import { registerSessionFsIpc } from "./services/session-fs";
import { registerSkillFsIpc } from "./services/skill-fs";
import { registerClipboardIpc } from "./services/clipboard";
import { clientPreferencesService } from "./services/client-preferences";
import { WindowLifecycleController } from "./services/window-lifecycle";
import { registerSystemInfoIpc } from "./services/system-info";

backendManager.registerIpc();
registerWorkspaceFsIpc();
registerSessionFsIpc();
registerSkillFsIpc();
registerClipboardIpc();
clientPreferencesService.registerIpc();
registerSystemInfoIpc();

const windowLifecycleController = new WindowLifecycleController(clientPreferencesService);

function getWindowIconPath(): string | undefined {
	if (process.platform === "darwin") {
		return undefined;
	}

	const iconPath: string = app.isPackaged
		? join(process.resourcesPath, "icon.ico")
		: join(app.getAppPath(), "build/icon.ico");

	return existsSync(iconPath) ? iconPath : undefined;
}

function createWindow(): void {
	const mainWindow: BrowserWindow = new BrowserWindow({
		width: 1200,
		height: 760,
		minWidth: 900,
		minHeight: 620,
		backgroundColor: "#141414",
		icon: getWindowIconPath(),
		show: false,
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
				color: "#14141400",
				symbolColor: "#ffffff",
				height: 36
			}
		} : {})
	});

	if (!app.isPackaged) {
		mainWindow.webContents.openDevTools({ mode: "detach" });
	}

	// 启动 backendManager
	backendManager.start(mainWindow);
	windowLifecycleController.attachWindow(mainWindow);

	mainWindow.once("ready-to-show", () => {
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
	await clientPreferencesService.load();
	createWindow();

	app.on("activate", () => {
		if (BrowserWindow.getAllWindows().length === 0) {
			createWindow();
		}
	});
});

app.on("before-quit", () => {
	windowLifecycleController.markQuitting();
});

app.on("window-all-closed", () => {
	if (process.platform !== "darwin") {
		app.quit();
	}
});

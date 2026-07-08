import { app, BrowserWindow, shell } from "electron";
import { join } from "node:path";
import { backendManager } from "./services/backend-manager";

backendManager.registerIpc();

function createWindow(): void {
	const mainWindow: BrowserWindow = new BrowserWindow({
		width: 1200,
		height: 760,
		minWidth: 900,
		minHeight: 620,
		backgroundColor: "#141414",
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
				height: 40
			}
		} : {})
	});

	if (!app.isPackaged) {
		mainWindow.webContents.openDevTools({ mode: "detach" });
	}

	// 启动 backendManager
	backendManager.start(mainWindow);

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

app.whenReady().then(() => {
	createWindow();

	app.on("activate", () => {
		if (BrowserWindow.getAllWindows().length === 0) {
			createWindow();
		}
	});
});

app.on("window-all-closed", () => {
	if (process.platform !== "darwin") {
		app.quit();
	}
});

const { app, BrowserWindow } = require("electron");
app.disableHardwareAcceleration();
app.on("window-all-closed", () => app.quit());
app.whenReady().then(() => {
	const window = new BrowserWindow({ show: false, webPreferences: { sandbox: true } });
	window.webContents.once("did-finish-load", () => {
		console.log("supervised-electron-renderer-ready");
		window.close();
	});
	window.loadURL("data:text/html,<title>Process lifecycle fixture</title>");
});

import { describe, expect, it } from "vitest";
import { readRepoFile } from "../../helpers/repo-paths";

describe("settings window lifecycle", () => {
	it("keeps settings as an independent taskbar window and closes it with the main window", () => {
		const source: string = readRepoFile("src", "main", "index.ts");

		expect(source).not.toContain("parent: mainWindow,");
		expect(source).toContain("skipTaskbar: false,");
		expect(source).toContain("mainWindow.on(\"closed\"");
		expect(source).toContain("settingsWindow.close();");
	});

	it("keeps the settings window title separate from the shared renderer document title", () => {
		const mainSource: string = readRepoFile("src", "main", "index.ts");
		const rendererEntrySource: string = readRepoFile("src", "renderer", "src", "main.tsx");
		const settingsWindowSource: string = readRepoFile("src", "renderer", "src", "app", "SettingsWindow.tsx");

		expect(mainSource).toContain('title: "Settings",');
		expect(rendererEntrySource).toContain('document.title = "Settings";');
		expect(settingsWindowSource).toContain('document.title = t("settings.menu.fallbackTitle");');
	});

	it("prewarms a fresh hidden settings window after startup and each real close", () => {
		const mainSource: string = readRepoFile("src", "main", "index.ts");

		expect(mainSource).toContain("function openSettingsWindow(page: string");
		expect(mainSource).toContain("createSettingsWindow(page)");
		expect(mainSource).toContain('settingsWindow.on("closed"');
		expect(mainSource).toContain("settingsWindow = null");
		expect(mainSource).toContain("scheduleSettingsWindowPrewarm()");
		expect(mainSource).toContain("SETTINGS_WINDOW_PREWARM_DELAY_MS");
		expect(mainSource).toContain('createSettingsWindow("provider")');
		expect(mainSource).toContain("cancelSettingsWindowPrewarm()");
		expect(mainSource).toContain("isAppQuitting");
		expect(mainSource).not.toContain("settingsWindow?.hide()");
		expect(mainSource).not.toContain("allowSettingsWindowClose");
		expect(mainSource).not.toContain("event.preventDefault()");
	});

	it("shows a lightweight settings shell immediately and swaps in content after critical fonts load", () => {
		const mainSource: string = readRepoFile("src", "main", "index.ts");
		const preloadSource: string = readRepoFile("src", "preload", "index.ts");
		const rendererEntrySource: string = readRepoFile("src", "renderer", "src", "main.tsx");
		const globalStylesSource: string = readRepoFile("src", "renderer", "src", "styles", "global.css");

		expect(mainSource).toContain('ipcMain.on("window:renderer-ready"');
		expect(mainSource).toContain('ipcMain.on("window:renderer-shell-ready"');
		expect(mainSource).toContain("requestRendererWindowReveal(mainWindow)");
		expect(mainSource).toContain("RENDERER_READY_FALLBACK_MS");
		expect(mainSource).toContain('browserWindow.once("ready-to-show"');
		expect(mainSource).toContain("rendererPaintReadyWindows");
		expect(mainSource).toContain("paintWhenInitiallyHidden: true");
		expect(preloadSource).toContain('ipcRenderer.send("window:renderer-shell-ready")');
		expect(preloadSource).toContain('ipcRenderer.send("window:renderer-ready")');
		expect(rendererEntrySource).toContain("window.electronAPI.windowControl.rendererShellReady()");
		expect(rendererEntrySource).toContain("await waitForStudioFonts(document.fonts)");
		expect(rendererEntrySource).toContain("await waitForRendererPaint()");
		expect(rendererEntrySource).toContain("window.electronAPI.windowControl.rendererReady()");
		expect(globalStylesSource).toContain(".settings-window-warmup__indicator");
	});
});

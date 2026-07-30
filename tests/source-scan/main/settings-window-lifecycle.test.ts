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

	it("prewarms and reuses the hidden settings renderer while the main window remains alive", () => {
		const mainSource: string = readRepoFile("src", "main", "index.ts");

		expect(mainSource).toContain("scheduleSettingsWindowPrewarm()");
		expect(mainSource).toContain('createSettingsWindow("provider")');
		expect(mainSource).toContain("event.preventDefault()");
		expect(mainSource).toContain("settingsWindow?.hide()");
		expect(mainSource).toContain("allowSettingsWindowClose = true");
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
		expect(preloadSource).toContain('ipcRenderer.send("window:renderer-shell-ready")');
		expect(preloadSource).toContain('ipcRenderer.send("window:renderer-ready")');
		expect(rendererEntrySource).toContain("window.electronAPI.windowControl.rendererShellReady()");
		expect(rendererEntrySource).toContain("await waitForStudioFonts(document.fonts)");
		expect(rendererEntrySource).toContain("window.electronAPI.windowControl.rendererReady()");
		expect(globalStylesSource).toContain(".settings-window-warmup__indicator");
	});
});

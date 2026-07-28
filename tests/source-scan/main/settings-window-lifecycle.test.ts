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
});

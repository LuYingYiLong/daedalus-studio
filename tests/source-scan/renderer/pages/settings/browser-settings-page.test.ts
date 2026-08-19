import { describe, expect, it } from "vitest";
import { readRepoFile } from "../../../../helpers/repo-paths";

describe("BrowserSettingsPage", () => {
	it("shows the download path as metadata with browse and reset actions", () => {
		const source: string = readRepoFile("src", "renderer", "src", "widgets", "settings", "BrowserSettingsPage.tsx");
		const styles: string = readRepoFile("src", "renderer", "src", "widgets", "settings", "BrowserSettingsPage.module.css");
		const browserServiceSource: string = readRepoFile("src", "main", "services", "browser", "browser-service.ts");
		const preloadSource: string = readRepoFile("src", "preload", "index.ts");

		expect(source).toContain("settings.downloadDirectory ??");
		expect(source).toContain("defaultDownloadDirectory ||");
		expect(source).toContain("settings.browser.downloads.systemDefault");
		expect(source).toContain('icon={<Icon name="folder-open" />}');
		expect(source).toContain('icon={<Icon name="reload" />}');
		expect(source).toContain("downloadDirectory: null");
		expect(source).toContain("settings.browser.downloads.resetDirectory");
		expect(styles).not.toContain(".directoryInput");
		expect(browserServiceSource).toContain('app.getPath("downloads")');
		expect(preloadSource).toContain("browser:settings-get-default-download-directory");
	});

	it("passes the Studio theme preference to Chromium pages", () => {
		const mainSource: string = readRepoFile("src", "main", "index.ts");
		expect(mainSource).toContain("nativeTheme.themeSource = preferences.theme");
		expect(mainSource).toContain("applyNativeThemePreference(preferences)");
		expect(mainSource).toContain("applyNativeThemePreference(nextPreferences)");
	});

	it("keeps AI CDP control off by default and requires confirmation", () => {
		const page = readRepoFile("src", "renderer", "src", "widgets", "settings", "BrowserSettingsPage.tsx");
		const store = readRepoFile("src", "main", "services", "browser", "browser-data-store.ts");
		expect(page).toContain("aiCdpEnabled: false");
		expect(page).toContain("settings.browser.aiControl.confirmTitle");
		expect(page).toContain("modal.confirm");
		expect(store).toContain("aiCdpEnabled: false");
	});
});

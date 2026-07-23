import { describe, expect, it } from "vitest";
import { readRepoFile } from "../../../../helpers/repo-paths";

describe("AboutSettingsPage", () => {
	it("shows backend details with the colorful backend icon", () => {
		const pageSource: string = readRepoFile("src", "renderer", "src", "pages", "settings", "AboutSettingsPage.tsx");
		const cssSource: string = readRepoFile("src", "renderer", "src", "pages", "settings", "AboutSettingsPage.module.css");
		const settingsCssSource: string = readRepoFile("src", "renderer", "src", "pages", "settings", "SettingsPage.module.css");
		const iconSource: string = readRepoFile("src", "renderer", "src", "assets", "icons", "index.tsx");

		expect(pageSource).toContain('backend-colorful.svg?url');
		expect(pageSource).toContain("src={backendColorfulIconUrl}");
		expect(pageSource).not.toContain('name="backend-colorful"');
		expect(pageSource).toContain('"backend.health"');
		expect(pageSource).toContain("Backend Details");
		expect(pageSource).toContain("Manager Status");
		expect(pageSource).toContain("Runtime Mode");
		expect(pageSource).toContain("Log Path");
		expect(pageSource).toContain("handleRefreshBackendDetails");
		expect(pageSource).not.toContain('tone="native"');
		expect(iconSource).not.toContain("NATIVE_COLOR_ICON_NAMES");
		expect(iconSource).not.toContain("data-tone");
		expect(settingsCssSource).toContain(".activePage");
		expect(settingsCssSource).toContain("height: 100%;");
		expect(settingsCssSource).toContain("overflow: hidden;");
		expect(cssSource).toContain("height: 100%;");
		expect(cssSource).toContain("max-height: 100%;");
		expect(cssSource).toContain("overflow-y: auto;");
		expect(cssSource).toMatch(/\.content\s*{[^}]*display:\s*grid;/);
		expect(cssSource).toContain("padding: 0 var(--ds-space-2) var(--ds-space-2) var(--ds-space-2);");
	});
});

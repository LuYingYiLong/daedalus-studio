import { describe, expect, it } from "vitest";
import { readRepoFile } from "../../../helpers/repo-paths";

describe("app background layering", () => {
	it("keeps the app root on the base background layer and lets the nav rail inherit the glass surface", () => {
		const globalCss: string = readRepoFile("src", "renderer", "src", "styles", "global.css");
		const appCss: string = readRepoFile("src", "renderer", "src", "app", "App.module.css");
		const navCss: string = readRepoFile("src", "renderer", "src", "app", "AppNavTabs.module.css");

		expect(globalCss).toContain("#root");
		expect(globalCss).toContain("background: var(--ds-bg);");
		expect(appCss).toContain("background: var(--ds-bg);");
		expect(navCss).not.toContain("background: var(--ds-bg);");
		expect(navCss).not.toContain("background: var(--ds-surface-elevated);");
	});
});

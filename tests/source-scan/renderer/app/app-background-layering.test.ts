import { describe, expect, it } from "vitest";
import { readRepoFile } from "../../../helpers/repo-paths";

describe("app background layering", () => {
	it("keeps the app root on the base background layer and the page surface opaque", () => {
		const globalCss: string = readRepoFile("src", "renderer", "src", "styles", "global.css");
		const appCss: string = readRepoFile("src", "renderer", "src", "app", "App.module.css");

		expect(globalCss).toContain("#root");
		expect(globalCss).toContain("background: var(--ds-bg);");
		expect(appCss).toContain("background: var(--ds-bg);");
	});
});

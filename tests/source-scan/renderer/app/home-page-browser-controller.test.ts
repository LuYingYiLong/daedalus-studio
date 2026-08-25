import { describe, expect, it } from "vitest";
import { readRepoFile } from "../../../helpers/repo-paths";

describe("HomePage browser controller source", () => {
	const pageSource: string = readRepoFile(
		"src",
		"renderer",
		"src",
		"widgets",
		"home",
		"HomePage.tsx",
	);
	const controllerSource: string = readRepoFile(
		"src",
		"renderer",
		"src",
		"widgets",
		"home",
		"surface",
		"useHomePageBrowserController.ts",
	);

	it("keeps browser runtime event wiring outside the page component", () => {
		expect(pageSource).toContain("useHomePageBrowserController({");
		expect(pageSource).not.toContain("createBackendClient()");
		expect(pageSource).not.toContain('event.event === "browser.tool.request"');
		expect(controllerSource).toContain("ensureBrowserRuntime");
		expect(controllerSource).toContain('"browser.tool.result"');
		expect(controllerSource).toContain("openMessageWebUrl");
		expect(controllerSource).toContain("openMessageHtmlFile");
	});
});

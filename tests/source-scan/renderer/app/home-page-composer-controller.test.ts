import { describe, expect, it } from "vitest";
import { readRepoFile } from "../../../helpers/repo-paths";

describe("HomePage Composer controller source", () => {
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
		"useHomePageComposerController.tsx",
	);

	it("keeps Composer prop adaptation outside the page component", () => {
		expect(pageSource).toContain("useHomePageComposerController({");
		expect(pageSource).not.toContain("<Composer");
		expect(pageSource).not.toContain("PluginContextProviderPicker");
		expect(controllerSource).not.toContain("createPluginContextItem");
		expect(controllerSource).not.toContain("onAddPluginContext");
		expect(controllerSource).toContain("compact={compact}");
		expect(controllerSource).toContain("floating={compact}");
	});
});

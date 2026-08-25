import { describe, expect, it } from "vitest";
import { readRepoFile } from "../../../helpers/repo-paths";

describe("Home page view model source", () => {
	const appSource: string = readRepoFile(
		"src",
		"renderer",
		"src",
		"app",
		"runtime",
		"useAppController.tsx",
	);
	const viewModelSource: string = readRepoFile(
		"src",
		"renderer",
		"src",
		"app",
		"runtime",
		"home-page-view-model.ts",
	);

	it("keeps the flat HomePage contract assembly outside the app controller", () => {
		expect(appSource).toContain("createHomePageViewModelFromRuntime({");
		expect(appSource).not.toContain("const homePageProps = {");
		expect(viewModelSource).toContain(
			"export function createHomePageViewModel({",
		);
		expect(viewModelSource).toContain(
			"export function createHomePageViewModelFromRuntime({",
		);
		expect(viewModelSource).toContain("...layout");
		expect(viewModelSource).toContain("...composer");
		expect(viewModelSource).toContain("...workspace");
		expect(viewModelSource).toContain("...actions");
	});

	it("keeps runtime-only derivations in the view model adapter", () => {
		expect(appSource).not.toContain("retryDisabled:");
		expect(appSource).not.toContain("workspaceFooterDisabled:");
		expect(appSource).not.toContain("forkDisabled:");
		expect(viewModelSource).toContain("retryDisabled:");
		expect(viewModelSource).toContain("workspaceFooterDisabled:");
		expect(viewModelSource).toContain("forkDisabled:");
	});
});

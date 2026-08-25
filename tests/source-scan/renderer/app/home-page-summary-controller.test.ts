import { describe, expect, it } from "vitest";
import { readRepoFile } from "../../../helpers/repo-paths";

describe("HomePage summary controller source", () => {
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
		"summary",
		"useHomePageSummaryController.tsx",
	);

	it("keeps summary loading, Git actions, Godot scenes and previews together", () => {
		expect(pageSource).toContain("useHomePageSummaryController({");
		expect(pageSource).not.toContain("useSessionSummaryOverview({");
		expect(pageSource).not.toContain("useGitActionDialogController({");
		expect(pageSource).not.toContain("fetchSessionOverview({");
		expect(controllerSource).toContain("useSessionSummaryOverview({");
		expect(controllerSource).toContain("useGitActionDialogController({");
		expect(controllerSource).toContain("fetchSessionOverview({");
		expect(controllerSource).toContain("summaryCollapseItems");
	});
});

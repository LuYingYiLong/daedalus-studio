import { describe, expect, it } from "vitest";
import { readRepoFile } from "../../../helpers/repo-paths";

describe("HomePage launch controller source", () => {
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
		"useHomePageLaunchController.tsx",
	);

	it("keeps launch target discovery and opening policy in one controller", () => {
		expect(pageSource).toContain("useHomePageLaunchController({");
		expect(pageSource).not.toContain("listLaunchTargets({");
		expect(pageSource).not.toContain("openLaunchTarget({");
		expect(controllerSource).toContain("listLaunchTargets({");
		expect(controllerSource).toContain("openLaunchTarget({");
		expect(controllerSource).toContain("isWorkspaceLaunchTargetId");
	});
});

import { describe, expect, it } from "vitest";
import { readRepoFile } from "../../../helpers/repo-paths";

describe("HomePage dock controller source", () => {
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
		"features",
		"home",
		"dock",
		"useHomePageDockController.ts",
	);

	it("keeps Dock layout state and resize policy in the Dock controller", () => {
		expect(pageSource).toContain("useHomePageDockController({");
		expect(pageSource).not.toContain("function handleSideDockResize(");
		expect(pageSource).not.toContain("function handleBottomDockResize(");
		expect(pageSource).not.toContain("function handleWorkspaceSidebarResize(");
		expect(controllerSource).toContain("listTerminalRuntimeIds(");
		expect(controllerSource).toContain("SIDE_DOCK_PROGRAMMATIC_OPEN_GUARD_MS");
		expect(controllerSource).toContain("handleSideDockResize");
	});
});

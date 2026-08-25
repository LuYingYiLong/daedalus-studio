import { describe, expect, it } from "vitest";
import { readRepoFile } from "../../../helpers/repo-paths";

describe("Home workspace navigation controller source", () => {
	const appSource: string = readRepoFile(
		"src",
		"renderer",
		"src",
		"app",
		"runtime",
		"useAppController.tsx",
	);
	const controllerSource: string = readRepoFile(
		"src",
		"renderer",
		"src",
		"app",
		"runtime",
		"hooks",
		"useHomeWorkspaceNavigationController.ts",
	);

	it("keeps Home workspace navigation orchestration outside the app controller", () => {
		expect(appSource).toContain(
			"useHomeWorkspaceNavigationController({",
		);
		expect(appSource).not.toContain(
			"async function handleNewWorkspaceSession(",
		);
		expect(appSource).not.toContain(
			"async function handleHomeWorkspaceSelect(",
		);
		expect(controllerSource).toContain("await selectWorkspace(workspaceId, {");
		expect(controllerSource).toContain("navigationVersionRef.current");
		expect(controllerSource).toContain("beginLocalNewSessionDraft(workspace");
	});

	it("retains optimistic workspace state while guarding stale responses", () => {
		expect(controllerSource).toContain("setHomeDraft(");
		expect(controllerSource).toContain(
			"if (navigationVersionRef.current !== navigationVersion)",
		);
		expect(controllerSource).toContain("setActiveSessionMetadata(");
	});
});

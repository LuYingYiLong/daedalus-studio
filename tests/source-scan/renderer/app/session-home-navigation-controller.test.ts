import { describe, expect, it } from "vitest";
import { readRepoFile } from "../../../helpers/repo-paths";

describe("Session home navigation controller source", () => {
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
		"useSessionHomeNavigationController.ts",
	);

	it("keeps new-session and temporary-draft orchestration outside the app controller", () => {
		expect(appSource).toContain(
			"useSessionHomeNavigationController({",
		);
		expect(appSource).toContain(
			"await handleNewSessionFromController(options);",
		);
		expect(appSource).not.toContain("const preferredWorkspace: WorkspaceConfig | null");
		expect(controllerSource).toContain(
			"async function restoreTemporaryDraftOnNewSessionHome(",
		);
		expect(controllerSource).toContain(
			"persistPendingWorkbenchPatchBeforeNavigation();",
		);
	});

	it("preserves temporary-session cleanup and Home workspace restoration", () => {
		expect(controllerSource).toContain(
			"await deleteSessionWithLayout(staleTemporaryId).catch(",
		);
		expect(controllerSource).toContain(
			"await onHomeWorkspaceSelect(workspace.id);",
		);
		expect(controllerSource).toContain(
			"setIsNewSessionHome(true);",
		);
	});
});

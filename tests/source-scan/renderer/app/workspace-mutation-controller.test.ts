import { describe, expect, it } from "vitest";
import { readRepoFile } from "../../../helpers/repo-paths";

describe("Workspace mutation controller source", () => {
	const source: string = readRepoFile(
		"src",
		"renderer",
		"src",
		"app",
		"runtime",
		"hooks",
		"useWorkspaceMutationController.ts",
	);

	it("removes deleted session artifacts and updates workspace selection", () => {
		expect(source).toContain("composerDraftsRef.current.delete(sessionId)");
		expect(source).toContain("removeStoredSessionLayouts(removedSessionIds)");
		expect(source).toContain("setHomeWorkspaceOptions(");
		expect(source).toContain("setActiveWorkspace(");
	});

	it("restores moved active sessions or returns home after workspace deletion", () => {
		expect(source).toContain("result.movedSessions.find(");
		expect(source).toContain("fetchWorkspaces()");
		expect(source).toContain("setActiveSessionMetadata(");
		expect(source).toContain("resetToNewSessionHome();");
	});

	it("keeps project creation updates and failures inside the controller", () => {
		expect(source).toContain("handleWorkspaceUpdate(workspace);");
		expect(source).toContain("handleHomeWorkspaceSelect(workspace.id)");
		expect(source).toContain("handleNewWorkspaceSession(workspace)");
		expect(source).toContain("showTransientError(");
	});
});

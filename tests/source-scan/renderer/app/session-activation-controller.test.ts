import { describe, expect, it } from "vitest";
import { readRepoFile } from "../../../helpers/repo-paths";

describe("Session activation controller source", () => {
	const source: string = readRepoFile(
		"src",
		"renderer",
		"src",
		"app",
		"runtime",
		"hooks",
		"useSessionActivationController.ts",
	);

	it("guards async session activation with a navigation version and active id", () => {
		expect(source).toContain("navigationVersionRef.current = navigationVersion;");
		expect(source).toContain("await persistPendingWorkbenchPatchBeforeNavigation();");
		expect(source).toContain("await openSession(sessionId);");
		expect(source).toContain("navigationVersionRef.current !== navigationVersion");
		expect(source).toContain("activeSessionIdRef.current !== sessionId");
	});

	it("restores the complete session runtime snapshot after opening", () => {
		expect(source).toContain("timelineStore.replace(createTimelinePageFromOpenResult(result));");
		expect(source).toContain("setRunningSessionState(");
		expect(source).toContain("syncSessionRunFromOpen(");
		expect(source).toContain("setActiveWorkspace(");
		expect(source).toContain("setWorkflowTodoSnapshot(workflowTodo);");
		expect(source).toContain("checkActiveSessionIntegrity(sessionId);");
	});

	it("always clears the loading state and reports open failures", () => {
		expect(source).toContain("setIsSessionLoading(false);");
		expect(source).toContain("console.error(\"[App] open session failed\", error);");
	});
});

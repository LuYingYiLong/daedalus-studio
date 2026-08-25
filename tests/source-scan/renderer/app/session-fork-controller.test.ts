import { describe, expect, it } from "vitest";
import { readRepoFile } from "../../../helpers/repo-paths";

describe("Session fork controller source", () => {
	const source: string = readRepoFile(
		"src",
		"renderer",
		"src",
		"app",
		"runtime",
		"hooks",
		"useSessionForkController.ts",
	);

	it("serializes fork operations and persists the source request context", () => {
		expect(source).toContain("if (forkOperationRef.current)");
		expect(source).toContain("forkOperationRef.current = true;");
		expect(source).toContain("await persistPendingWorkbenchPatchBeforeNavigation();");
		expect(source).toContain("sourceRequestId");
		expect(source).toContain("await forkSession({");
	});

	it("activates the forked session with a clean runtime snapshot", () => {
		expect(source).toContain("timelineStore.replace(createTimelinePageFromOpenResult(result));");
		expect(source).toContain("setLatestPlanClarification(null);");
		expect(source).toContain("setLatestPlanApproval(null);");
		expect(source).toContain("syncSessionRunFromOpen(current, sessionId, null)");
		expect(source).toContain("setActiveWorkspace(createWorkspaceFromSessionOpenResult(result));");
	});

	it("always clears fork UI state and reports failures", () => {
		expect(source).toContain("setForkingSourceSessionId(null);");
		expect(source).toContain("setForkingRequestId(null);");
		expect(source).toContain("onError(errorMessage);");
	});
});

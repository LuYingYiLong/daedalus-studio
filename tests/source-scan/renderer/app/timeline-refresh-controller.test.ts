import { describe, expect, it } from "vitest";
import { readRepoFile } from "../../../helpers/repo-paths";

describe("Timeline refresh controller source", () => {
	const source: string = readRepoFile(
		"src",
		"renderer",
		"src",
		"app",
		"runtime",
		"hooks",
		"useTimelineRefreshController.ts",
	);

	it("ignores timeline results for an inactive session", () => {
		expect(source).toContain("activeSessionIdRef.current !== sessionId");
		expect(source).toContain("timeline.sessionId !== sessionId");
		expect(source).toContain("ignored latest timeline for inactive session");
	});

	it("merges refreshed timeline data and restores workflow state", () => {
		expect(source).toContain("mergeOptimisticUserBlocks(");
		expect(source).toContain("await refreshTimelineNavigationEntries(sessionId);");
		expect(source).toContain("createWorkflowTodoSnapshotFromTimelineResult(timeline)");
		expect(source).toContain("rememberLoadedWorkflowTodo(workflowTodo);");
		expect(source).toContain("await fetchSessions();");
	});

	it("persists workflow dismissal and clears only the matching snapshot", () => {
		expect(source).toContain("await dismissWorkflowTodo(params);");
		expect(source).toContain("saveSessionUiMetadata({");
		expect(source).toContain("isSameWorkflowTodoSnapshot(currentSnapshot, snapshot)");
		expect(source).toContain("Failed to dismiss workflow todo");
	});
});

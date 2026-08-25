import { describe, expect, it } from "vitest";
import { readRepoFile } from "../../../helpers/repo-paths";

describe("HomePage surface source", () => {
	const pageSource: string = readRepoFile(
		"src",
		"renderer",
		"src",
		"widgets",
		"home",
		"HomePage.tsx",
	);
	const workflowSurfaceSource: string = readRepoFile(
		"src",
		"renderer",
		"src",
		"widgets",
		"home",
		"surface",
		"TimelineWorkflowTodoPanel.tsx",
	);

	it("keeps workflow file-change projection with its surface", () => {
		expect(pageSource).toContain("TimelineWorkflowTodoPanel");
		expect(pageSource).not.toContain("aggregateTimelineFileChanges(");
		expect(workflowSurfaceSource).toContain(
		"aggregateTimelineFileChanges(timelineBlocks)",
	);
		expect(workflowSurfaceSource).toContain("FloatingGoalPanel");
		expect(workflowSurfaceSource).toContain("FloatingWorkflowTodoPanel");
	});
});

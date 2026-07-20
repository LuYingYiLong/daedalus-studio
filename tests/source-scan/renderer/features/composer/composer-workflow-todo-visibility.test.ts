import { describe, expect, it } from "vitest";
import { readRepoFile } from "../../../../helpers/repo-paths";

describe("Composer workflow todo visibility", () => {
	it("shows todos only from workflow snapshots instead of simple answer state", () => {
		const composerSource: string = readRepoFile("src", "renderer", "src", "features", "composer", "Composer.tsx");
		const appSource: string = readRepoFile("src", "renderer", "src", "app", "App.tsx");

		expect(composerSource).toContain("const workflowTodoSteps: WorkflowTodoStep[] = workflowTodoSnapshot?.steps ?? [];");
		expect(composerSource).toContain("const hasWorkflowTodo: boolean = workflowTodoSteps.length > 0;");
		expect(composerSource).toContain("const isWorkflowTodoPanelVisible: boolean = todoPanelOpen && hasWorkflowTodo && !hasCompletion;");
		expect(appSource).toContain('event.event === "workflow.todo.updated" || event.event === "agent.run.snapshot"');
	});
});

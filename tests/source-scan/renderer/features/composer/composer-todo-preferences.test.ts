import { describe, expect, it } from "vitest";
import { readRepoFile } from "../../../../helpers/repo-paths";

describe("Composer todo preferences", () => {
	it("does not apply global todo auto expand preference inside Composer", () => {
		const source: string = readRepoFile("src", "renderer", "src", "features", "composer", "Composer.tsx");

		expect(source).not.toContain("autoExpandWorkflowTodo");
		expect(source).toContain("if (dismissedWorkflowTodoKeyRef.current !== workflowTodoKey)");
		expect(source).toContain("setTodoPanelOpen(true)");
	});
});

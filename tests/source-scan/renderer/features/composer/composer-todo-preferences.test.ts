import { describe, expect, it } from "vitest";
import { readAppImplementation, readRepoFile } from "../../../../helpers/repo-paths";

describe("Composer todo preferences", () => {
	it("keeps active todo panels expanded without a separate preference", () => {
		const composerSource: string = readRepoFile("src", "renderer", "src", "widgets", "composer", "Composer.tsx");
		const appSource: string = readAppImplementation();
		const agentSource: string = readRepoFile("src", "renderer", "src", "widgets", "home", "HomePage.tsx");

		expect(composerSource).not.toContain("autoExpandWorkflowTodo");
		expect(composerSource).not.toContain("dismissedWorkflowTodoKeyRef");
		expect(composerSource).not.toContain("setTodoPanelOpen");
		expect(appSource).toContain("const workflowTodoCollapsed: boolean = !workflowTodoIsActive;");
		expect(appSource).toContain("expandedActiveWorkflowTodoKeyRef.current = workflowTodoKey;");
		expect(appSource).toContain("saveSessionUiMetadata({ workflowTodoCollapsed })");
		expect(appSource).toContain("workflowTodoCollapsed: activeSessionMetadata?.workflowTodoCollapsed === true");
		expect(agentSource).toContain("<FloatingWorkflowTodoPanel");
	});
});

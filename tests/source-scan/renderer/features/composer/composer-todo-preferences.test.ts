import { describe, expect, it } from "vitest";
import { readAppImplementation, readRepoFile } from "../../../../helpers/repo-paths";

describe("Composer todo preferences", () => {
	it("applies todo auto expand preference before rendering the floating HomePage panel", () => {
		const composerSource: string = readRepoFile("src", "renderer", "src", "features", "composer", "Composer.tsx");
		const appSource: string = readAppImplementation();
		const agentSource: string = readRepoFile("src", "renderer", "src", "pages", "home", "HomePage.tsx");

		expect(composerSource).not.toContain("autoExpandWorkflowTodo");
		expect(composerSource).not.toContain("dismissedWorkflowTodoKeyRef");
		expect(composerSource).not.toContain("setTodoPanelOpen");
		expect(appSource).toContain("const workflowTodoCollapsed: boolean = workflowTodoIsActive ? false : !generalSettings.autoExpandTodoList;");
		expect(appSource).toContain("expandedActiveWorkflowTodoKeyRef.current = workflowTodoKey;");
		expect(appSource).toContain("saveSessionUiMetadata({ workflowTodoCollapsed })");
		expect(appSource).toContain("workflowTodoCollapsed: activeSessionMetadata?.workflowTodoCollapsed === true");
		expect(agentSource).toContain("<FloatingWorkflowTodoPanel");
	});
});

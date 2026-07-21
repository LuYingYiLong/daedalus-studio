import { describe, expect, it } from "vitest";
import { readRepoFile } from "../../../../helpers/repo-paths";

describe("Composer todo preferences", () => {
	it("applies todo auto expand preference before rendering the floating AgentPage panel", () => {
		const composerSource: string = readRepoFile("src", "renderer", "src", "features", "composer", "Composer.tsx");
		const appSource: string = readRepoFile("src", "renderer", "src", "app", "App.tsx");
		const agentSource: string = readRepoFile("src", "renderer", "src", "pages", "agent", "AgentPage.tsx");

		expect(composerSource).not.toContain("autoExpandWorkflowTodo");
		expect(composerSource).not.toContain("dismissedWorkflowTodoKeyRef");
		expect(composerSource).not.toContain("setTodoPanelOpen");
		expect(appSource).toContain("const workflowTodoCollapsed: boolean = !generalSettings.autoExpandTodoList;");
		expect(appSource).toContain("saveSessionUiMetadata({ workflowTodoCollapsed })");
		expect(appSource).toContain("workflowTodoCollapsed={activeSessionMetadata?.workflowTodoCollapsed === true}");
		expect(agentSource).toContain("<FloatingWorkflowTodoPanel");
	});
});

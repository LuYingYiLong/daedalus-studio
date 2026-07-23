import { describe, expect, it } from "vitest";
import { readRepoFile } from "../../../../helpers/repo-paths";

describe("Composer workflow todo visibility", () => {
	it("keeps workflow todos out of Composer and renders the floating panel from snapshots", () => {
		const composerSource: string = readRepoFile("src", "renderer", "src", "features", "composer", "Composer.tsx");
		const appSource: string = readRepoFile("src", "renderer", "src", "app", "App.tsx");
		const agentSource: string = readRepoFile("src", "renderer", "src", "pages", "agent", "AgentPage.tsx");
		const floatingTodoSource: string = readRepoFile("src", "renderer", "src", "features", "composer", "FloatingWorkflowTodoPanel.tsx");
		const globalCss: string = readRepoFile("src", "renderer", "src", "styles", "global.css");
		const designDoc: string = readRepoFile("docs", "ui-design-system.md");

		expect(composerSource).not.toContain("workflowTodoSnapshot");
		expect(composerSource).not.toContain("Collapse");
		expect(composerSource).not.toContain("Steps");
		expect(agentSource).toContain("<FloatingWorkflowTodoPanel");
		expect(agentSource).toContain("const showWorkflowTodoPanel: boolean = !workflowTodoCollapsed && workflowTodoSnapshot !== null;");
		expect(agentSource).toContain("{showWorkflowTodoPanel ? (");
		expect(floatingTodoSource).not.toContain("Collapse");
		expect(floatingTodoSource).not.toContain("import { Steps");
		expect(floatingTodoSource).not.toContain("<Steps");
		expect(floatingTodoSource).toContain("Popover");
		expect(floatingTodoSource).toContain("Progress");
		expect(floatingTodoSource).toContain("fileChangeSummary");
		expect(floatingTodoSource).toContain("styles.additions");
		expect(floatingTodoSource).toContain("styles.deletions");
		expect(agentSource).toContain("aggregateTimelineFileChanges(timelineBlocks)");
		expect(agentSource).toContain("fileChangeSummary={workflowFileChangeSummary}");
		expect(globalCss).toContain("--ds-git-addition");
		expect(globalCss).toContain("--ds-git-deletion");
		expect(designDoc).toContain("`--ds-git-addition`");
		expect(designDoc).toContain("Git 差异 UI 统一使用");
		expect(appSource).toContain("function clearWorkflowTodoUiState()");
		expect(appSource).toContain('if (event.event === "agent.run.started")');
		expect(appSource).toContain("clearWorkflowTodoUiState();");
		expect(appSource).toContain('event.event === "workflow.todo.updated" || event.event === "agent.run.snapshot"');
	});
});

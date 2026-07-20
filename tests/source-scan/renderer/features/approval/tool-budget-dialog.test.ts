import { describe, expect, it } from "vitest";
import { readRepoFile } from "../../../../helpers/repo-paths";

describe("ToolBudgetDialog source", () => {
	const source: string = readRepoFile("src", "renderer", "src", "features", "approval", "ToolBudgetDialog.tsx");

	it("shows budget details and continue/stop actions", () => {
		expect(source).toContain("ToolBudgetDialogProps");
		expect(source).toContain("pendingToolBudget.additionalSteps");
		expect(source).toContain("工具调用达到上限");
		expect(source).toContain(">继续<");
		expect(source).toContain(">否，结束并总结<");
		expect(source).toContain("onContinue?.(pendingToolBudget.budgetId)");
		expect(source).toContain("onStop?.(pendingToolBudget.budgetId)");
	});
});

import { describe, expect, it } from "vitest";
import { readRepoFile } from "../../../../helpers/repo-paths";

describe("ToolBudgetDialog source", () => {
	const source: string = readRepoFile("src", "renderer", "src", "widgets", "approval", "ToolBudgetDialog.tsx");

	it("shows budget details and continue/stop actions", () => {
		expect(source).toContain("ToolBudgetDialogProps");
		expect(source).toContain("pendingToolBudget.additionalSteps");
		expect(source).toContain('t("approval.toolBudget.title")');
		expect(source).toContain('t("approval.toolBudget.actions.continue")');
		expect(source).toContain('t("approval.toolBudget.actions.stop")');
		expect(source).toContain("onContinue?.(pendingToolBudget.budgetId)");
		expect(source).toContain("onStop?.(pendingToolBudget.budgetId)");
	});
});

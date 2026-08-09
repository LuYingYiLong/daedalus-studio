import { describe, expect, it } from "vitest";
import { readRepoFile } from "../../../../helpers/repo-paths";

describe("ToolBudgetDialog source", () => {
	const source: string = readRepoFile("src", "renderer", "src", "widgets", "approval", "ToolBudgetDialog.tsx");

	it("separates continuing, summarizing, and cancelling a tool-budget run", () => {
		expect(source).toContain("ToolBudgetDialogProps");
		expect(source).toContain("pendingToolBudget.additionalSteps");
		expect(source).toContain('t("approval.toolBudget.title")');
		expect(source).toContain('t("approval.toolBudget.actions.continue")');
		expect(source).toContain('t("approval.toolBudget.actions.summarize")');
		expect(source).toContain('t("approval.toolBudget.actions.cancel")');
		expect(source).toContain("onContinue?.(pendingToolBudget.budgetId)");
		expect(source).toContain("onStop?.(pendingToolBudget.budgetId)");
		expect(source).toContain("onCancel?.()");
	});
});

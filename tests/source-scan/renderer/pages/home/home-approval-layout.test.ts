import { describe, expect, it } from "vitest";
import { readRepoFile } from "../../../../helpers/repo-paths";

describe("HomePage approval layout source", () => {
	const source: string = readRepoFile("src", "renderer", "src", "widgets", "home", "HomePage.tsx");

	it("renders approval panel in the composer slot instead of an overlay", () => {
		expect(source).toContain("pendingApproval !== null ? (");
		expect(source).toContain("<ApprovalDialog");
		expect(source).toContain("<Composer");
		expect(source).not.toContain("className={styles.approvalLayer}");
		expect(source).not.toContain("styles.approvalLayer");
	});

	it("renders plan clarification in the composer slot after approval and before composer", () => {
		expect(source).toContain("pendingToolBudget !== null ? (");
		expect(source).toContain("<ToolBudgetDialog");
		expect(source).toContain("pendingPlanClarification !== null ? (");
		expect(source).toContain("<ClarificationDialog");
		expect(source).toContain("<PlanApprovalDialog");
		const composerSlotStart: number = source.indexOf("pendingApproval !== null ? (");
		const approvalStart: number = source.indexOf("<ApprovalDialog", composerSlotStart);
		const toolBudgetStart: number = source.indexOf("<ToolBudgetDialog", composerSlotStart);
		const clarificationStart: number = source.indexOf("<ClarificationDialog", composerSlotStart);
		const planApprovalStart: number = source.indexOf("<PlanApprovalDialog", composerSlotStart);
		const composerStart: number = source.indexOf("renderComposer(false)", composerSlotStart);
		expect(composerSlotStart).toBeGreaterThan(0);
		expect(approvalStart).toBeLessThan(toolBudgetStart);
		expect(toolBudgetStart).toBeLessThan(clarificationStart);
		expect(clarificationStart).toBeLessThan(planApprovalStart);
		expect(planApprovalStart).toBeLessThan(composerStart);
	});
});

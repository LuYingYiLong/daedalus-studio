import { describe, expect, it } from "vitest";
import { readRepoFile } from "../../../../helpers/repo-paths";

describe("PlanApprovalDialog source", () => {
	const source: string = readRepoFile("src", "renderer", "src", "widgets", "approval", "PlanApprovalDialog.tsx");

	it("renders approve and revise actions from controlled plan props", () => {
		expect(source).toContain("PlanApprovalDialogProps");
		expect(source).toContain('t("approval.plan.actions.approveAndExecute")');
		expect(source).toContain("onApprove(plan.planId)");
		expect(source).toContain("onRevise(plan.planId, trimmedFeedback)");
		expect(source).toContain('placeholder={t("approval.plan.revisionPlaceholder")}');
		expect(source).toContain("errorMessage");
		expect(source).not.toContain("<Button>Skip</Button>");
	});
});

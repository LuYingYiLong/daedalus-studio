import { describe, expect, it } from "vitest";
import { readRepoFile } from "../../../../helpers/repo-paths";

describe("PlanApprovalDialog source", () => {
	const source: string = readRepoFile("src", "renderer", "src", "features", "approval", "PlanApprovalDialog.tsx");

	it("renders approve and revise actions from controlled plan props", () => {
		expect(source).toContain("PlanApprovalDialogProps");
		expect(source).toContain("Approve and Execute");
		expect(source).toContain("onApprove(plan.planId)");
		expect(source).toContain("onRevise(plan.planId, trimmedFeedback)");
		expect(source).toContain("Tell the assistant how to change the plan");
		expect(source).toContain("errorMessage");
		expect(source).not.toContain("<Button>Skip</Button>");
	});
});

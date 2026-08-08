import { describe, expect, it } from "vitest";
import { readRepoFile } from "../../../../helpers/repo-paths";

describe("ApprovalDialog source", () => {
	const source: string = readRepoFile("src", "renderer", "src", "widgets", "approval", "ApprovalDialog.tsx");

	it("keeps approval UI focused on reason and actions", () => {
		expect(source).toContain('t("approval.tool.title")');
		expect(source).toContain("pendingApproval.reason");
		expect(source).toContain('t("approval.tool.actions.approve")');
		expect(source).toContain('t("approval.tool.actions.reject")');
		expect(source).not.toContain("formatApprovalArgs");
		expect(source).not.toContain("Requested");
		expect(source).not.toContain("llmToolName || pendingApproval.toolName");
	});
});

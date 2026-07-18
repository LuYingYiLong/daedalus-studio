import { describe, expect, it } from "vitest";
import { readRepoFile } from "../../../../helpers/repo-paths";

describe("ApprovalDialog source", () => {
	const source: string = readRepoFile("src", "renderer", "src", "features", "approval", "ApprovalDialog.tsx");

	it("keeps approval UI focused on reason and actions", () => {
		expect(source).toContain("Approve tool execution?");
		expect(source).toContain("pendingApproval.reason");
		expect(source).toContain(">Approve<");
		expect(source).toContain(">Reject<");
		expect(source).not.toContain("formatApprovalArgs");
		expect(source).not.toContain("Requested");
		expect(source).not.toContain("llmToolName || pendingApproval.toolName");
	});
});

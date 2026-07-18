import { describe, expect, it } from "vitest";
import { readRepoFile } from "../../../../helpers/repo-paths";

describe("AgentPage approval layout source", () => {
	const source: string = readRepoFile("src", "renderer", "src", "pages", "agent", "AgentPage.tsx");

	it("renders approval panel in the composer slot instead of an overlay", () => {
		expect(source).toContain("pendingApproval !== null ? (");
		expect(source).toContain("<ApprovalDialog");
		expect(source).toContain("<Composer");
		expect(source).not.toContain("className={styles.approvalLayer}");
		expect(source).not.toContain("styles.approvalLayer");
	});
});

import { describe, expect, it } from "vitest";
import { readRepoFile } from "../../../../helpers/repo-paths";

describe("ClarificationDialog source", () => {
	const source: string = readRepoFile("src", "renderer", "src", "widgets", "clarification", "ClarificationDialog.tsx");

	it("renders AI-provided question, structured replies, and custom submit controls", () => {
		expect(source).toContain('t("clarification.title")');
		expect(source).toContain("question");
		expect(source).toContain("recommendedReplies");
		expect(source).toContain("reply.text");
		expect(source).toContain("reply.description");
		expect(source).toContain('placeholder={t("clarification.placeholder")}');
		expect(source).toContain('t("clarification.skipHint")');
		expect(source).toContain("onSkip");
		expect(source).not.toContain("Pagination");
		expect(source).not.toContain("Suggested Reply (Recommend)");
	});
});

import { describe, expect, it } from "vitest";
import { readRepoFile } from "../../../../helpers/repo-paths";

describe("UserBubble retry editing", () => {
	it("does not reset the retry draft while an edit is already active", () => {
		const source: string = readRepoFile("src", "renderer", "src", "features", "bubble", "UserBubble.tsx");

		expect(source).toContain("const wasRetryEditingRef = useRef<boolean>(isRetryEditing);");
		expect(source).toContain("if (!wasRetryEditing) {");
		expect(source).toContain("setDraftText(message);");
		expect(source).toContain("setDraftContext(cloneContextItems(additionalContext));");
	});
});

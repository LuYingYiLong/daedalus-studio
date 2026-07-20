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

	it("exposes the retry edit button through the same edit path as double click", () => {
		const userBubbleSource: string = readRepoFile("src", "renderer", "src", "features", "bubble", "UserBubble.tsx");
		const messageListSource: string = readRepoFile("src", "renderer", "src", "features", "chat", "MessageList.tsx");

		expect(messageListSource).toContain("const canEditUserMessages: boolean = onRetryFromUserMessage !== undefined && !retryDisabled && !hasRunningAssistantBlock && activeRetryRequestId === null;");
		expect(messageListSource).toContain("showEditButton={canEditUserMessages}");
		expect(userBubbleSource).toContain("const canShowEditButton: boolean = showEditButton === true && !isRetryEditing;");
		expect(userBubbleSource).toContain("aria-label=\"Edit and resend user message\"");
		expect(userBubbleSource).toContain("onClick={beginRetryEdit}");
		expect(userBubbleSource).toContain("onDoubleClick={(): void => {");
		expect(userBubbleSource).toContain("beginRetryEdit();");
	});
});

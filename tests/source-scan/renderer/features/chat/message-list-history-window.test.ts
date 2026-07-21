import { describe, expect, it } from "vitest";
import { readRepoFile } from "../../../../helpers/repo-paths";

describe("MessageList history window source", () => {
	const messageListSource: string = readRepoFile("src", "renderer", "src", "features", "chat", "MessageList.tsx");
	const messageListStyles: string = readRepoFile("src", "renderer", "src", "features", "chat", "MessageList.module.css");

	it("renders the loaded timeline window without virtual spacer blank areas", () => {
		expect(messageListSource).toContain("renderableBlocks.map");
		expect(messageListSource).not.toContain("visibleBlocks.map");
		expect(messageListSource).not.toContain("topSpacerHeight");
		expect(messageListSource).not.toContain("bottomSpacerHeight");
		expect(messageListSource).not.toContain("styles.spacer");
		expect(messageListStyles).not.toContain(".spacer");
	});

	it("continues pagination checks after the loaded block set changes", () => {
		expect(messageListSource).toContain("if (anchor !== null)");
		expect(messageListSource).toContain("pendingAnchorRef.current = null");
		expect(messageListSource).toContain("updateViewport();");
		expect(messageListSource).toContain("contentFitsViewport");
	});
});

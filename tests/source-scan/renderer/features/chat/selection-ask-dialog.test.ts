import { describe, expect, it } from "vitest";
import { readRepoFile } from "../../../../helpers/repo-paths";

describe("SelectionAskDialog", () => {
	it("keeps the latest user question visible across final Markdown relayouts", () => {
		const dialogSource: string = readRepoFile(
			"src",
			"renderer",
			"src",
			"widgets",
			"conversation",
			"SelectionAskDialog.tsx"
		);
		const cssSource: string = readRepoFile(
			"src",
			"renderer",
			"src",
			"widgets", "conversation",
			"SelectionAskDialog.module.css"
		);

		expect(dialogSource).toContain("new ResizeObserver(scheduleScrollAnchor)");
		expect(dialogSource).toContain('scrollAnchorModeRef.current = sending ? "bottom" : "latest-user"');
		expect(dialogSource).toContain("messageItemsRef");
		expect(dialogSource).toContain("styles.userMessageText");
		expect(dialogSource).toContain("onWheel={releaseScrollAnchor}");
		expect(dialogSource).toContain("onPointerDown={releaseScrollAnchor}");
		expect(cssSource).toContain("overflow-anchor: none;");
		expect(cssSource).toContain("white-space: pre-wrap;");
	});
});

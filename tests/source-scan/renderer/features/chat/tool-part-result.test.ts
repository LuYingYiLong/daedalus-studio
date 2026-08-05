import { describe, expect, it } from "vitest";
import { readRepoFile } from "../../../../helpers/repo-paths";

describe("ToolPart result rendering", () => {
	it("renders the normalized result instead of the model tool-call event JSON", () => {
		const source: string = readRepoFile("src", "renderer", "src", "features", "chat", "ToolPart.tsx");

		expect(source).toContain("function getToolResultText");
		expect(source).toContain('getLatestEvent(events, "tool.result")');
		expect(source).toContain("className={styles.resultText}");
		expect(source).not.toContain("JSON.stringify(part.events");
	});
});

import { describe, expect, it } from "vitest";
import { readRepoFile } from "../../../../helpers/repo-paths";

describe("ToolPart result rendering", () => {
	it("renders the normalized result instead of the model tool-call event JSON", () => {
		const source: string = readRepoFile("src", "renderer", "src", "widgets", "conversation", "ToolPart.tsx");

		expect(source).toContain("function getToolResultText");
		expect(source).toContain('getLatestEvent(events, "tool.result")');
		expect(source).toContain("className={styles.resultText}");
		expect(source).not.toContain("JSON.stringify(part.events");
	});

	it("keeps file writes visible while running and renders structured file change statistics", () => {
		const source: string = readRepoFile("src", "renderer", "src", "widgets", "conversation", "ToolPart.tsx");
		const dataSource: string = readRepoFile("src", "renderer", "src", "domain", "conversation", "tool-part-data.ts");

		expect(source).toContain("FILE_WRITE_TOOL_NAMES");
		expect(source).toContain('t("chat.tool.activity.writing"');
		expect(dataSource).toContain("export function getFileEditBatch");
		expect(source).toContain("fileEditBatch.editedFiles.map");
		expect(source).toContain('t("chat.tool.fileChanges.summary"');
	});
});

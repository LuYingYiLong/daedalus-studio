import { describe, expect, it } from "vitest";
import { readRepoFile } from "../../../../helpers/repo-paths";

describe("MarkdownContent source", () => {
	const source: string = readRepoFile("src", "renderer", "src", "features", "markdown", "MarkdownContent.tsx");

	it("guards highlight.js calls and uses a lightweight streaming renderer", () => {
		expect(source).toContain("gd: \"gdscript\"");
		expect(source).toContain("hljs.getLanguage(normalizedLanguage)");
		expect(source).not.toContain("hljs.highlightAuto(code).value");
		expect(source).toContain("getStreamingMarkdownRenderIntervalMs");
		expect(source).toContain("STREAMING_MARKDOWN_COMPONENTS");
		expect(source).toContain("highlight={highlightCodeBlocks}");
		expect(source).not.toContain("language.replace(/^hljs");
	});
});

import { describe, expect, it } from "vitest";
import { readRepoFile } from "../../../../helpers/repo-paths";

describe("HomePage Splitter styling", () => {
	it("keeps the semantic dragger states without restoring a visible dashed divider", () => {
		const pageSource: string = readRepoFile("src", "renderer", "src", "widgets", "home", "HomePage.tsx");
		const cssSource: string = readRepoFile("src", "renderer", "src", "ui", "styles", "global.css");

		expect(pageSource).toContain("draggerIcon={null}");
		expect(pageSource).not.toContain("SPLITTER_CLASS_NAMES");
		expect(cssSource).toContain(".ant-splitter-bar-dragger::before");
		expect(cssSource).toContain("background: transparent !important;");
		expect(cssSource).toContain(".ant-splitter-bar-dragger:hover::before,");
		expect(cssSource).toContain(".ant-splitter-bar-dragger:active::before,");
		expect(cssSource).not.toContain("border: 1px dashed");
	});
});

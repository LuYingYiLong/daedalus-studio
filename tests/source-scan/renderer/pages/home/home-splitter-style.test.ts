import { describe, expect, it } from "vitest";
import { readRepoFile } from "../../../../helpers/repo-paths";

describe("HomePage Splitter styling", () => {
	it("keeps the semantic dragger states without restoring a visible dashed divider", () => {
		const pageSource: string = readRepoFile("src", "renderer", "src", "widgets", "home", "HomePage.tsx");
		const cssSource: string = readRepoFile("src", "renderer", "src", "widgets", "home", "HomePage.module.css");

		expect(pageSource).toContain("draggerIcon={null}");
		expect(pageSource).toContain("classNames={SPLITTER_CLASS_NAMES}");
		expect(pageSource).toContain("active: styles.splitterDraggerActive");
		expect(cssSource).toContain(".splitterDragger::before");
		expect(cssSource).toContain("background: transparent !important;");
		expect(cssSource).toContain(".splitterDragger:hover::before,");
		expect(cssSource).toContain(".splitterDraggerActive::before");
		expect(cssSource).not.toContain("border: 1px dashed");
	});
});

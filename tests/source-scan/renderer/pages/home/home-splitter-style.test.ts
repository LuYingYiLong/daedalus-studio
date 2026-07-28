import { describe, expect, it } from "vitest";
import { readRepoFile } from "../../../../helpers/repo-paths";

describe("HomePage Splitter styling", () => {
	it("uses Splitter semantic dragger states for the hover and active divider treatment", () => {
		const pageSource: string = readRepoFile("src", "renderer", "src", "pages", "home", "HomePage.tsx");
		const cssSource: string = readRepoFile("src", "renderer", "src", "pages", "home", "HomePage.module.css");

		expect(pageSource).toContain("draggerIcon={null}");
		expect(pageSource).toContain("classNames={SPLITTER_CLASS_NAMES}");
		expect(pageSource).toContain("active: styles.splitterDraggerActive");
		expect(cssSource).toContain(".splitterDragger::before");
		expect(cssSource).toContain("background: transparent !important;");
		expect(cssSource).toContain("border: 1px dashed var(--ds-border);");
		expect(cssSource).toContain(".splitterDragger:hover::before,");
		expect(cssSource).toContain(".splitterDraggerActive::before");
		expect(cssSource).toContain("border-color: var(--ds-accent);");
	});
});

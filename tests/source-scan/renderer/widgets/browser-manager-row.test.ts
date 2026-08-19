import { describe, expect, it } from "vitest";
import { readRepoFile } from "../../../helpers/repo-paths";

describe("Browser manager rows", () => {
	it("does not draw a divider after the final manager row", () => {
		const styles: string = readRepoFile("src", "renderer", "src", "widgets", "browser", "BrowserPanel.module.css");

		expect(styles).toContain(".managerRow:last-child");
		expect(styles).toMatch(/\.managerRow:last-child\s*\{[^}]*border-bottom:\s*0;/u);
	});
});

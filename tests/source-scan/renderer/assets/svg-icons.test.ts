import { describe, expect, it } from "vitest";
import { readRepoFile } from "../../../helpers/repo-paths";

describe("SVG icon sources", () => {
	it("does not include React-unknown customFrame attributes", () => {
		for (const iconPath of [
			"file-edit.svg",
			"file-search.svg",
			"folder-edit.svg",
			"folder-search.svg"
		]) {
			const source: string = readRepoFile("src", "renderer", "src", "assets", "icons", iconPath);
			expect(source).not.toContain("customFrame");
		}
	});
});

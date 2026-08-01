import { readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { readRepoFile, repoPath } from "../../../helpers/repo-paths";

describe("SVG icon sources", () => {
	it("does not include React-unknown customFrame attributes", () => {
		const iconDirectory: string = repoPath("src", "renderer", "src", "assets", "icons");
		for (const iconPath of readdirSync(iconDirectory).filter((fileName: string): boolean => fileName.endsWith(".svg"))) {
			const source: string = readRepoFile("src", "renderer", "src", "assets", "icons", iconPath);
			expect(source).not.toContain("customFrame");
		}
	});
});

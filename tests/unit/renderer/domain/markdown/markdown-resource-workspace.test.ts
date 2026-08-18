import { describe, expect, it } from "vitest";
import { resolveMarkdownResourceWorkspaceRoot } from "@/domain/markdown/markdown-resource-workspace";

describe("resolveMarkdownResourceWorkspaceRoot", () => {
	it("selects a non-primary source folder for a project resource", () => {
		expect(resolveMarkdownResourceWorkspaceRoot(
			"C:\\Projects\\Client\\src\\App.tsx",
			["C:\\Projects\\Server", "C:\\Projects\\Client"],
		)).toBe("C:\\Projects\\Client");
	});

	it("selects the most specific nested source folder", () => {
		expect(resolveMarkdownResourceWorkspaceRoot(
			"C:\\Projects\\Suite\\packages\\editor\\index.ts",
			["C:\\Projects\\Suite", "C:\\Projects\\Suite\\packages\\editor"],
		)).toBe("C:\\Projects\\Suite\\packages\\editor");
	});

	it("does not authorize a sibling path with a shared prefix", () => {
		expect(resolveMarkdownResourceWorkspaceRoot(
			"C:\\Projects\\Client-copy\\secret.txt",
			["C:\\Projects\\Client"],
		)).toBeNull();
	});
});

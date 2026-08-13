import { describe, expect, it } from "vitest";
import type { WorkspaceSourceFolder } from "@/platform/rpc/types";
import {
	resolveGitReviewRequestSourceFolderId,
	resolveGitReviewSourceFolderId
} from "@/widgets/git/review/source-folder-selection";

function sourceFolder(id: string, git: boolean): WorkspaceSourceFolder {
	return {
		id,
		path: `C:/workspace/${id}`,
		capabilities: { git, godot: false }
	};
}

describe("resolveGitReviewSourceFolderId", () => {
	it("keeps a selected source when the source list changes", () => {
		expect(resolveGitReviewSourceFolderId([
			sourceFolder("primary", true),
			sourceFolder("selected", false),
			sourceFolder("new-source", true)
		], "selected", "primary")).toBe("selected");
	});

	it("falls back to an available Git source after the selected source is deleted", () => {
		expect(resolveGitReviewSourceFolderId([
			sourceFolder("primary", false),
			sourceFolder("repository", true)
		], "deleted", "primary")).toBe("repository");
	});

	it("falls back to the primary source when no Git capability is available", () => {
		expect(resolveGitReviewSourceFolderId([
			sourceFolder("other", false),
			sourceFolder("primary", false)
		], null, "primary")).toBe("primary");
	});

	it("returns null when the workspace has no source folders", () => {
		expect(resolveGitReviewSourceFolderId([], "deleted", "primary")).toBeNull();
	});
});

describe("resolveGitReviewRequestSourceFolderId", () => {
	it("omits the synthetic primary id used by legacy single-source session snapshots", () => {
		expect(resolveGitReviewRequestSourceFolderId([
			sourceFolder("primary", true)
		], "primary")).toBeUndefined();
	});

	it("keeps explicit ids for authoritative and multi-source workspaces", () => {
		expect(resolveGitReviewRequestSourceFolderId([
			sourceFolder("primary", true),
			sourceFolder("frontend", true)
		], "primary")).toBe("primary");
		expect(resolveGitReviewRequestSourceFolderId([
			sourceFolder("source-a1b2", true)
		], "source-a1b2")).toBe("source-a1b2");
	});
});

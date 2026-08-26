import { describe, expect, it } from "vitest";
import { workspaceSupportsWorktrees } from "@/domain/workspace/worktree-capability";

function createWorkspace(gitCapabilities: boolean[]): never {
	return {
		id: "workspace-1",
		name: "Workspace",
		kind: "godot",
		rootPath: "C:/workspace",
		icon: 0,
		color: 0,
		primarySourceFolderId: "source-1",
		sourceFolders: gitCapabilities.map((git, index) => ({
			id: `source-${index + 1}`,
			path: `C:/workspace/source-${index + 1}`,
			capabilities: { git, godot: false },
		})),
	} as never;
}

describe("workspace worktree capability", () => {
	it("requires every source folder to be a Git repository", () => {
		expect(workspaceSupportsWorktrees(createWorkspace([true]))).toBe(true);
		expect(workspaceSupportsWorktrees(createWorkspace([true, true]))).toBe(
			true,
		);
		expect(workspaceSupportsWorktrees(createWorkspace([true, false]))).toBe(
			false,
		);
	});

	it("rejects an empty or missing workspace", () => {
		expect(workspaceSupportsWorktrees(createWorkspace([]))).toBe(false);
		expect(workspaceSupportsWorktrees(null)).toBe(false);
		expect(workspaceSupportsWorktrees(undefined)).toBe(false);
	});
});

import { describe, expect, it } from "vitest";
import { readRepoFile } from "../../../../helpers/repo-paths";

describe("WorkspaceTree session directory action", () => {
	it("opens the bound workspace instead of the non-portable session persistence directory", () => {
		const treeSource: string = readRepoFile("src", "renderer", "src", "widgets", "workspace", "WorkspaceTree.tsx");

		expect(treeSource).toContain("handleOpenSessionWorkspaceInExplorer");
		expect(treeSource).toContain("workspaceById.get(session.workspaceId)");
		expect(treeSource).toContain("window.electronAPI.workspaceFs.openWorkspaceDirectory(workspace.rootPath)");
		expect(treeSource).toContain("canOpenSessionWorkspace(session)");
		expect(treeSource).not.toContain("window.electronAPI.sessionFs.openSessionDirectory(session.id)");
	});
});

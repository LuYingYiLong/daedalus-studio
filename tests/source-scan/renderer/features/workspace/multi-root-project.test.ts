import { describe, expect, it } from "vitest";
import { readRepoFile } from "../../../../helpers/repo-paths";

describe("multi-root workspace projects", () => {
	const typesSource: string = readRepoFile("src", "renderer", "src", "api", "types.ts");
	const workspaceApiSource: string = readRepoFile("src", "renderer", "src", "api", "workspace-api.ts");
	const gitApiSource: string = readRepoFile("src", "renderer", "src", "api", "workspace-git-api.ts");
	const gitDiffApiSource: string = readRepoFile("src", "renderer", "src", "api", "workspace-git-diff-api.ts");
	const treeSource: string = readRepoFile("src", "renderer", "src", "features", "workspace", "WorkspaceTree.tsx");
	const editorSource: string = readRepoFile("src", "renderer", "src", "features", "workspace", "WorkspaceProjectDialog.tsx");
	const deleteSource: string = readRepoFile("src", "renderer", "src", "features", "workspace", "DeleteWorkspaceDialog.tsx");
	const composerSource: string = readRepoFile("src", "renderer", "src", "features", "composer", "Composer.tsx");
	const appSource: string = readRepoFile("src", "renderer", "src", "app", "App.tsx");

	it("models a stable project with appearance and source folders", () => {
		expect(typesSource).toContain("export type WorkspaceIcon = 0 | 1 | 2 | 3 | 4 | 5 | 6;");
		expect(typesSource).toContain("export type WorkspaceColor = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7;");
		expect(typesSource).toContain("sourceFolders: WorkspaceSourceFolder[];");
		expect(typesSource).toContain("primarySourceFolderId: string;");
		expect(workspaceApiSource).toContain('client.request<{ workspace: WorkspaceConfig }>("workspace.update", params)');
	});

	it("opens a controlled Ant Design project editor from the workspace menu", () => {
		expect(treeSource).toContain('key: "edit"');
		expect(treeSource).toContain('icon: <Icon name="folder-edit" />');
		expect(treeSource).toContain("<WorkspaceProjectDialog");
		expect(editorSource).toContain("<Space.Compact block");
		expect(editorSource).toContain("<Popover");
		expect(editorSource).toContain("window.electronAPI.workspaceFs.pickWorkspaceDirectory()");
		expect(editorSource).toContain("primarySourceFolderId: source.id");
		expect(editorSource).toContain("sourceFolders: current.sourceFolders.filter");
		expect(editorSource).toContain("const updated: WorkspaceConfig = await updateWorkspace({");
	});

	it("reuses one delete confirmation dialog and propagates session migration results", () => {
		expect(treeSource).toContain("<DeleteWorkspaceDialog");
		expect(treeSource).not.toContain("title={labels.deleteWorkspaceTitle}");
		expect(deleteSource).toContain("confirmLoading={loading}");
		expect(deleteSource).toContain("workspaceTree.modals.deleteWorkspace.sessionPolicy");
		expect(workspaceApiSource).toContain("movedSessions:");
		expect(treeSource).toContain("result.movedSessions.map");
		expect(appSource).toContain("result.movedSessions.find");
	});

	it("uses project names and appearance in the tree and Composer", () => {
		expect(treeSource).toContain("<WorkspaceIconView workspace={workspace} />");
		expect(composerSource).toContain("<WorkspaceIconView workspace={workspace}");
		expect(composerSource).toContain("workspace.name");
	});

	it("keeps source folder routing available to every Git RPC", () => {
		expect(gitApiSource.match(/sourceFolderId\?: string \| undefined;/gu)?.length).toBeGreaterThanOrEqual(5);
		expect(gitDiffApiSource).toContain("sourceFolderId?: string | undefined;");
	});
});

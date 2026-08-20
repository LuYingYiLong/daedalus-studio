import { describe, expect, it } from "vitest";
import { readRepoFile } from "../../../../helpers/repo-paths";

describe("WorkspaceTree session project move", (): void => {
	it("connects the RPC, submenu, cross-tree drag target, and runtime safety checks", (): void => {
		const treeSource: string = readRepoFile("src", "renderer", "src", "widgets", "workspace", "WorkspaceTree.tsx");
		const controllerSource: string = readRepoFile("src", "renderer", "src", "app", "runtime", "useAppController.tsx");
		const sessionApiSource: string = readRepoFile("src", "renderer", "src", "platform", "rpc", "session-api.ts");

		expect(sessionApiSource).toContain('"session.workspace.move", params');
		expect(treeSource).toContain('key: "move"');
		expect(treeSource).toContain('icon: <Icon name="move-session" />');
		expect(treeSource).toContain('children: options.moveWorkspaces.map');
		expect(treeSource).toContain('application/x-daedalus-session-id');
		expect(treeSource).toContain('workspaceSessionDropTarget');
		expect(controllerSource).toContain('hasDirtyFilePanelBuffersForSession(targetSession.id)');
		expect(controllerSource).toContain('listTerminalRuntimeIds(targetSession.id, sessionLayout)');
		expect(controllerSource).toContain('resetSessionFilePanelWorkspaceState(sessionLayout)');
	});
});

import { describe, expect, it } from "vitest";
import { readRepoFile } from "../../../helpers/repo-paths";

describe("Session worktree controller source", () => {
	const source: string = readRepoFile(
		"src",
		"renderer",
		"src",
		"app",
		"runtime",
		"hooks",
		"useSessionWorktreeController.ts",
	);

	it("blocks destructive worktree actions while terminals are running", () => {
		expect(source).toContain("listTerminalRuntimeIds(");
		expect(source).toContain("window.electronAPI.terminal.getState");
		expect(source).toContain(
			"workspaceTree.errors.worktreeTerminalActive",
		);
		expect(source).toContain(
			"workspaceTree.errors.moveSessionTerminalActive",
		);
	});

	it("guards workspace moves and resets file-panel state after success", () => {
		expect(source).toContain("hasDirtyFilePanelBuffersForSession");
		expect(source).toContain("await moveSessionWorkspace({");
		expect(source).toContain("resetSessionFilePanelWorkspaceState(sessionLayout)");
		expect(source).toContain("clearCleanFilePanelBuffersForSession");
		expect(source).toContain("window.electronAPI.sessionCatalog.notifyChanged();");
	});

	it("keeps handoff and setup failures inside the controller boundary", () => {
		expect(source).toContain("await previewSessionWorktreeHandoff({");
		expect(source).toContain("Modal.confirm({");
		expect(source).toContain("await executeSessionWorktreeHandoff({");
		expect(source).toContain("retrySessionWorktreeSetup");
		expect(source).toContain("skipSessionWorktreeSetup");
		expect(source).toContain("onError(");
	});
});

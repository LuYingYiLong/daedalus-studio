import { describe, expect, it } from "vitest";
import { readRepoFile } from "../../../helpers/repo-paths";

describe("file panel memory lifecycle", () => {
	it("releases runtime buffers and Monaco models when tabs disappear", () => {
		const filePanelSource: string = readRepoFile("src", "renderer", "src", "widgets", "files", "FilePanel.tsx");
		const editorSource: string = readRepoFile("src", "renderer", "src", "widgets", "files", "MonacoFileEditor.tsx");

		expect(filePanelSource).toContain("RUNTIME_BUFFERS.delete(getBufferKey(sessionId, panelKey, tab));");
		expect(filePanelSource).toContain("RUNTIME_BUFFERS.clearClean();");
		expect(editorSource).toContain("const openTabKeys: Set<string> = new Set(tabKeys);");
		expect(editorSource).toContain("model.dispose();");
	});

	it("uses a bounded terminal scrollback", () => {
		const terminalSource: string = readRepoFile("src", "renderer", "src", "widgets", "terminal", "TerminalPanel.tsx");
		expect(terminalSource).toContain("scrollback: 2000,");
		expect(terminalSource).not.toContain("scrollback: 6000,");
	});
});

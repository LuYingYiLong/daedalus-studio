import { describe, expect, it } from "vitest";
import { readRepoFile } from "../../../../helpers/repo-paths";

describe("Composer context-menu image paste", () => {
	it("bridges clipboard images through the main process and adds them as context files", () => {
		const mainClipboard: string = readRepoFile("src", "main", "services", "clipboard.ts");
		const preload: string = readRepoFile("src", "preload", "index.ts");
		const composer: string = readRepoFile("src", "renderer", "src", "widgets", "composer", "Composer.tsx");

		expect(mainClipboard).toContain('ipcMain.handle("clipboard:read-image"');
		expect(mainClipboard).toContain("clipboard.readImage()");
		expect(preload).toContain('ipcRenderer.invoke("clipboard:read-image")');
		expect(composer).toContain("readImageFromClipboard()");
		expect(composer).toContain("addContextFiles([image])");
	});
});

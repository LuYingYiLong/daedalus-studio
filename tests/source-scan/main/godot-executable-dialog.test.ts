import { describe, expect, it } from "vitest";
import { readRepoFile } from "../../helpers/repo-paths";

describe("Godot executable dialog IPC", () => {
	it("exposes a file-only executable picker through preload", () => {
		const mainSource: string = readRepoFile("src", "main", "services", "godot-executable-dialog.ts");
		const preloadSource: string = readRepoFile("src", "preload", "index.ts");
		const envSource: string = readRepoFile("src", "renderer", "src", "vite-env.d.ts");

		expect(mainSource).toContain('properties: ["openFile"]');
		expect(mainSource).toContain('"godot-executable:pick"');
		expect(mainSource).toContain('extensions: ["exe"]');
		expect(preloadSource).toContain('pickGodotExecutable: (): Promise<string | null>');
		expect(preloadSource).toContain('ipcRenderer.invoke("godot-executable:pick")');
		expect(envSource).toContain('pickGodotExecutable: () => Promise<string | null>;');
	});
});

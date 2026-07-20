import { describe, expect, it } from "vitest";
import { readRepoFile } from "../../helpers/repo-paths";

describe("Windows electron-builder wrapper", () => {
	it("selects an installed Spectre MSVC toolset for native module rebuilds", () => {
		const packageSource: string = readRepoFile("package.json");
		const scriptSource: string = readRepoFile("scripts", "electron-builder-win.cjs");

		expect(packageSource).toContain("node scripts/electron-builder-win.cjs");
		expect(scriptSource).toContain("VCToolsVersion");
		expect(scriptSource).toContain("lib\", \"spectre\", \"x64");
		expect(scriptSource).toContain("lib\", \"spectre\", \"x86");
		expect(scriptSource).toContain("electron-builder\", \"cli.js");
		expect(scriptSource).toContain("spawn(process.execPath");
	});
});

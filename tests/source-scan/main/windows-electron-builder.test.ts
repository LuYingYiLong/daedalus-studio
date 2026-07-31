import { describe, expect, it } from "vitest";
import { readRepoFile } from "../../helpers/repo-paths";

describe("Windows electron-builder wrapper", () => {
	it("installs Electron once before parallel tests start in CI", () => {
		const packageSource: string = readRepoFile("package.json");
		const workflowSource: string = readRepoFile(".github", "workflows", "build-release.yml");
		const verificationSource: string = readRepoFile("scripts", "verify-electron.cjs");

		expect(packageSource).toContain('"verify:electron": "node scripts/verify-electron.cjs"');
		expect(verificationSource).toContain('require("electron")');
		expect(verificationSource).toContain('"dist", "version"');
		expect(verificationSource).toContain("statSync(electronPath).isFile()");

		const installDependenciesIndex: number = workflowSource.indexOf(
			"- name: Install dependencies",
		);
		const verifyElectronIndex: number = workflowSource.indexOf(
			"- name: Install and verify Electron",
		);
		const runTestsIndex: number = workflowSource.indexOf("- name: Run tests");

		expect(installDependenciesIndex).toBeGreaterThanOrEqual(0);
		expect(verifyElectronIndex).toBeGreaterThan(installDependenciesIndex);
		expect(runTestsIndex).toBeGreaterThan(verifyElectronIndex);
		expect(workflowSource).toContain("run: npm run verify:electron");
	});

	it("selects an installed Spectre MSVC toolset for native module rebuilds", () => {
		const packageSource: string = readRepoFile("package.json");
		const scriptSource: string = readRepoFile("scripts", "electron-builder-win.cjs");

		expect(packageSource).toContain("node scripts/electron-builder-win.cjs");
		expect(scriptSource).toContain("VCToolsVersion");
		expect(scriptSource).toContain("lib\", \"spectre\", \"x64");
		expect(scriptSource).toContain("lib\", \"spectre\", \"x86");
		expect(scriptSource).toContain("electron-builder\", \"cli.js");
		expect(scriptSource).toContain("\"--publish\", \"never\"");
		expect(scriptSource).toContain("hasExplicitPublishArg");
		expect(scriptSource).toContain("spawn(process.execPath");
	});
});

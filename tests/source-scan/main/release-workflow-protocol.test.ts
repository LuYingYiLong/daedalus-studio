import { describe, expect, it } from "vitest";
import { readRepoFile } from "../../helpers/repo-paths";

describe("release workflow protocol compatibility", () => {
	const workflowSource: string = readRepoFile(".github", "workflows", "build-release.yml");
	const bridgePrepareSource: string = readRepoFile("scripts", "prepare-editor-bridge.cjs");
	const godotProjectsSource: string = readRepoFile("src", "main", "services", "godot-projects.ts");
	const packageManifest = JSON.parse(readRepoFile("package.json")) as {
		scripts?: Record<string, string>;
	};

	it("derives packaged backend and Daedalus Bridge protocol checks from package.json", () => {
		expect(workflowSource).toContain("[string]$package.backendProtocolVersion");
		expect(workflowSource).toContain("[string]$package.godotBridgeProtocolVersion");
		expect(workflowSource).toContain("BACKEND_PROTOCOL_VERSION=$backendProtocolVersion");
		expect(workflowSource).toContain("GODOT_BRIDGE_PROTOCOL_VERSION=$godotBridgeProtocolVersion");
		expect(workflowSource).toContain("$manifest.protocolVersion -ne $expectedBackendProtocolVersion");
		expect(workflowSource).toContain(
			"$manifest.minBridgeProtocolVersion -gt $expectedBridgeProtocolVersion",
		);
		expect(workflowSource).toContain(
			"$manifest.maxBridgeProtocolVersion -lt $expectedBridgeProtocolVersion",
		);
		expect(workflowSource).toContain(
			"$manifest.bridgeProtocolVersion -ne $expectedBridgeProtocolVersion",
		);
		expect(workflowSource).not.toMatch(
			/\$manifest\.(?:min|max)BridgeProtocolVersion\s+-ne\s+\d+/,
		);
	});

	it("excludes Godot-generated cache and native artifacts from the embedded Bridge", () => {
		for (const extension of [
			".uid",
			".import",
			".dll",
			".so",
			".dylib",
			".a",
			".wasm",
			".gdextension",
		]) {
			expect(bridgePrepareSource).toContain(`\"${extension}\"`);
		}
		expect(bridgePrepareSource).toContain("Daedalus Bridge script contains a UID reference");
	});

	it("packages Daedalus Bridge from the renamed repository and addon root", () => {
		expect(bridgePrepareSource).toContain('"..", "daedalus-bridge", "addons", "daedalus_bridge"');
		expect(bridgePrepareSource).toContain("siblingRepositoryExists");
		expect(bridgePrepareSource).toContain("process.env.DAEDALUS_BRIDGE_SOURCE");
		expect(bridgePrepareSource).toContain("siblingRepositoryExists\n\t\t? canonicalSourceRoot");
		expect(bridgePrepareSource).toContain("daedalus-bridge-v${packageManifest.godotBridgeVersion}.zip");
		expect(bridgePrepareSource).toContain("addons/daedalus_bridge/plugin.cfg");
		expect(bridgePrepareSource).not.toContain("addons/daedalus_editor_bridge");
		expect(bridgePrepareSource).not.toContain("LuYingYiLong/daedalus-editor-bridge");
	});

	it("prepares a missing development Bridge package before project scanning", () => {
		expect(packageManifest.scripts?.predev).toBe("npm run prepare:editor-bridge");
		expect(godotProjectsSource).toContain("prepareDevelopmentBundle");
		expect(godotProjectsSource).toContain('ELECTRON_RUN_AS_NODE: "1"');
		expect(godotProjectsSource.indexOf("await this.prepareDevelopmentBundle();"))
			.toBeLessThan(godotProjectsSource.indexOf("plugin-manifest.json", godotProjectsSource.indexOf("private async loadPackage")));
	});
});

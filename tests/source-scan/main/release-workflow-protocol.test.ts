import { describe, expect, it } from "vitest";
import { readRepoFile } from "../../helpers/repo-paths";

describe("release workflow protocol compatibility", () => {
	const workflowSource: string = readRepoFile(".github", "workflows", "build-release.yml");
	const bridgePrepareSource: string = readRepoFile("scripts", "prepare-editor-bridge.cjs");

	it("derives packaged backend and Editor Bridge protocol checks from package.json", () => {
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
		expect(bridgePrepareSource).toContain("Editor Bridge script contains a UID reference");
	});
});

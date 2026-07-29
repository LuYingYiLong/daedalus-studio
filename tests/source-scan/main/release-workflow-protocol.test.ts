import { describe, expect, it } from "vitest";
import { readRepoFile } from "../../helpers/repo-paths";

describe("release workflow protocol compatibility", () => {
	const workflowSource: string = readRepoFile(".github", "workflows", "build-release.yml");

	it("derives packaged backend and Godot plugin protocol checks from package.json", () => {
		expect(workflowSource).toContain("[string]$package.backendProtocolVersion");
		expect(workflowSource).toContain("[string]$package.godotPluginProtocolVersion");
		expect(workflowSource).toContain("BACKEND_PROTOCOL_VERSION=$backendProtocolVersion");
		expect(workflowSource).toContain("GODOT_PLUGIN_PROTOCOL_VERSION=$godotPluginProtocolVersion");
		expect(workflowSource).toContain("$manifest.protocolVersion -ne $expectedBackendProtocolVersion");
		expect(workflowSource).toContain(
			"$manifest.minPluginProtocolVersion -gt $expectedPluginProtocolVersion",
		);
		expect(workflowSource).toContain(
			"$manifest.maxPluginProtocolVersion -lt $expectedPluginProtocolVersion",
		);
		expect(workflowSource).toContain(
			"$manifest.pluginProtocolVersion -ne $expectedPluginProtocolVersion",
		);
		expect(workflowSource).not.toMatch(
			/\$manifest\.(?:min|max)PluginProtocolVersion\s+-ne\s+\d+/,
		);
	});
});

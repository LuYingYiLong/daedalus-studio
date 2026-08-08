import { describe, expect, it } from "vitest";
import { readRepoFile } from "../../../../helpers/repo-paths";

describe("McpServersSettingsPage source", () => {
	it("does not render a plan access field", () => {
		const source: string = readRepoFile("src", "renderer", "src", "widgets", "settings", "McpServersSettingsPage.tsx");

		expect(source).not.toContain("Plan access");
		expect(source).not.toContain("planAccess");
	});

	it("keeps the settings page visible when MCP config loading is slow", () => {
		const source: string = readRepoFile("src", "renderer", "src", "widgets", "settings", "McpServersSettingsPage.tsx");

		expect(source).toContain("MCP_CONFIG_LOAD_TIMEOUT_MS");
		expect(source).toContain("<Skeleton active={true}");
		expect(source).not.toContain("if (isLoading) {\n\t\treturn null;");
	});
});

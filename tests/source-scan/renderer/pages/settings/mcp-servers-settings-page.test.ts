import { describe, expect, it } from "vitest";
import { readRepoFile } from "../../../../helpers/repo-paths";

describe("McpServersSettingsPage source", () => {
	it("does not render a plan access field", () => {
		const source: string = readRepoFile("src", "renderer", "src", "pages", "settings", "McpServersSettingsPage.tsx");

		expect(source).not.toContain("Plan access");
		expect(source).not.toContain("planAccess");
	});
});

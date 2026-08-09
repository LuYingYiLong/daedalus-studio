import { describe, expect, it } from "vitest";
import { readRepoFile } from "../../../../helpers/repo-paths";

describe("GodotProjectsSettingsPage source", () => {
	it("keeps the initial loading state separate from the table empty state", () => {
		const source: string = readRepoFile("src", "renderer", "src", "widgets", "settings", "GodotProjectsSettingsPage.tsx");

		expect(source).toContain("const showInitialLoading: boolean = loading && result === null;");
		expect(source).toContain("{showInitialLoading ? (");
		expect(source).toContain('<Spin size="large" />');
		expect(source).toContain("loading={false}");
	});
});

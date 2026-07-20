import { describe, expect, it } from "vitest";
import { readRepoFile } from "../../../../helpers/repo-paths";

describe("DefaultModelSettingsPage", () => {
	it("uses the Select clear-icon API for the single-value model selector", () => {
		const pageSource: string = readRepoFile("src", "renderer", "src", "pages", "settings", "DefaultModelSettingsPage.tsx");

		expect(pageSource).toContain('allowClear={{ clearIcon: <Icon name="clear" /> }}');
		expect(pageSource).toContain('suffixIcon={<Icon name="arrow-down" style={{ pointerEvents: "none" }} />}');
		expect(pageSource).not.toContain('removeIcon={<Icon name="clear" />}');
	});
});

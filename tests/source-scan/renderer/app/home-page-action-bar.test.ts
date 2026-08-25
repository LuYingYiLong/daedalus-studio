import { describe, expect, it } from "vitest";
import { readRepoFile } from "../../../helpers/repo-paths";

describe("HomePage action bar source", () => {
	const pageSource: string = readRepoFile(
		"src",
		"renderer",
		"src",
		"widgets",
		"home",
		"HomePage.tsx",
	);
	const actionBarSource: string = readRepoFile(
		"src",
		"renderer",
		"src",
		"widgets",
		"home",
		"surface",
		"HomePageActionBar.tsx",
	);

	it("keeps floating launch, summary and Dock controls together", () => {
		expect(pageSource).toContain("<HomePageActionBar");
		expect(pageSource).not.toContain("<Space.Compact");
		expect(pageSource).not.toContain("data-studio-open-bottom-dock");
		expect(actionBarSource).toContain("data-studio-open-bottom-dock");
		expect(actionBarSource).toContain("data-studio-open-side-dock");
	});
});

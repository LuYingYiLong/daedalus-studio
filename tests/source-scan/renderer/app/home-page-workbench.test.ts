import { describe, expect, it } from "vitest";
import { readRepoFile } from "../../../helpers/repo-paths";

describe("HomePage workbench composition source", () => {
	const pageSource: string = readRepoFile(
		"src",
		"renderer",
		"src",
		"widgets",
		"home",
		"HomePage.tsx",
	);
	const workbenchSource: string = readRepoFile(
		"src",
		"renderer",
		"src",
		"widgets",
		"home",
		"surface",
		"HomePageWorkbench.tsx",
	);

	it("keeps nested workbench layout outside the page coordinator", () => {
		expect(pageSource).toContain("<HomePageWorkbench");
		expect(pageSource).not.toContain("<Splitter");
		expect(pageSource).not.toContain("<HomeDockPanel");
		expect(pageSource).not.toContain("<ScheduledTasksPage");
		expect(workbenchSource).toContain("<Splitter");
		expect(workbenchSource).toContain("<HomeChatSurface");
		expect(workbenchSource).toContain("<ScheduledTasksPage");
	});
});

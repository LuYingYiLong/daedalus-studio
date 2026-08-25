import { describe, expect, it } from "vitest";
import { readRepoFile } from "../../../helpers/repo-paths";

describe("HomePage keyboard shortcuts source", () => {
	const pageSource: string = readRepoFile(
		"src",
		"renderer",
		"src",
		"widgets",
		"home",
		"HomePage.tsx",
	);
	const controllerSource: string = readRepoFile(
		"src",
		"renderer",
		"src",
		"widgets",
		"home",
		"surface",
		"useHomePageKeyboardShortcuts.ts",
	);

	it("keeps global shortcut policy outside the page component", () => {
		expect(pageSource).toContain("useHomePageKeyboardShortcuts({");
		expect(pageSource).not.toContain("addEventListener(\"keydown\"");
		expect(controllerSource).toContain("findMatchingShortcutCommand");
		expect(controllerSource).toContain("navigateSessionHistory");
		expect(controllerSource).toContain("getSelectedConversationSearchQuery");
	});
});

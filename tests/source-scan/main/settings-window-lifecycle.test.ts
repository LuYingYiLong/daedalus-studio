import { describe, expect, it } from "vitest";
import { readRepoFile } from "../../helpers/repo-paths";

describe("settings window lifecycle", () => {
	it("keeps settings as a child of the main window and closes it with its owner", () => {
		const source: string = readRepoFile("src", "main", "index.ts");

		expect(source).toContain("parent: mainWindow,");
		expect(source).toContain("mainWindow.on(\"closed\"");
		expect(source).toContain("settingsWindow.close();");
	});
});

import { describe, expect, it } from "vitest";
import { readRepoFile } from "../../helpers/repo-paths";

describe("single instance lifecycle", () => {
	it("exits secondary processes and activates the existing main window", () => {
		const source: string = readRepoFile("src", "main", "index.ts");

		expect(source).toContain("app.requestSingleInstanceLock()");
		expect(source).toContain("if (!hasSingleInstanceLock)");
		expect(source).toContain("app.quit()");
		expect(source).toContain('app.on("second-instance"');
		expect(source).toContain("activateMainWindow()");
		expect(source).toContain("requestRendererWindowReveal(mainWindow)");
	});
});

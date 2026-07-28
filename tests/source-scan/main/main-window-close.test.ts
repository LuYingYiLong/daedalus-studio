import { describe, expect, it } from "vitest";
import { readRepoFile } from "../../helpers/repo-paths";

describe("main window close lifecycle", () => {
	it("quits the application after the main window is destroyed", () => {
		const source: string = readRepoFile("src", "main", "index.ts");
		const closedHandlerStart: number = source.indexOf('mainWindow.on("closed", () => {');
		const closedHandlerEnd: number = source.indexOf("\n\t});", closedHandlerStart);
		const closedHandler: string = source.slice(closedHandlerStart, closedHandlerEnd);

		expect(closedHandlerStart).toBeGreaterThan(-1);
		expect(closedHandlerEnd).toBeGreaterThan(closedHandlerStart);
		expect(closedHandler).toContain("windowLifecycleController.quit();");
	});
});

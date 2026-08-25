import { describe, expect, it } from "vitest";
import { readRepoFile } from "../../../helpers/repo-paths";

describe("Workbench navigation persistence source", () => {
	const appSource: string = readRepoFile(
		"src",
		"renderer",
		"src",
		"app",
		"runtime",
		"useAppController.tsx",
	);
	const controllerSource: string = readRepoFile(
		"src",
		"renderer",
		"src",
		"app",
		"runtime",
		"hooks",
		"useWorkbenchNavigationPersistenceController.ts",
	);

	it("keeps pending workbench persistence outside the app controller", () => {
		expect(appSource).toContain(
			"useWorkbenchNavigationPersistenceController({",
		);
		expect(appSource).not.toContain(
			"persist pending workbench patch before navigation failed",
		);
		expect(controllerSource).toContain("takePendingWorkbenchPatch();");
		expect(controllerSource).toContain("await sendWorkbenchPatch(pendingPatch, false);");
	});
});

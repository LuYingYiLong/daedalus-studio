import { describe, expect, it } from "vitest";
import { readRepoFile } from "../../../helpers/repo-paths";

describe("app session state controller source", () => {
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
		"useAppSessionStateController.ts",
	);

	it("keeps session/home state initialization outside the app orchestrator", () => {
		expect(appSource).toContain("useAppSessionStateController({");
		expect(appSource).not.toContain("sessionCatalog.onChanged");
		expect(appSource).not.toContain("createTimelinePageStore()");
		expect(controllerSource).toContain("sessionCatalog.onChanged");
		expect(controllerSource).toContain("createTimelinePageStore()");
		expect(controllerSource).toContain("createPreferredHomeDraft(");
	});
});

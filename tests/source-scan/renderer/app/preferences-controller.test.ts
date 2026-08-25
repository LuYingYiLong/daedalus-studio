import { describe, expect, it } from "vitest";
import { readRepoFile } from "../../../helpers/repo-paths";

describe("app preferences controller source", () => {
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
		"useAppPreferencesController.ts",
	);

	it("keeps preference and composer resource ownership outside the app orchestrator", () => {
		expect(appSource).toContain("useAppPreferencesController({");
		expect(appSource).not.toContain("useComposerResourceController({");
		expect(appSource).not.toContain("fetchClientPreferences");
		expect(controllerSource).toContain("useAppResourceBootstrapController({");
		expect(controllerSource).toContain("useComposerResourceController({");
		expect(controllerSource).toContain("const [clientPreferences");
	});
});

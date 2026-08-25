import { describe, expect, it } from "vitest";
import { readRepoFile } from "../../../helpers/repo-paths";

describe("App window event controller source", () => {
	const appSource: string = readRepoFile(
		"src",
		"renderer",
		"src",
		"app",
		"runtime",
		"useAppController.tsx",
	);
	const runtimeSource: string = readRepoFile(
		"src",
		"renderer",
		"src",
		"app",
		"runtime",
		"hooks",
		"useAppRuntimeEventController.ts",
	);
	const controllerSource: string = readRepoFile(
		"src",
		"renderer",
		"src",
		"app",
		"runtime",
		"hooks",
		"useAppWindowEventController.ts",
	);

	it("keeps window-level renderer events outside the app controller", () => {
		expect(appSource).toContain("useAppRuntimeEventController({");
		expect(runtimeSource).toContain("useAppWindowEventController({");
		expect(appSource).not.toContain("daedalus:retry-agent-run");
		expect(appSource).not.toContain("CLIENT_PREFERENCES_CHANGED_EVENT");
		expect(appSource).not.toContain("NEW_SESSION_EVENT");
		expect(controllerSource).toContain("daedalus:retry-agent-run");
		expect(controllerSource).toContain("CLIENT_PREFERENCES_CHANGED_EVENT");
		expect(controllerSource).toContain("NEW_SESSION_EVENT");
	});
});

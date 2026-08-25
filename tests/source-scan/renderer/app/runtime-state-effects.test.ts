import { describe, expect, it } from "vitest";
import { readRepoFile } from "../../../helpers/repo-paths";

describe("App runtime state effects source", () => {
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
		"useAppRuntimeStateEffects.ts",
	);

	it("keeps runtime state synchronization outside the app controller", () => {
		expect(appSource).toContain("useAppRuntimeEventController({");
		expect(runtimeSource).toContain("useAppRuntimeStateEffects({");
		expect(appSource).not.toContain("applyRunStateFromWorkbench(");
		expect(appSource).not.toContain("const handleWindowFocus = (): void => {");
		expect(controllerSource).toContain("applyRunStateFromWorkbench(");
		expect(controllerSource).toContain("discardPendingTimelineEvents();");
		expect(controllerSource).toContain("markActiveSessionRead(");
		expect(controllerSource).toContain("findPreferredComposerModel(");
	});
});

import { describe, expect, it } from "vitest";
import { readRepoFile } from "../../../helpers/repo-paths";

describe("App runtime notification effects source", () => {
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
	const effectsSource: string = readRepoFile(
		"src",
		"renderer",
		"src",
		"app",
		"runtime",
		"hooks",
		"useAppRuntimeNotificationEffects.ts",
	);

	it("keeps runtime notification effects outside the app controller", () => {
		expect(appSource).toContain("useAppRuntimeEventController({");
		expect(runtimeSource).toContain("useAppRuntimeNotificationEffects({");
		expect(appSource).not.toContain("window.electronAPI.appUpdate");
		expect(effectsSource).toContain("setRuntimeBusy(appUpdateRuntimeBusy)");
		expect(effectsSource).toContain("showNativeTaskNotification({");
		expect(effectsSource).toContain("pendingPlanClarification");
	});
});

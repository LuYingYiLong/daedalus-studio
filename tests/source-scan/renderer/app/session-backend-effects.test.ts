import { describe, expect, it } from "vitest";
import { readRepoFile } from "../../../helpers/repo-paths";

describe("Session backend effects source", () => {
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
		"useAppSessionBackendEffects.ts",
	);

	it("keeps reconnect and pending approval effects outside the app controller", () => {
		expect(appSource).toContain("useAppSessionBackendEffects({");
		expect(appSource).not.toContain("return onBackendReconnected(");
		expect(appSource).not.toContain("getPendingApprovalCount(workbench)");
		expect(controllerSource).toContain("return onBackendReconnected(");
		expect(controllerSource).toContain("getPendingApprovalCount(workbench)");
		expect(controllerSource).toContain("void refreshPendingApproval();");
	});
});

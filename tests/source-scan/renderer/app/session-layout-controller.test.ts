import { describe, expect, it } from "vitest";
import { readRepoFile } from "../../../helpers/repo-paths";

describe("Session layout controller source", () => {
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
		"useSessionLayoutController.ts",
	);

	it("keeps layout persistence and session cleanup outside the app controller", () => {
		expect(appSource).toContain("useSessionLayoutController({");
		expect(appSource).not.toContain("await deleteSession(sessionId);");
		expect(appSource).not.toContain("window.electronAPI.sessionLayout");
		expect(controllerSource).toContain("await deleteSession(sessionId);");
		expect(controllerSource).toContain("removeStoredSessionLayouts([sessionId]);");
		expect(controllerSource).toContain("updateClientPreferences({ workspaceSidebar })");
	});
});

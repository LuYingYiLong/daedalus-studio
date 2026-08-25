import { describe, expect, it } from "vitest";
import { readRepoFile } from "../../../helpers/repo-paths";

describe("Tray session integration source", () => {
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
		"useTraySessionIntegration.ts",
	);

	it("keeps tray event wiring outside the app controller", () => {
		expect(appSource).toContain("useTraySessionIntegration({");
		expect(appSource).not.toContain("window.electronAPI.tray.onNewChat(");
		expect(appSource).not.toContain("updateRecentSessions(");
		expect(controllerSource).toContain("window.electronAPI.tray.onNewChat(");
		expect(controllerSource).toContain("window.electronAPI.tray.onOpenSession(");
		expect(controllerSource).toContain("await fetchSessions();");
		expect(controllerSource).toContain("getSessionTitle(session, session.id)");
	});
});

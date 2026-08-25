import { describe, expect, it } from "vitest";
import { readRepoFile } from "../../../helpers/repo-paths";

describe("Session preference controller source", () => {
	const source: string = readRepoFile(
		"src",
		"renderer",
		"src",
		"app",
		"runtime",
		"hooks",
		"useSessionPreferenceController.ts",
	);

	it("persists session UI metadata and updates the active session", () => {
		expect(source).toContain("await saveSessionUiMetadata(params)");
		expect(source).toContain("currentMetadata.id !== sessionId");
		expect(source).toContain("setSessionError(message);");
	});

	it("keeps home preferences and active workbench preferences in sync", () => {
		expect(source).toContain("if (isNewSessionHome)");
		expect(source).toContain("persistNewSessionComposerDefaults({ mode: nextMode });");
		expect(source).toContain("queueWorkbenchPatch({ composer: { chatMode: nextMode } }, true);");
		expect(source).toContain("await setSessionModel({");
		expect(source).toContain("activeSessionIdRef.current !== sessionId");
	});

	it("persists new-session defaults through the client preference boundary", () => {
		expect(source).toContain("dispatchClientPreferencesChanged(nextPreferences);");
		expect(source).toContain("updateClientPreferences({");
		expect(source).toContain("clientPreferencesRef.current = savedPreferences;");
	});
});

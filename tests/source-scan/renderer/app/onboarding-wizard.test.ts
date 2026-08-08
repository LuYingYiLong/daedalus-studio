import { describe, expect, it } from "vitest";
import { readRepoFile } from "../../../helpers/repo-paths";

describe("OnboardingWizard", () => {
	const source: string = readRepoFile("src", "renderer", "src", "app", "onboarding", "OnboardingWizard.tsx");
	const preferencesSource: string = readRepoFile("src", "main", "services", "client-preferences-store.ts");
	const preloadSource: string = readRepoFile("src", "preload", "index.ts");
	const mainSource: string = readRepoFile("src", "main", "index.ts");
	const preferencesServiceSource: string = readRepoFile("src", "main", "services", "client-preferences.ts");
	const onboardingSource: string = readRepoFile("src", "contracts", "onboarding.ts");

	it("persists all six steps and supports optional setup flows", () => {
		expect(source).toContain("ONBOARDING_STEP_IDS.map");
		expect(source).toContain('goForward("skipped")');
		expect(source).toContain('goForward(currentConfigurableStep === null ? undefined : "configured")');
		expect(source).toContain("discoverProviderModels");
		expect(source).toContain("window.electronAPI.pickGodotExecutable()");
		expect(source).toContain("installGodotDocumentation");
		expect(source).toContain("window.electronAPI.godotProjects.install");
		expect(source).toContain("setJob(nextState.activeJob ?? null)");
		expect(source).toContain("console.error(\"[Onboarding] persist step failed\"");
		expect(preferencesServiceSource).toContain("[ClientPreferences] update failed");
	});

	it("normalizes persisted progress and exposes a guarded relaunch API", () => {
		expect(preferencesSource).toContain("normalizeOnboardingPreferences");
		expect(preferencesSource).toContain('currentStep: completed ? "complete" : currentStep');
		expect(preloadSource).toContain('relaunch: (options?: { forceProcess?: boolean }): Promise<void> => ipcRenderer.invoke("window:relaunch", options)');
		expect(mainSource).toContain('ipcMain.handle("window:relaunch"');
		expect(mainSource).toContain("senderWindow !== mainWindow && senderWindow !== settingsWindow");
		expect(mainSource).toContain("!app.isPackaged && process.env.ELECTRON_RENDERER_URL && !forceProcessRelaunch");
		expect(mainSource).toContain("setImmediate(reloadDevelopmentRenderer)");
		expect(mainSource).toContain("browserWindow.webContents.reloadIgnoringCache()");
		expect(onboardingSource).toContain("isOnboardingPreferences");
		expect(mainSource).toContain("app.relaunch({");
		expect(mainSource).toContain("execPath: process.execPath");
		expect(mainSource).toContain("args: process.argv.slice(1)");
	});
});

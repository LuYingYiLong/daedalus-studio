import { describe, expect, it } from "vitest";
import { readRepoFile } from "../../../helpers/repo-paths";

describe("OnboardingWizard", () => {
	const source: string = readRepoFile("src", "renderer", "src", "app", "onboarding", "OnboardingWizard.tsx");
	const preferencesSource: string = readRepoFile("src", "main", "services", "client-preferences-store.ts");
	const preloadSource: string = readRepoFile("src", "preload", "index.ts");
	const mainSource: string = readRepoFile("src", "main", "index.ts");
	const preferencesServiceSource: string = readRepoFile("src", "main", "services", "client-preferences.ts");
	const onboardingSource: string = readRepoFile("src", "contracts", "onboarding.ts");
	const conceptVideoSource: string = readRepoFile("src", "renderer", "src", "app", "onboarding", "concept-video", "DaedalusConceptVideo.tsx");
	const conceptPlayerSource: string = readRepoFile("src", "renderer", "src", "app", "onboarding", "concept-video", "DaedalusConceptPlayer.tsx");

	it("persists all six steps and supports optional setup flows", () => {
		expect(source).toContain("ONBOARDING_STEP_IDS.map");
		expect(source).toContain('goForward("skipped")');
		expect(source).toMatch(/goForward\(\s*currentConfigurableStep\s*===\s*null\s*\?\s*undefined\s*:\s*"configured"\s*,?\s*\)/);
		expect(source).toMatch(/const activeOperation:\s*boolean\s*=\s*currentStep\s*===\s*"provider"/);
		expect(source).not.toContain("const navigationBusy:");
		expect(source).not.toContain("disabled={navigationBusy}");
		expect(source).toContain("return (): void => onBusyChange(false);");
		expect(source).toContain("ONBOARDING_NAVIGATION_TIMEOUT_MS");
		expect(source).toContain('if (currentStep === "complete")');
		expect(source).toContain("onPrewarmApp?.()");
		expect(source).toContain("activeOperation || isEnteringStudio");
		expect(source).toMatch(/function persistCheckpoint\(\s*nextPreferences:\s*ClientPreferences/);
		expect(source).toContain("setPreferences(nextPreferences);");
		expect(source).toContain("persistCheckpoint(nextPreferences");
		expect(source).not.toContain("await persistStep(");
		expect(source).toContain("discoverProviderModels");
		expect(source).toContain("window.electronAPI.pickGodotExecutable()");
		expect(source).toContain("installGodotDocumentation");
		expect(source).toContain("window.electronAPI.godotProjects.install");
		expect(source).toContain("<DaedalusConceptPlayer");
		expect(source).toContain("onboarding.welcome.conceptVideoLabel");
		expect(conceptVideoSource).toContain("TransitionSeries.Sequence durationInFrames={110} name=\"Light home\"");
		expect(conceptVideoSource).toContain("TransitionSeries.Sequence durationInFrames={110} name=\"Dark home\"");
		expect(conceptVideoSource).toContain("TransitionSeries.Sequence durationInFrames={110} name=\"Light conversation\"");
		expect(conceptVideoSource).toContain("TransitionSeries.Sequence durationInFrames={110} name=\"Dark conversation\"");
		expect(conceptPlayerSource).toContain("component={DaedalusConceptVideo}");
		expect(conceptPlayerSource).toContain("inputProps={{ language }}");
		expect(conceptPlayerSource).toContain("autoPlay={true}");
		expect(conceptPlayerSource).toContain("initiallyMuted={true}");
		expect(source).toContain("setJob(nextState.activeJob ?? null)");
		expect(source).toContain("console.error(\"[Onboarding] persist checkpoint failed\"");
		expect(preferencesServiceSource).toContain("[ClientPreferences] update failed");
		expect(preferencesServiceSource).toContain("private updateTail: Promise<void> = Promise.resolve()");
		expect(preferencesServiceSource).toContain("saveClientPreferencesFile");
		expect(preferencesServiceSource).toContain("setTimeout((): void => this.notifyChange(persistedPreferences), 0)");
		expect(preferencesServiceSource).not.toContain("updateClientPreferencesFile");
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

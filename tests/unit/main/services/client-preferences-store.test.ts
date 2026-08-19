import { describe, expect, it } from "vitest";
import {
	DEFAULT_CLIENT_PREFERENCES,
	DEFAULT_THEME_COLOR,
	loadClientPreferencesFile,
	normalizeClientPreferences,
	updateClientPreferencesFile
} from "@main/services/client-preferences-store";

function createMemoryIo(initialText: string | null = null): {
	writes: string[];
	io: {
		readText(path: string): Promise<string>;
		writeText(path: string, text: string): Promise<void>;
		ensureDirectory(path: string): Promise<void>;
	};
} {
	let text: string | null = initialText;
	const writes: string[] = [];
	return {
		writes,
		io: {
			async readText(): Promise<string> {
				if (text === null) {
					throw new Error("missing");
				}
				return text;
			},
			async writeText(_path: string, nextText: string): Promise<void> {
				text = nextText;
				writes.push(nextText);
			},
			async ensureDirectory(): Promise<void> {}
		}
	};
}

describe("client preferences store", () => {
	it("returns defaults for missing or damaged files", async () => {
		await expect(loadClientPreferencesFile("prefs.json", createMemoryIo(null).io)).resolves.toEqual({
			preferences: DEFAULT_CLIENT_PREFERENCES,
			normalized: true
		});
		await expect(loadClientPreferencesFile("prefs.json", createMemoryIo("{").io)).resolves.toEqual({
			preferences: DEFAULT_CLIENT_PREFERENCES,
			normalized: true
		});
	});

	it("normalizes missing fields and strips unknown fields", () => {
		expect(normalizeClientPreferences({
			obsoleteSetting: false,
			lastComposerModel: {
				providerId: "minimax",
				modelId: "MiniMax-M3"
			},
			extra: true
		})).toEqual({
			preferences: {
				autoCheckForUpdates: true,
				notifyOnRunCompleted: true,
				minimizeToTrayOnClose: false,
				theme: "system",
				themeColor: DEFAULT_THEME_COLOR,
				animationsEnabled: true,
				uiFontSize: 14,
				codeFontSize: 13,
				fontFamily: DEFAULT_CLIENT_PREFERENCES.fontFamily,
				fontFamilyCode: DEFAULT_CLIENT_PREFERENCES.fontFamilyCode,
				language: "system",
				workspaceSidebar: {
					open: true,
					size: 260
				},
				keyboardShortcuts: {},
				lastComposerModel: {
					providerId: "minimax",
					modelId: "MiniMax-M3"
				},
				newSessionComposer: {
					mode: "agent",
					approvalMode: "manual",
					model: {
						providerId: "minimax",
						modelId: "MiniMax-M3"
					},
					reasoningEffort: "medium"
				},
				onboarding: DEFAULT_CLIENT_PREFERENCES.onboarding
			},
			normalized: true
		});
	});

	it("updates only requested fields and persists normalized JSON", async () => {
		const memory = createMemoryIo(JSON.stringify({
			obsoleteSetting: false,
			minimizeToTrayOnClose: false
		}));

		const nextPreferences = await updateClientPreferencesFile("prefs.json", {
			minimizeToTrayOnClose: true
		}, memory.io);

		expect(nextPreferences).toEqual({
			autoCheckForUpdates: true,
			notifyOnRunCompleted: true,
			minimizeToTrayOnClose: true,
			theme: "system",
			themeColor: DEFAULT_THEME_COLOR,
			animationsEnabled: true,
			uiFontSize: 14,
			codeFontSize: 13,
			fontFamily: DEFAULT_CLIENT_PREFERENCES.fontFamily,
			fontFamilyCode: DEFAULT_CLIENT_PREFERENCES.fontFamilyCode,
			language: "system",
			workspaceSidebar: {
				open: true,
				size: 260
			},
			keyboardShortcuts: {},
			lastComposerModel: null,
			newSessionComposer: DEFAULT_CLIENT_PREFERENCES.newSessionComposer,
			onboarding: DEFAULT_CLIENT_PREFERENCES.onboarding
		});
		expect(memory.writes.at(-1)).toBe(`${JSON.stringify(nextPreferences, null, 2)}\n`);
	});

	it("updates the hidden last composer model preference", async () => {
		const memory = createMemoryIo(JSON.stringify(DEFAULT_CLIENT_PREFERENCES));

		const nextPreferences = await updateClientPreferencesFile("prefs.json", {
			lastComposerModel: {
				providerId: "opencode_go",
				modelId: "minimax-m3"
			}
		}, memory.io);

		expect(nextPreferences.lastComposerModel).toEqual({
			providerId: "opencode_go",
			modelId: "minimax-m3"
		});
	});

	it("updates the theme preference", async () => {
		const memory = createMemoryIo(JSON.stringify(DEFAULT_CLIENT_PREFERENCES));

		const nextPreferences = await updateClientPreferencesFile("prefs.json", {
			theme: "dark"
		}, memory.io);

		expect(nextPreferences.theme).toBe("dark");
	});

	it("stores custom font families in Studio preferences", async () => {
		const memory = createMemoryIo(JSON.stringify(DEFAULT_CLIENT_PREFERENCES));
		const nextPreferences = await updateClientPreferencesFile("prefs.json", {
			fontFamily: '"Inter", sans-serif',
			fontFamilyCode: '"JetBrains Mono", monospace'
		}, memory.io);

		expect(nextPreferences.fontFamily).toBe('"Inter", sans-serif');
		expect(nextPreferences.fontFamilyCode).toBe('"JetBrains Mono", monospace');
		await expect(updateClientPreferencesFile("prefs.json", {
			fontFamily: "Inter; color: red"
		}, memory.io)).rejects.toThrow(/fontFamily contains invalid CSS/u);
	});

	it("persists and bounds appearance motion and font sizes", async () => {
		const memory = createMemoryIo(JSON.stringify(DEFAULT_CLIENT_PREFERENCES));
		const nextPreferences = await updateClientPreferencesFile("prefs.json", {
			animationsEnabled: false,
			uiFontSize: 99,
			codeFontSize: 10.6
		}, memory.io);

		expect(nextPreferences.animationsEnabled).toBe(false);
		expect(nextPreferences.uiFontSize).toBe(18);
		expect(nextPreferences.codeFontSize).toBe(11);
	});

	it("persists and normalizes new-session composer defaults", async () => {
		const memory = createMemoryIo(JSON.stringify(DEFAULT_CLIENT_PREFERENCES));
		const nextPreferences = await updateClientPreferencesFile("prefs.json", {
			newSessionComposer: {
				mode: "goal",
				approvalMode: "auto-safe",
				model: {
					providerId: "deepseek",
					modelId: "deepseek-v4-pro"
				},
				reasoningEffort: " max "
			}
		}, memory.io);

		expect(nextPreferences.newSessionComposer).toEqual({
			mode: "goal",
			approvalMode: "auto-safe",
			model: {
				providerId: "deepseek",
				modelId: "deepseek-v4-pro"
			},
			reasoningEffort: "max"
		});
	});

	it("falls back invalid new-session values and carries forward the legacy model", () => {
		const preferences = normalizeClientPreferences({
			lastComposerModel: {
				providerId: "stepfun",
				modelId: "step-3"
			},
			newSessionComposer: {
				mode: "invalid",
				approvalMode: "invalid",
				reasoningEffort: ""
			}
		}).preferences;

		expect(preferences.newSessionComposer).toEqual({
			mode: "agent",
			approvalMode: "manual",
			model: {
				providerId: "stepfun",
				modelId: "step-3"
			},
			reasoningEffort: "medium"
		});
	});

	it("normalizes and updates the custom theme color as six-digit hex", async () => {
		expect(normalizeClientPreferences({ themeColor: " #AABBCC " }).preferences.themeColor).toBe("#aabbcc");
		expect(normalizeClientPreferences({ themeColor: "rgba(1, 2, 3, 0.5)" }).preferences.themeColor).toBe(DEFAULT_THEME_COLOR);

		const memory = createMemoryIo(JSON.stringify(DEFAULT_CLIENT_PREFERENCES));
		const nextPreferences = await updateClientPreferencesFile("prefs.json", {
			themeColor: "#C05A91"
		}, memory.io);

		expect(nextPreferences.themeColor).toBe("#c05a91");
	});

	it("updates the language preference", async () => {
		const memory = createMemoryIo(JSON.stringify(DEFAULT_CLIENT_PREFERENCES));

		const nextPreferences = await updateClientPreferencesFile("prefs.json", {
			language: "zh-CN"
		}, memory.io);

		expect(nextPreferences.language).toBe("zh-CN");
	});

	it("updates the startup update check preference", async () => {
		const memory = createMemoryIo(JSON.stringify(DEFAULT_CLIENT_PREFERENCES));

		const nextPreferences = await updateClientPreferencesFile("prefs.json", {
			autoCheckForUpdates: false
		}, memory.io);

		expect(nextPreferences.autoCheckForUpdates).toBe(false);
	});

	it("updates the run completion notification preference", async () => {
		const memory = createMemoryIo(JSON.stringify(DEFAULT_CLIENT_PREFERENCES));

		const nextPreferences = await updateClientPreferencesFile("prefs.json", {
			notifyOnRunCompleted: false
		}, memory.io);

		expect(nextPreferences.notifyOnRunCompleted).toBe(false);
	});

	it("normalizes and persists the global workspace sidebar layout", async () => {
		const memory = createMemoryIo(JSON.stringify(DEFAULT_CLIENT_PREFERENCES));

		const nextPreferences = await updateClientPreferencesFile("prefs.json", {
			workspaceSidebar: {
				open: false,
				size: 900
			}
		}, memory.io);

		expect(nextPreferences.workspaceSidebar).toEqual({
			open: false,
			size: 720
		});
		expect(memory.writes.at(-1)).toBe(`${JSON.stringify(nextPreferences, null, 2)}\n`);
	});

	it("normalizes global keyboard shortcut overrides", async () => {
		const memory = createMemoryIo(JSON.stringify(DEFAULT_CLIENT_PREFERENCES));
		const nextPreferences = await updateClientPreferencesFile("prefs.json", {
			keyboardShortcuts: {
				"workbench.toggleWorkspaceSidebar": "Alt+Mod+KeyQ",
				"conversation.previousTurn": "KeyP",
				unknown: "Mod+KeyU"
			}
		} as never, memory.io);

		expect(nextPreferences.keyboardShortcuts).toEqual({
			"workbench.toggleWorkspaceSidebar": "Mod+Alt+KeyQ"
		});
	});

	it("starts existing users at onboarding and persists resumable progress", async () => {
		expect(normalizeClientPreferences({ autoCheckForUpdates: true }).preferences.onboarding).toEqual({
			schemaVersion: 1,
			completed: false,
			currentStep: "welcome",
			stepOutcomes: {},
			completedAt: null
		});

		const memory = createMemoryIo(JSON.stringify(DEFAULT_CLIENT_PREFERENCES));
		const nextPreferences = await updateClientPreferencesFile("prefs.json", {
			onboarding: {
				schemaVersion: 1,
				completed: false,
				currentStep: "documentation",
				stepOutcomes: {
					provider: "configured",
					godot_executable: "skipped"
				},
				completedAt: null
			}
		}, memory.io);

		expect(nextPreferences.onboarding.currentStep).toBe("documentation");
		expect(nextPreferences.onboarding.stepOutcomes).toEqual({
			provider: "configured",
			godot_executable: "skipped"
		});
	});

	it("resets invalid onboarding state without losing other preferences", () => {
		const normalized = normalizeClientPreferences({
			theme: "dark",
			onboarding: {
				schemaVersion: 2,
				completed: true,
				currentStep: "missing"
			}
		}).preferences;

		expect(normalized.theme).toBe("dark");
		expect(normalized.onboarding).toEqual(DEFAULT_CLIENT_PREFERENCES.onboarding);
	});
});

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import {
	normalizeKeyboardShortcutOverrides,
	type KeyboardShortcutOverrides,
	type ShortcutPlatform
} from "../../keyboard-shortcuts";
import { DEFAULT_STUDIO_THEME_COLOR, normalizeStudioThemeColor } from "../../theme-color";
import {
	ONBOARDING_STEP_IDS,
	createDefaultOnboardingPreferences,
	type OnboardingConfigurableStepId,
	type OnboardingPreferences,
	type OnboardingStepId,
	type OnboardingStepOutcome
} from "../../onboarding";
import {
	createDefaultNewSessionComposerPreferences,
	type NewSessionComposerModel,
	type NewSessionComposerPreferences
} from "../../new-session-composer-preferences";

export type ClientPreferences = {
	autoCheckForUpdates: boolean;
	minimizeToTrayOnClose: boolean;
	theme: "system" | "light" | "dark";
	themeColor: string;
	language: "system" | "en-US" | "zh-CN";
	workspaceSidebar: {
		open: boolean;
		size: number;
	};
	keyboardShortcuts: KeyboardShortcutOverrides;
	lastComposerModel: {
		providerId: string;
		modelId: string;
	} | null;
	newSessionComposer: NewSessionComposerPreferences;
	onboarding: OnboardingPreferences;
};

export type ClientPreferencesPatch = Partial<ClientPreferences>;

export const DEFAULT_THEME_COLOR: string = DEFAULT_STUDIO_THEME_COLOR;

export const DEFAULT_CLIENT_PREFERENCES: ClientPreferences = {
	autoCheckForUpdates: true,
	minimizeToTrayOnClose: false,
	theme: "system",
	themeColor: DEFAULT_THEME_COLOR,
	language: "system",
	workspaceSidebar: {
		open: true,
		size: 260
	},
	keyboardShortcuts: {},
	lastComposerModel: null,
	newSessionComposer: createDefaultNewSessionComposerPreferences(),
	onboarding: createDefaultOnboardingPreferences()
};

const SHORTCUT_PLATFORM: ShortcutPlatform = process.platform === "darwin" ? "mac" : "other";

type ClientPreferencesStoreIo = {
	readText(path: string): Promise<string>;
	writeText(path: string, text: string): Promise<void>;
	ensureDirectory(path: string): Promise<void>;
};

const DEFAULT_IO: ClientPreferencesStoreIo = {
	async readText(path: string): Promise<string> {
		return await readFile(path, "utf8");
	},
	async writeText(path: string, text: string): Promise<void> {
		await writeFile(path, text, "utf8");
	},
	async ensureDirectory(path: string): Promise<void> {
		await mkdir(path, { recursive: true });
	}
};

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeWorkspaceSidebar(value: unknown): ClientPreferences["workspaceSidebar"] {
	if (!isRecord(value)) {
		return { ...DEFAULT_CLIENT_PREFERENCES.workspaceSidebar };
	}

	const open: boolean = typeof value.open === "boolean"
		? value.open
		: DEFAULT_CLIENT_PREFERENCES.workspaceSidebar.open;
	const size: number = typeof value.size === "number" && Number.isFinite(value.size)
		? Math.min(720, Math.max(150, Math.trunc(value.size)))
		: DEFAULT_CLIENT_PREFERENCES.workspaceSidebar.size;
	return { open, size };
}

function normalizeComposerModel(value: unknown): NewSessionComposerModel | null {
	return isRecord(value)
		&& typeof value.providerId === "string"
		&& value.providerId.trim().length > 0
		&& typeof value.modelId === "string"
		&& value.modelId.trim().length > 0
		? {
			providerId: value.providerId.trim(),
			modelId: value.modelId.trim()
		}
		: null;
}

function normalizeNewSessionComposerPreferences(
	value: unknown,
	legacyModel: NewSessionComposerModel | null
): NewSessionComposerPreferences {
	const defaults: NewSessionComposerPreferences = createDefaultNewSessionComposerPreferences();
	if (!isRecord(value)) {
		return {
			...defaults,
			model: legacyModel
		};
	}

	return {
		mode: value.mode === "ask" || value.mode === "agent" || value.mode === "plan" || value.mode === "goal"
			? value.mode
			: defaults.mode,
		approvalMode: value.approvalMode === "manual" || value.approvalMode === "auto-safe" || value.approvalMode === "full-trust"
			? value.approvalMode
			: defaults.approvalMode,
		model: normalizeComposerModel(value.model) ?? legacyModel,
		reasoningEffort: typeof value.reasoningEffort === "string"
			&& value.reasoningEffort.trim().length > 0
			&& value.reasoningEffort.trim().length <= 80
			? value.reasoningEffort.trim()
			: defaults.reasoningEffort
	};
}

const ONBOARDING_CONFIGURABLE_STEP_IDS: readonly OnboardingConfigurableStepId[] = [
	"provider",
	"godot_executable",
	"documentation",
	"godot_plugin"
];

function normalizeOnboardingPreferences(value: unknown): OnboardingPreferences {
	const defaults: OnboardingPreferences = createDefaultOnboardingPreferences();
	if (!isRecord(value) || value.schemaVersion !== 1) {
		return defaults;
	}

	const completed: boolean = value.completed === true;
	const currentStep: OnboardingStepId = typeof value.currentStep === "string"
		&& ONBOARDING_STEP_IDS.includes(value.currentStep as OnboardingStepId)
		? value.currentStep as OnboardingStepId
		: defaults.currentStep;
	const stepOutcomes: OnboardingPreferences["stepOutcomes"] = {};
	if (isRecord(value.stepOutcomes)) {
		for (const stepId of ONBOARDING_CONFIGURABLE_STEP_IDS) {
			const outcome: unknown = value.stepOutcomes[stepId];
			if (outcome === "configured" || outcome === "skipped") {
				stepOutcomes[stepId] = outcome as OnboardingStepOutcome;
			}
		}
	}
	const completedAt: string | null = completed && typeof value.completedAt === "string" && value.completedAt.trim().length > 0
		? value.completedAt.trim()
		: null;

	return {
		schemaVersion: 1,
		completed,
		currentStep: completed ? "complete" : currentStep,
		stepOutcomes,
		completedAt
	};
}

export function normalizeClientPreferences(value: unknown): { preferences: ClientPreferences; normalized: boolean } {
	if (!isRecord(value)) {
		return {
			preferences: { ...DEFAULT_CLIENT_PREFERENCES },
			normalized: true
		};
	}

	const autoCheckForUpdates: boolean = typeof value.autoCheckForUpdates === "boolean"
		? value.autoCheckForUpdates
		: DEFAULT_CLIENT_PREFERENCES.autoCheckForUpdates;
	const minimizeToTrayOnClose: boolean = typeof value.minimizeToTrayOnClose === "boolean"
		? value.minimizeToTrayOnClose
		: DEFAULT_CLIENT_PREFERENCES.minimizeToTrayOnClose;
	const themePreference: ClientPreferences["theme"] =
		value.theme === "light" || value.theme === "dark" || value.theme === "system"
			? value.theme
			: DEFAULT_CLIENT_PREFERENCES.theme;
	const themeColor: string = normalizeStudioThemeColor(value.themeColor);
	const languagePreference: ClientPreferences["language"] =
		value.language === "en-US" || value.language === "zh-CN" || value.language === "system"
			? value.language
			: DEFAULT_CLIENT_PREFERENCES.language;
	const workspaceSidebar: ClientPreferences["workspaceSidebar"] = normalizeWorkspaceSidebar(value.workspaceSidebar);
	const keyboardShortcuts: KeyboardShortcutOverrides = normalizeKeyboardShortcutOverrides(
		value.keyboardShortcuts,
		SHORTCUT_PLATFORM
	);
	const lastComposerModel: NewSessionComposerModel | null = normalizeComposerModel(value.lastComposerModel);
	const newSessionComposer: NewSessionComposerPreferences = normalizeNewSessionComposerPreferences(
		value.newSessionComposer,
		lastComposerModel
	);
	const onboarding: OnboardingPreferences = normalizeOnboardingPreferences(value.onboarding);

	return {
		preferences: {
			autoCheckForUpdates,
			minimizeToTrayOnClose,
			theme: themePreference,
			themeColor,
			language: languagePreference,
			workspaceSidebar,
			keyboardShortcuts,
			lastComposerModel,
			newSessionComposer,
			onboarding
		},
		normalized: value.autoCheckForUpdates !== autoCheckForUpdates
			|| value.minimizeToTrayOnClose !== minimizeToTrayOnClose
			|| value.theme !== themePreference
			|| value.themeColor !== themeColor
			|| value.language !== languagePreference
			|| JSON.stringify(value.workspaceSidebar ?? null) !== JSON.stringify(workspaceSidebar)
			|| JSON.stringify(value.keyboardShortcuts ?? null) !== JSON.stringify(keyboardShortcuts)
			|| JSON.stringify(value.lastComposerModel ?? null) !== JSON.stringify(lastComposerModel)
			|| JSON.stringify(value.newSessionComposer ?? null) !== JSON.stringify(newSessionComposer)
			|| JSON.stringify(value.onboarding ?? null) !== JSON.stringify(onboarding)
			|| Object.keys(value).some((key: string): boolean => ![
				"autoCheckForUpdates",
				"minimizeToTrayOnClose",
				"theme",
				"themeColor",
				"language",
				"workspaceSidebar",
				"keyboardShortcuts",
				"lastComposerModel",
				"newSessionComposer",
				"onboarding"
			].includes(key))
	};
}

export function normalizeClientPreferencesPatch(value: unknown): ClientPreferencesPatch {
	if (!isRecord(value)) {
		return {};
	}

	const patch: ClientPreferencesPatch = {};
	if (typeof value.autoCheckForUpdates === "boolean") {
		patch.autoCheckForUpdates = value.autoCheckForUpdates;
	}
	if (typeof value.minimizeToTrayOnClose === "boolean") {
		patch.minimizeToTrayOnClose = value.minimizeToTrayOnClose;
	}
	if (value.theme === "light" || value.theme === "dark" || value.theme === "system") {
		patch.theme = value.theme;
	}
	if (typeof value.themeColor === "string" && /^#[0-9a-fA-F]{6}$/.test(value.themeColor.trim())) {
		patch.themeColor = normalizeStudioThemeColor(value.themeColor);
	}
	if (value.language === "en-US" || value.language === "zh-CN" || value.language === "system") {
		patch.language = value.language;
	}
	if (
		isRecord(value.workspaceSidebar)
		&& typeof value.workspaceSidebar.open === "boolean"
		&& typeof value.workspaceSidebar.size === "number"
		&& Number.isFinite(value.workspaceSidebar.size)
	) {
		patch.workspaceSidebar = normalizeWorkspaceSidebar(value.workspaceSidebar);
	}
	if (isRecord(value.keyboardShortcuts)) {
		patch.keyboardShortcuts = normalizeKeyboardShortcutOverrides(value.keyboardShortcuts, SHORTCUT_PLATFORM);
	}
	if (value.lastComposerModel === null) {
		patch.lastComposerModel = null;
	} else if (
		isRecord(value.lastComposerModel)
		&& typeof value.lastComposerModel.providerId === "string"
		&& value.lastComposerModel.providerId.trim().length > 0
		&& typeof value.lastComposerModel.modelId === "string"
		&& value.lastComposerModel.modelId.trim().length > 0
	) {
		patch.lastComposerModel = {
			providerId: value.lastComposerModel.providerId.trim(),
			modelId: value.lastComposerModel.modelId.trim()
		};
	}
	if (isRecord(value.newSessionComposer)) {
		patch.newSessionComposer = normalizeNewSessionComposerPreferences(
			value.newSessionComposer,
			DEFAULT_CLIENT_PREFERENCES.newSessionComposer.model
		);
	}
	if (isRecord(value.onboarding)) {
		patch.onboarding = normalizeOnboardingPreferences(value.onboarding);
	}
	return patch;
}

export async function loadClientPreferencesFile(
	filePath: string,
	io: ClientPreferencesStoreIo = DEFAULT_IO
): Promise<{ preferences: ClientPreferences; normalized: boolean }> {
	try {
		const rawText: string = await io.readText(filePath);
		const parsed: unknown = JSON.parse(rawText) as unknown;
		return normalizeClientPreferences(parsed);
	} catch {
		return {
			preferences: { ...DEFAULT_CLIENT_PREFERENCES },
			normalized: true
		};
	}
}

export async function saveClientPreferencesFile(
	filePath: string,
	preferences: ClientPreferences,
	io: ClientPreferencesStoreIo = DEFAULT_IO
): Promise<void> {
	await io.ensureDirectory(dirname(filePath));
	await io.writeText(filePath, `${JSON.stringify(preferences, null, 2)}\n`);
}

export async function updateClientPreferencesFile(
	filePath: string,
	patch: ClientPreferencesPatch,
	io: ClientPreferencesStoreIo = DEFAULT_IO
): Promise<ClientPreferences> {
	const loaded = await loadClientPreferencesFile(filePath, io);
	const normalizedPatch: ClientPreferencesPatch = normalizeClientPreferencesPatch(patch);
	const nextPreferences: ClientPreferences = {
		...loaded.preferences,
		...normalizedPatch
	};
	await saveClientPreferencesFile(filePath, nextPreferences, io);
	return nextPreferences;
}

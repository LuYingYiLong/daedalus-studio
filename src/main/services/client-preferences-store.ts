import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import {
	normalizeKeyboardShortcutOverrides,
	type KeyboardShortcutOverrides,
	type ShortcutPlatform
} from "../../contracts/keyboard-shortcuts";
import { DEFAULT_STUDIO_THEME_COLOR, normalizeStudioThemeColor } from "../../contracts/theme-color";
import {
	DEFAULT_STUDIO_CODE_FONT_SIZE,
	DEFAULT_STUDIO_FONT_FAMILY,
	DEFAULT_STUDIO_FONT_FAMILY_CODE,
	DEFAULT_STUDIO_UI_FONT_SIZE,
	MAX_STUDIO_CODE_FONT_SIZE,
	MAX_STUDIO_UI_FONT_SIZE,
	MIN_STUDIO_CODE_FONT_SIZE,
	MIN_STUDIO_UI_FONT_SIZE,
	normalizeStudioFontFamily,
	normalizeStudioFontFamilyPatch,
	normalizeStudioFontSize
} from "../../contracts/studio-fonts";
import type { ClientPreferences, ClientPreferencesPatch } from "../../contracts/client-preferences";
import {
	ONBOARDING_STEP_IDS,
	createDefaultOnboardingPreferences,
	type OnboardingConfigurableStepId,
	type OnboardingPreferences,
	type OnboardingStepId,
	type OnboardingStepOutcome
} from "../../contracts/onboarding";
import {
	createDefaultNewSessionComposerPreferences,
	type NewSessionComposerModel,
	type NewSessionComposerPreferences
} from "../../contracts/new-session-composer-preferences";

export type { ClientPreferences, ClientPreferencesPatch } from "../../contracts/client-preferences";

export const DEFAULT_THEME_COLOR: string = DEFAULT_STUDIO_THEME_COLOR;

export const DEFAULT_CLIENT_PREFERENCES: ClientPreferences = {
	allowComputerObservation: false,
	allowComputerControl: false,
	autoCheckForUpdates: true,
	notifyOnRunCompleted: true,
	minimizeToTrayOnClose: false,
	theme: "system",
	themeColor: DEFAULT_THEME_COLOR,
	animationsEnabled: true,
	uiFontSize: DEFAULT_STUDIO_UI_FONT_SIZE,
	codeFontSize: DEFAULT_STUDIO_CODE_FONT_SIZE,
	fontFamily: DEFAULT_STUDIO_FONT_FAMILY,
	fontFamilyCode: DEFAULT_STUDIO_FONT_FAMILY_CODE,
	language: "system",
	webLinkOpenMode: "integrated",
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
	"godot_bridge"
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
	const notifyOnRunCompleted: boolean = typeof value.notifyOnRunCompleted === "boolean"
		? value.notifyOnRunCompleted
		: DEFAULT_CLIENT_PREFERENCES.notifyOnRunCompleted;
	const minimizeToTrayOnClose: boolean = typeof value.minimizeToTrayOnClose === "boolean"
		? value.minimizeToTrayOnClose
		: DEFAULT_CLIENT_PREFERENCES.minimizeToTrayOnClose;
	const themePreference: ClientPreferences["theme"] =
		value.theme === "light" || value.theme === "dark" || value.theme === "system"
			? value.theme
			: DEFAULT_CLIENT_PREFERENCES.theme;
	const themeColor: string = normalizeStudioThemeColor(value.themeColor);
	const animationsEnabled: boolean = typeof value.animationsEnabled === "boolean"
		? value.animationsEnabled
		: DEFAULT_CLIENT_PREFERENCES.animationsEnabled;
	const uiFontSize: number = normalizeStudioFontSize(
		value.uiFontSize,
		DEFAULT_CLIENT_PREFERENCES.uiFontSize,
		MIN_STUDIO_UI_FONT_SIZE,
		MAX_STUDIO_UI_FONT_SIZE
	);
	const codeFontSize: number = normalizeStudioFontSize(
		value.codeFontSize,
		DEFAULT_CLIENT_PREFERENCES.codeFontSize,
		MIN_STUDIO_CODE_FONT_SIZE,
		MAX_STUDIO_CODE_FONT_SIZE
	);
	const fontFamily: string = normalizeStudioFontFamily(value.fontFamily, DEFAULT_CLIENT_PREFERENCES.fontFamily);
	const fontFamilyCode: string = normalizeStudioFontFamily(value.fontFamilyCode, DEFAULT_CLIENT_PREFERENCES.fontFamilyCode);
	const languagePreference: ClientPreferences["language"] =
		value.language === "en-US" || value.language === "zh-CN" || value.language === "system"
			? value.language
			: DEFAULT_CLIENT_PREFERENCES.language;
	const webLinkOpenMode: ClientPreferences["webLinkOpenMode"] =
		value.webLinkOpenMode === "external" || value.webLinkOpenMode === "integrated"
			? value.webLinkOpenMode
			: DEFAULT_CLIENT_PREFERENCES.webLinkOpenMode;
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
			notifyOnRunCompleted,
			minimizeToTrayOnClose,
			allowComputerObservation: value.allowComputerObservation === true,
			allowComputerControl: value.allowComputerObservation === true && value.allowComputerControl === true,
			theme: themePreference,
			themeColor,
			animationsEnabled,
			uiFontSize,
			codeFontSize,
			fontFamily,
			fontFamilyCode,
			language: languagePreference,
			webLinkOpenMode,
			workspaceSidebar,
			keyboardShortcuts,
			lastComposerModel,
			newSessionComposer,
			onboarding
		},
		normalized: value.autoCheckForUpdates !== autoCheckForUpdates
			|| typeof value.allowComputerObservation !== "boolean"
			|| value.allowComputerControl !== (value.allowComputerObservation === true && value.allowComputerControl === true)
			|| value.notifyOnRunCompleted !== notifyOnRunCompleted
			|| value.minimizeToTrayOnClose !== minimizeToTrayOnClose
			|| value.theme !== themePreference
			|| value.themeColor !== themeColor
			|| value.animationsEnabled !== animationsEnabled
			|| value.uiFontSize !== uiFontSize
			|| value.codeFontSize !== codeFontSize
			|| value.fontFamily !== fontFamily
			|| value.fontFamilyCode !== fontFamilyCode
			|| value.language !== languagePreference
			|| value.webLinkOpenMode !== webLinkOpenMode
			|| JSON.stringify(value.workspaceSidebar ?? null) !== JSON.stringify(workspaceSidebar)
			|| JSON.stringify(value.keyboardShortcuts ?? null) !== JSON.stringify(keyboardShortcuts)
			|| JSON.stringify(value.lastComposerModel ?? null) !== JSON.stringify(lastComposerModel)
			|| JSON.stringify(value.newSessionComposer ?? null) !== JSON.stringify(newSessionComposer)
			|| JSON.stringify(value.onboarding ?? null) !== JSON.stringify(onboarding)
			|| Object.keys(value).some((key: string): boolean => ![
				"allowComputerObservation",
				"allowComputerControl",
				"autoCheckForUpdates",
				"notifyOnRunCompleted",
				"minimizeToTrayOnClose",
				"theme",
				"themeColor",
				"animationsEnabled",
				"uiFontSize",
				"codeFontSize",
				"fontFamily",
				"fontFamilyCode",
				"language",
				"webLinkOpenMode",
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
	if (typeof value.notifyOnRunCompleted === "boolean") {
		patch.notifyOnRunCompleted = value.notifyOnRunCompleted;
	}
	if (typeof value.minimizeToTrayOnClose === "boolean") {
		patch.minimizeToTrayOnClose = value.minimizeToTrayOnClose;
	}
	if (typeof value.allowComputerObservation === "boolean") patch.allowComputerObservation = value.allowComputerObservation;
	if (typeof value.allowComputerControl === "boolean") patch.allowComputerControl = value.allowComputerControl;
	if (value.theme === "light" || value.theme === "dark" || value.theme === "system") {
		patch.theme = value.theme;
	}
	if (typeof value.themeColor === "string" && /^#[0-9a-fA-F]{6}$/.test(value.themeColor.trim())) {
		patch.themeColor = normalizeStudioThemeColor(value.themeColor);
	}
	if (typeof value.animationsEnabled === "boolean") {
		patch.animationsEnabled = value.animationsEnabled;
	}
	if (typeof value.uiFontSize === "number" && Number.isFinite(value.uiFontSize)) {
		patch.uiFontSize = normalizeStudioFontSize(
			value.uiFontSize,
			DEFAULT_CLIENT_PREFERENCES.uiFontSize,
			MIN_STUDIO_UI_FONT_SIZE,
			MAX_STUDIO_UI_FONT_SIZE
		);
	}
	if (typeof value.codeFontSize === "number" && Number.isFinite(value.codeFontSize)) {
		patch.codeFontSize = normalizeStudioFontSize(
			value.codeFontSize,
			DEFAULT_CLIENT_PREFERENCES.codeFontSize,
			MIN_STUDIO_CODE_FONT_SIZE,
			MAX_STUDIO_CODE_FONT_SIZE
		);
	}
	if (typeof value.fontFamily === "string") {
		patch.fontFamily = normalizeStudioFontFamilyPatch(value.fontFamily, DEFAULT_CLIENT_PREFERENCES.fontFamily, "fontFamily");
	}
	if (typeof value.fontFamilyCode === "string") {
		patch.fontFamilyCode = normalizeStudioFontFamilyPatch(value.fontFamilyCode, DEFAULT_CLIENT_PREFERENCES.fontFamilyCode, "fontFamilyCode");
	}
	if (value.language === "en-US" || value.language === "zh-CN" || value.language === "system") {
		patch.language = value.language;
	}
	if (value.webLinkOpenMode === "external" || value.webLinkOpenMode === "integrated") {
		patch.webLinkOpenMode = value.webLinkOpenMode;
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

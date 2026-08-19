import type { KeyboardShortcutOverrides } from "./keyboard-shortcuts";
import type { NewSessionComposerPreferences } from "./new-session-composer-preferences";
import type { OnboardingPreferences } from "./onboarding";

export type LanguagePreference = "system" | "en-US" | "zh-CN";

export type WorkspaceSidebarPreferences = {
	open: boolean;
	size: number;
};

export type ClientPreferences = {
	autoCheckForUpdates: boolean;
	notifyOnRunCompleted: boolean;
	minimizeToTrayOnClose: boolean;
	theme: "system" | "light" | "dark";
	themeColor: string;
	animationsEnabled: boolean;
	uiFontSize: number;
	codeFontSize: number;
	fontFamily: string;
	fontFamilyCode: string;
	language: LanguagePreference;
	workspaceSidebar: WorkspaceSidebarPreferences;
	keyboardShortcuts: KeyboardShortcutOverrides;
	lastComposerModel: {
		providerId: string;
		modelId: string;
	} | null;
	newSessionComposer: NewSessionComposerPreferences;
	onboarding: OnboardingPreferences;
};

export type ClientPreferencesPatch = Partial<ClientPreferences>;

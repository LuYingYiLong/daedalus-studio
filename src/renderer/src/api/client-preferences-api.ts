import type { KeyboardShortcutOverrides } from "./keyboard-shortcuts";
import { DEFAULT_STUDIO_THEME_COLOR } from "../../../theme-color";
import { createDefaultOnboardingPreferences, type OnboardingPreferences } from "../../../onboarding";

export type ClientPreferences = {
	autoCheckForUpdates: boolean;
	minimizeToTrayOnClose: boolean;
	theme: "system" | "light" | "dark";
	themeColor: string;
	language: LanguagePreference;
	workspaceSidebar: WorkspaceSidebarPreferences;
	keyboardShortcuts: KeyboardShortcutOverrides;
	lastComposerModel: {
		providerId: string;
		modelId: string;
	} | null;
	onboarding: OnboardingPreferences;
};

export type LanguagePreference = "system" | "en-US" | "zh-CN";

export type WorkspaceSidebarPreferences = {
	open: boolean;
	size: number;
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
	onboarding: createDefaultOnboardingPreferences()
};

export const CLIENT_PREFERENCES_CHANGED_EVENT = "daedalus:client-preferences-changed";

export async function fetchClientPreferences(): Promise<ClientPreferences> {
	return await window.electronAPI.clientPreferences.get();
}

export function getCachedClientPreferences(): ClientPreferences {
	if (window.electronAPI?.clientPreferences === undefined) {
		return DEFAULT_CLIENT_PREFERENCES;
	}
	return window.electronAPI.clientPreferences.getCached();
}

export function dispatchClientPreferencesChanged(preferences: ClientPreferences): void {
	window.dispatchEvent(new CustomEvent<ClientPreferences>(CLIENT_PREFERENCES_CHANGED_EVENT, {
		detail: preferences
	}));
}

export async function updateClientPreferences(patch: ClientPreferencesPatch): Promise<ClientPreferences> {
	const preferences: ClientPreferences = await window.electronAPI.clientPreferences.update(patch);
	dispatchClientPreferencesChanged(preferences);
	return preferences;
}

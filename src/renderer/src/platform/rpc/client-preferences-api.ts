import { DEFAULT_STUDIO_THEME_COLOR } from "../../../../contracts/theme-color";
import {
	DEFAULT_STUDIO_CODE_FONT_SIZE,
	DEFAULT_STUDIO_FONT_FAMILY,
	DEFAULT_STUDIO_FONT_FAMILY_CODE,
	DEFAULT_STUDIO_UI_FONT_SIZE,
} from "../../../../contracts/studio-fonts";
import { createDefaultOnboardingPreferences } from "../../../../contracts/onboarding";
import {
	createDefaultNewSessionComposerPreferences,
	type NewSessionComposerPreferences,
} from "../../../../contracts/new-session-composer-preferences";
import type {
	ClientPreferences,
	ClientPreferencesPatch,
	LanguagePreference,
	WebLinkOpenMode,
	WorkspaceSidebarPreferences,
} from "../../../../contracts/client-preferences";

export type {
	ClientPreferences,
	ClientPreferencesPatch,
	LanguagePreference,
	WebLinkOpenMode,
	WorkspaceSidebarPreferences,
} from "../../../../contracts/client-preferences";
export type { NewSessionComposerPreferences } from "../../../../contracts/new-session-composer-preferences";

export const DEFAULT_THEME_COLOR: string = DEFAULT_STUDIO_THEME_COLOR;

export const DEFAULT_CLIENT_PREFERENCES: ClientPreferences = {
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
		size: 260,
	},
	keyboardShortcuts: {},
	lastComposerModel: null,
	newSessionComposer: createDefaultNewSessionComposerPreferences(),
	onboarding: createDefaultOnboardingPreferences(),
};

export const CLIENT_PREFERENCES_CHANGED_EVENT =
	"daedalus:client-preferences-changed";

export async function fetchClientPreferences(): Promise<ClientPreferences> {
	return await window.electronAPI.clientPreferences.get();
}

export function getCachedClientPreferences(): ClientPreferences {
	if (window.electronAPI?.clientPreferences === undefined) {
		return DEFAULT_CLIENT_PREFERENCES;
	}
	return window.electronAPI.clientPreferences.getCached();
}

export function dispatchClientPreferencesChanged(
	preferences: ClientPreferences,
): void {
	window.dispatchEvent(
		new CustomEvent<ClientPreferences>(CLIENT_PREFERENCES_CHANGED_EVENT, {
			detail: preferences,
		}),
	);
}

export async function updateClientPreferences(
	patch: ClientPreferencesPatch,
): Promise<ClientPreferences> {
	const preferences: ClientPreferences =
		await window.electronAPI.clientPreferences.update(patch);
	dispatchClientPreferencesChanged(preferences);
	return preferences;
}

import type { BackgroundImageFit, BackgroundImagePreference } from "./appearance-background";
import type { KeyboardShortcutOverrides } from "./keyboard-shortcuts";
import type { NewSessionComposerPreferences } from "./new-session-composer-preferences";
import type { OnboardingPreferences } from "./onboarding";

export type LanguagePreference = "system" | "en-US" | "zh-CN";

export type WebLinkOpenMode = "external" | "integrated";

export type WorkspaceSidebarPreferences = {
	open: boolean;
	size: number;
};

export type ClientPreferences = {
	allowComputerObservation?: boolean;
	allowComputerControl?: boolean;
	autoCheckForUpdates: boolean;
	notifyOnRunCompleted: boolean;
	minimizeToTrayOnClose: boolean;
	theme: "system" | "light" | "dark";
	themeColor: string;
	animationsEnabled: boolean;
	mascotEnabled: boolean;
	mascotSize: number;
	uiFontSize: number;
	codeFontSize: number;
	fontFamily: string;
	fontFamilyCode: string;
	backgroundImage: BackgroundImagePreference | null;
	backgroundImageOpacity: number;
	backgroundImageBlur: number;
	backgroundImageFit: BackgroundImageFit;
	language: LanguagePreference;
	webLinkOpenMode: WebLinkOpenMode;
	workspaceSidebar: WorkspaceSidebarPreferences;
	keyboardShortcuts: KeyboardShortcutOverrides;
	flowSnapToGrid: boolean;
	flowRunEntryByFlowId: Record<string, string>;
	lastComposerModel: {
		providerId: string;
		modelId: string;
	} | null;
	newSessionComposer: NewSessionComposerPreferences;
	onboarding: OnboardingPreferences;
};

export type ClientPreferencesPatch = Partial<ClientPreferences>;

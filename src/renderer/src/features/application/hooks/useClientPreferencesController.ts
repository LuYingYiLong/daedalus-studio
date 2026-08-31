import { useEffect, useState } from "react";
import { useEventListener, useMemoizedFn, useRequest } from "ahooks";
import {
	CLIENT_PREFERENCES_CHANGED_EVENT,
	dispatchClientPreferencesChanged,
	fetchClientPreferences,
	getCachedClientPreferences,
	type ClientPreferences,
	type LanguagePreference
} from "@/platform/rpc/client-preferences-api";
import { resolveLanguagePreference, type ResolvedLanguage } from "@/platform/i18n";
import {
	resolveThemePreference,
	type ResolvedTheme,
	type ThemePreference
} from "@/domain/theme/studio-theme-preference";

const PREFERS_LIGHT_SCHEME_QUERY = "(prefers-color-scheme: light)";

function getCurrentSystemTheme(): ResolvedTheme {
	return window.matchMedia(PREFERS_LIGHT_SCHEME_QUERY).matches ? "light" : "dark";
}

export type ClientPreferencesController = {
	themePreference: ThemePreference;
	themeColor: string;
	languagePreference: LanguagePreference;
	systemTheme: ResolvedTheme;
	resolvedTheme: ResolvedTheme;
	resolvedLanguage: ResolvedLanguage;
	fontFamily: string;
	fontFamilyCode: string;
	animationsEnabled: boolean;
	uiFontSize: number;
	codeFontSize: number;
};

function useClientPreferencesController(): ClientPreferencesController {
	const [themePreference, setThemePreference] = useState<ThemePreference>(() => getCachedClientPreferences().theme);
	const [themeColor, setThemeColor] = useState<string>(() => getCachedClientPreferences().themeColor);
	const [fontFamily, setFontFamily] = useState<string>(() => getCachedClientPreferences().fontFamily);
	const [fontFamilyCode, setFontFamilyCode] = useState<string>(() => getCachedClientPreferences().fontFamilyCode);
	const [animationsEnabled, setAnimationsEnabled] = useState<boolean>(() => getCachedClientPreferences().animationsEnabled);
	const [uiFontSize, setUiFontSize] = useState<number>(() => getCachedClientPreferences().uiFontSize);
	const [codeFontSize, setCodeFontSize] = useState<number>(() => getCachedClientPreferences().codeFontSize);
	const [languagePreference, setLanguagePreference] = useState<LanguagePreference>(() => getCachedClientPreferences().language);
	const [systemTheme, setSystemTheme] = useState<ResolvedTheme>(() => getCurrentSystemTheme());

	const applyPreferences = useMemoizedFn((preferences: ClientPreferences): void => {
		setThemePreference(preferences.theme);
		setThemeColor(preferences.themeColor);
		setFontFamily(preferences.fontFamily);
		setFontFamilyCode(preferences.fontFamilyCode);
		setAnimationsEnabled(preferences.animationsEnabled);
		setUiFontSize(preferences.uiFontSize);
		setCodeFontSize(preferences.codeFontSize);
		setLanguagePreference(preferences.language);
	});

	useRequest(fetchClientPreferences, {
		onSuccess: applyPreferences
	});

	useEffect((): (() => void) => {
		const mediaQuery: MediaQueryList = window.matchMedia(PREFERS_LIGHT_SCHEME_QUERY);
		function handleSystemThemeChange(event: MediaQueryListEvent): void {
			setSystemTheme(event.matches ? "light" : "dark");
		}

		mediaQuery.addEventListener("change", handleSystemThemeChange);
		return (): void => {
			mediaQuery.removeEventListener("change", handleSystemThemeChange);
		};
	}, []);

	useEffect((): (() => void) => {
		return window.electronAPI.clientPreferences.onChanged((preferences: ClientPreferences): void => {
			applyPreferences(preferences);
			dispatchClientPreferencesChanged(preferences);
		});
	}, [applyPreferences]);

	useEventListener(CLIENT_PREFERENCES_CHANGED_EVENT, (event: Event): void => {
		const preferences: ClientPreferences | undefined = (event as CustomEvent<ClientPreferences>).detail;
		if (preferences !== undefined) {
			applyPreferences(preferences);
		}
	});

	return {
		themePreference,
		themeColor,
		languagePreference,
		systemTheme,
		resolvedTheme: resolveThemePreference(themePreference, systemTheme),
		resolvedLanguage: resolveLanguagePreference(languagePreference),
		fontFamily,
		fontFamilyCode,
		animationsEnabled,
		uiFontSize,
		codeFontSize
	};
}

export default useClientPreferencesController;

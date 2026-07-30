import { useEffect, useState } from "react";
import { useEventListener, useMemoizedFn, useRequest } from "ahooks";
import {
	CLIENT_PREFERENCES_CHANGED_EVENT,
	dispatchClientPreferencesChanged,
	fetchClientPreferences,
	getCachedClientPreferences,
	type ClientPreferences,
	type LanguagePreference
} from "@/api/client-preferences-api";
import { resolveLanguagePreference, type ResolvedLanguage } from "@/i18n";
import {
	resolveThemePreference,
	type ResolvedTheme,
	type ThemePreference
} from "@/styles/studio-theme";

const PREFERS_LIGHT_SCHEME_QUERY = "(prefers-color-scheme: light)";

function getCurrentSystemTheme(): ResolvedTheme {
	return window.matchMedia(PREFERS_LIGHT_SCHEME_QUERY).matches ? "light" : "dark";
}

export type ClientPreferencesController = {
	themePreference: ThemePreference;
	languagePreference: LanguagePreference;
	systemTheme: ResolvedTheme;
	resolvedTheme: ResolvedTheme;
	resolvedLanguage: ResolvedLanguage;
};

function useClientPreferencesController(): ClientPreferencesController {
	const [themePreference, setThemePreference] = useState<ThemePreference>(() => getCachedClientPreferences().theme);
	const [languagePreference, setLanguagePreference] = useState<LanguagePreference>(() => getCachedClientPreferences().language);
	const [systemTheme, setSystemTheme] = useState<ResolvedTheme>(() => getCurrentSystemTheme());

	const applyPreferences = useMemoizedFn((preferences: ClientPreferences): void => {
		setThemePreference(preferences.theme);
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
		languagePreference,
		systemTheme,
		resolvedTheme: resolveThemePreference(themePreference, systemTheme),
		resolvedLanguage: resolveLanguagePreference(languagePreference)
	};
}

export default useClientPreferencesController;

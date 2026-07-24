import { useCallback, useEffect, useMemo, useState } from "react";
import { App as AntdApp, ConfigProvider, type ThemeConfig } from "antd";
import enUS from "antd/locale/en_US";
import zhCN from "antd/locale/zh_CN";
import {
	CLIENT_PREFERENCES_CHANGED_EVENT,
	fetchClientPreferences,
	getCachedClientPreferences,
	type ClientPreferences,
	type LanguagePreference
} from "@/api/client-preferences-api";
import i18n, { resolveLanguagePreference, type ResolvedLanguage } from "@/i18n";
import Titlebar from "@/components/Titlebar";
import App from "./App";
import BootSplash from "./BootSplash";
import type { BootstrapData } from "./bootstrap";
import {
	createStudioTheme,
	resolveThemePreference,
	type ResolvedTheme,
	type ThemePreference
} from "@/styles/studio-theme";

const PREFERS_LIGHT_SCHEME_QUERY = "(prefers-color-scheme: light)";

function getCurrentSystemTheme(): ResolvedTheme {
	return window.matchMedia(PREFERS_LIGHT_SCHEME_QUERY).matches ? "light" : "dark";
}

function StudioThemeRoot(): React.JSX.Element {
	const [themePreference, setThemePreference] = useState<ThemePreference>(() => getCachedClientPreferences().theme);
	const [languagePreference, setLanguagePreference] = useState<LanguagePreference>(() => getCachedClientPreferences().language);
	const [systemTheme, setSystemTheme] = useState<ResolvedTheme>(() => getCurrentSystemTheme());
	const [bootstrapData, setBootstrapData] = useState<BootstrapData | null>(null);
	const resolvedTheme: ResolvedTheme = resolveThemePreference(themePreference, systemTheme);
	const resolvedLanguage: ResolvedLanguage = resolveLanguagePreference(languagePreference);
	const studioTheme: ThemeConfig = useMemo((): ThemeConfig => createStudioTheme(resolvedTheme), [resolvedTheme]);
	const antdLocale = resolvedLanguage === "zh-CN" ? zhCN : enUS;
	const handleBootstrapReady = useCallback((data: BootstrapData): void => {
		setBootstrapData(data);
	}, []);

	useEffect((): void => {
		document.documentElement.dataset.theme = resolvedTheme;
	}, [resolvedTheme]);

	useEffect((): void => {
		document.documentElement.lang = resolvedLanguage;
		void i18n.changeLanguage(resolvedLanguage);
	}, [resolvedLanguage]);

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
		let cancelled: boolean = false;
		void fetchClientPreferences().then((preferences: ClientPreferences): void => {
			if (!cancelled) {
				setThemePreference(preferences.theme);
				setLanguagePreference(preferences.language);
			}
		});

		return (): void => {
			cancelled = true;
		};
	}, []);

	useEffect((): (() => void) => {
		function handleClientPreferencesChanged(event: Event): void {
			const preferences: ClientPreferences | undefined = (event as CustomEvent<ClientPreferences>).detail;
			if (preferences !== undefined) {
				setThemePreference(preferences.theme);
				setLanguagePreference(preferences.language);
			}
		}

		window.addEventListener(CLIENT_PREFERENCES_CHANGED_EVENT, handleClientPreferencesChanged);
		return (): void => {
			window.removeEventListener(CLIENT_PREFERENCES_CHANGED_EVENT, handleClientPreferencesChanged);
		};
	}, []);

	return (
		<ConfigProvider theme={studioTheme} locale={antdLocale}>
			<AntdApp component="div" style={{ display: "contents" }}>
				<Titlebar />
				{bootstrapData === null ? <BootSplash onReady={handleBootstrapReady} /> : <App bootstrapData={bootstrapData} />}
			</AntdApp>
		</ConfigProvider>
	);
}

export default StudioThemeRoot;

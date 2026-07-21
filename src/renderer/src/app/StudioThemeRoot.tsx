import { useCallback, useEffect, useMemo, useState } from "react";
import { ConfigProvider, type ThemeConfig } from "antd";
import {
	CLIENT_PREFERENCES_CHANGED_EVENT,
	fetchClientPreferences,
	getCachedClientPreferences,
	type ClientPreferences
} from "@/api/client-preferences-api";
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
	const [systemTheme, setSystemTheme] = useState<ResolvedTheme>(() => getCurrentSystemTheme());
	const [bootstrapData, setBootstrapData] = useState<BootstrapData | null>(null);
	const resolvedTheme: ResolvedTheme = resolveThemePreference(themePreference, systemTheme);
	const studioTheme: ThemeConfig = useMemo((): ThemeConfig => createStudioTheme(resolvedTheme), [resolvedTheme]);
	const handleBootstrapReady = useCallback((data: BootstrapData): void => {
		setBootstrapData(data);
	}, []);

	useEffect((): void => {
		document.documentElement.dataset.theme = resolvedTheme;
	}, [resolvedTheme]);

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
			}
		}

		window.addEventListener(CLIENT_PREFERENCES_CHANGED_EVENT, handleClientPreferencesChanged);
		return (): void => {
			window.removeEventListener(CLIENT_PREFERENCES_CHANGED_EVENT, handleClientPreferencesChanged);
		};
	}, []);

	return (
		<ConfigProvider theme={studioTheme}>
			<Titlebar />
			{bootstrapData === null ? <BootSplash onReady={handleBootstrapReady} /> : <App bootstrapData={bootstrapData} />}
		</ConfigProvider>
	);
}

export default StudioThemeRoot;

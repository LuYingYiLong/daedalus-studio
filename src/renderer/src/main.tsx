import { StrictMode, useCallback, useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import { ConfigProvider, theme as antdTheme, type ThemeConfig } from "antd";
import {
	CLIENT_PREFERENCES_CHANGED_EVENT,
	fetchClientPreferences,
	getCachedClientPreferences,
	type ClientPreferences
} from "./api/client-preferences-api";
import Titlebar from "./components/Titlebar";
import BootSplash from "./app/BootSplash";
import type { BootstrapData } from "./app/bootstrap";
import App from "./app/App";
import "react-diff-view/style/index.css";
import "./styles/global.css";
import "./styles/markdown.css";

const rootElement = document.getElementById("root");

type ResolvedTheme = "light" | "dark";
type ThemePreference = ClientPreferences["theme"];

const dsDarkColors = {
	accent: "#478cbf",
	accentHover: "#5aa0d2",
	accentActive: "#386f98",
	bg: "#141414",
	bgSunken: "#0f0f0f",
	surface: "#1b1b1b",
	surfaceElevated: "#1f1f1f",
	surfaceHover: "#242424",
	surfaceActive: "#2a2a2a",
	border: "#3b3b3b",
	textPrimary: "#e8e8e8",
	textSecondary: "#b8b8b8",
	textMuted: "#8c8c8c",
} as const;

const dsLightColors = {
	accent: "#478cbf",
	accentHover: "#5aa0d2",
	accentActive: "#386f98",
	bg: "#f5f5f5",
	bgSunken: "#eeeeee",
	surface: "#ffffff",
	surfaceElevated: "#ffffff",
	surfaceHover: "#f0f0f0",
	surfaceActive: "#e8e8e8",
	border: "#d6d6d6",
	textPrimary: "#141414",
	textSecondary: "#4f4f4f",
	textMuted: "#737373",
} as const;

const dsFontFamily = `"Mona Sans", "Wen Yuan Sans SC", "Microsoft YaHei UI", "Microsoft YaHei", system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`;
const dsFontFamilyCode = `"Fira Code", "Cascadia Code", "SFMono-Regular", Consolas, "Liberation Mono", Menlo, Courier, monospace`;

if (!rootElement) {
	throw new Error("Root element not found");
}

function resolveTheme(themePreference: ThemePreference): ResolvedTheme {
	if (themePreference === "light" || themePreference === "dark") {
		return themePreference;
	}
	return window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
}

function createStudioTheme(resolvedTheme: ResolvedTheme): ThemeConfig {
	const dsColors = resolvedTheme === "dark" ? dsDarkColors : dsLightColors;

	return {
		algorithm: resolvedTheme === "dark" ? antdTheme.darkAlgorithm : antdTheme.defaultAlgorithm,
		token: {
			borderRadius: 4,
			borderRadiusLG: 8,
			borderRadiusSM: 4,
			borderRadiusXS: 4,
			colorBgBase: dsColors.bg,
			colorBgContainer: dsColors.surface,
			colorBgElevated: dsColors.surfaceElevated,
			colorBgLayout: dsColors.bg,
			colorBorder: dsColors.border,
			colorBorderSecondary: dsColors.border,
			colorFillQuaternary: dsColors.surfaceHover,
			colorPrimary: dsColors.accent,
			colorPrimaryActive: dsColors.accentActive,
			colorPrimaryHover: dsColors.accentHover,
			colorText: dsColors.textPrimary,
			colorTextSecondary: dsColors.textSecondary,
			colorTextTertiary: dsColors.textMuted,
			controlHeight: 28,
			controlHeightLG: 32,
			controlHeightSM: 24,
			fontFamily: dsFontFamily,
			fontFamilyCode: dsFontFamilyCode,
			margin: 8,
			marginSM: 8,
			marginXS: 4,
			padding: 8,
			paddingLG: 16,
			paddingSM: 8,
			paddingXS: 4,
		},
		components: {
			Button: {
				borderRadius: 4,
				dangerShadow: "none",
				defaultShadow: "none",
				iconGap: 4,
				paddingInline: 8,
				paddingInlineLG: 8,
				primaryShadow: "none",
			},
			Tree: {
				indentSize: 16,
			},
			Menu: {
				darkItemBg: "transparent",
				darkItemHoverBg: dsColors.surfaceHover,
				darkItemSelectedBg: "rgb(71 140 191 / 24%)",
				darkItemSelectedColor: dsColors.textPrimary,
				itemBg: "transparent",
				itemBorderRadius: 4,
				itemHeight: 28,
				itemHoverBg: dsColors.surfaceHover,
				itemPaddingInline: 8,
				itemSelectedBg: "rgb(71 140 191 / 18%)",
				subMenuItemBg: "transparent",
			},
			Alert: {
				defaultPadding: 8,
				withDescriptionPadding: 8,
			},
			Form: {
				itemMarginBottom: 4,
			},
			Table: {
				headerBorderRadius: 4,
				borderRadius: 4,
				cellPaddingBlock: 8,
				cellPaddingInline: 8,
			},
			Progress: {
				lineBorderRadius: 4,
			},
			Steps: {
				iconFontSize: 8,
			},
			Modal: {
				padding: 8,
			},
			Card: {
				bodyPaddingSM: 8,
				bodyPadding: 8,
				headerPadding: 8,
				headerPaddingSM: 8,
			},
		}
	};
}

function StudioThemeRoot(): React.JSX.Element {
	const [themePreference, setThemePreference] = useState<ThemePreference>(() => getCachedClientPreferences().theme);
	const [systemTheme, setSystemTheme] = useState<ResolvedTheme>(() => resolveTheme("system"));
	const [bootstrapData, setBootstrapData] = useState<BootstrapData | null>(null);
	const resolvedTheme: ResolvedTheme = themePreference === "system" ? systemTheme : themePreference;
	const studioTheme: ThemeConfig = useMemo((): ThemeConfig => createStudioTheme(resolvedTheme), [resolvedTheme]);
	const handleBootstrapReady = useCallback((data: BootstrapData): void => {
		setBootstrapData(data);
	}, []);

	useEffect((): void => {
		document.documentElement.dataset.theme = resolvedTheme;
	}, [resolvedTheme]);

	useEffect((): (() => void) => {
		const mediaQuery: MediaQueryList = window.matchMedia("(prefers-color-scheme: light)");
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

createRoot(rootElement).render(
	<StrictMode>
		<StudioThemeRoot />
	</StrictMode>
);

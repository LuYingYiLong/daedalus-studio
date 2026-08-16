import { useEffect, useMemo, useState } from "react";
import { App as AntdApp, ConfigProvider, type ThemeConfig } from "antd";
import enUS from "antd/locale/en_US";
import zhCN from "antd/locale/zh_CN";
import i18n from "@/platform/i18n";
import useClientPreferencesController from "../runtime/hooks/useClientPreferencesController";
import { applyStudioFontVariables, createStudioTheme } from "@/ui/styles/studio-theme";
import {
	DEFAULT_GENERAL_SETTINGS,
	fetchGeneralSettings,
	GENERAL_SETTINGS_CHANGED_EVENT,
	type GeneralSettings
} from "@/platform/rpc/general-settings-api";
import { applyStudioAccentVariables } from "../../../../contracts/theme-color";
import InputContextMenu from "@/ui/InputContextMenu";
import styles from "./WindowProviders.module.css";

type WindowProvidersProps = {
	children: React.ReactNode;
};

function WindowProviders({ children }: WindowProvidersProps): React.JSX.Element {
	const { resolvedTheme, resolvedLanguage, themeColor } = useClientPreferencesController();
	const [generalSettings, setGeneralSettings] = useState<GeneralSettings>(DEFAULT_GENERAL_SETTINGS);
	const studioTheme: ThemeConfig = useMemo(
		(): ThemeConfig => createStudioTheme(resolvedTheme, themeColor, generalSettings.fontFamily, generalSettings.fontFamilyCode),
		[generalSettings.fontFamily, generalSettings.fontFamilyCode, resolvedTheme, themeColor]
	);
	const antdLocale = resolvedLanguage === "zh-CN" ? zhCN : enUS;

	useEffect((): void => {
		document.documentElement.dataset.theme = resolvedTheme;
		applyStudioAccentVariables(document.documentElement.style, resolvedTheme, themeColor);
	}, [resolvedTheme, themeColor]);

	useEffect((): void => {
		document.documentElement.lang = resolvedLanguage;
		void i18n.changeLanguage(resolvedLanguage);
	}, [resolvedLanguage]);

	useEffect((): (() => void) => {
		let cancelled: boolean = false;
		void fetchGeneralSettings()
			.then((settings: GeneralSettings): void => {
				if (!cancelled) setGeneralSettings(settings);
			})
			.catch((error: unknown): void => {
				console.warn("[WindowProviders] failed to load general settings", error);
			});
		return (): void => {
			cancelled = true;
		};
	}, []);

	useEffect((): (() => void) => {
		const handleGeneralSettingsChange = (event: Event): void => {
			const settings: GeneralSettings | undefined = (event as CustomEvent<GeneralSettings>).detail;
			if (settings !== undefined) setGeneralSettings(settings);
		};
		window.addEventListener(GENERAL_SETTINGS_CHANGED_EVENT, handleGeneralSettingsChange);
		const unsubscribe = window.electronAPI.generalSettings?.onChanged((settings: GeneralSettings): void => {
			setGeneralSettings(settings);
		});
		return (): void => {
			window.removeEventListener(GENERAL_SETTINGS_CHANGED_EVENT, handleGeneralSettingsChange);
			unsubscribe?.();
		};
	}, []);

	useEffect((): void => {
		applyStudioFontVariables(
			document.documentElement.style,
			generalSettings.fontFamily,
			generalSettings.fontFamilyCode
		);
	}, [generalSettings.fontFamily, generalSettings.fontFamilyCode]);

	return (
		<ConfigProvider theme={studioTheme} locale={antdLocale}>
			<AntdApp component="div" className={styles.root}>
				{children}
				<InputContextMenu />
			</AntdApp>
		</ConfigProvider>
	);
}

export default WindowProviders;

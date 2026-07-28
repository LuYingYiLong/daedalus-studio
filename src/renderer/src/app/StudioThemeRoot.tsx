import { useCallback, useEffect, useMemo, useState } from "react";
import { App as AntdApp, ConfigProvider, type ThemeConfig } from "antd";
import enUS from "antd/locale/en_US";
import zhCN from "antd/locale/zh_CN";
import i18n from "@/i18n";
import Titlebar from "@/app/layout/Titlebar";
import App from "./App";
import SettingsWindow from "./SettingsWindow";
import BootSplash from "./BootSplash";
import type { BootstrapData } from "./bootstrap";
import useClientPreferencesController from "./hooks/useClientPreferencesController";
import { createStudioTheme } from "@/styles/studio-theme";
import styles from "./StudioThemeRoot.module.css";

function StudioThemeRoot(): React.JSX.Element {
	const [bootstrapData, setBootstrapData] = useState<BootstrapData | null>(null);
	const { resolvedTheme, resolvedLanguage } = useClientPreferencesController();
	const studioTheme: ThemeConfig = useMemo((): ThemeConfig => createStudioTheme(resolvedTheme), [resolvedTheme]);
	const antdLocale = resolvedLanguage === "zh-CN" ? zhCN : enUS;
	const isSettingsWindow: boolean = new URLSearchParams(window.location.search).get("view") === "settings";
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

	return (
		<ConfigProvider theme={studioTheme} locale={antdLocale}>
			<AntdApp component="div" className={styles.root}>
				<Titlebar />
				{bootstrapData === null ? <BootSplash onReady={handleBootstrapReady} /> : (
					isSettingsWindow ? <SettingsWindow bootstrapData={bootstrapData} /> : <App bootstrapData={bootstrapData} />
				)}
			</AntdApp>
		</ConfigProvider>
	);
}

export default StudioThemeRoot;

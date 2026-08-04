import { useEffect, useMemo } from "react";
import { App as AntdApp, ConfigProvider, type ThemeConfig } from "antd";
import enUS from "antd/locale/en_US";
import zhCN from "antd/locale/zh_CN";
import i18n from "@/i18n";
import useClientPreferencesController from "./hooks/useClientPreferencesController";
import { createStudioTheme } from "@/styles/studio-theme";
import { applyStudioAccentVariables } from "../../../theme-color";
import InputContextMenu from "@/shared/components/InputContextMenu";
import styles from "./WindowProviders.module.css";

type WindowProvidersProps = {
	children: React.ReactNode;
};

function WindowProviders({ children }: WindowProvidersProps): React.JSX.Element {
	const { resolvedTheme, resolvedLanguage, themeColor } = useClientPreferencesController();
	const studioTheme: ThemeConfig = useMemo(
		(): ThemeConfig => createStudioTheme(resolvedTheme, themeColor),
		[resolvedTheme, themeColor]
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

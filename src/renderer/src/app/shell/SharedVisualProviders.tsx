import { useEffect, useMemo } from "react";
import { App as AntdApp, ConfigProvider, type ThemeConfig } from "antd";
import enUS from "antd/locale/en_US";
import zhCN from "antd/locale/zh_CN";
import i18n, { type ResolvedLanguage } from "@/platform/i18n";
import { createStudioTheme, type ResolvedTheme } from "@/ui/styles/studio-theme";
import { applyStudioAccentVariables } from "../../../../contracts/theme-color";
import { applyStudioFontVariables } from "../../../../contracts/studio-fonts";
import { Icon } from "@/assets/icons";

export type SharedVisualProvidersProps = {
	children: React.ReactNode;
	resolvedTheme: ResolvedTheme;
	resolvedLanguage: ResolvedLanguage;
	themeColor: string;
	fontFamily: string;
	fontFamilyCode: string;
	uiFontSize: number;
	codeFontSize: number;
	animationsEnabled: boolean;
	className?: string;
};

function SharedVisualProviders({
	children,
	resolvedTheme,
	resolvedLanguage,
	themeColor,
	fontFamily,
	fontFamilyCode,
	uiFontSize,
	codeFontSize,
	animationsEnabled,
	className,
}: SharedVisualProvidersProps): React.JSX.Element {
	const studioTheme: ThemeConfig = useMemo((): ThemeConfig => createStudioTheme(
		resolvedTheme,
		themeColor,
		fontFamily,
		fontFamilyCode,
		uiFontSize,
	), [fontFamily, fontFamilyCode, resolvedTheme, themeColor, uiFontSize]);
	const antdLocale = resolvedLanguage === "zh-CN" ? zhCN : enUS;

	useEffect((): void => {
		document.documentElement.dataset.theme = resolvedTheme;
		applyStudioAccentVariables(document.documentElement.style, resolvedTheme, themeColor);
	}, [resolvedTheme, themeColor]);

	useEffect((): void => {
		document.documentElement.lang = resolvedLanguage;
		void i18n.changeLanguage(resolvedLanguage);
	}, [resolvedLanguage]);

	useEffect((): void => {
		applyStudioFontVariables(document.documentElement.style, fontFamily, fontFamilyCode, uiFontSize, codeFontSize);
	}, [codeFontSize, fontFamily, fontFamilyCode, uiFontSize]);

	useEffect((): void => {
		document.documentElement.dataset.motion = animationsEnabled ? "on" : "off";
	}, [animationsEnabled]);

	return (
		<ConfigProvider
			theme={studioTheme}
			locale={antdLocale}
			select={{ suffixIcon: <Icon name="arrow-down" />, removeIcon: <Icon name="clear" />, menuItemSelectedIcon: <Icon name="check" /> }}
			spin={{ indicator: <Icon name="spin-indicator" className="spinner" /> }}
			collapse={{ expandIcon: ({ isActive }) => <span className={`collapseExpandIcon ${isActive ? "collapseExpandIconActive" : ""}`}><Icon name="arrow-down" /></span> }}
			modal={{ closeIcon: <Icon name="close" /> }}
			tabs={{ moreIcon: <Icon name="more-h" /> }}
			menu={{ expandIcon: <Icon name="arrow-forward" /> }}
		>
			<AntdApp component="div" className={className}>{children}</AntdApp>
		</ConfigProvider>
	);
}

export default SharedVisualProviders;

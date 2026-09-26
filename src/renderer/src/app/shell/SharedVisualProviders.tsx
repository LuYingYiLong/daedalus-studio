import { useEffect, useMemo } from "react";
import { App as AntdApp, ConfigProvider, type ThemeConfig } from "antd";
import enUS from "antd/locale/en_US";
import zhCN from "antd/locale/zh_CN";
import i18n, { type ResolvedLanguage } from "@/platform/i18n";
import { createStudioTheme, type StudioThemeVariant } from "@/ui/styles/studio-theme";
import type { ResolvedTheme } from "@/domain/theme/studio-theme-preference";
import { applyStudioAccentVariables } from "../../../../contracts/theme-color";
import { applyStudioFontVariables } from "../../../../contracts/studio-fonts";
import { applyStudioBackgroundVariables, DEFAULT_BACKGROUND_IMAGE_BLUR, DEFAULT_BACKGROUND_IMAGE_FIT, DEFAULT_BACKGROUND_IMAGE_OPACITY, type BackgroundImageFit, type BackgroundImagePreference } from "../../../../contracts/appearance-background";
import { Icon } from "@/assets/icons";

export type SharedVisualProvidersProps = {
	children: React.ReactNode;
	resolvedTheme: ResolvedTheme;
	resolvedLanguage: ResolvedLanguage;
	themeColor: string;
	fontFamily: string;
	fontFamilyCode: string;
	backgroundImage?: BackgroundImagePreference | null;
	backgroundImageOpacity?: number;
	backgroundImageBlur?: number;
	backgroundImageFit?: BackgroundImageFit;
	uiFontSize: number;
	codeFontSize: number;
	animationsEnabled: boolean;
	themeVariant?: StudioThemeVariant;
	className?: string;
};

function SharedVisualProviders({
	children,
	resolvedTheme,
	resolvedLanguage,
	themeColor,
	fontFamily,
	fontFamilyCode,
	backgroundImage = null,
	backgroundImageOpacity = DEFAULT_BACKGROUND_IMAGE_OPACITY,
	backgroundImageBlur = DEFAULT_BACKGROUND_IMAGE_BLUR,
	backgroundImageFit = DEFAULT_BACKGROUND_IMAGE_FIT,
	uiFontSize,
	codeFontSize,
	animationsEnabled,
	themeVariant = "desktop",
	className,
}: SharedVisualProvidersProps): React.JSX.Element {
	const studioTheme: ThemeConfig = useMemo(
		(): ThemeConfig =>
			createStudioTheme(resolvedTheme, themeColor, fontFamily, fontFamilyCode, uiFontSize, themeVariant),
		[fontFamily, fontFamilyCode, resolvedTheme, themeColor, themeVariant, uiFontSize],
	);
	const antdLocale = resolvedLanguage === "zh-CN" ? zhCN : enUS;

	useEffect((): void => {
		document.documentElement.dataset.theme = resolvedTheme;
		document.documentElement.dataset.themeVariant = themeVariant;
		applyStudioAccentVariables(document.documentElement.style, resolvedTheme, themeColor);
	}, [resolvedTheme, themeColor, themeVariant]);

	useEffect((): void => {
		document.documentElement.lang = resolvedLanguage;
		void i18n.changeLanguage(resolvedLanguage);
	}, [resolvedLanguage]);

	useEffect((): void => {
		applyStudioFontVariables(document.documentElement.style, fontFamily, fontFamilyCode, uiFontSize, codeFontSize);
	}, [codeFontSize, fontFamily, fontFamilyCode, uiFontSize]);

	useEffect((): void => {
		applyStudioBackgroundVariables(document.documentElement.style, {
			image: backgroundImage,
			opacity: backgroundImageOpacity,
			blur: backgroundImageBlur,
			fit: backgroundImageFit,
		});
	}, [backgroundImage, backgroundImageBlur, backgroundImageFit, backgroundImageOpacity]);

	useEffect((): void => {
		document.documentElement.dataset.motion = animationsEnabled ? "on" : "off";
	}, [animationsEnabled]);

	return (
		<ConfigProvider
			theme={studioTheme}
			locale={antdLocale}
			select={{
				suffixIcon: <Icon name="arrow-down" />,
				removeIcon: <Icon name="clear" />,
				menuItemSelectedIcon: <Icon name="check" />,
			}}
			spin={{ indicator: <Icon name="spin-indicator" className="spinner" /> }}
			notification={{ closeIcon: <Icon name="close" /> }}
			collapse={{
				expandIcon: ({ isActive }) => (
					<span className={`collapseExpandIcon ${isActive ? "collapseExpandIconActive" : ""}`}>
						<Icon name="arrow-down" />
					</span>
				),
			}}
			modal={{ closeIcon: <Icon name="close" /> }}
			tabs={{ moreIcon: <Icon name="more-h" /> }}
			menu={{ expandIcon: <Icon name="arrow-forward" /> }}
		>
			<AntdApp component="div" className={className}>
				{children}
			</AntdApp>
		</ConfigProvider>
	);
}

export default SharedVisualProviders;

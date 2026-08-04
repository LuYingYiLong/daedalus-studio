import { theme as antdTheme, type ThemeConfig } from "antd";
import {
	createStudioAccentPalette,
	DEFAULT_STUDIO_THEME_COLOR,
	type ResolvedStudioTheme,
	type StudioAccentPalette
} from "../../../theme-color";

export { createStudioAccentPalette, DEFAULT_STUDIO_THEME_COLOR } from "../../../theme-color";
export type { StudioAccentPalette } from "../../../theme-color";

export type ResolvedTheme = ResolvedStudioTheme;
export type ThemePreference = ResolvedTheme | "system";

type StudioThemeColors = {
	bg: string;
	surface: string;
	surfaceElevated: string;
	surfaceHover: string;
	border: string;
	textPrimary: string;
	textSecondary: string;
	textMuted: string;
};

const studioThemeColors: Record<ResolvedTheme, StudioThemeColors> = {
	dark: {
		bg: "#141414",
		surface: "#1b1b1b",
		surfaceElevated: "#1f1f1f",
		surfaceHover: "#242424",
		border: "#3b3b3b",
		textPrimary: "#e8e8e8",
		textSecondary: "#b8b8b8",
		textMuted: "#8c8c8c"
	},
	light: {
		bg: "#f5f5f5",
		surface: "#ffffff",
		surfaceElevated: "#ffffff",
		surfaceHover: "#f0f0f0",
		border: "#d6d6d6",
		textPrimary: "#141414",
		textSecondary: "#4f4f4f",
		textMuted: "#737373"
	}
};

const dsFontFamily = `"Mona Sans", "Wen Yuan Sans SC", "Microsoft YaHei UI", "Microsoft YaHei", system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`;
const dsFontFamilyCode = `"Fira Code", "Cascadia Code", "SFMono-Regular", Consolas, "Liberation Mono", Menlo, Courier, monospace`;

export function resolveThemePreference(themePreference: ThemePreference, systemTheme: ResolvedTheme): ResolvedTheme {
	return themePreference === "system" ? systemTheme : themePreference;
}

export function createStudioTheme(
	resolvedTheme: ResolvedTheme,
	themeColor: string = DEFAULT_STUDIO_THEME_COLOR
): ThemeConfig {
	const dsColors: StudioThemeColors = studioThemeColors[resolvedTheme];
	const accent: StudioAccentPalette = createStudioAccentPalette(resolvedTheme, themeColor);

	return {
		algorithm: resolvedTheme === "dark" ? antdTheme.darkAlgorithm : antdTheme.defaultAlgorithm,
		token: {
			borderRadiusXS: 4,
			borderRadiusSM: 6,
			borderRadius: 6,
			borderRadiusLG: 8,
			colorBgBase: dsColors.bg,
			colorBgContainer: dsColors.surface,
			colorBgElevated: dsColors.surfaceElevated,
			colorBgLayout: dsColors.bg,
			colorBorder: dsColors.border,
			colorBorderSecondary: dsColors.border,
			colorFillQuaternary: dsColors.surfaceHover,
			colorPrimary: accent.primary,
			colorPrimaryActive: accent.active,
			colorPrimaryHover: accent.hover,
			colorText: dsColors.textPrimary,
			colorTextSecondary: dsColors.textSecondary,
			colorTextTertiary: dsColors.textMuted,
			controlHeight: 28,
			controlHeightLG: 32,
			controlHeightSM: 24,
			fontFamily: dsFontFamily,
			fontFamilyCode: dsFontFamilyCode,
			padding: 8,
			margin: 8,
			marginXS: 4,
			marginSM: 8,
			paddingXS: 4,
			paddingSM: 8,
			paddingLG: 16,
		},
		components: {
			Button: {
				borderRadius: 6,
				dangerShadow: "none",
				defaultShadow: "none",
				iconGap: 4,
				paddingInline: 8,
				paddingInlineLG: 8,
				primaryShadow: "none"
			},
			Tree: {
				indentSize: 24,
				nodeSelectedBg: accent.muted
			},
			Menu: {
				darkItemBg: "transparent",
				darkItemHoverBg: dsColors.surfaceHover,
				darkItemSelectedBg: accent.muted,
				darkItemSelectedColor: dsColors.textPrimary,
				itemBg: "transparent",
				itemBorderRadius: 4,
				itemHeight: 28,
				itemHoverBg: dsColors.surfaceHover,
				itemPaddingInline: 8,
				itemSelectedBg: accent.muted,
				subMenuItemBg: "transparent"
			},
			Alert: {
				defaultPadding: 8,
				withDescriptionPadding: 8
			},
			Form: {
				itemMarginBottom: 4
			},
			Table: {
				cellPaddingBlock: 8,
				cellPaddingInline: 8
			},
			Progress: {
				lineBorderRadius: 4
			},
			Steps: {
				iconFontSize: 8
			},
			Modal: {
				padding: 8
			},
			Card: {
				bodyPaddingSM: 8,
				bodyPadding: 8,
				headerPadding: 8,
				headerPaddingSM: 8
			}
		}
	};
}

import { theme as antdTheme, type ThemeConfig } from "antd";

export type ResolvedTheme = "light" | "dark";
export type ThemePreference = ResolvedTheme | "system";

type StudioThemeColors = {
	accent: string;
	accentHover: string;
	accentActive: string;
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
		accent: "#478cbf",
		accentHover: "#5aa0d2",
		accentActive: "#386f98",
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
		accent: "#478cbf",
		accentHover: "#5aa0d2",
		accentActive: "#386f98",
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

export function createStudioTheme(resolvedTheme: ResolvedTheme): ThemeConfig {
	const dsColors: StudioThemeColors = studioThemeColors[resolvedTheme];

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
			paddingXS: 4
		},
		components: {
			Button: {
				borderRadius: 4,
				dangerShadow: "none",
				defaultShadow: "none",
				iconGap: 4,
				paddingInline: 8,
				paddingInlineLG: 8,
				primaryShadow: "none"
			},
			Tree: {
				indentSize: 16
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
				headerBorderRadius: 4,
				borderRadius: 4,
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

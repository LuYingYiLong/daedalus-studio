import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { ConfigProvider, theme } from "antd";
import { probeBackendWorkspaceAndSessions } from "./api/dev-backend-probe";
import Titlebar from "./components/Titlebar";
import App from "./app/App";
import "./styles/global.css";
import "./styles/markdown.css";

const rootElement = document.getElementById("root");
const dsColors = {
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

const dsFontFamily = `"Mona Sans", "Wen Yuan Sans SC", "Microsoft YaHei UI", "Microsoft YaHei", system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`;
const dsFontFamilyCode = `"Fira Code", "Cascadia Code", "SFMono-Regular", Consolas, "Liberation Mono", Menlo, Courier, monospace`;

if (!rootElement) {
	throw new Error("Root element not found");
}

createRoot(rootElement).render(
	<StrictMode>
		<ConfigProvider
			theme={{
				algorithm: theme.darkAlgorithm,
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
						itemPaddingInline: 8,
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
			}}
		>
			<Titlebar />
			<App />
		</ConfigProvider>
	</StrictMode>
);

void probeBackendWorkspaceAndSessions();

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { ConfigProvider, theme } from "antd";
import { probeBackendWorkspaceAndSessions } from "./api/dev-backend-probe";
import Titlebar from "./components/Titlebar";
import App from "./app/App";
import "./styles/global.css";
import "./styles/markdown.css";

const rootElement = document.getElementById("root");

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
					colorPrimary: "#478cbf",
					fontFamily: `"Mona Sans", "Source Han Sans SC", "Microsoft YaHei UI", "Microsoft YaHei", system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`,
					// fontFamilyCode: `"Cascadia Code", "JetBrains Mono", "SFMono-Regular", Consolas, Arial, Helvetica, sans-serif"`,
				},
				components: {
					Button: {
						iconGap: 4,
						paddingInline: 8,
						paddingInlineLG: 8,
					},
					Tree: {
						indentSize: 16,
					},
					Menu: {
						itemBorderRadius: 4,
						itemHeight: 28,
						itemPaddingInline: 8,
						subMenuItemBg: "#ffffff00",
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
					},
					Progress: {
						lineBorderRadius: 4,
					},
					Steps: {
						iconFontSize: 8,
					},
					Modal: {
						padding: 8,
					}
				}
			}}
		>
			<Titlebar />
			<App />
		</ConfigProvider>
	</StrictMode>
);

void probeBackendWorkspaceAndSessions();

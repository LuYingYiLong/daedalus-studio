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
					colorPrimary: "#478cbf",
					fontFamily: `"Mona Sans", "Microsoft YaHei UI", "Microsoft YaHei", system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`,
				},
				components: {
					Tree: {
						indentSize: 16,
					},
					Menu: {
						itemBorderRadius: 4,
						itemHeight: 28,
						itemPaddingInline: 8,
						subMenuItemBg: "#ffffff00",
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

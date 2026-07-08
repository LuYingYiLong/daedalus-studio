import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { ConfigProvider, theme } from "antd";
import { probeBackendWorkspaceAndSessions } from "./api/dev-backend-probe";
import Titlebar from "./components/Titlebar";
import App from "./app/App";
import "./styles/global.css";

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
					borderRadius: 4
				},
				components: {
					Tree: {
						indentSize: 16,
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

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { ConfigProvider, theme } from "antd";
import Titlebar from "./Titlebar";
import BootSplash from "./BootSplash";
import App from "./App";
import "./App.css";

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
				}
			}}
		>
			<Titlebar />
			<BootSplash />
		</ConfigProvider>
	</StrictMode>
);

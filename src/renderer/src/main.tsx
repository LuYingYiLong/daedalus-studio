import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import MainWindowRoot from "./app/MainWindowRoot";
import SettingsWindow from "./app/SettingsWindow";
import WindowProviders from "./app/WindowProviders";
import "react-diff-view/style/index.css";
import "./styles/global.css";
import "./styles/markdown.css";

const rootElement = document.getElementById("root");

if (!rootElement) {
	throw new Error("Root element not found");
}

const isSettingsWindow: boolean = new URLSearchParams(window.location.search).get("view") === "settings";
if (isSettingsWindow) {
	document.title = "Settings";
}

createRoot(rootElement).render(
	<StrictMode>
		<WindowProviders>
			{isSettingsWindow ? <SettingsWindow /> : <MainWindowRoot />}
		</WindowProviders>
	</StrictMode>
);

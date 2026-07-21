import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import StudioThemeRoot from "./app/StudioThemeRoot";
import "react-diff-view/style/index.css";
import "./styles/global.css";
import "./styles/markdown.css";

const rootElement = document.getElementById("root");

if (!rootElement) {
	throw new Error("Root element not found");
}

createRoot(rootElement).render(
	<StrictMode>
		<StudioThemeRoot />
	</StrictMode>
);

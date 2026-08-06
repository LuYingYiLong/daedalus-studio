import { StrictMode } from "react";
import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";
import MainWindowRoot from "./app/MainWindowRoot";
import MainWindowErrorBoundary from "./app/MainWindowErrorBoundary";
import SettingsWindow from "./app/SettingsWindow";
import WindowProviders from "./app/WindowProviders";
import "react-diff-view/style/index.css";
import "./styles/global.css";
import "./styles/markdown.css";
import { waitForStudioFonts } from "./styles/studio-fonts";
import { waitForRendererPaint } from "./app/renderer-paint";

const rootElement = document.getElementById("root");

if (!rootElement) {
	throw new Error("Root element not found");
}
const rendererRootElement: HTMLElement = rootElement;

const isSettingsWindow: boolean = new URLSearchParams(window.location.search).get("view") === "settings";
if (isSettingsWindow) {
	document.title = "Settings";
}

async function startRenderer(): Promise<void> {
	if (isSettingsWindow) {
		rendererRootElement.innerHTML = `
			<div class="settings-window-warmup" aria-hidden="true">
				<span class="settings-window-warmup__indicator"></span>
			</div>
		`;
		window.electronAPI.windowControl.rendererShellReady();
	}
	await waitForStudioFonts(document.fonts);
	const root = createRoot(rendererRootElement);
	flushSync((): void => {
		root.render(
			<StrictMode>
				<MainWindowErrorBoundary>
					<WindowProviders>
						{isSettingsWindow ? <SettingsWindow /> : <MainWindowRoot />}
					</WindowProviders>
				</MainWindowErrorBoundary>
			</StrictMode>
		);
	});
	await waitForRendererPaint();
	window.electronAPI.windowControl.rendererReady();
}

void startRenderer();

import { StrictMode } from "react";
import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";
import MainWindowRoot from "./app/shell/MainWindowRoot";
import MainWindowErrorBoundary from "./app/errors/MainWindowErrorBoundary";
import SettingsWindow from "./app/shell/SettingsWindow";
import WindowProviders from "./app/shell/WindowProviders";
import "react-diff-view/style/index.css";
import "./ui/styles/global.css";
import "./ui/styles/markdown.css";
import { waitForStudioFonts } from "./ui/styles/studio-fonts";
import { waitForGlobalStyles, waitForRendererPaint } from "./app/runtime/renderer-paint";
import { configurePlatformRuntime } from "./platform/runtime/platform-runtime";
import { desktopPlatformRuntime } from "./platform/runtime/desktop-platform-runtime";

configurePlatformRuntime(desktopPlatformRuntime);

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
	await waitForGlobalStyles();
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
	if (isSettingsWindow) {
		window.electronAPI.windowControl.rendererReady();
	}
}

void startRenderer();

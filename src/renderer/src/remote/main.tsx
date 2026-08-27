import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { configurePlatformRuntime } from "@/platform/runtime/platform-runtime";
import { remotePlatformRuntime } from "@/platform/runtime/remote-platform-runtime";
import RemoteProviders from "./RemoteProviders";
import RemoteApp from "./RemoteApp";
import "react-diff-view/style/index.css";
import "@/ui/styles/global.css";
import "@/ui/styles/markdown.css";

configurePlatformRuntime(remotePlatformRuntime);

const rootElement: HTMLElement | null = document.getElementById("root");
if (rootElement === null) throw new Error("Remote root element not found");

createRoot(rootElement).render(<StrictMode><RemoteProviders><RemoteApp /></RemoteProviders></StrictMode>);

if ("serviceWorker" in navigator) {
	window.addEventListener("load", (): void => {
		void navigator.serviceWorker.register("/remote-sw.js", { scope: "/" }).catch((error: unknown): void => {
			// Online remote control must remain usable when the local CA has not
			// yet been trusted deeply enough for Service Worker registration.
			console.warn("[Daedalus Remote] Service Worker registration failed", error);
		});
	});
}

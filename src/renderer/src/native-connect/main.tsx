import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import RemoteProviders from "@/remote/RemoteProviders";
import NativeConnectApp from "./NativeConnectApp";
import "@/ui/styles/global.css";

const rootElement: HTMLElement | null = document.getElementById("root");
if (rootElement === null) throw new Error("Native connect root element not found");

createRoot(rootElement).render(
	<StrictMode>
		<RemoteProviders>
			<NativeConnectApp />
		</RemoteProviders>
	</StrictMode>,
);

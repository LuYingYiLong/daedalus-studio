import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import RemoteProviders from "./RemoteProviders";
import RemoteConnectApp from "./RemoteConnectApp";
import "@/ui/styles/global.css";

const rootElement: HTMLElement | null = document.getElementById("root");
if (rootElement === null) throw new Error("Native connect root element not found");

createRoot(rootElement).render(
	<StrictMode>
		<RemoteProviders>
			<RemoteConnectApp />
		</RemoteProviders>
	</StrictMode>,
);

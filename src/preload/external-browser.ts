import { ipcRenderer } from "electron";
import type {
	ExternalBrowserApi,
	ExternalBrowserScope,
	ExternalBrowserState,
} from "../contracts/external-browser";
function subscribe<T>(
	channel: string,
	listener: (value: T) => void,
): () => void {
	const handler = (_event: Electron.IpcRendererEvent, value: T): void =>
		listener(value);
	ipcRenderer.on(channel, handler);
	return () => {
		ipcRenderer.removeListener(channel, handler);
	};
}
export const externalBrowserBridge: ExternalBrowserApi = {
	getState: () => ipcRenderer.invoke("external-browser:getState"),
	configure: (patch) => ipcRenderer.invoke("external-browser:configure", patch),
	install: () => ipcRenderer.invoke("external-browser:install"),
	setContext: (context) =>
		ipcRenderer.invoke("external-browser:setContext", context),
	execute: (request) => ipcRenderer.invoke("external-browser:execute", request),
	finish: (scope, keepTarget) =>
		ipcRenderer.invoke("external-browser:finish", { scope, keepTarget }),
	heartbeat: (scope) => ipcRenderer.invoke("external-browser:heartbeat", scope),
	stop: () => ipcRenderer.invoke("external-browser:stop"),
	onState: (listener) =>
		subscribe<ExternalBrowserState>("external-browser:state", listener),
	onRevoked: (listener) =>
		subscribe<ExternalBrowserScope>("external-browser:revoked", listener),
};

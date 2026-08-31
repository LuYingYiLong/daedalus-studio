type ChromeEvent<T extends (...args: never[]) => unknown> = {
	addListener(listener: T): void;
};
export type Tab = {
	id?: number;
	url?: string;
	title?: string;
	active?: boolean;
	windowId?: number;
};
export type NativePort = {
	postMessage(message: unknown): void;
	disconnect(): void;
	onMessage: ChromeEvent<(message: unknown) => void>;
	onDisconnect: ChromeEvent<() => void>;
};
export type ChromeApi = {
	runtime: {
		connectNative(name: string): NativePort;
		getURL(path: string): string;
		lastError?: { message?: string };
		onMessage: ChromeEvent<
			(
				message: unknown,
				sender: { url?: string },
				respond: (value: unknown) => void,
			) => boolean | void
		>;
	};
	storage: {
		local: {
			get(key: string): Promise<Record<string, unknown>>;
			set(value: Record<string, unknown>): Promise<void>;
		};
	};
	tabs: {
		query(query: Record<string, unknown>): Promise<Tab[]>;
		get(id: number): Promise<Tab>;
		create(options: { url: string; active: boolean }): Promise<Tab>;
		onRemoved: ChromeEvent<(id: number) => void>;
		onUpdated: ChromeEvent<
			(id: number, change: { url?: string; status?: string }) => void
		>;
	};
	debugger: {
		attach(target: { tabId: number }, version: string): Promise<void>;
		detach(target: { tabId: number }): Promise<void>;
		sendCommand(
			target: { tabId: number },
			method: string,
			params?: Record<string, unknown>,
		): Promise<unknown>;
		onDetach: ChromeEvent<(target: { tabId?: number }, reason: string) => void>;
		onEvent: ChromeEvent<
			(
				target: { tabId?: number },
				method: string,
				params?: Record<string, unknown>,
			) => void
		>;
	};
	action: { setBadgeText(options: { text: string }): Promise<void> };
};
declare global {
	const chrome: ChromeApi;
	const __BROWSER_CHANNEL__: string;
}

export interface BrowserCdpTransport {
	acquire(owner: string): Promise<() => void>;
	sendCommand<T = unknown>(
		method: string,
		params?: Record<string, unknown>,
	): Promise<T>;
}
export interface BrowserAutomationPage {
	loadURL(url: string): Promise<unknown>;
	getURL(): string;
	getTitle(): string;
	isLoading(): boolean;
	capturePage(): Promise<{ toPNG(): Buffer }>;
	navigationHistory: {
		canGoBack(): boolean;
		canGoForward(): boolean;
		goBack(): void;
		goForward(): void;
	};
	reload(): void;
}

export type BrowserViewState = {
	browserId: string;
	url: string | null;
	title: string;
	isLoading: boolean;
	canGoBack: boolean;
	canGoForward: boolean;
	error: string | null;
};

export type BrowserViewBounds = {
	x: number;
	y: number;
	width: number;
	height: number;
};

export type BrowserHistoryEntry = {
	id: string;
	url: string;
	title: string;
	visitedAt: string;
};

export type BrowserDownloadState = "progressing" | "completed" | "cancelled" | "interrupted";

export type BrowserDownloadRecord = {
	id: string;
	url: string;
	fileName: string;
	savePath: string;
	receivedBytes: number;
	totalBytes: number;
	state: BrowserDownloadState;
	startedAt: string;
	finishedAt: string | null;
};

export type BrowserPermissionDecision = "allow" | "block";

export type BrowserPermissionRule = {
	origin: string;
	permission: string;
	decision: BrowserPermissionDecision;
	updatedAt: string;
};

export type BrowserPermissionRequest = {
	id: string;
	browserId: string;
	origin: string;
	permission: string;
};

export type BrowserCredentialSummary = {
	id: string;
	origin: string;
	username: string;
	createdAt: string;
	updatedAt: string;
};

export type BrowserProfileSource = "chrome" | "edge";

export type BrowserImportProfile = {
	source: BrowserProfileSource;
	profileId: string;
	name: string;
};

export type BrowserImportResult = {
	cookiesImported: number;
	passwordsImported: number;
	skipped: number;
	unsupported: number;
	errors: string[];
};

export type BrowserElementSnapshot = {
	url: string;
	pageTitle: string;
	selector: string;
	tagName: string;
	role: string;
	accessibleName: string;
	selectedText: string;
	attributes: Record<string, string>;
	viewportRect: {
		x: number;
		y: number;
		width: number;
		height: number;
	};
};

export type BrowserSettings = {
	downloadDirectory: string | null;
	askWhereToSave: boolean;
	savePasswordsEnabled: boolean;
	permissionRules: BrowserPermissionRule[];
};

export type BrowserClearDataOptions = {
	timeRange: "lastHour" | "last24Hours" | "last7Days" | "last4Weeks" | "allTime";
	history: boolean;
	downloads: boolean;
	cookiesAndStorage: boolean;
	cache: boolean;
	passwords: boolean;
};

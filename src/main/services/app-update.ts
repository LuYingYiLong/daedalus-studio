import { app, BrowserWindow, ipcMain } from "electron";
import electronUpdater from "electron-updater";
import type { ProgressInfo, UpdateInfo } from "electron-updater";

export type AppUpdateStatus =
	| "idle"
	| "checking"
	| "available"
	| "downloading"
	| "downloaded"
	| "installing"
	| "not_available"
	| "error"
	| "unsupported";

export type AppUpdateState = {
	status: AppUpdateStatus;
	currentVersion: string;
	availableVersion: string | null;
	releaseName: string | null;
	releaseDate: string | null;
	progress: number | null;
	errorMessage: string | null;
};

export type AppUpdateServiceOptions = {
	isPackaged?: boolean;
	currentVersion?: string;
	autoUpdater?: AppUpdaterLike;
	sendEvent?: (channel: "app-update:state-changed", payload: AppUpdateState) => void;
	installDelayMs?: number;
};

type AppUpdateEventName =
	| "checking-for-update"
	| "update-available"
	| "update-not-available"
	| "download-progress"
	| "update-downloaded"
	| "error";

type AppUpdateEventMap = {
	"checking-for-update": [];
	"update-available": [UpdateInfo];
	"update-not-available": [UpdateInfo];
	"download-progress": [ProgressInfo];
	"update-downloaded": [UpdateInfo];
	"error": [Error];
};

type AppUpdateEventHandler<TEventName extends AppUpdateEventName> = (...args: AppUpdateEventMap[TEventName]) => void;

type AppUpdaterLike = {
	autoDownload: boolean;
	allowPrerelease: boolean;
	checkForUpdates: () => Promise<unknown>;
	downloadUpdate: () => Promise<unknown>;
	quitAndInstall: (isSilent: boolean, isForceRunAfter: boolean) => void;
	on: (eventName: AppUpdateEventName, handler: (...args: unknown[]) => void) => unknown;
};

function createNoopAutoUpdater(): AppUpdaterLike {
	return {
		autoDownload: false,
		allowPrerelease: false,
		async checkForUpdates(): Promise<null> {
			return null;
		},
		async downloadUpdate(): Promise<string[]> {
			return [];
		},
		quitAndInstall(): void {},
		on(): AppUpdaterLike {
			return this;
		}
	};
}

function getDefaultIsPackaged(): boolean {
	return app?.isPackaged === true;
}

function getDefaultCurrentVersion(): string {
	return typeof app?.getVersion === "function" ? app.getVersion() : "0.0.0";
}

function getAutoUpdater(): AppUpdaterLike {
	const { autoUpdater } = electronUpdater;
	return autoUpdater as unknown as AppUpdaterLike;
}

function createInitialState(currentVersion: string, isPackaged: boolean): AppUpdateState {
	return {
		status: isPackaged ? "idle" : "unsupported",
		currentVersion,
		availableVersion: null,
		releaseName: null,
		releaseDate: null,
		progress: null,
		errorMessage: isPackaged ? null : "Updates are only available in packaged builds."
	};
}

function getUpdateReleaseName(info: UpdateInfo): string | null {
	return typeof info.releaseName === "string" && info.releaseName.trim().length > 0
		? info.releaseName
		: null;
}

function getUpdateReleaseDate(info: UpdateInfo): string | null {
	return typeof info.releaseDate === "string" && info.releaseDate.trim().length > 0
		? info.releaseDate
		: null;
}

function getErrorMessage(error: Error): string {
	return error.message.trim().length > 0 ? error.message : "Update check failed.";
}

function broadcastAppUpdateEvent(channel: "app-update:state-changed", payload: AppUpdateState): void {
	for (const browserWindow of BrowserWindow?.getAllWindows?.() ?? []) {
		if (browserWindow.isDestroyed()) {
			continue;
		}
		browserWindow.webContents.send(channel, payload);
	}
}

export class AppUpdateService {
	private readonly isPackaged: boolean;
	private readonly autoUpdater: AppUpdaterLike;
	private readonly sendEvent: (channel: "app-update:state-changed", payload: AppUpdateState) => void;
	private readonly installDelayMs: number;
	private state: AppUpdateState;
	private checkPromise: Promise<void> | null = null;
	private downloadPromise: Promise<AppUpdateState> | null = null;
	private initialized: boolean = false;

	public constructor(options: AppUpdateServiceOptions = {}) {
		this.isPackaged = options.isPackaged ?? getDefaultIsPackaged();
		this.autoUpdater = options.autoUpdater ?? (this.isPackaged ? getAutoUpdater() : createNoopAutoUpdater());
		this.autoUpdater.autoDownload = false;
		this.autoUpdater.allowPrerelease = false;
		this.sendEvent = options.sendEvent ?? broadcastAppUpdateEvent;
		this.installDelayMs = options.installDelayMs ?? 1200;
		this.state = createInitialState(options.currentVersion ?? getDefaultCurrentVersion(), this.isPackaged);
		this.registerUpdaterEvents();
	}

	public getState(): AppUpdateState {
		return { ...this.state };
	}

	public async checkForUpdatesIfEnabled(enabled: boolean): Promise<AppUpdateState> {
		if (!enabled) {
			return this.getState();
		}
		await this.checkForUpdates();
		return this.getState();
	}

	public async checkForUpdates(): Promise<AppUpdateState> {
		if (!this.isPackaged) {
			this.setState({
				status: "unsupported",
				progress: null,
				errorMessage: "Updates are only available in packaged builds."
			});
			return this.getState();
		}
		if (this.checkPromise !== null) {
			await this.checkPromise;
			return this.getState();
		}

		this.checkPromise = this.runUpdateCheck();
		try {
			await this.checkPromise;
			return this.getState();
		} finally {
			this.checkPromise = null;
		}
	}

	public async download(): Promise<AppUpdateState> {
		if (!this.isPackaged) {
			this.setState({
				status: "unsupported",
				progress: null,
				errorMessage: "Updates are only available in packaged builds."
			});
			return this.getState();
		}
		if (this.state.status === "downloading" || this.state.status === "downloaded" || this.state.status === "installing") {
			return this.getState();
		}
		if (this.state.status !== "available" && this.state.status !== "error") {
			return this.getState();
		}
		if (this.downloadPromise !== null) {
			return await this.downloadPromise;
		}

		this.downloadPromise = this.runDownload();
		try {
			return await this.downloadPromise;
		} finally {
			this.downloadPromise = null;
		}
	}

	public registerIpc(): void {
		if (this.initialized) {
			return;
		}
		this.initialized = true;
		if (typeof ipcMain?.handle !== "function") {
			return;
		}
		ipcMain.handle("app-update:get-state", (): AppUpdateState => this.getState());
		ipcMain.handle("app-update:download", async (): Promise<AppUpdateState> => await this.download());
	}

	private async runUpdateCheck(): Promise<void> {
		this.setState({
			status: "checking",
			progress: null,
			errorMessage: null
		});
		try {
			await this.autoUpdater.checkForUpdates();
		} catch (error: unknown) {
			this.handleError(error instanceof Error ? error : new Error("Update check failed."));
		}
	}

	private async runDownload(): Promise<AppUpdateState> {
		this.setState({
			status: "downloading",
			progress: 0,
			errorMessage: null
		});
		try {
			await this.autoUpdater.downloadUpdate();
		} catch (error: unknown) {
			this.handleError(error instanceof Error ? error : new Error("Update download failed."));
		}
		return this.getState();
	}

	private registerUpdaterEvents(): void {
		this.onUpdaterEvent("checking-for-update", (): void => {
			this.setState({
				status: "checking",
				progress: null,
				errorMessage: null
			});
		});
		this.onUpdaterEvent("update-available", (info: UpdateInfo): void => {
			this.setState({
				status: "available",
				availableVersion: info.version,
				releaseName: getUpdateReleaseName(info),
				releaseDate: getUpdateReleaseDate(info),
				progress: null,
				errorMessage: null
			});
		});
		this.onUpdaterEvent("update-not-available", (info: UpdateInfo): void => {
			this.setState({
				status: "not_available",
				availableVersion: info.version,
				releaseName: getUpdateReleaseName(info),
				releaseDate: getUpdateReleaseDate(info),
				progress: null,
				errorMessage: null
			});
		});
		this.onUpdaterEvent("download-progress", (progress: ProgressInfo): void => {
			this.setState({
				status: "downloading",
				progress: Math.max(0, Math.min(100, progress.percent)),
				errorMessage: null
			});
		});
		this.onUpdaterEvent("update-downloaded", (info: UpdateInfo): void => {
			this.setState({
				status: "downloaded",
				availableVersion: info.version,
				releaseName: getUpdateReleaseName(info),
				releaseDate: getUpdateReleaseDate(info),
				progress: 100,
				errorMessage: null
			});
			setTimeout((): void => {
				this.setState({
					status: "installing",
					progress: 100,
					errorMessage: null
				});
				this.autoUpdater.quitAndInstall(false, true);
			}, this.installDelayMs);
		});
		this.onUpdaterEvent("error", (error: Error): void => {
			this.handleError(error);
		});
	}

	private onUpdaterEvent<TEventName extends AppUpdateEventName>(
		eventName: TEventName,
		handler: AppUpdateEventHandler<TEventName>
	): void {
		this.autoUpdater.on(eventName, handler as (...args: unknown[]) => void);
	}

	private handleError(error: Error): void {
		this.setState({
			status: "error",
			progress: null,
			errorMessage: getErrorMessage(error)
		});
	}

	private setState(patch: Partial<AppUpdateState>): void {
		this.state = {
			...this.state,
			...patch
		};
		this.sendEvent("app-update:state-changed", this.getState());
	}
}

export const appUpdateService: AppUpdateService = new AppUpdateService();

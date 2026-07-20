import { app, BrowserWindow, ipcMain } from "electron";
import electronUpdater from "electron-updater";
import type { ProgressInfo, UpdateInfo } from "electron-updater";
import WebSocket from "ws";
import { backendManager } from "./backend-manager";

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

export type AppUpdateKind = "client" | "backend" | "combined" | null;

export type AppUpdateComponentState = {
	status: AppUpdateStatus;
	currentVersion: string | null;
	availableVersion: string | null;
	releaseName: string | null;
	releaseDate: string | null;
	progress: number | null;
	errorMessage: string | null;
};

export type AppUpdateState = {
	status: AppUpdateStatus;
	updateKind: AppUpdateKind;
	currentVersion: string;
	availableVersion: string | null;
	releaseName: string | null;
	releaseDate: string | null;
	progress: number | null;
	errorMessage: string | null;
	client: AppUpdateComponentState;
	backend: AppUpdateComponentState;
};

export type BackendUpdateCheckResult = {
	currentVersion: string;
	installedVersion: string | null;
	latestVersion: string | null;
	updateAvailable: boolean;
	checkedAt: string;
	errorMessage: string | null;
};

export type BackendUpdateInstallResult = {
	installed: true;
	version: string;
	previousVersion: string | null;
	installedAt: string;
};

export type BackendUpdateClient = {
	check: () => Promise<BackendUpdateCheckResult>;
	install: (version: string | null) => Promise<BackendUpdateInstallResult>;
	restartAndWaitHealthy: () => Promise<void>;
};

export type AppUpdateServiceOptions = {
	isPackaged?: boolean;
	currentVersion?: string;
	autoUpdater?: AppUpdaterLike;
	backendUpdateClient?: BackendUpdateClient;
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

type BackendRpcResponse<TResult> =
	| {
		type: "response";
		id: string;
		ok: true;
		result: TResult;
	}
	| {
		type: "response";
		id: string;
		ok: false;
		error: {
			code: string;
			message: string;
		};
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
	return error.message.trim().length > 0 ? error.message : "Update failed.";
}

function getUnsupportedClientMessage(): string {
	return "Client updates are only available in packaged builds.";
}

function createComponentState(status: AppUpdateStatus, currentVersion: string | null, errorMessage: string | null = null): AppUpdateComponentState {
	return {
		status,
		currentVersion,
		availableVersion: null,
		releaseName: null,
		releaseDate: null,
		progress: null,
		errorMessage
	};
}

function getUpdateKind(client: AppUpdateComponentState, backend: AppUpdateComponentState): AppUpdateKind {
	const clientHasUpdate: boolean = client.status === "available"
		|| client.status === "downloading"
		|| client.status === "downloaded"
		|| client.status === "installing";
	const backendHasUpdate: boolean = backend.status === "available"
		|| backend.status === "downloading"
		|| backend.status === "downloaded"
		|| backend.status === "installing";

	if (clientHasUpdate && backendHasUpdate) {
		return "combined";
	}
	if (clientHasUpdate) {
		return "client";
	}
	if (backendHasUpdate) {
		return "backend";
	}
	return null;
}

function getOverallStatus(client: AppUpdateComponentState, backend: AppUpdateComponentState): AppUpdateStatus {
	const statuses: AppUpdateStatus[] = [client.status, backend.status];
	if (statuses.includes("installing")) {
		return "installing";
	}
	if (statuses.includes("downloading")) {
		return "downloading";
	}
	if (statuses.includes("downloaded")) {
		return "downloaded";
	}
	if (statuses.includes("available")) {
		return "available";
	}
	if (statuses.includes("checking")) {
		return "checking";
	}
	if (statuses.includes("error")) {
		return "error";
	}
	if (statuses.every((status: AppUpdateStatus): boolean => status === "unsupported")) {
		return "unsupported";
	}
	if (statuses.every((status: AppUpdateStatus): boolean => status === "not_available" || status === "unsupported")) {
		return "not_available";
	}
	return "idle";
}

function getPrimaryComponent(updateKind: AppUpdateKind, client: AppUpdateComponentState, backend: AppUpdateComponentState): AppUpdateComponentState {
	if (updateKind === "backend") {
		return backend;
	}
	if (updateKind === "combined") {
		return client.status === "available" || client.status === "downloading" || client.status === "downloaded" || client.status === "installing"
			? client
			: backend;
	}
	return client;
}

function getCombinedErrorMessage(client: AppUpdateComponentState, backend: AppUpdateComponentState): string | null {
	return client.errorMessage ?? backend.errorMessage;
}

function createState(client: AppUpdateComponentState, backend: AppUpdateComponentState): AppUpdateState {
	const updateKind: AppUpdateKind = getUpdateKind(client, backend);
	const primary: AppUpdateComponentState = getPrimaryComponent(updateKind, client, backend);
	return {
		status: getOverallStatus(client, backend),
		updateKind,
		currentVersion: client.currentVersion ?? "",
		availableVersion: primary.availableVersion,
		releaseName: primary.releaseName,
		releaseDate: primary.releaseDate,
		progress: primary.progress,
		errorMessage: getCombinedErrorMessage(client, backend),
		client: { ...client },
		backend: { ...backend }
	};
}

function broadcastAppUpdateEvent(channel: "app-update:state-changed", payload: AppUpdateState): void {
	for (const browserWindow of BrowserWindow?.getAllWindows?.() ?? []) {
		if (browserWindow.isDestroyed()) {
			continue;
		}
		browserWindow.webContents.send(channel, payload);
	}
}

function isBackendRpcResponse<TResult>(value: unknown, id: string): value is BackendRpcResponse<TResult> {
	return typeof value === "object"
		&& value !== null
		&& (value as { type?: unknown }).type === "response"
		&& (value as { id?: unknown }).id === id
		&& typeof (value as { ok?: unknown }).ok === "boolean";
}

function requestBackendRpc<TResult>(method: string, params?: unknown): Promise<TResult> {
	return new Promise((resolve, reject): void => {
		const requestId: string = `studio-update-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
		const ws = new WebSocket(`ws://localhost:${backendManager.getPort()}`);
		const timeout: ReturnType<typeof setTimeout> = setTimeout((): void => {
			ws.close();
			reject(new Error(`Timed out waiting for ${method}.`));
		}, 30000);

		ws.on("open", (): void => {
			ws.send(JSON.stringify({
				protocolVersion: 2,
				type: "request",
				id: requestId,
				method,
				...(params === undefined ? {} : { params })
			}));
		});
		ws.on("message", (data: WebSocket.RawData): void => {
			try {
				const parsed: unknown = JSON.parse(data.toString());
				if (!isBackendRpcResponse<TResult>(parsed, requestId)) {
					return;
				}
				clearTimeout(timeout);
				ws.close();
				if (parsed.ok) {
					resolve(parsed.result);
					return;
				}
				reject(new Error(parsed.error.message));
			} catch (error: unknown) {
				clearTimeout(timeout);
				ws.close();
				reject(error instanceof Error ? error : new Error(`Failed to parse ${method} response.`));
			}
		});
		ws.on("error", (error: Error): void => {
			clearTimeout(timeout);
			reject(error);
		});
	});
}

class MainProcessBackendUpdateClient implements BackendUpdateClient {
	public async check(): Promise<BackendUpdateCheckResult> {
		await backendManager.waitUntilHealthy();
		return await requestBackendRpc<BackendUpdateCheckResult>("backend.update.check");
	}

	public async install(version: string | null): Promise<BackendUpdateInstallResult> {
		return await requestBackendRpc<BackendUpdateInstallResult>(
			"backend.update.install",
			version === null ? {} : { version }
		);
	}

	public async restartAndWaitHealthy(): Promise<void> {
		await backendManager.restartAndWaitHealthy();
	}
}

export class AppUpdateService {
	private readonly isPackaged: boolean;
	private readonly autoUpdater: AppUpdaterLike;
	private readonly backendUpdateClient: BackendUpdateClient;
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
		this.backendUpdateClient = options.backendUpdateClient ?? new MainProcessBackendUpdateClient();
		this.sendEvent = options.sendEvent ?? broadcastAppUpdateEvent;
		this.installDelayMs = options.installDelayMs ?? 1200;
		this.state = createState(
			createComponentState(this.isPackaged ? "idle" : "unsupported", options.currentVersion ?? getDefaultCurrentVersion(), this.isPackaged ? null : getUnsupportedClientMessage()),
			createComponentState("idle", null)
		);
		this.registerUpdaterEvents();
	}

	public getState(): AppUpdateState {
		return {
			...this.state,
			client: { ...this.state.client },
			backend: { ...this.state.backend }
		};
	}

	public async checkForUpdatesIfEnabled(enabled: boolean): Promise<AppUpdateState> {
		if (!enabled) {
			return this.getState();
		}
		await this.checkForUpdates();
		return this.getState();
	}

	public async checkForUpdates(): Promise<AppUpdateState> {
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
		if (this.state.status === "downloading" || this.state.status === "downloaded" || this.state.status === "installing") {
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

	public acknowledge(): AppUpdateState {
		if (this.state.updateKind === "backend" && this.state.backend.status === "downloaded") {
			this.updateBackend({
				status: "not_available",
				availableVersion: null,
				releaseName: null,
				releaseDate: null,
				progress: null,
				errorMessage: null
			});
		}
		return this.getState();
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
		ipcMain.handle("app-update:acknowledge", (): AppUpdateState => this.acknowledge());
	}

	private async runUpdateCheck(): Promise<void> {
		await Promise.all([
			this.runClientUpdateCheck(),
			this.runBackendUpdateCheck()
		]);
	}

	private async runClientUpdateCheck(): Promise<void> {
		if (!this.isPackaged) {
			this.updateClient({
				status: "unsupported",
				progress: null,
				errorMessage: getUnsupportedClientMessage()
			});
			return;
		}

		this.updateClient({
			status: "checking",
			progress: null,
			errorMessage: null
		});
		try {
			await this.autoUpdater.checkForUpdates();
		} catch (error: unknown) {
			this.handleClientError(error instanceof Error ? error : new Error("Client update check failed."));
		}
	}

	private async runBackendUpdateCheck(): Promise<void> {
		this.updateBackend({
			status: "checking",
			progress: null,
			errorMessage: null
		});
		try {
			const result: BackendUpdateCheckResult = await this.backendUpdateClient.check();
			this.updateBackend({
				status: result.updateAvailable ? "available" : result.errorMessage === null ? "not_available" : "error",
				currentVersion: result.currentVersion,
				availableVersion: result.updateAvailable ? result.latestVersion : null,
				releaseName: result.updateAvailable && result.latestVersion !== null ? `Daedalus backend ${result.latestVersion}` : null,
				releaseDate: result.checkedAt,
				progress: null,
				errorMessage: result.errorMessage
			});
		} catch (error: unknown) {
			this.updateBackend({
				status: "error",
				progress: null,
				errorMessage: error instanceof Error ? error.message : "Backend update check failed."
			});
		}
	}

	private async runDownload(): Promise<AppUpdateState> {
		if (this.state.status === "error") {
			await this.checkForUpdates();
		}

		const shouldInstallBackend: boolean = this.state.backend.status === "available";
		const shouldDownloadClient: boolean = this.state.client.status === "available";
		if (!shouldInstallBackend && !shouldDownloadClient) {
			return this.getState();
		}

		if (shouldInstallBackend) {
			await this.installBackendUpdate();
			if (this.state.backend.status === "error") {
				return this.getState();
			}
		}
		if (shouldDownloadClient) {
			await this.downloadClientUpdate();
		}
		return this.getState();
	}

	private async installBackendUpdate(): Promise<void> {
		this.updateBackend({
			status: "downloading",
			progress: 0,
			errorMessage: null
		});
		try {
			const result: BackendUpdateInstallResult = await this.backendUpdateClient.install(this.state.backend.availableVersion);
			this.updateBackend({
				status: "installing",
				currentVersion: result.version,
				availableVersion: result.version,
				progress: 75,
				errorMessage: null
			});
			await this.backendUpdateClient.restartAndWaitHealthy();
			this.updateBackend({
				status: "downloaded",
				currentVersion: result.version,
				availableVersion: result.version,
				progress: 100,
				errorMessage: null
			});
		} catch (error: unknown) {
			this.updateBackend({
				status: "error",
				progress: null,
				errorMessage: error instanceof Error ? error.message : "Backend update install failed."
			});
		}
	}

	private async downloadClientUpdate(): Promise<void> {
		if (!this.isPackaged) {
			this.updateClient({
				status: "unsupported",
				progress: null,
				errorMessage: getUnsupportedClientMessage()
			});
			return;
		}

		this.updateClient({
			status: "downloading",
			progress: 0,
			errorMessage: null
		});
		try {
			await this.autoUpdater.downloadUpdate();
		} catch (error: unknown) {
			this.handleClientError(error instanceof Error ? error : new Error("Client update download failed."));
		}
	}

	private registerUpdaterEvents(): void {
		this.onUpdaterEvent("checking-for-update", (): void => {
			this.updateClient({
				status: "checking",
				progress: null,
				errorMessage: null
			});
		});
		this.onUpdaterEvent("update-available", (info: UpdateInfo): void => {
			this.updateClient({
				status: "available",
				currentVersion: this.state.client.currentVersion,
				availableVersion: info.version,
				releaseName: getUpdateReleaseName(info),
				releaseDate: getUpdateReleaseDate(info),
				progress: null,
				errorMessage: null
			});
		});
		this.onUpdaterEvent("update-not-available", (): void => {
			this.updateClient({
				status: "not_available",
				availableVersion: null,
				releaseName: null,
				releaseDate: null,
				progress: null,
				errorMessage: null
			});
		});
		this.onUpdaterEvent("download-progress", (progress: ProgressInfo): void => {
			this.updateClient({
				status: "downloading",
				progress: Math.max(0, Math.min(100, progress.percent)),
				errorMessage: null
			});
		});
		this.onUpdaterEvent("update-downloaded", (info: UpdateInfo): void => {
			this.updateClient({
				status: "downloaded",
				availableVersion: info.version,
				releaseName: getUpdateReleaseName(info),
				releaseDate: getUpdateReleaseDate(info),
				progress: 100,
				errorMessage: null
			});
			setTimeout((): void => {
				this.updateClient({
					status: "installing",
					progress: 100,
					errorMessage: null
				});
				this.autoUpdater.quitAndInstall(false, true);
			}, this.installDelayMs);
		});
		this.onUpdaterEvent("error", (error: Error): void => {
			this.handleClientError(error);
		});
	}

	private onUpdaterEvent<TEventName extends AppUpdateEventName>(
		eventName: TEventName,
		handler: AppUpdateEventHandler<TEventName>
	): void {
		this.autoUpdater.on(eventName, handler as (...args: unknown[]) => void);
	}

	private handleClientError(error: Error): void {
		this.updateClient({
			status: "error",
			progress: null,
			errorMessage: getErrorMessage(error)
		});
	}

	private updateClient(patch: Partial<AppUpdateComponentState>): void {
		this.state = createState({
			...this.state.client,
			...patch
		}, this.state.backend);
		this.broadcast();
	}

	private updateBackend(patch: Partial<AppUpdateComponentState>): void {
		this.state = createState(this.state.client, {
			...this.state.backend,
			...patch
		});
		this.broadcast();
	}

	private broadcast(): void {
		this.sendEvent("app-update:state-changed", this.getState());
	}
}

export const appUpdateService: AppUpdateService = new AppUpdateService();

import { randomUUID } from "node:crypto";
import {
	BrowserWindow,
	dialog,
	ipcMain,
	session,
	shell,
	WebContentsView,
	type IpcMainInvokeEvent,
	type Rectangle,
	type Session,
	type WebContents
} from "electron";
import type {
	BrowserClearDataOptions,
	BrowserElementSnapshot,
	BrowserImportProfile,
	BrowserPermissionRequest,
	BrowserSettings,
	BrowserViewBounds,
	BrowserViewState
} from "../../../contracts/browser";
import { BrowserDataStore } from "./browser-data-store";
import { BrowserInspector } from "./browser-inspector";
import { BrowserPasswordStore } from "./browser-password-store";
import { importBrowserProfile, listBrowserImportProfiles, type DiscoveredBrowserImportProfile } from "./browser-profile-import";
import { BrowserDownloadController } from "./browser-download-controller";

type BrowserViewRecord = {
	browserId: string;
	ownerWebContentsId: number;
	view: WebContentsView | null;
	bounds: BrowserViewBounds;
	visible: boolean;
	state: BrowserViewState;
	inspector: BrowserInspector | null;
};

type PendingPermission = {
	request: BrowserPermissionRequest;
	callback: (allowed: boolean) => void;
	timer: NodeJS.Timeout;
};

const BROWSER_PARTITION: string = "persist:daedalus-browser";
const BROWSER_ID_PATTERN: RegExp = /^[A-Za-z0-9:_-]{1,180}$/u;
const SUPPORTED_PERMISSIONS: Set<string> = new Set(["notifications", "geolocation", "media", "clipboard-read", "fullscreen"]);
const CLEAR_TIME_RANGES_MS = {
	lastHour: 60 * 60 * 1000,
	last24Hours: 24 * 60 * 60 * 1000,
	last7Days: 7 * 24 * 60 * 60 * 1000,
	last4Weeks: 28 * 24 * 60 * 60 * 1000,
	allTime: null
} as const;

function normalizeUrl(rawUrl: string): string {
	const candidate: string = rawUrl.trim();
	if (candidate.length === 0 || candidate.length > 2048) throw new Error("browser_url_invalid");
	let parsed: URL;
	try {
		parsed = new URL(/^[a-z][a-z0-9+.-]*:/iu.test(candidate) ? candidate : `https://${candidate}`);
	} catch {
		throw new Error("browser_url_invalid");
	}
	if (parsed.protocol !== "https:" && parsed.protocol !== "http:") throw new Error("browser_url_not_allowed");
	parsed.username = "";
	parsed.password = "";
	return parsed.toString();
}

function createInitialState(browserId: string): BrowserViewState {
	return { browserId, url: null, title: "", isLoading: false, canGoBack: false, canGoForward: false, error: null };
}

export class BrowserService {
	private readonly views: Map<string, BrowserViewRecord> = new Map();
	private readonly pendingPermissions: Map<string, PendingPermission> = new Map();
	private readonly downloads: BrowserDownloadController;
	private browserSession: Session | null = null;
	private sessionConfigured: boolean = false;

	constructor(
		private readonly getMainWindow: () => BrowserWindow | null,
		private readonly getSettingsWindow: () => BrowserWindow | null,
		private readonly dataStore: BrowserDataStore,
		private readonly passwordStore: BrowserPasswordStore
	) {
		this.downloads = new BrowserDownloadController(dataStore, getMainWindow);
	}

	registerIpc(): void {
		ipcMain.handle("browser:view-create", (event, payload: unknown): BrowserViewState => this.createDescriptor(event, payload));
		ipcMain.handle("browser:view-destroy", (event, payload: unknown): void => this.destroyView(event, payload));
		ipcMain.handle("browser:view-bounds", (event, payload: unknown): void => this.setBounds(event, payload));
		ipcMain.handle("browser:view-visible", (event, payload: unknown): void => this.setVisible(event, payload));
		ipcMain.handle("browser:view-navigate", async (event, payload: unknown): Promise<BrowserViewState> => await this.navigate(event, payload));
		ipcMain.handle("browser:view-action", (event, payload: unknown): BrowserViewState => this.runNavigationAction(event, payload));
		ipcMain.handle("browser:view-inspect", async (event, payload: unknown): Promise<void> => await this.toggleInspect(event, payload));
		ipcMain.handle("browser:view-state", (event, payload: unknown): BrowserViewState => ({ ...this.requireOwnedRecord(event, payload).state }));

		ipcMain.handle("browser:history-list", async (event) => { this.assertStudioSender(event); return await this.dataStore.listHistory(); });
		ipcMain.handle("browser:history-clear", async (event): Promise<void> => { this.assertStudioSender(event); await this.dataStore.clearHistory(); });
		ipcMain.handle("browser:downloads-list", async (event) => { this.assertStudioSender(event); return await this.downloads.list(); });
		ipcMain.handle("browser:downloads-cancel", async (event, id: unknown): Promise<void> => { this.assertStudioSender(event); this.downloads.cancel(this.requireString(id, "browser_download_id_invalid")); });
		ipcMain.handle("browser:downloads-open", async (event, id: unknown): Promise<void> => { this.assertStudioSender(event); await this.downloads.open(this.requireString(id, "browser_download_id_invalid")); });
		ipcMain.handle("browser:downloads-reveal", async (event, id: unknown): Promise<void> => { this.assertStudioSender(event); await this.downloads.reveal(this.requireString(id, "browser_download_id_invalid")); });
		ipcMain.handle("browser:downloads-remove", async (event, id: unknown): Promise<void> => { this.assertStudioSender(event); await this.downloads.remove(this.requireString(id, "browser_download_id_invalid")); });
		ipcMain.handle("browser:downloads-clear", async (event): Promise<void> => { this.assertStudioSender(event); await this.downloads.clear(); });

		ipcMain.handle("browser:settings-get", async (event): Promise<BrowserSettings> => { this.assertStudioSender(event); return await this.dataStore.getSettings(); });
		ipcMain.handle("browser:settings-update", async (event, patch: unknown): Promise<BrowserSettings> => { this.assertStudioSender(event); return await this.updateSettings(patch); });
		ipcMain.handle("browser:settings-pick-download-directory", async (event): Promise<string | null> => await this.pickDownloadDirectory(event));
		ipcMain.handle("browser:permissions-set", async (event, payload: unknown) => { this.assertStudioSender(event); return await this.setPermission(payload); });
		ipcMain.handle("browser:permissions-remove", async (event, payload: unknown) => { this.assertStudioSender(event); return await this.removePermission(payload); });
		ipcMain.handle("browser:permissions-respond", async (event, payload: unknown): Promise<void> => { this.assertStudioSender(event); await this.respondPermission(payload); });

		ipcMain.handle("browser:passwords-list", async (event) => { this.assertStudioSender(event); return await this.passwordStore.list(); });
		ipcMain.handle("browser:passwords-save", async (event, payload: unknown) => { this.assertStudioSender(event); return await this.savePassword(payload); });
		ipcMain.handle("browser:passwords-reveal", async (event, id: unknown) => { this.assertStudioSender(event); return { password: await this.passwordStore.reveal(this.requireString(id, "browser_password_id_invalid")) }; });
		ipcMain.handle("browser:passwords-remove", async (event, id: unknown): Promise<void> => { this.assertStudioSender(event); await this.passwordStore.remove(this.requireString(id, "browser_password_id_invalid")); });
		ipcMain.handle("browser:passwords-for-url", async (event, rawUrl: unknown) => { this.assertStudioSender(event); return await this.passwordStore.findForUrl(normalizeUrl(this.requireString(rawUrl, "browser_url_invalid"))); });
		ipcMain.handle("browser:passwords-fill", async (event, payload: unknown): Promise<void> => await this.fillPassword(event, payload));

		ipcMain.handle("browser:import-profiles", async (event): Promise<BrowserImportProfile[]> => {
			this.assertStudioSender(event);
			return (await listBrowserImportProfiles()).map(({ source, profileId, name }): BrowserImportProfile => ({ source, profileId, name }));
		});
		ipcMain.handle("browser:import-run", async (event, payload: unknown) => { this.assertStudioSender(event); return await this.runImport(payload); });
		ipcMain.handle("browser:data-clear", async (event, payload: unknown): Promise<void> => { this.assertStudioSender(event); await this.clearData(payload); });
	}

	destroyAll(): void {
		this.downloads.cancelAll();
		for (const record of [...this.views.values()]) this.destroyRecord(record);
		this.views.clear();
		for (const pending of this.pendingPermissions.values()) {
			clearTimeout(pending.timer);
			pending.callback(false);
		}
		this.pendingPermissions.clear();
	}

	private createDescriptor(event: IpcMainInvokeEvent, payload: unknown): BrowserViewState {
		this.assertMainSender(event);
		const browserId: string = this.readBrowserId(payload);
		const existing: BrowserViewRecord | undefined = this.views.get(browserId);
		if (existing !== undefined) return { ...existing.state };
		const record: BrowserViewRecord = {
			browserId,
			ownerWebContentsId: event.sender.id,
			view: null,
			bounds: { x: 0, y: 0, width: 0, height: 0 },
			visible: false,
			state: createInitialState(browserId),
			inspector: null
		};
		this.views.set(browserId, record);
		return { ...record.state };
	}

	private destroyView(event: IpcMainInvokeEvent, payload: unknown): void {
		const record: BrowserViewRecord = this.requireOwnedRecord(event, payload);
		this.destroyRecord(record);
		this.views.delete(record.browserId);
	}

	private destroyRecord(record: BrowserViewRecord): void {
		if (record.inspector !== null) void record.inspector.cancel();
		const mainWindow: BrowserWindow | null = this.getMainWindow();
		if (record.view !== null) {
			try { mainWindow?.contentView.removeChildView(record.view); } catch { /* already removed */ }
			if (!record.view.webContents.isDestroyed()) record.view.webContents.close();
		}
		record.view = null;
	}

	private setBounds(event: IpcMainInvokeEvent, payload: unknown): void {
		const record: BrowserViewRecord = this.requireOwnedRecord(event, payload);
		if (typeof payload !== "object" || payload === null || Array.isArray(payload)) throw new Error("browser_bounds_invalid");
		const bounds: unknown = (payload as Record<string, unknown>).bounds;
		if (typeof bounds !== "object" || bounds === null || Array.isArray(bounds)) throw new Error("browser_bounds_invalid");
		const raw = bounds as Record<string, unknown>;
		if (![raw.x, raw.y, raw.width, raw.height].every((value: unknown): value is number => typeof value === "number" && Number.isFinite(value))) throw new Error("browser_bounds_invalid");
		const windowBounds: Rectangle = this.getMainWindow()?.getContentBounds() ?? { x: 0, y: 0, width: 0, height: 0 };
		const x: number = Math.max(0, Math.min(Math.round(raw.x as number), windowBounds.width));
		const y: number = Math.max(0, Math.min(Math.round(raw.y as number), windowBounds.height));
		record.bounds = {
			x,
			y,
			width: Math.max(0, Math.min(Math.round(raw.width as number), windowBounds.width - x)),
			height: Math.max(0, Math.min(Math.round(raw.height as number), windowBounds.height - y))
		};
		record.view?.setBounds(record.bounds);
	}

	private setVisible(event: IpcMainInvokeEvent, payload: unknown): void {
		const record: BrowserViewRecord = this.requireOwnedRecord(event, payload);
		if (typeof payload !== "object" || payload === null || Array.isArray(payload) || typeof (payload as Record<string, unknown>).visible !== "boolean") throw new Error("browser_visibility_invalid");
		record.visible = (payload as Record<string, unknown>).visible as boolean;
		record.view?.setVisible(record.visible);
	}

	private async navigate(event: IpcMainInvokeEvent, payload: unknown): Promise<BrowserViewState> {
		const record: BrowserViewRecord = this.requireOwnedRecord(event, payload);
		if (typeof payload !== "object" || payload === null || Array.isArray(payload)) throw new Error("browser_url_invalid");
		const url: string = normalizeUrl(this.requireString((payload as Record<string, unknown>).url, "browser_url_invalid"));
		const view: WebContentsView = this.ensureView(record);
		record.state = { ...record.state, url, error: null, isLoading: true };
		this.emitState(record);
		await view.webContents.loadURL(url);
		return { ...record.state };
	}

	private runNavigationAction(event: IpcMainInvokeEvent, payload: unknown): BrowserViewState {
		const record: BrowserViewRecord = this.requireOwnedRecord(event, payload);
		if (record.view === null || typeof payload !== "object" || payload === null || Array.isArray(payload)) return { ...record.state };
		const action: unknown = (payload as Record<string, unknown>).action;
		if (action === "back" && record.view.webContents.navigationHistory.canGoBack()) record.view.webContents.navigationHistory.goBack();
		else if (action === "forward" && record.view.webContents.navigationHistory.canGoForward()) record.view.webContents.navigationHistory.goForward();
		else if (action === "reload") record.view.webContents.reload();
		else if (action === "stop") record.view.webContents.stop();
		else if (action !== "back" && action !== "forward") throw new Error("browser_action_invalid");
		return { ...record.state };
	}

	private ensureView(record: BrowserViewRecord): WebContentsView {
		if (record.view !== null) return record.view;
		this.configureSession();
		const mainWindow: BrowserWindow | null = this.getMainWindow();
		if (mainWindow === null || mainWindow.isDestroyed()) throw new Error("browser_window_unavailable");
		const view = new WebContentsView({ webPreferences: { partition: BROWSER_PARTITION, sandbox: true, contextIsolation: true, nodeIntegration: false, webSecurity: true } });
		record.view = view;
		mainWindow.contentView.addChildView(view);
		view.setBounds(record.bounds);
		view.setVisible(record.visible);
		view.webContents.setWindowOpenHandler(({ url }): Electron.WindowOpenHandlerResponse => {
			try { void view.webContents.loadURL(normalizeUrl(url)); } catch { void this.confirmExternalUrl(url); }
			return { action: "deny" };
		});
		view.webContents.on("will-navigate", (navigationEvent, url: string): void => {
			try { normalizeUrl(url); } catch { navigationEvent.preventDefault(); void this.confirmExternalUrl(url); }
		});
		view.webContents.on("did-start-loading", (): void => this.updateViewState(record, { isLoading: true, error: null }));
		view.webContents.on("did-stop-loading", (): void => this.refreshNavigationState(record));
		view.webContents.on("page-title-updated", (_event, title: string): void => this.updateViewState(record, { title }));
		view.webContents.on("did-fail-load", (_event, code, description, validatedUrl, isMainFrame): void => {
			if (!isMainFrame) return;
			if (code === -3) { this.refreshNavigationState(record); return; }
			this.updateViewState(record, { url: validatedUrl || record.state.url, isLoading: false, error: description });
		});
		const navigated = (_event: Electron.Event, url: string): void => { void this.handleNavigated(record, url); };
		view.webContents.on("did-navigate", navigated);
		view.webContents.on("did-navigate-in-page", navigated);
		view.webContents.on("before-input-event", (_event, input): void => {
			if (input.type === "keyDown" && input.key === "Escape" && record.inspector !== null) void record.inspector.cancel();
		});
		return view;
	}

	private async handleNavigated(record: BrowserViewRecord, rawUrl: string): Promise<void> {
		let url: string;
		try { url = normalizeUrl(rawUrl); } catch { return; }
		this.refreshNavigationState(record, url);
		await this.dataStore.addHistory({ id: randomUUID(), url, title: record.view?.webContents.getTitle() ?? "", visitedAt: new Date().toISOString() });
	}

	private refreshNavigationState(record: BrowserViewRecord, url: string | null = record.view?.webContents.getURL() || record.state.url): void {
		const contents: WebContents | undefined = record.view?.webContents;
		this.updateViewState(record, {
			url,
			title: contents?.getTitle() ?? record.state.title,
			isLoading: contents?.isLoading() ?? false,
			canGoBack: contents?.navigationHistory.canGoBack() ?? false,
			canGoForward: contents?.navigationHistory.canGoForward() ?? false
		});
	}

	private updateViewState(record: BrowserViewRecord, patch: Partial<BrowserViewState>): void {
		record.state = { ...record.state, ...patch };
		this.emitState(record);
	}

	private emitState(record: BrowserViewRecord): void {
		const owner: WebContents | undefined = this.getMainWindow()?.webContents;
		if (owner !== undefined && !owner.isDestroyed() && owner.id === record.ownerWebContentsId) owner.send("browser:view-state-changed", { ...record.state });
	}

	private async toggleInspect(event: IpcMainInvokeEvent, payload: unknown): Promise<void> {
		const record: BrowserViewRecord = this.requireOwnedRecord(event, payload);
		if (record.view === null) throw new Error("browser_view_not_loaded");
		if (record.inspector === null) {
			record.inspector = new BrowserInspector(
				record.view.webContents,
				(snapshot: BrowserElementSnapshot): void => {
					record.inspector = null;
					event.sender.send("browser:view-element-selected", { browserId: record.browserId, snapshot });
				},
				(): void => {
					record.inspector = null;
					event.sender.send("browser:view-inspect-cancelled", { browserId: record.browserId });
				}
			);
		}
		await record.inspector.start();
	}

	private configureSession(): void {
		if (this.sessionConfigured) return;
		this.browserSession = session.fromPartition(BROWSER_PARTITION, { cache: true });
		this.browserSession.setPermissionRequestHandler((contents, permission, callback): void => {
			void this.handlePermissionRequest(contents, permission, callback);
		});
		this.browserSession.setPermissionCheckHandler((_contents, permission): boolean => SUPPORTED_PERMISSIONS.has(permission));
		this.browserSession.setDevicePermissionHandler((): boolean => false);
		this.downloads.attach(this.browserSession, (contents: WebContents): boolean => [...this.views.values()].some((record: BrowserViewRecord): boolean => record.view?.webContents === contents));
		this.sessionConfigured = true;
	}

	private async handlePermissionRequest(contents: WebContents, permission: string, callback: (allowed: boolean) => void): Promise<void> {
		if (!SUPPORTED_PERMISSIONS.has(permission)) { callback(false); return; }
		let origin: string;
		try { origin = new URL(contents.getURL()).origin; } catch { callback(false); return; }
		const settings: BrowserSettings = await this.dataStore.getSettings();
		const rule = settings.permissionRules.find((item): boolean => item.origin === origin && item.permission === permission);
		if (rule !== undefined) { callback(rule.decision === "allow"); return; }
		const record: BrowserViewRecord | undefined = [...this.views.values()].find((item: BrowserViewRecord): boolean => item.view?.webContents === contents);
		if (record === undefined || !record.visible) { callback(false); return; }
		const request: BrowserPermissionRequest = { id: randomUUID(), browserId: record.browserId, origin, permission };
		const timer: NodeJS.Timeout = setTimeout((): void => {
			this.pendingPermissions.delete(request.id);
			callback(false);
		}, 30_000);
		this.pendingPermissions.set(request.id, { request, callback, timer });
		this.getMainWindow()?.webContents.send("browser:permission-requested", request);
	}

	private async respondPermission(payload: unknown): Promise<void> {
		if (typeof payload !== "object" || payload === null || Array.isArray(payload)) throw new Error("browser_permission_response_invalid");
		const data = payload as Record<string, unknown>;
		const id: string = this.requireString(data.id, "browser_permission_response_invalid");
		const pending: PendingPermission | undefined = this.pendingPermissions.get(id);
		if (pending === undefined) return;
		const decision: unknown = data.decision;
		if (decision !== "allow_once" && decision !== "allow_always" && decision !== "block") throw new Error("browser_permission_response_invalid");
		clearTimeout(pending.timer);
		this.pendingPermissions.delete(id);
		const allowed: boolean = decision === "allow_once" || decision === "allow_always";
		pending.callback(allowed);
		if (decision === "allow_always" || decision === "block") {
			await this.dataStore.setPermission(pending.request.origin, pending.request.permission, allowed ? "allow" : "block");
		}
	}

	private async updateSettings(patch: unknown): Promise<BrowserSettings> {
		if (typeof patch !== "object" || patch === null || Array.isArray(patch)) throw new Error("browser_settings_invalid");
		const data = patch as Record<string, unknown>;
		const normalized: Partial<Omit<BrowserSettings, "permissionRules">> = {};
		if (data.downloadDirectory === null || typeof data.downloadDirectory === "string") normalized.downloadDirectory = data.downloadDirectory as string | null;
		if (typeof data.askWhereToSave === "boolean") normalized.askWhereToSave = data.askWhereToSave;
		if (typeof data.savePasswordsEnabled === "boolean") normalized.savePasswordsEnabled = data.savePasswordsEnabled;
		return await this.dataStore.updateSettings(normalized);
	}

	private async pickDownloadDirectory(event: IpcMainInvokeEvent): Promise<string | null> {
		this.assertStudioSender(event);
		const senderWindow: BrowserWindow | null = BrowserWindow.fromWebContents(event.sender);
		if (senderWindow === null) throw new Error("browser_sender_not_allowed");
		const result = await dialog.showOpenDialog(senderWindow, { properties: ["openDirectory", "createDirectory"] });
		return result.canceled ? null : result.filePaths[0] ?? null;
	}

	private async setPermission(payload: unknown) {
		if (typeof payload !== "object" || payload === null || Array.isArray(payload)) throw new Error("browser_permission_invalid");
		const data = payload as Record<string, unknown>;
		if (data.decision !== "allow" && data.decision !== "block") throw new Error("browser_permission_invalid");
		return await this.dataStore.setPermission(this.requireString(data.origin, "browser_permission_invalid"), this.requireString(data.permission, "browser_permission_invalid"), data.decision);
	}

	private async removePermission(payload: unknown) {
		if (typeof payload !== "object" || payload === null || Array.isArray(payload)) throw new Error("browser_permission_invalid");
		const data = payload as Record<string, unknown>;
		return await this.dataStore.removePermission(this.requireString(data.origin, "browser_permission_invalid"), this.requireString(data.permission, "browser_permission_invalid"));
	}

	private async savePassword(payload: unknown) {
		if (typeof payload !== "object" || payload === null || Array.isArray(payload)) throw new Error("browser_password_invalid");
		if (!(await this.dataStore.getSettings()).savePasswordsEnabled) throw new Error("browser_password_saving_disabled");
		const data = payload as Record<string, unknown>;
		return await this.passwordStore.save(this.requireString(data.origin, "browser_password_invalid"), this.requireString(data.username, "browser_password_invalid"), this.requireString(data.password, "browser_password_invalid"));
	}

	private async fillPassword(event: IpcMainInvokeEvent, payload: unknown): Promise<void> {
		const record: BrowserViewRecord = this.requireOwnedRecord(event, payload);
		if (record.view === null || record.state.url === null || typeof payload !== "object" || payload === null || Array.isArray(payload)) throw new Error("browser_view_not_loaded");
		const credentialId: string = this.requireString((payload as Record<string, unknown>).credentialId, "browser_password_id_invalid");
		const credential = (await this.passwordStore.list()).find((item): boolean => item.id === credentialId);
		if (credential === undefined || credential.origin !== new URL(record.state.url).origin) throw new Error("browser_password_origin_mismatch");
		const password: string = await this.passwordStore.reveal(credentialId);
		const script: string = `(() => { const username = ${JSON.stringify(credential.username)}; const password = ${JSON.stringify(password)}; const passwordInput = document.querySelector('input[type="password"]'); if (!passwordInput) return false; const form = passwordInput.form || document; const userInput = form.querySelector('input[autocomplete="username"], input[type="email"], input[type="text"]'); const set = (input, value) => { const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; setter.call(input, value); input.dispatchEvent(new Event('input', { bubbles: true })); input.dispatchEvent(new Event('change', { bubbles: true })); }; if (userInput) set(userInput, username); set(passwordInput, password); return true; })()`;
		await record.view.webContents.executeJavaScript(script, true);
	}

	private async runImport(payload: unknown) {
		if (typeof payload !== "object" || payload === null || Array.isArray(payload)) throw new Error("browser_import_invalid");
		const data = payload as Record<string, unknown>;
		const source: unknown = data.source;
		const profileId: string = this.requireString(data.profileId, "browser_import_invalid");
		if (source !== "chrome" && source !== "edge") throw new Error("browser_import_invalid");
		if (data.includePasswords === true && !(await this.dataStore.getSettings()).savePasswordsEnabled) throw new Error("browser_password_saving_disabled");
		const profile: DiscoveredBrowserImportProfile | undefined = (await listBrowserImportProfiles()).find((item: DiscoveredBrowserImportProfile): boolean => item.source === source && item.profileId === profileId);
		if (profile === undefined) throw new Error("browser_import_profile_not_found");
		this.configureSession();
		return await importBrowserProfile({
			profile,
			includeCookies: data.includeCookies === true,
			includePasswords: data.includePasswords === true,
			session: this.browserSession!,
			passwordStore: this.passwordStore
		});
	}

	private async clearData(payload: unknown): Promise<void> {
		if (typeof payload !== "object" || payload === null || Array.isArray(payload)) throw new Error("browser_clear_data_invalid");
		const options = payload as Partial<BrowserClearDataOptions>;
		if (typeof options.timeRange !== "string" || !(options.timeRange in CLEAR_TIME_RANGES_MS)
			|| ![options.history, options.downloads, options.cookiesAndStorage, options.cache, options.passwords]
				.every((value: unknown): value is boolean => typeof value === "boolean")) {
			throw new Error("browser_clear_data_invalid");
		}
		const duration: number | null = CLEAR_TIME_RANGES_MS[options.timeRange as keyof typeof CLEAR_TIME_RANGES_MS];
		const sinceMs: number | null = duration === null ? null : Date.now() - duration;
		this.configureSession();
		if (options.cookiesAndStorage) await this.browserSession!.clearData({ dataTypes: ["cookies", "localStorage", "indexedDB", "serviceWorkers"] });
		if (options.cache) await this.browserSession!.clearCache();
		if (options.history) await this.dataStore.clearHistory(sinceMs);
		if (options.downloads) await this.dataStore.clearDownloads(sinceMs);
		if (options.passwords) await this.passwordStore.clear(sinceMs);
	}

	private requireOwnedRecord(event: IpcMainInvokeEvent, payload: unknown): BrowserViewRecord {
		this.assertMainSender(event);
		const browserId: string = this.readBrowserId(payload);
		const record: BrowserViewRecord | undefined = this.views.get(browserId);
		if (record === undefined || record.ownerWebContentsId !== event.sender.id) throw new Error("browser_view_not_found");
		return record;
	}

	private assertMainSender(event: IpcMainInvokeEvent): void {
		const mainWindow: BrowserWindow | null = this.getMainWindow();
		if (mainWindow === null || mainWindow.isDestroyed() || event.sender !== mainWindow.webContents) throw new Error("browser_sender_not_allowed");
	}

	private assertStudioSender(event: IpcMainInvokeEvent): void {
		const senderWindow: BrowserWindow | null = BrowserWindow.fromWebContents(event.sender);
		const mainWindow: BrowserWindow | null = this.getMainWindow();
		const settingsWindow: BrowserWindow | null = this.getSettingsWindow();
		if (senderWindow === null || senderWindow.isDestroyed() || (senderWindow !== mainWindow && senderWindow !== settingsWindow)) {
			throw new Error("browser_sender_not_allowed");
		}
	}

	private async confirmExternalUrl(rawUrl: string): Promise<void> {
		let parsed: URL;
		try { parsed = new URL(rawUrl); } catch { return; }
		if (["file:", "javascript:", "data:", "blob:", "devtools:", "about:", "chrome:"].includes(parsed.protocol)) return;
		const window: BrowserWindow | null = this.getMainWindow();
		if (window === null || window.isDestroyed()) return;
		const result = await dialog.showMessageBox(window, {
			type: "question",
			message: "Open this link in your default application?",
			detail: rawUrl,
			buttons: ["Open", "Cancel"],
			defaultId: 1,
			cancelId: 1,
			noLink: true
		});
		if (result.response === 0) await shell.openExternal(rawUrl);
	}

	private readBrowserId(payload: unknown): string {
		if (typeof payload !== "object" || payload === null || Array.isArray(payload)) throw new Error("browser_id_invalid");
		const browserId: unknown = (payload as Record<string, unknown>).browserId;
		if (typeof browserId !== "string" || !BROWSER_ID_PATTERN.test(browserId)) throw new Error("browser_id_invalid");
		return browserId;
	}

	private requireString(value: unknown, code: string): string {
		if (typeof value !== "string" || value.length === 0) throw new Error(code);
		return value;
	}

}

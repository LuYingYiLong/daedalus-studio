import { app, BrowserWindow, ipcMain, nativeTheme, protocol, shell, type BrowserWindowConstructorOptions, type WebContents } from "electron";
import { join } from "node:path";
import { backendManager } from "./services/backend-manager";
import { backendBootstrapService } from "./services/backend-bootstrap";
import { registerWorkspaceFsIpc } from "./services/workspace-fs";
import { registerSessionFsIpc } from "./services/session-fs";
import { registerSkillFsIpc } from "./services/skill-fs";
import { registerGodotDocumentationFsIpc } from "./services/godot-documentation-fs";
import { registerSkillsCliIpc } from "./services/skills-cli";
import { registerClipboardIpc } from "./services/clipboard";
import { registerGodotExecutableDialogIpc } from "./services/godot-executable-dialog";
import { clientPreferencesService } from "./services/client-preferences";
import { WindowLifecycleController } from "./services/window-lifecycle";
import { registerSystemInfoIpc } from "./services/system-info";
import { registerTerminalPtyIpc, terminalPtyService } from "./services/terminal-pty";
import { appUpdateService } from "./services/app-update";
import { nativeNotificationService } from "./services/native-notifications";
import { getWindowThemeColors, resolveWindowTheme, type WindowThemeColors } from "./services/window-theme";
import type { ClientPreferences } from "./services/client-preferences";
import { configureAppIdentity, getAppIconPath } from "./services/app-identity";
import { godotProjectsService } from "./services/godot-projects";
import { sessionLayoutService } from "./services/session-layout";
import { resetDaedalusData } from "./services/data-reset";
import { getDaedalusDir } from "./services/backend-binary-store";
import { homedir } from "node:os";
import { publishStudioExecutableRecord } from "./services/studio-executable-record";
import { registerImageExportIpc } from "./services/image-export";
import { registerFileExportIpc } from "./services/file-export";
import { registerPluginFsIpc } from "./services/plugin-fs";
import { createLogger } from "./services/logger";
import type { GeneralSettings } from "../contracts/general-settings";
import { BrowserService } from "./services/browser/browser-service";
import { BrowserDataStore } from "./services/browser/browser-data-store";
import { BrowserPasswordStore } from "./services/browser/browser-password-store";
import { scheduledTaskService } from "./services/scheduled-tasks/service";
import { registerWorkspaceMediaProtocol } from "./services/workspace-media";
import { remoteAccessService } from "./services/remote-access";
import { registerWindowCaptureIpc } from "./services/window-capture/window-capture-ipc";
import { registerComputerIpc } from "./services/computer-observation/computer-ipc";

const logger = createLogger("main");
const MEMORY_DIAGNOSTICS_INTERVAL_MS: number = 30_000;
const MEMORY_DIAGNOSTICS_ENABLED: boolean = !app.isPackaged || process.env.DAEDALUS_MEMORY_DIAGNOSTICS === "1";
let memoryDiagnosticsTimer: ReturnType<typeof setInterval> | null = null;

if (process.env.DAEDALUS_E2E === "1") {
	app.disableHardwareAcceleration();
}

protocol.registerSchemesAsPrivileged([{
	scheme: "daedalus-media",
	privileges: {
		standard: true,
		secure: true,
		supportFetchAPI: true,
		stream: true
	}
}]);

backendManager.registerIpc();
backendBootstrapService.registerIpc();
registerWorkspaceFsIpc();
registerSessionFsIpc();
registerSkillFsIpc();
registerGodotDocumentationFsIpc();
registerSkillsCliIpc();
registerClipboardIpc();
registerImageExportIpc();
registerFileExportIpc();
registerPluginFsIpc();
registerGodotExecutableDialogIpc();
clientPreferencesService.registerIpc();
registerSystemInfoIpc();
registerTerminalPtyIpc();
appUpdateService.registerIpc();
nativeNotificationService.registerIpc();
scheduledTaskService.registerIpc();
godotProjectsService.registerIpc();
sessionLayoutService.registerIpc();
remoteAccessService.registerIpc();

ipcMain.handle("app-data:reset-all", async (event): Promise<{ reset: true }> => {
	const senderWindow: BrowserWindow | null = BrowserWindow.fromWebContents(event.sender);
	if (senderWindow === null || senderWindow.isDestroyed()) {
		throw new Error("app_data_reset_not_allowed");
	}

	// 先停止后端再清理 SQLite、运行时状态和配置，避免 Windows 文件锁留下半套数据。
	await remoteAccessService.stop();
	await backendManager.stopAndWait();
	await resetDaedalusData({
		daedalusRoot: getDaedalusDir(),
		userProfile: process.env.USERPROFILE ?? homedir(),
		studioDataRoot: app.getPath("userData")
	});
	return { reset: true };
});

configureAppIdentity();

const isScheduledTaskRunner: boolean = process.argv.includes("--scheduled-task-runner");
const hasSingleInstanceLock: boolean = process.env.DAEDALUS_E2E === "1"
	|| app.requestSingleInstanceLock();
const windowLifecycleController = new WindowLifecycleController(clientPreferencesService);
let mainWindow: BrowserWindow | null = null;
let settingsWindow: BrowserWindow | null = null;
const browserService = new BrowserService(
	(): BrowserWindow | null => mainWindow,
	(): BrowserWindow | null => settingsWindow,
	new BrowserDataStore(join(app.getPath("userData"), "browser-data.json")),
	new BrowserPasswordStore(join(app.getPath("userData"), "browser-passwords.json"))
);
browserService.registerIpc();
registerWindowCaptureIpc(() => mainWindow);
registerComputerIpc(() => mainWindow, () => settingsWindow);
const rendererReadyWindows: WeakSet<BrowserWindow> = new WeakSet();
const rendererShellReadyWindows: WeakSet<BrowserWindow> = new WeakSet();
const rendererPaintReadyWindows: WeakSet<BrowserWindow> = new WeakSet();
const rendererRevealRequestedWindows: WeakSet<BrowserWindow> = new WeakSet();
const rendererReadyFallbackTimers: Map<number, ReturnType<typeof setTimeout>> = new Map();
const RENDERER_READY_FALLBACK_MS: number = 3_500;
const SETTINGS_WINDOW_PREWARM_DELAY_MS: number = 100;
let settingsWindowPrewarmTimer: ReturnType<typeof setTimeout> | null = null;
let isAppQuitting: boolean = false;
let allowAppQuit: boolean = false;
let preserveBackendForClientInstall: boolean = false;
let gracefulQuitPromise: Promise<void> | null = null;
let isDevelopmentRendererReloading: boolean = false;
let pendingSettingsPage: string = "provider";
type PluginReviewRequest = {
	reviewId: string;
	sessionId: string;
	pluginId: string;
	fingerprint: string;
	packageName: string;
	version: string;
	revision: string;
	testCaseCount: number;
	origin: "plugin_creator";
};
let pendingPluginReview: PluginReviewRequest | null = null;
const SETTINGS_PAGE_KEYS: readonly string[] = [
	"provider",
	"default_model",
	"general",
	"appearance",
	"keyboard_shortcuts",
	"search",
	"statistics",
	"personalization",
	"mcp_servers",
	"skills",
	"hooks",
	"plugins",
	"browser",
	"remote_access",
	"computer_observation",
	"environments",
	"worktrees",
	"documentation",
	"godot_projects",
	"archived_sessions",
	"import",
	"about"
];
windowLifecycleController.registerIpc();
appUpdateService.setBeforeClientInstall(async (): Promise<void> => {
	isAppQuitting = true;
	stopMemoryDiagnostics();
	preserveBackendForClientInstall = true;
	cancelSettingsWindowPrewarm();
	windowLifecycleController.markQuitting();
	terminalPtyService.dispose();
	browserService.destroyAll();
	await remoteAccessService.stop();
	backendManager.detach();
});
appUpdateService.setRuntimeBusyHandler((runtimeBusy: boolean): void => {
	backendBootstrapService.setRuntimeBusy(runtimeBusy);
});

async function releaseBackendBeforeQuit(): Promise<void> {
	await remoteAccessService.stop();
	if (preserveBackendForClientInstall) {
		// 客户端更新由更新流程接管运行时，不能在这里终止后端。
		backendManager.detach();
		return;
	}

	try {
		// 必须等待 shutdown RPC 和运行时 lease 关闭完成；仅 detach 会留下短暂的旧 38180 实例。
		await backendManager.stopAndWait();
	} catch {
		// 退出不能被不可达的旧后端阻塞，仍释放本地引用以便下次启动重新获取运行时。
		backendManager.detach();
	}
}

function getWindowIconPath(): string | undefined {
	if (process.platform === "darwin") {
		return undefined;
	}

	return getAppIconPath() ?? undefined;
}

function getCurrentWindowThemeColors(preferences: ClientPreferences): WindowThemeColors {
	return getWindowThemeColors(resolveWindowTheme(preferences.theme, nativeTheme.shouldUseDarkColors));
}

function getWindowBackgroundColor(colors: WindowThemeColors): string {
	return process.platform === "win32" || process.platform === "darwin" ? "#00000000" : colors.backgroundColor;
}

function applyNativeThemePreference(preferences: ClientPreferences): void {
	nativeTheme.themeSource = preferences.theme;
}

function getNativeWindowMaterialOptions(): Partial<BrowserWindowConstructorOptions> {
	if (process.platform === "win32") {
		return {
			backgroundMaterial: "acrylic"
		};
	}

	if (process.platform === "darwin") {
		return {
			vibrancy: "under-window",
			visualEffectState: "active"
		};
	}

	return {};
}

function applyWindowTheme(mainWindow: BrowserWindow, preferences: ClientPreferences): void {
	const colors: WindowThemeColors = getCurrentWindowThemeColors(preferences);
	mainWindow.setBackgroundColor(getWindowBackgroundColor(colors));
	if (process.platform !== "darwin") {
		mainWindow.setTitleBarOverlay({
			color: colors.titleBarOverlayColor,
			symbolColor: colors.symbolColor,
			height: 36
		});
	}
}

function applyWindowThemeToAllWindows(): void {
	const preferences: ClientPreferences = clientPreferencesService.getCachedPreferences();
	for (const browserWindow of BrowserWindow.getAllWindows()) {
		applyWindowTheme(browserWindow, preferences);
	}
}

function clearRendererReadyFallback(browserWindow: BrowserWindow): void {
	const fallbackTimer: ReturnType<typeof setTimeout> | undefined = rendererReadyFallbackTimers.get(browserWindow.id);
	if (fallbackTimer === undefined) {
		return;
	}
	clearTimeout(fallbackTimer);
	rendererReadyFallbackTimers.delete(browserWindow.id);
}

function revealRendererWindow(browserWindow: BrowserWindow): void {
	if (browserWindow.isDestroyed()) {
		return;
	}
	clearRendererReadyFallback(browserWindow);
	applyWindowTheme(browserWindow, clientPreferencesService.getCachedPreferences());
	if (browserWindow.isMinimized()) {
		browserWindow.restore();
	}
	browserWindow.show();
	browserWindow.focus();
}

function hasRendererContentReady(browserWindow: BrowserWindow): boolean {
	return rendererReadyWindows.has(browserWindow) || rendererShellReadyWindows.has(browserWindow);
}

function canRevealRendererWindow(browserWindow: BrowserWindow): boolean {
	return rendererPaintReadyWindows.has(browserWindow) && hasRendererContentReady(browserWindow);
}

function scheduleRendererReadyFallback(browserWindow: BrowserWindow): void {
	if (browserWindow === mainWindow) {
		return;
	}
	if (rendererReadyFallbackTimers.has(browserWindow.id)) {
		return;
	}
	const fallbackTimer: ReturnType<typeof setTimeout> = setTimeout((): void => {
		if (!browserWindow.isDestroyed() && rendererRevealRequestedWindows.has(browserWindow)) {
			revealRendererWindow(browserWindow);
		}
	}, RENDERER_READY_FALLBACK_MS);
	rendererReadyFallbackTimers.set(browserWindow.id, fallbackTimer);
}

function trackRendererWindow(browserWindow: BrowserWindow): void {
	browserWindow.once("ready-to-show", (): void => {
		if (browserWindow.isDestroyed()) {
			return;
		}
		rendererPaintReadyWindows.add(browserWindow);
		if (!rendererRevealRequestedWindows.has(browserWindow)) {
			return;
		}
		if (hasRendererContentReady(browserWindow)) {
			revealRendererWindow(browserWindow);
			return;
		}
		scheduleRendererReadyFallback(browserWindow);
	});
	browserWindow.once("closed", (): void => {
		clearRendererReadyFallback(browserWindow);
	});
}

function requestRendererWindowReveal(browserWindow: BrowserWindow): void {
	if (browserWindow.isDestroyed()) {
		return;
	}
	rendererRevealRequestedWindows.add(browserWindow);
	if (canRevealRendererWindow(browserWindow)) {
		revealRendererWindow(browserWindow);
		return;
	}
	if (rendererPaintReadyWindows.has(browserWindow)) {
		scheduleRendererReadyFallback(browserWindow);
	}
}

function activateMainWindow(): void {
	if (mainWindow === null || mainWindow.isDestroyed()) {
		return;
	}
	requestRendererWindowReveal(mainWindow);
}

function markRendererWindowReady(browserWindow: BrowserWindow): void {
	if (browserWindow.isDestroyed()) {
		return;
	}
	rendererReadyWindows.add(browserWindow);
	clearRendererReadyFallback(browserWindow);
	if (rendererRevealRequestedWindows.has(browserWindow) && rendererPaintReadyWindows.has(browserWindow)) {
		revealRendererWindow(browserWindow);
	}
}

function broadcastClientPreferencesChanged(preferences: ClientPreferences): void {
	for (const browserWindow of BrowserWindow.getAllWindows()) {
		if (!browserWindow.isDestroyed()) {
			browserWindow.webContents.send("client-preferences:changed", preferences);
		}
	}
}

function broadcastGeneralSettingsChanged(settings: GeneralSettings, senderWebContentsId: number): void {
	for (const browserWindow of BrowserWindow.getAllWindows()) {
		if (!browserWindow.isDestroyed() && browserWindow.webContents.id !== senderWebContentsId) {
			browserWindow.webContents.send("general-settings:changed", settings);
		}
	}
}

function broadcastSessionCatalogChanged(senderWebContentsId: number): void {
	for (const browserWindow of BrowserWindow.getAllWindows()) {
		if (!browserWindow.isDestroyed() && browserWindow.webContents.id !== senderWebContentsId) {
			browserWindow.webContents.send("session-catalog:changed");
		}
	}
}

ipcMain.on("session-catalog:changed", (event): void => {
	if (BrowserWindow.fromWebContents(event.sender) === null) {
		return;
	}
	broadcastSessionCatalogChanged(event.sender.id);
});

ipcMain.on("general-settings:changed", (event, settings: GeneralSettings): void => {
	if (BrowserWindow.fromWebContents(event.sender) === null) {
		return;
	}
	if (
		settings === null ||
		typeof settings !== "object"
	) {
		return;
	}
	broadcastGeneralSettingsChanged(settings, event.sender.id);
});

ipcMain.on("window:renderer-ready", (event): void => {
	const browserWindow: BrowserWindow | null = BrowserWindow.fromWebContents(event.sender);
	if (browserWindow !== null) {
		markRendererWindowReady(browserWindow);
		if (browserWindow === mainWindow) {
			scheduleSettingsWindowPrewarm();
		}
		if (browserWindow === settingsWindow) {
			setImmediate((): void => {
				if (settingsWindow !== null && !settingsWindow.isDestroyed()) {
					settingsWindow.webContents.send("window:open-settings", pendingSettingsPage);
					if (pendingPluginReview !== null) settingsWindow.webContents.send("window:plugin-review-requested");
				}
			});
		}
	}
});

ipcMain.on("window:renderer-shell-ready", (event): void => {
	const browserWindow: BrowserWindow | null = BrowserWindow.fromWebContents(event.sender);
	if (browserWindow === null || browserWindow.isDestroyed()) {
		return;
	}
	rendererShellReadyWindows.add(browserWindow);
	if (rendererRevealRequestedWindows.has(browserWindow) && rendererPaintReadyWindows.has(browserWindow)) {
		revealRendererWindow(browserWindow);
	}
});

function isSettingsPageKey(value: unknown): value is string {
	return typeof value === "string" && SETTINGS_PAGE_KEYS.includes(value);
}

function loadRendererWindow(browserWindow: BrowserWindow, view: "main" | "settings", settingsPage?: string): void {
	if (!app.isPackaged && process.env.ELECTRON_RENDERER_URL) {
		const rendererUrl: URL = new URL(process.env.ELECTRON_RENDERER_URL);
		rendererUrl.searchParams.set("view", view);
		if (settingsPage !== undefined) {
			rendererUrl.searchParams.set("page", settingsPage);
		}
		void browserWindow.loadURL(rendererUrl.toString());
		return;
	}

	void browserWindow.loadFile(join(__dirname, "../renderer/index.html"), {
		query: settingsPage === undefined ? { view } : { view, page: settingsPage }
	});
}

function createSettingsWindow(page: string): BrowserWindow | null {
	cancelSettingsWindowPrewarm();
	if (mainWindow === null || mainWindow.isDestroyed()) {
		return null;
	}
	pendingSettingsPage = page;

	if (settingsWindow !== null && !settingsWindow.isDestroyed()) {
		if (rendererReadyWindows.has(settingsWindow)) {
			settingsWindow.webContents.send("window:open-settings", page);
		}
		return settingsWindow;
	}

	const colors: WindowThemeColors = getCurrentWindowThemeColors(clientPreferencesService.getCachedPreferences());
	settingsWindow = new BrowserWindow({
		width: 1080,
		height: 648,
		minWidth: 820,
		minHeight: 580,
		skipTaskbar: false,
		backgroundColor: getWindowBackgroundColor(colors),
		title: "Settings",
		icon: getWindowIconPath(),
		show: false,
		paintWhenInitiallyHidden: true,
		...getNativeWindowMaterialOptions(),
		webPreferences: {
			preload: join(__dirname, "../preload/index.js"),
			contextIsolation: true,
			nodeIntegration: false,
			sandbox: false
		},
		titleBarStyle: "hidden",
		...(process.platform !== "darwin" ? {
			titleBarOverlay: {
				color: colors.titleBarOverlayColor,
				symbolColor: colors.symbolColor,
				height: 36
			}
		} : {})
	});
	applyWindowTheme(settingsWindow, clientPreferencesService.getCachedPreferences());
	trackRendererWindow(settingsWindow);
	settingsWindow.webContents.setWindowOpenHandler(({ url }) => {
		void shell.openExternal(url);
		return { action: "deny" };
	});
	settingsWindow.on("closed", () => {
		settingsWindow = null;
		scheduleSettingsWindowPrewarm();
	});
	loadRendererWindow(settingsWindow, "settings", page);
	return settingsWindow;
}

function openSettingsWindow(page: string = "provider"): void {
	const browserWindow: BrowserWindow | null = createSettingsWindow(page);
	if (browserWindow !== null) {
		requestRendererWindowReveal(browserWindow);
	}
}

function cancelSettingsWindowPrewarm(): void {
	if (settingsWindowPrewarmTimer === null) {
		return;
	}
	clearTimeout(settingsWindowPrewarmTimer);
	settingsWindowPrewarmTimer = null;
}

function scheduleSettingsWindowPrewarm(): void {
	if (
		isAppQuitting
		|| process.env.DAEDALUS_E2E === "1"
		|| isDevelopmentRendererReloading
		|| settingsWindowPrewarmTimer !== null
		|| mainWindow === null
		|| mainWindow.isDestroyed()
		|| (settingsWindow !== null && !settingsWindow.isDestroyed())
	) {
		return;
	}
	settingsWindowPrewarmTimer = setTimeout((): void => {
		settingsWindowPrewarmTimer = null;
		if (
			!isAppQuitting
			&& !isDevelopmentRendererReloading
			&& mainWindow !== null
			&& !mainWindow.isDestroyed()
			&& (settingsWindow === null || settingsWindow.isDestroyed())
		) {
			createSettingsWindow("provider");
		}
	}, SETTINGS_WINDOW_PREWARM_DELAY_MS);
}

ipcMain.handle("window:open-settings", (_event, page?: unknown): void => {
	openSettingsWindow(isSettingsPageKey(page) ? page : "provider");
});

ipcMain.handle("window:open-plugin-review", (event, value: unknown): void => {
	if (BrowserWindow.fromWebContents(event.sender) !== mainWindow || value === null || typeof value !== "object") {
		throw new Error("plugin_review_request_not_allowed");
	}
	const request = value as Partial<PluginReviewRequest>;
	if (
		typeof request.reviewId !== "string"
		|| typeof request.sessionId !== "string"
		|| typeof request.pluginId !== "string"
		|| typeof request.fingerprint !== "string"
		|| typeof request.packageName !== "string"
		|| typeof request.version !== "string"
		|| typeof request.revision !== "string"
		|| typeof request.testCaseCount !== "number"
		|| request.origin !== "plugin_creator"
	) {
		throw new Error("plugin_review_request_invalid");
	}
	pendingPluginReview = request as PluginReviewRequest;
	openSettingsWindow("plugins");
	if (settingsWindow !== null && !settingsWindow.isDestroyed() && rendererReadyWindows.has(settingsWindow)) {
		settingsWindow.webContents.send("window:plugin-review-requested");
	}
});

ipcMain.handle("window:consume-plugin-review", (event): PluginReviewRequest | null => {
	if (BrowserWindow.fromWebContents(event.sender) !== settingsWindow) throw new Error("plugin_review_consume_not_allowed");
	const request = pendingPluginReview;
	pendingPluginReview = null;
	return request;
});

ipcMain.handle("window:open-external", async (event, rawUrl: unknown): Promise<void> => {
	const senderWindow: BrowserWindow | null = BrowserWindow.fromWebContents(event.sender);
	if (senderWindow === null || (senderWindow !== mainWindow && senderWindow !== settingsWindow)) {
		throw new Error("window_open_external_not_allowed");
	}
	if (typeof rawUrl !== "string") {
		throw new Error("window_external_url_invalid");
	}
	let url: URL;
	try {
		url = new URL(rawUrl);
	} catch {
		throw new Error("window_external_url_invalid");
	}
	if (url.protocol !== "https:" && url.protocol !== "http:") {
		throw new Error("window_external_url_not_allowed");
	}
	await shell.openExternal(url.toString());
});

function reloadDevelopmentRenderer(): void {
	if (isDevelopmentRendererReloading) {
		return;
	}

	isDevelopmentRendererReloading = true;
	cancelSettingsWindowPrewarm();

	if (settingsWindow !== null && !settingsWindow.isDestroyed()) {
		settingsWindow.destroy();
	}

	const browserWindow: BrowserWindow | null = mainWindow;
	if (browserWindow === null || browserWindow.isDestroyed()) {
		isDevelopmentRendererReloading = false;
		createWindow();
		startMemoryDiagnostics();
		return;
	}

	const finishReload = (): void => {
		browserWindow.webContents.removeListener("did-finish-load", finishReload);
		browserWindow.webContents.removeListener("did-fail-load", finishReload);
		isDevelopmentRendererReloading = false;
	};
	browserWindow.webContents.once("did-finish-load", finishReload);
	browserWindow.webContents.once("did-fail-load", finishReload);
	browserWindow.webContents.reloadIgnoringCache();
	revealRendererWindow(browserWindow);
}

async function logMemorySnapshot(): Promise<void> {
	const windows = BrowserWindow.getAllWindows();
	const windowMemory = await Promise.all(windows.map(async (browserWindow: BrowserWindow): Promise<Record<string, unknown>> => {
		if (browserWindow.isDestroyed()) return { id: browserWindow.id, destroyed: true };
		try {
			const memory = await (browserWindow.webContents as WebContents & { getProcessMemoryInfo: () => Promise<Record<string, unknown>> }).getProcessMemoryInfo();
			return { id: browserWindow.id, type: browserWindow === settingsWindow ? "settings" : "main", ...memory };
		} catch (error: unknown) {
			return { id: browserWindow.id, error: error instanceof Error ? error.message : String(error) };
		}
	}));
	logger.info("memory_snapshot", { windows: windowMemory });
}

function startMemoryDiagnostics(): void {
	if (!MEMORY_DIAGNOSTICS_ENABLED || memoryDiagnosticsTimer !== null) return;
	memoryDiagnosticsTimer = setInterval((): void => { void logMemorySnapshot(); }, MEMORY_DIAGNOSTICS_INTERVAL_MS);
	memoryDiagnosticsTimer.unref();
}

function stopMemoryDiagnostics(): void {
	if (memoryDiagnosticsTimer === null) return;
	clearInterval(memoryDiagnosticsTimer);
	memoryDiagnosticsTimer = null;
}

ipcMain.handle("window:relaunch", (event, options?: unknown): void => {
	const senderWindow: BrowserWindow | null = BrowserWindow.fromWebContents(event.sender);
	if (senderWindow === null || (senderWindow !== mainWindow && senderWindow !== settingsWindow)) {
		throw new Error("window_relaunch_not_allowed");
	}
	const forceProcessRelaunch: boolean = typeof options === "object"
		&& options !== null
		&& !Array.isArray(options)
		&& (options as Record<string, unknown>).forceProcess === true;
	if (!app.isPackaged && process.env.ELECTRON_RENDERER_URL && !forceProcessRelaunch) {
		setImmediate(reloadDevelopmentRenderer);
		return;
	}
	if (isAppQuitting) {
		return;
	}
	isAppQuitting = true;
	cancelSettingsWindowPrewarm();
	windowLifecycleController.markQuitting();
	app.relaunch({
		execPath: process.execPath,
		args: process.argv.slice(1)
	});
	app.quit();
});

function createWindow(): void {
	const colors: WindowThemeColors = getCurrentWindowThemeColors(clientPreferencesService.getCachedPreferences());
	mainWindow = new BrowserWindow({
		width: 1300,
		height: 760,
		minWidth: 900,
		minHeight: 620,
		backgroundColor: getWindowBackgroundColor(colors),
		icon: getWindowIconPath(),
		show: false,
		paintWhenInitiallyHidden: true,
		...getNativeWindowMaterialOptions(),
		webPreferences: {
			preload: join(__dirname, "../preload/index.js"),
			contextIsolation: true,
			nodeIntegration: false,
			sandbox: false
		},

		// 自定义标题栏
		titleBarStyle: "hidden",
		...(process.platform != "darwin" ? {
			titleBarStyle: "hidden",
			titleBarOverlay: {
				color: colors.titleBarOverlayColor,
				symbolColor: colors.symbolColor,
				height: 36
			}
		} : {})
	});
	applyWindowTheme(mainWindow, clientPreferencesService.getCachedPreferences());

	if (!app.isPackaged && process.env.DAEDALUS_E2E !== "1") {
		mainWindow.webContents.openDevTools({ mode: "detach" });
	}

	backendBootstrapService.attachWindow(mainWindow);
	windowLifecycleController.attachWindow(mainWindow);
	nativeNotificationService.attachWindow(mainWindow);
	trackRendererWindow(mainWindow);
	requestRendererWindowReveal(mainWindow);

	mainWindow.webContents.setWindowOpenHandler(({ url }) => {
		void shell.openExternal(url);
		return { action: "deny" };
	});

	mainWindow.on("closed", () => {
		browserService.destroyAll();
		mainWindow = null;
		cancelSettingsWindowPrewarm();
		if (settingsWindow !== null && !settingsWindow.isDestroyed()) {
			settingsWindow.close();
		}
		windowLifecycleController.quit();
	});
	loadRendererWindow(mainWindow, "main");
}

if (!hasSingleInstanceLock) {
	app.quit();
} else {
	app.on("second-instance", (_event, argv): void => {
		if (argv.includes("--scheduled-task-runner")) {
			void scheduledTaskService.runDueTasks();
			return;
		}
		activateMainWindow();
	});

	void app.whenReady().then(async (): Promise<void> => {
		registerWorkspaceMediaProtocol();
		await publishStudioExecutableRecord().catch((): void => {
			// Bridge launch metadata is a convenience; failure must not block Studio startup.
		});
		const preferences: ClientPreferences = await clientPreferencesService.load();
		applyNativeThemePreference(preferences);
		clientPreferencesService.onDidChange((nextPreferences: ClientPreferences): void => {
			applyNativeThemePreference(nextPreferences);
			applyWindowThemeToAllWindows();
			broadcastClientPreferencesChanged(nextPreferences);
			windowLifecycleController.syncTrayWithPreferences();
		});
		nativeTheme.on("updated", (): void => {
			applyWindowThemeToAllWindows();
		});
		await scheduledTaskService.start();
		if (isScheduledTaskRunner) {
			await scheduledTaskService.runDueTasks();
			await releaseBackendBeforeQuit();
			allowAppQuit = true;
			app.quit();
			return;
		}
		await remoteAccessService.start();
		createWindow();
		let checkedStartupUpdates: boolean = false;
		const checkStartupUpdates = (state: ReturnType<typeof backendBootstrapService.getState>): void => {
			if (!checkedStartupUpdates && state.status === "healthy") {
				checkedStartupUpdates = true;
				void appUpdateService.checkForUpdatesIfEnabled(preferences.autoCheckForUpdates);
			}
		};
		backendBootstrapService.onDidChangeState(checkStartupUpdates);
		void backendBootstrapService.prepare().then(checkStartupUpdates);
		void godotProjectsService.startupMaintenance();

		app.on("activate", () => {
			if (BrowserWindow.getAllWindows().length === 0) {
				createWindow();
				return;
			}
			activateMainWindow();
		});
	});

	app.on("before-quit", (event) => {
		if (allowAppQuit) {
			return;
		}
		event.preventDefault();
		isAppQuitting = true;
		stopMemoryDiagnostics();
		cancelSettingsWindowPrewarm();
		windowLifecycleController.markQuitting();
		terminalPtyService.dispose();
		void scheduledTaskService.stop();
		gracefulQuitPromise ??= releaseBackendBeforeQuit().finally((): void => {
			allowAppQuit = true;
			app.quit();
		});
	});

	app.on("window-all-closed", () => {
		if (process.platform !== "darwin") {
			app.quit();
		}
	});
}

import { contextBridge, ipcRenderer, webUtils } from "electron";
import type { WindowCaptureAPI } from "../contracts/window-capture";
import type { ComputerAPI, ComputerState } from "../contracts/computer-observation";
import { applyStudioAccentVariables } from "../contracts/theme-color";
import { applyStudioFontVariables } from "../contracts/studio-fonts";
import type { ClientPreferences, ClientPreferencesPatch } from "../contracts/client-preferences";
import type { GeneralSettings } from "../contracts/general-settings";
import type {
	RemoteAccessPairingSession,
	RemoteAccessPortPatch,
	RemoteAccessState,
} from "../contracts/remote-access";
import type {
	BrowserClearDataOptions,
	BrowserCredentialSummary,
	BrowserDownloadRecord,
	BrowserElementSnapshot,
	BrowserHistoryEntry,
	BrowserImportProfile,
	BrowserImportResult,
	BrowserPermissionRequest,
	BrowserPermissionRule,
	BrowserSettings,
	BrowserAutomationRequest,
	BrowserAutomationState,
	BrowserViewBounds,
	BrowserViewState
} from "../contracts/browser";
import type { ManualScheduledTaskCreateInput, ScheduledTask, ScheduledTaskListResult, ScheduledTaskRun, ScheduledTaskToolRequest } from "../contracts/scheduled-tasks";

type AppUpdateState = {
	status: "idle" | "checking" | "available" | "downloading" | "downloaded" | "installing" | "not_available" | "error" | "unsupported";
	updateKind: "client" | "backend" | "combined" | null;
	runtimeBusy: boolean;
	installDeferred: boolean;
	currentVersion: string;
	availableVersion: string | null;
	releaseName: string | null;
	releaseDate: string | null;
	progress: number | null;
	errorMessage: string | null;
	client: AppUpdateComponentState;
	backend: AppUpdateComponentState;
};

type AppUpdateComponentState = {
	status: AppUpdateState["status"];
	currentVersion: string | null;
	availableVersion: string | null;
	releaseName: string | null;
	releaseDate: string | null;
	progress: number | null;
	errorMessage: string | null;
	downloadPhase: "differential" | "full" | null;
	downloadAttempt: number | null;
	downloadFallbackReason: string | null;
};

type BackendBootstrapState = {
	status: "idle" | "checking" | "installing" | "starting" | "healthy" | "error" | "unsupported";
	phase: "detect" | "resolve_latest" | "install" | "write_metadata" | "start" | "health_check" | "ready" | "error";
	packaged: boolean;
	firstRun: boolean;
	progress: number;
	backendVersion: string | null;
	port: number;
	errorCode: string | null;
	errorMessage: string | null;
	suggestedAction: string | null;
};

type BackendDiagnostics = {
	status: "starting" | "healthy" | "unhealthy" | "stopped";
	port: number;
	name: string | null;
	version: string | null;
	processId: number | null;
	logPath: string | null;
};

type BackendLogTail = {
	path: string | null;
	content: string;
	truncated: boolean;
};

type NativeNotificationPayload = {
	kind: "run_completed" | "approval_required" | "clarification_required" | "scheduled_reminder" | "scheduled_completed" | "scheduled_changed" | "scheduled_failed" | "scheduled_approval_required";
	sessionId?: string | null;
	requestId?: string | null;
	taskId?: string | null;
	title: string;
	body: string;
	dedupeKey: string;
};

type NativeNotificationResult = {
	shown: boolean;
	reason?: "foreground" | "deduped" | "unsupported" | "invalid" | "no_window" | "failed";
};

type TrayRecentSession = {
	id: string;
	title: string;
};

type DockLayoutPreferences = {
	open: boolean;
	size: number;
	tabs: Array<{
		key: string;
		kind: "review" | "terminal" | "files" | "browser" | "trajectory";
		index: number;
	}>;
	activeTabKey: string | null;
};

type FilePanelLayoutPreferences = {
	sidebarOpen: boolean;
	splitSize: number;
	selectedSourceFolderId: string | null;
	expandedPathsBySourceFolder: Record<string, string[]>;
	tabs: Array<{
		key: string;
		sourceFolderId: string;
		relativePath: string;
		pinned: boolean;
	}>;
	activeTabKey: string | null;
	previewTabKey: string | null;
};

type SessionLayoutPreferences = {
	side: DockLayoutPreferences;
	bottom: DockLayoutPreferences;
	fullscreenDock: "side" | "bottom" | null;
	filePanels: Record<string, FilePanelLayoutPreferences>;
	browserPanels: Record<string, { lastUrl: string | null }>;
};

type GodotProjectPluginStatus =
	| "not_installed"
	| "current"
	| "development"
	| "outdated"
	| "disabled"
	| "modified"
	| "pending"
	| "pending_restart"
	| "failed";

type GodotProjectScanResult = {
	projects: Array<{
		id: string;
		name: string;
		path: string;
		godotVersion: string | null;
		pluginVersion: string | null;
		bundledPluginVersion: string | null;
		enabled: boolean;
		status: GodotProjectPluginStatus;
		errorMessage: string | null;
	}>;
	plugin: {
		available: boolean;
		version: string | null;
		studioVersion: string | null;
		errorMessage: string | null;
	};
};

function getCachedClientPreferences(): ClientPreferences {
	return ipcRenderer.sendSync("client-preferences:get-cached") as ClientPreferences;
}

function resolveRendererTheme(themePreference: ClientPreferences["theme"]): "light" | "dark" {
	if (themePreference === "light" || themePreference === "dark") {
		return themePreference;
	}
	return globalThis.matchMedia?.("(prefers-color-scheme: light)").matches === true ? "light" : "dark";
}

let cachedClientPreferences: ClientPreferences = getCachedClientPreferences();

function applyRendererTheme(preferences: ClientPreferences = cachedClientPreferences): void {
	const rootElement: HTMLElement | null = document.documentElement;
	if (rootElement === null) {
		return;
	}
	const resolvedTheme: "light" | "dark" = resolveRendererTheme(preferences.theme);
	rootElement.dataset.theme = resolvedTheme;
	applyStudioAccentVariables(rootElement.style, resolvedTheme, preferences.themeColor);
	applyStudioFontVariables(
		rootElement.style,
		preferences.fontFamily,
		preferences.fontFamilyCode,
		preferences.uiFontSize,
		preferences.codeFontSize
	);
	rootElement.dataset.motion = preferences.animationsEnabled !== false ? "on" : "off";
}

applyRendererTheme();
document.addEventListener("readystatechange", (): void => applyRendererTheme(), { once: true });

contextBridge.exposeInMainWorld("electronAPI", {
	versions: {
		chrome: process.versions.chrome,
		electron: process.versions.electron,
		node: process.versions.node
	},

	backend: {
		getPort: (): Promise<number> => ipcRenderer.invoke("backend:get-port"),
		getConnectionInfo: (): Promise<{ port: number; authProtocol: string | null }> => {
			return ipcRenderer.invoke("backend:get-connection-info");
		},
		getStatus: (): Promise<string> => ipcRenderer.invoke("backend:get-status"),
		getDiagnostics: (): Promise<BackendDiagnostics> => ipcRenderer.invoke("backend:get-diagnostics"),
		getLogTail: (): Promise<BackendLogTail> => ipcRenderer.invoke("backend:get-log-tail"),
		openLog: (): Promise<{ opened: boolean; path: string | null }> => ipcRenderer.invoke("backend:open-log"),
		healthCheck: (): Promise<boolean> => ipcRenderer.invoke("backend:health-check"),
		restart: (): Promise<void> => ipcRenderer.invoke("backend:restart"),
		onStatusChanged: (callback: (status: string) => void): (() => void) => {
			const handler = (_event: Electron.IpcRendererEvent, status: string): void => callback(status);
			ipcRenderer.on("backend:status-changed", handler);
			return () => { ipcRenderer.removeListener("backend:status-changed", handler); };
		}
	},

	backendBootstrap: {
		getState: (): Promise<BackendBootstrapState> => {
			return ipcRenderer.invoke("backend-bootstrap:get-state");
		},
		prepare: (): Promise<BackendBootstrapState> => {
			return ipcRenderer.invoke("backend-bootstrap:prepare");
		},
		repair: (): Promise<BackendBootstrapState> => {
			return ipcRenderer.invoke("backend-bootstrap:repair");
		},
		retryStart: (): Promise<BackendBootstrapState> => {
			return ipcRenderer.invoke("backend-bootstrap:retry-start");
		},
		onStateChanged: (callback: (state: BackendBootstrapState) => void): (() => void) => {
			const handler = (_event: Electron.IpcRendererEvent, payload: BackendBootstrapState): void => callback(payload);
			ipcRenderer.on("backend-bootstrap:state-changed", handler);
			return () => { ipcRenderer.removeListener("backend-bootstrap:state-changed", handler); };
		}
	},

	clientPreferences: {
		getCached: (): ClientPreferences => {
			return cachedClientPreferences;
		},
		get: (): Promise<ClientPreferences> => {
			return ipcRenderer.invoke("client-preferences:get");
		},
		update: (patch: ClientPreferencesPatch): Promise<ClientPreferences> => {
			return ipcRenderer.invoke("client-preferences:update", patch);
		},
		onChanged: (callback: (preferences: ClientPreferences) => void): (() => void) => {
			const handler = (_event: Electron.IpcRendererEvent, preferences: ClientPreferences): void => {
				cachedClientPreferences = preferences;
				applyRendererTheme(preferences);
				callback(preferences);
			};
			ipcRenderer.on("client-preferences:changed", handler);
			return (): void => {
				ipcRenderer.removeListener("client-preferences:changed", handler);
			};
		}
	},

	generalSettings: {
		notifyChanged: (settings: GeneralSettings): void => {
			ipcRenderer.send("general-settings:changed", settings);
		},
		onChanged: (callback: (settings: GeneralSettings) => void): (() => void) => {
			const handler = (_event: Electron.IpcRendererEvent, settings: GeneralSettings): void => {
				callback(settings);
			};
			ipcRenderer.on("general-settings:changed", handler);
			return (): void => {
				ipcRenderer.removeListener("general-settings:changed", handler);
			};
		}
	},

	remoteAccess: {
		getState: (): Promise<RemoteAccessState> => ipcRenderer.invoke("remote-access:get-state"),
		setEnabled: (enabled: boolean): Promise<RemoteAccessState> => {
			return ipcRenderer.invoke("remote-access:set-enabled", enabled);
		},
		updatePorts: (patch: RemoteAccessPortPatch): Promise<RemoteAccessState> => {
			return ipcRenderer.invoke("remote-access:update-ports", patch);
		},
		beginPairing: (): Promise<RemoteAccessPairingSession> => {
			return ipcRenderer.invoke("remote-access:begin-pairing");
		},
		revokeDevice: (deviceId: string): Promise<RemoteAccessState> => {
			return ipcRenderer.invoke("remote-access:revoke-device", deviceId);
		},
		revokeAll: (rotateIdentity: boolean): Promise<RemoteAccessState> => {
			return ipcRenderer.invoke("remote-access:revoke-all", rotateIdentity);
		},
		onStateChanged: (callback: (state: RemoteAccessState) => void): (() => void) => {
			const handler = (_event: Electron.IpcRendererEvent, state: RemoteAccessState): void => callback(state);
			ipcRenderer.on("remote-access:state-changed", handler);
			return (): void => {
				ipcRenderer.removeListener("remote-access:state-changed", handler);
			};
		},
	},

	sessionCatalog: {
		notifyChanged: (): void => {
			ipcRenderer.send("session-catalog:changed");
		},
		onChanged: (callback: () => void): (() => void) => {
			const handler = (): void => callback();
			ipcRenderer.on("session-catalog:changed", handler);
			return (): void => {
				ipcRenderer.removeListener("session-catalog:changed", handler);
			};
		}
	},

	scheduledTasks: {
		list: (): Promise<ScheduledTaskListResult> => ipcRenderer.invoke("scheduled-tasks:list"),
		create: (input: ManualScheduledTaskCreateInput): Promise<ScheduledTask> => ipcRenderer.invoke("scheduled-tasks:create", input),
		get: (taskId: string): Promise<ScheduledTask> => ipcRenderer.invoke("scheduled-tasks:get", taskId),
		pause: (taskId: string): Promise<ScheduledTask> => ipcRenderer.invoke("scheduled-tasks:pause", taskId),
		resume: (taskId: string): Promise<ScheduledTask> => ipcRenderer.invoke("scheduled-tasks:resume", taskId),
		runNow: (taskId: string): Promise<{ queued: true }> => ipcRenderer.invoke("scheduled-tasks:run-now", taskId),
		delete: (taskId: string): Promise<{ deleted: true }> => ipcRenderer.invoke("scheduled-tasks:delete", taskId),
		listRuns: (taskId?: string): Promise<ScheduledTaskRun[]> => ipcRenderer.invoke("scheduled-tasks:runs-list", taskId),
		executeTool: (request: ScheduledTaskToolRequest): Promise<Record<string, unknown>> => ipcRenderer.invoke("scheduled-tasks:execute-tool", request),
		reconcileSessionRun: (input: { sessionId: string; status: "succeeded" | "failed" | "awaiting_approval"; summary?: string }): Promise<{ reconciled: boolean }> => ipcRenderer.invoke("scheduled-tasks:reconcile-session-run", input),
		onChanged: (callback: () => void): (() => void) => {
			const handler = (): void => callback();
			ipcRenderer.on("scheduled-tasks:changed", handler);
			return (): void => { ipcRenderer.removeListener("scheduled-tasks:changed", handler); };
		},
		onRunUpdated: (callback: (run: ScheduledTaskRun) => void): (() => void) => {
			const handler = (_event: Electron.IpcRendererEvent, run: ScheduledTaskRun): void => callback(run);
			ipcRenderer.on("scheduled-task-run:updated", handler);
			return (): void => { ipcRenderer.removeListener("scheduled-task-run:updated", handler); };
		},
		onNavigate: (callback: (target: { taskId: string; sessionId: string | null }) => void): (() => void) => {
			const handler = (_event: Electron.IpcRendererEvent, target: { taskId: string; sessionId: string | null }): void => callback(target);
			ipcRenderer.on("scheduled-task:navigate", handler);
			return (): void => { ipcRenderer.removeListener("scheduled-task:navigate", handler); };
		},
	},

	clipboard: {
		writeText: (text: string): Promise<{ written: true }> => {
			return ipcRenderer.invoke("clipboard:write-text", text);
		},
		readText: (): Promise<{ text: string }> => {
			return ipcRenderer.invoke("clipboard:read-text");
		},
		readImage: (): Promise<{ dataUrl: string | null; fileName?: string }> => {
			return ipcRenderer.invoke("clipboard:read-image");
		}
	},

	...(process.platform === "win32" ? { windowCapture: {
		list: (params) => ipcRenderer.invoke("window-capture:list", params),
		capture: (params) => ipcRenderer.invoke("window-capture:capture", params),
		release: (params) => ipcRenderer.invoke("window-capture:release", params),
	} satisfies WindowCaptureAPI } : {}),
	...(process.platform === "win32" && process.arch === "x64" ? { computerObservation: {
    previewOverlay: (request) => ipcRenderer.invoke("computer:previewOverlay", request),
		onRevoked: (listener) => { const handler = (_event: Electron.IpcRendererEvent, value: Parameters<typeof listener>[0]): void => listener(value); ipcRenderer.on("computer:revoked", handler); return () => { ipcRenderer.removeListener("computer:revoked", handler); }; },
		getState: () => ipcRenderer.invoke("computer:getState"),
		onState: (listener) => { const handler = (_event: Electron.IpcRendererEvent, state: ComputerState): void => listener(state); ipcRenderer.on("computer:state", handler); return () => { ipcRenderer.removeListener("computer:state", handler); }; },
		setEnabled: (enabled) => ipcRenderer.invoke("computer:setEnabled", enabled),
    setControlEnabled: (enabled) => ipcRenderer.invoke("computer:setControlEnabled", enabled),
    resume: () => ipcRenderer.invoke("computer:resume"),
    clearTarget: () => ipcRenderer.invoke("computer:clearTarget"),
    heartbeat: (scope) => ipcRenderer.invoke("computer:heartbeat", scope),
    acknowledgeControl: (scope) => ipcRenderer.invoke("computer:acknowledgeControl", scope),
		setContext: (context) => ipcRenderer.invoke("computer:setContext", context),
		execute: (request) => ipcRenderer.invoke("computer:execute", request),
		cancel: (callId) => ipcRenderer.invoke("computer:cancel", callId),
		finish: (scope) => ipcRenderer.invoke("computer:finish", scope),
		list: () => ipcRenderer.invoke("computer:list"),
		decide: (params) => ipcRenderer.invoke("computer:decide", params),
		revoke: () => ipcRenderer.invoke("computer:revoke"),
		diagnose: (sourceId) => ipcRenderer.invoke("computer:diagnose", sourceId),
		listDiagnostics: () => ipcRenderer.invoke("computer:listDiagnostics"),
		closeDiagnostics: () => ipcRenderer.invoke("computer:closeDiagnostics"),
	} satisfies ComputerAPI } : {}),

	nativeNotifications: {
		show: (payload: NativeNotificationPayload): Promise<NativeNotificationResult> => {
			return ipcRenderer.invoke("native-notification:show", payload);
		},
		clearAttention: (): Promise<{ cleared: true }> => {
			return ipcRenderer.invoke("native-notification:clear-attention");
		},
		onForeground: (callback: (payload: NativeNotificationPayload) => void): (() => void) => {
			const handler = (_event: Electron.IpcRendererEvent, payload: NativeNotificationPayload): void => callback(payload);
			ipcRenderer.on("native-notification:foreground", handler);
			return (): void => { ipcRenderer.removeListener("native-notification:foreground", handler); };
		},
	},

	tray: {
		updateRecentSessions: (sessions: TrayRecentSession[]): Promise<{ updated: true }> => {
			return ipcRenderer.invoke("tray:update-recent-sessions", sessions);
		},
		onNewChat: (callback: () => void): (() => void) => {
			const handler = (): void => callback();
			ipcRenderer.on("tray:new-chat", handler);
			return () => { ipcRenderer.removeListener("tray:new-chat", handler); };
		},
		onOpenSession: (callback: (sessionId: string) => void): (() => void) => {
			const handler = (_event: Electron.IpcRendererEvent, sessionId: string): void => callback(sessionId);
			ipcRenderer.on("tray:open-session", handler);
			return () => { ipcRenderer.removeListener("tray:open-session", handler); };
		}
	},

	windowControl: {
		openSettings: (page?: string): Promise<void> => ipcRenderer.invoke("window:open-settings", page),
		openPluginReview: (payload: unknown): Promise<void> => ipcRenderer.invoke("window:open-plugin-review", payload),
		consumePluginReview: (): Promise<unknown> => ipcRenderer.invoke("window:consume-plugin-review"),
		onPluginReviewRequested: (callback: () => void): (() => void) => {
			const handler = (): void => callback();
			ipcRenderer.on("window:plugin-review-requested", handler);
			return (): void => { ipcRenderer.removeListener("window:plugin-review-requested", handler); };
		},
		openExternal: (url: string): Promise<void> => ipcRenderer.invoke("window:open-external", url),
		relaunch: (options?: { forceProcess?: boolean }): Promise<void> => ipcRenderer.invoke("window:relaunch", options),
		rendererShellReady: (): void => ipcRenderer.send("window:renderer-shell-ready"),
		rendererReady: (): void => ipcRenderer.send("window:renderer-ready"),
		onSettingsPageRequested: (callback: (page: string) => void): (() => void) => {
			const handler = (_event: Electron.IpcRendererEvent, page: string): void => callback(page);
			ipcRenderer.on("window:open-settings", handler);
			return () => { ipcRenderer.removeListener("window:open-settings", handler); };
		}
	},

	browser: {
		view: {
			create: (browserId: string): Promise<BrowserViewState> => ipcRenderer.invoke("browser:view-create", { browserId }),
			destroy: (browserId: string): Promise<void> => ipcRenderer.invoke("browser:view-destroy", { browserId }),
			setBounds: (browserId: string, bounds: BrowserViewBounds): Promise<void> => ipcRenderer.invoke("browser:view-bounds", { browserId, bounds }),
			setVisible: (browserId: string, visible: boolean): Promise<void> => ipcRenderer.invoke("browser:view-visible", { browserId, visible }),
			navigate: (browserId: string, url: string): Promise<BrowserViewState> => ipcRenderer.invoke("browser:view-navigate", { browserId, url }),
			openFile: (browserId: string, params: { workspaceRoot: string; filePath: string }): Promise<BrowserViewState> => ipcRenderer.invoke("browser:view-open-file", { browserId, ...params }),
			action: (browserId: string, action: "back" | "forward" | "reload" | "stop"): Promise<BrowserViewState> => ipcRenderer.invoke("browser:view-action", { browserId, action }),
			inspect: (browserId: string): Promise<void> => ipcRenderer.invoke("browser:view-inspect", { browserId }),
			getState: (browserId: string): Promise<BrowserViewState> => ipcRenderer.invoke("browser:view-state", { browserId }),
			capture: (browserId: string): Promise<string | null> => ipcRenderer.invoke("browser:view-capture", { browserId }),
			onStateChanged: (callback: (state: BrowserViewState) => void): (() => void) => {
				const handler = (_event: Electron.IpcRendererEvent, state: BrowserViewState): void => callback(state);
				ipcRenderer.on("browser:view-state-changed", handler);
				return (): void => { ipcRenderer.removeListener("browser:view-state-changed", handler); };
			},
			onElementSelected: (callback: (event: { browserId: string; snapshot: BrowserElementSnapshot }) => void): (() => void) => {
				const handler = (_event: Electron.IpcRendererEvent, payload: { browserId: string; snapshot: BrowserElementSnapshot }): void => callback(payload);
				ipcRenderer.on("browser:view-element-selected", handler);
				return (): void => { ipcRenderer.removeListener("browser:view-element-selected", handler); };
			},
			onInspectCancelled: (callback: (event: { browserId: string }) => void): (() => void) => {
				const handler = (_event: Electron.IpcRendererEvent, payload: { browserId: string }): void => callback(payload);
				ipcRenderer.on("browser:view-inspect-cancelled", handler);
				return (): void => { ipcRenderer.removeListener("browser:view-inspect-cancelled", handler); };
			}
		},
		automation: {
			execute: (request: BrowserAutomationRequest): Promise<Record<string, unknown>> => ipcRenderer.invoke("browser:automation-execute", request),
			cancel: (browserId: string, callId?: string): Promise<void> => ipcRenderer.invoke("browser:automation-cancel", { browserId, callId }),
			onStateChanged: (callback: (state: BrowserAutomationState) => void): (() => void) => {
				const handler = (_event: Electron.IpcRendererEvent, state: BrowserAutomationState): void => callback(state);
				ipcRenderer.on("browser:automation-state-changed", handler);
				return (): void => { ipcRenderer.removeListener("browser:automation-state-changed", handler); };
			}
		},
		history: {
			list: (): Promise<BrowserHistoryEntry[]> => ipcRenderer.invoke("browser:history-list"),
			clear: (): Promise<void> => ipcRenderer.invoke("browser:history-clear")
		},
		downloads: {
			list: (): Promise<BrowserDownloadRecord[]> => ipcRenderer.invoke("browser:downloads-list"),
			cancel: (id: string): Promise<void> => ipcRenderer.invoke("browser:downloads-cancel", id),
			open: (id: string): Promise<void> => ipcRenderer.invoke("browser:downloads-open", id),
			reveal: (id: string): Promise<void> => ipcRenderer.invoke("browser:downloads-reveal", id),
			remove: (id: string): Promise<void> => ipcRenderer.invoke("browser:downloads-remove", id),
			clear: (): Promise<void> => ipcRenderer.invoke("browser:downloads-clear"),
			onChanged: (callback: (record: BrowserDownloadRecord) => void): (() => void) => {
				const handler = (_event: Electron.IpcRendererEvent, record: BrowserDownloadRecord): void => callback(record);
				ipcRenderer.on("browser:download-changed", handler);
				return (): void => { ipcRenderer.removeListener("browser:download-changed", handler); };
			}
		},
		permissions: {
			set: (rule: Pick<BrowserPermissionRule, "origin" | "permission" | "decision">): Promise<BrowserPermissionRule[]> => ipcRenderer.invoke("browser:permissions-set", rule),
			remove: (origin: string, permission: string): Promise<BrowserPermissionRule[]> => ipcRenderer.invoke("browser:permissions-remove", { origin, permission }),
			respond: (request: BrowserPermissionRequest, decision: "allow_once" | "allow_always" | "block"): Promise<void> => ipcRenderer.invoke("browser:permissions-respond", { ...request, decision }),
			onRequested: (callback: (request: BrowserPermissionRequest) => void): (() => void) => {
				const handler = (_event: Electron.IpcRendererEvent, request: BrowserPermissionRequest): void => callback(request);
				ipcRenderer.on("browser:permission-requested", handler);
				return (): void => { ipcRenderer.removeListener("browser:permission-requested", handler); };
			}
		},
		passwords: {
			list: (): Promise<BrowserCredentialSummary[]> => ipcRenderer.invoke("browser:passwords-list"),
			save: (payload: { origin: string; username: string; password: string }): Promise<BrowserCredentialSummary> => ipcRenderer.invoke("browser:passwords-save", payload),
			reveal: (id: string): Promise<{ password: string }> => ipcRenderer.invoke("browser:passwords-reveal", id),
			remove: (id: string): Promise<void> => ipcRenderer.invoke("browser:passwords-remove", id),
			forUrl: (url: string): Promise<BrowserCredentialSummary[]> => ipcRenderer.invoke("browser:passwords-for-url", url),
			fill: (browserId: string, credentialId: string): Promise<void> => ipcRenderer.invoke("browser:passwords-fill", { browserId, credentialId })
		},
		import: {
			listProfiles: (): Promise<BrowserImportProfile[]> => ipcRenderer.invoke("browser:import-profiles"),
			run: (payload: { source: "chrome" | "edge"; profileId: string; includeCookies: boolean; includePasswords: boolean }): Promise<BrowserImportResult> => ipcRenderer.invoke("browser:import-run", payload)
		},
		settings: {
			get: (): Promise<BrowserSettings> => ipcRenderer.invoke("browser:settings-get"),
			update: (patch: Partial<Omit<BrowserSettings, "permissionRules">>): Promise<BrowserSettings> => ipcRenderer.invoke("browser:settings-update", patch),
			getDefaultDownloadDirectory: (): Promise<string> => ipcRenderer.invoke("browser:settings-get-default-download-directory"),
			pickDownloadDirectory: (): Promise<string | null> => ipcRenderer.invoke("browser:settings-pick-download-directory"),
			onChanged: (callback: (settings: BrowserSettings) => void): (() => void) => {
				const handler = (_event: Electron.IpcRendererEvent, settings: BrowserSettings): void => callback(settings);
				ipcRenderer.on("browser:settings-changed", handler);
				return (): void => { ipcRenderer.removeListener("browser:settings-changed", handler); };
			}
		},
		data: {
			clear: (options: BrowserClearDataOptions): Promise<void> => ipcRenderer.invoke("browser:data-clear", options)
		}
	},

	dataReset: {
		resetAll: (): Promise<{ reset: true }> => ipcRenderer.invoke("app-data:reset-all")
	},

	appUpdate: {
		getState: (): Promise<AppUpdateState> => {
			return ipcRenderer.invoke("app-update:get-state");
		},
		setRuntimeBusy: (runtimeBusy: boolean): Promise<AppUpdateState> => {
			return ipcRenderer.invoke("app-update:set-runtime-busy", runtimeBusy);
		},
		check: (): Promise<AppUpdateState> => {
			return ipcRenderer.invoke("app-update:check");
		},
		download: (): Promise<AppUpdateState> => {
			return ipcRenderer.invoke("app-update:download");
		},
		acknowledge: (): Promise<AppUpdateState> => {
			return ipcRenderer.invoke("app-update:acknowledge");
		},
		onStateChanged: (callback: (state: AppUpdateState) => void): (() => void) => {
			const handler = (_event: Electron.IpcRendererEvent, payload: AppUpdateState): void => callback(payload);
			ipcRenderer.on("app-update:state-changed", handler);
			return () => { ipcRenderer.removeListener("app-update:state-changed", handler); };
		}
	},

	terminal: {
		create: (params: { terminalId?: string | null; cwd?: string | null; cols: number; rows: number }): Promise<{ terminalId: string; shell: string; cwd: string; running: boolean }> => {
			return ipcRenderer.invoke("terminal:create", params);
		},
		write: (params: { terminalId: string; data: string }): Promise<{ written: true }> => {
			return ipcRenderer.invoke("terminal:write", params);
		},
		resize: (params: { terminalId: string; cols: number; rows: number }): Promise<{ resized: true }> => {
			return ipcRenderer.invoke("terminal:resize", params);
		},
		kill: (params: { terminalId: string }): Promise<{ killed: true }> => {
			return ipcRenderer.invoke("terminal:kill", params);
		},
		getState: (params?: { terminalId?: string | null }): Promise<{ terminalId: string; shell: string; cwd: string; running: boolean } | null> => {
			return ipcRenderer.invoke("terminal:get-state", params);
		},
		onData: (callback: (event: { terminalId: string; data: string }) => void): (() => void) => {
			const handler = (_event: Electron.IpcRendererEvent, payload: { terminalId: string; data: string }): void => callback(payload);
			ipcRenderer.on("terminal:data", handler);
			return () => { ipcRenderer.removeListener("terminal:data", handler); };
		},
		onExit: (callback: (event: { terminalId: string; exitCode: number; signal: number | string | null }) => void): (() => void) => {
			const handler = (_event: Electron.IpcRendererEvent, payload: { terminalId: string; exitCode: number; signal: number | string | null }): void => callback(payload);
			ipcRenderer.on("terminal:exit", handler);
			return () => { ipcRenderer.removeListener("terminal:exit", handler); };
		}
	},

	sessionFs: {
		openSessionDirectory: (sessionId: string): Promise<{ opened: true }> => {
			return ipcRenderer.invoke("session-fs:open-directory", sessionId);
		},
		pickExportDestination: (params: { sessionId: string; title: string; dialogTitle?: string; buttonLabel?: string }): Promise<string | null> => {
			return ipcRenderer.invoke("session-fs:pick-export-destination", params);
		},
		pickImportSource: (params?: { dialogTitle?: string; buttonLabel?: string }): Promise<string | null> => {
			return ipcRenderer.invoke("session-fs:pick-import-source", params);
		}
	},

	sessionLayout: {
		getAll: (): Promise<Record<string, SessionLayoutPreferences>> => {
			return ipcRenderer.invoke("session-layout:get-all");
		},
		save: (payload: { sessionId: string; layout: SessionLayoutPreferences }): Promise<SessionLayoutPreferences> => {
			return ipcRenderer.invoke("session-layout:save", payload);
		},
		remove: (payload: { sessionIds: string[] }): Promise<{ removed: number }> => {
			return ipcRenderer.invoke("session-layout:remove", payload);
		}
	},

	workspaceFs: {
		listChildren: (params: { workspaceRoot: string; relativePath?: string }): Promise<{ entries: Array<{ name: string; relativePath: string; resourcePath: string; kind: "file" | "folder" }> }> => {
			return ipcRenderer.invoke("workspace-fs:list-children", params);
		},
		pickWorkspaceDirectory: (): Promise<string | null> => {
			return ipcRenderer.invoke("workspace-fs:pick-directory");
		},
		pickWorkspaceFiles: (params: { workspaceRoot: string }): Promise<Array<{ name: string; relativePath: string; resourcePath: string; kind: "file" | "folder" }> | null> => {
			return ipcRenderer.invoke("workspace-fs:pick-files", params);
		},
		pickWorkspaceFolder: (params: { workspaceRoot: string }): Promise<Array<{ name: string; relativePath: string; resourcePath: string; kind: "file" | "folder" }> | null> => {
			return ipcRenderer.invoke("workspace-fs:pick-folder", params);
		},
		getPathForFile: (file: File): string => {
			return webUtils.getPathForFile(file);
		},
		createEntriesFromPaths: (params: { workspaceRoot: string; paths: string[] }): Promise<Array<{ name: string; relativePath: string; resourcePath: string; kind: "file" | "folder" }>> => {
			return ipcRenderer.invoke("workspace-fs:create-entries-from-paths", params);
		},
		openWorkspaceDirectory: (workspaceRoot: string): Promise<{ opened: true }> => {
			return ipcRenderer.invoke("workspace-fs:open-directory", workspaceRoot);
		},
		openFile: (params: { workspaceRoot: string; filePath: string }): Promise<{ opened: true }> => {
			return ipcRenderer.invoke("workspace-fs:open-file", params);
		},
		revealFile: (params: { workspaceRoot: string; filePath: string }): Promise<{ revealed: true }> => {
			return ipcRenderer.invoke("workspace-fs:reveal-file", params);
		},
		saveFileAs: (params: { workspaceRoot: string; filePath: string }): Promise<{ saved: true; filePath: string } | { saved: false }> => {
			return ipcRenderer.invoke("workspace-fs:save-file-as", params);
		},
		readTextFile: (params: { workspaceRoot: string; filePath: string }): Promise<{ readable: boolean; binary: boolean; oversized: boolean; content?: string; byteSize: number; modifiedAtMs: number; sha256: string; relativePath: string }> => {
			return ipcRenderer.invoke("workspace-fs:read-text-file", params);
		},
		statFile: (params: { workspaceRoot: string; filePath: string }): Promise<{ readable: boolean; binary: boolean; oversized: boolean; byteSize: number; modifiedAtMs: number; sha256: string; relativePath: string }> => {
			return ipcRenderer.invoke("workspace-fs:stat-file", params);
		},
		createMediaUrl: (params: { workspaceRoot: string; filePath: string }): Promise<{ supported: boolean; kind?: "image" | "audio" | "video"; mimeType?: string; url?: string; byteSize: number; modifiedAtMs: number; relativePath: string }> => {
			return ipcRenderer.invoke("workspace-fs:create-media-url", params);
		},
		writeTextFile: (params: { workspaceRoot: string; filePath: string; content: string; expectedSha256: string; expectedModifiedAtMs: number }): Promise<{ saved: true; byteSize: number; modifiedAtMs: number; sha256: string; relativePath: string }> => {
			return ipcRenderer.invoke("workspace-fs:write-text-file", params);
		},
		saveTextFileAs: (params: { workspaceRoot: string; filePath: string; content: string }): Promise<{ saved: true; filePath: string } | { saved: false }> => {
			return ipcRenderer.invoke("workspace-fs:save-text-file-as", params);
		},
		search: (params: { workspaceRoot: string; query: string; maxResults?: number }): Promise<{ entries: Array<{ name: string; relativePath: string; resourcePath: string; kind: "file" | "folder" }>; truncated: boolean }> => {
			return ipcRenderer.invoke("workspace-fs:search", params);
		},
		listLaunchTargets: (params?: { godotExecutablePath?: string | null }): Promise<Array<{ id: "file-explorer" | "terminal" | "vscode" | "visual-studio" | "github-desktop" | "git-bash" | "godot"; label: string }>> => {
			return ipcRenderer.invoke("workspace-fs:list-launch-targets", params);
		},
		openLaunchTarget: (params: { workspaceRoot: string; filePath?: string; targetId: "file-explorer" | "terminal" | "vscode" | "visual-studio" | "github-desktop" | "git-bash" | "godot"; godotExecutablePath?: string | null; godotRunMode?: "editor" | "project" | "scene"; godotScenePath?: string }): Promise<{ opened: true; targetId: "file-explorer" | "terminal" | "vscode" | "visual-studio" | "github-desktop" | "git-bash" | "godot" }> => {
			return ipcRenderer.invoke("workspace-fs:open-launch-target", params);
		}
	},

	imageExport: {
		savePng: (params: { defaultFileName: string; bytes: Uint8Array }): Promise<{ saved: true; filePath: string } | { saved: false }> => {
			return ipcRenderer.invoke("image-export:save-png", params);
		}
	},

	fileExport: {
		saveText: (params: { defaultFileName: string; content: string; dialogTitle?: string; buttonLabel?: string }): Promise<{ saved: true; filePath: string } | { saved: false }> => {
			return ipcRenderer.invoke("file-export:save-text", params);
		}
	},

	skillFs: {
		pickSkillZip: (): Promise<string | null> => {
			return ipcRenderer.invoke("skill-fs:pick-zip");
		},
		pickSkillDirectory: (): Promise<string | null> => {
			return ipcRenderer.invoke("skill-fs:pick-directory");
		}
	},

	pluginFs: {
		pickDirectory: (): Promise<string | null> => ipcRenderer.invoke("plugin-fs:pick-directory"),
		pickTarball: (): Promise<string | null> => ipcRenderer.invoke("plugin-fs:pick-tarball"),
		openDirectory: (directoryName: string): Promise<void> => ipcRenderer.invoke("plugin-fs:open-directory", directoryName),
	},
	godotDocumentationFs: {
		pickDirectory: (): Promise<string | null> => {
			return ipcRenderer.invoke("godot-documentation-fs:pick-directory");
		},
		pickZip: (): Promise<string | null> => {
			return ipcRenderer.invoke("godot-documentation-fs:pick-zip");
		}
	},

	godotProjects: {
		scan: (): Promise<GodotProjectScanResult> => ipcRenderer.invoke("godot-projects:scan"),
		add: (): Promise<GodotProjectScanResult> => ipcRenderer.invoke("godot-projects:add"),
		install: (projectPath: string): Promise<GodotProjectScanResult> =>
			ipcRenderer.invoke("godot-projects:install", projectPath),
		repair: (projectPath: string): Promise<GodotProjectScanResult> =>
			ipcRenderer.invoke("godot-projects:repair", projectPath),
		uninstall: (projectPath: string): Promise<GodotProjectScanResult> =>
			ipcRenderer.invoke("godot-projects:uninstall", projectPath),
		setEnabled: (projectPath: string, enabled: boolean): Promise<GodotProjectScanResult> =>
			ipcRenderer.invoke("godot-projects:set-enabled", projectPath, enabled),
		upgradeAll: (): Promise<GodotProjectScanResult> => ipcRenderer.invoke("godot-projects:upgrade-all"),
		retryPending: (): Promise<GodotProjectScanResult> => ipcRenderer.invoke("godot-projects:retry-pending")
	},

	skillCli: {
		listGlobalCodexSkills: (): Promise<Array<{ name: string; path: string; slug: string }>> => {
			return ipcRenderer.invoke("skills-cli:list-global-codex");
		}
	},

	pickGodotExecutable: (): Promise<string | null> => {
		return ipcRenderer.invoke("godot-executable:pick");
	},

	checkDiskSpace: (): Promise<{ drive: string; free: number; total: number } | null> => {
		return ipcRenderer.invoke("electron:checkDiskSpace");
	},

	appInfo: {
		getPackageInfo: (): Promise<{
			name: string;
			version: string;
			description: string;
			license: string;
			author: string;
			godotBridgeVersion: string;
			godotBridgeProtocolVersion: number | null;
		}> => {
			return ipcRenderer.invoke("app:get-package-info");
		}
	}
});

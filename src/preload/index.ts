import { contextBridge, ipcRenderer, webUtils } from "electron";
import type { KeyboardShortcutOverrides } from "../contracts/keyboard-shortcuts";
import { applyStudioAccentVariables } from "../contracts/theme-color";
import type { OnboardingPreferences } from "../contracts/onboarding";
import type { NewSessionComposerPreferences } from "../contracts/new-session-composer-preferences";

type ClientPreferences = {
	autoCheckForUpdates: boolean;
	minimizeToTrayOnClose: boolean;
	theme: "system" | "light" | "dark";
	themeColor: string;
	language: "system" | "en-US" | "zh-CN";
	workspaceSidebar: {
		open: boolean;
		size: number;
	};
	keyboardShortcuts: KeyboardShortcutOverrides;
	lastComposerModel: {
		providerId: string;
		modelId: string;
	} | null;
	newSessionComposer: NewSessionComposerPreferences;
	onboarding: OnboardingPreferences;
};

type AppUpdateState = {
	status: "idle" | "checking" | "available" | "downloading" | "downloaded" | "installing" | "not_available" | "error" | "unsupported";
	updateKind: "client" | "backend" | "combined" | null;
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

type NativeNotificationPayload = {
	kind: "run_completed" | "approval_required" | "clarification_required";
	sessionId?: string | null;
	requestId?: string | null;
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
		kind: "review" | "terminal";
		index: number;
	}>;
	activeTabKey: string | null;
};

type SessionLayoutPreferences = {
	side: DockLayoutPreferences;
	bottom: DockLayoutPreferences;
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
		update: (patch: Partial<ClientPreferences>): Promise<ClientPreferences> => {
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

	clipboard: {
		writeText: (text: string): Promise<{ written: true }> => {
			return ipcRenderer.invoke("clipboard:write-text", text);
		},
		readText: (): Promise<{ text: string }> => {
			return ipcRenderer.invoke("clipboard:read-text");
		}
	},

	nativeNotifications: {
		show: (payload: NativeNotificationPayload): Promise<NativeNotificationResult> => {
			return ipcRenderer.invoke("native-notification:show", payload);
		},
		clearAttention: (): Promise<{ cleared: true }> => {
			return ipcRenderer.invoke("native-notification:clear-attention");
		}
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
		relaunch: (options?: { forceProcess?: boolean }): Promise<void> => ipcRenderer.invoke("window:relaunch", options),
		rendererShellReady: (): void => ipcRenderer.send("window:renderer-shell-ready"),
		rendererReady: (): void => ipcRenderer.send("window:renderer-ready"),
		onSettingsPageRequested: (callback: (page: string) => void): (() => void) => {
			const handler = (_event: Electron.IpcRendererEvent, page: string): void => callback(page);
			ipcRenderer.on("window:open-settings", handler);
			return () => { ipcRenderer.removeListener("window:open-settings", handler); };
		}
	},

	dataReset: {
		resetAll: (): Promise<{ reset: true }> => ipcRenderer.invoke("app-data:reset-all")
	},

	appUpdate: {
		getState: (): Promise<AppUpdateState> => {
			return ipcRenderer.invoke("app-update:get-state");
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
		listLaunchTargets: (params?: { godotExecutablePath?: string | null }): Promise<Array<{ id: "file-explorer" | "terminal" | "vscode" | "visual-studio" | "github-desktop" | "git-bash" | "godot"; label: string }>> => {
			return ipcRenderer.invoke("workspace-fs:list-launch-targets", params);
		},
		openLaunchTarget: (params: { workspaceRoot: string; filePath?: string; targetId: "file-explorer" | "terminal" | "vscode" | "visual-studio" | "github-desktop" | "git-bash" | "godot"; godotExecutablePath?: string | null; godotRunMode?: "editor" | "project" | "scene"; godotScenePath?: string }): Promise<{ opened: true; targetId: "file-explorer" | "terminal" | "vscode" | "visual-studio" | "github-desktop" | "git-bash" | "godot" }> => {
			return ipcRenderer.invoke("workspace-fs:open-launch-target", params);
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
		getPackageInfo: (): Promise<{ name: string; version: string; description: string; license: string; author: string }> => {
			return ipcRenderer.invoke("app:get-package-info");
		}
	}
});

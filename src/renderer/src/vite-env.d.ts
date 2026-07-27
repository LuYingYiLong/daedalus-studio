/// <reference types="vite-plugin-svgr/client" />

export {};

declare global {
	interface ElectronVersions {
		chrome: string;
		electron: string;
		node: string;
	}

	interface BackendAPI {
		getPort: () => Promise<number>;
		getConnectionInfo: () => Promise<{
			port: number;
			authProtocol: string | null;
		}>;
		getStatus: () => Promise<string>;
		healthCheck: () => Promise<boolean>;
		restart: () => Promise<void>;
		onStatusChanged: (callback: (status: string) => void) => () => void;
	}

	type BackendBootstrapStatus =
		| "idle"
		| "checking"
		| "installing"
		| "starting"
		| "healthy"
		| "error"
		| "unsupported";

	type BackendBootstrapPhase =
		| "detect"
		| "recover"
		| "install"
		| "verify"
		| "write_metadata"
		| "start"
		| "health_check"
		| "rollback"
		| "ready"
		| "error";

	interface BackendBootstrapState {
		status: BackendBootstrapStatus;
		phase: BackendBootstrapPhase;
		packaged: boolean;
		firstRun: boolean;
		progress: number;
		backendVersion: string | null;
		port: number;
		errorCode: string | null;
		errorMessage: string | null;
		suggestedAction: string | null;
	}

	interface BackendBootstrapAPI {
		getState: () => Promise<BackendBootstrapState>;
		prepare: () => Promise<BackendBootstrapState>;
		repair: () => Promise<BackendBootstrapState>;
		retryStart: () => Promise<BackendBootstrapState>;
		onStateChanged: (callback: (state: BackendBootstrapState) => void) => () => void;
	}

	interface ClientPreferences {
		autoCheckForUpdates: boolean;
		minimizeToTrayOnClose: boolean;
		theme: "system" | "light" | "dark";
		language: "system" | "en-US" | "zh-CN";
		lastComposerModel: {
			providerId: string;
			modelId: string;
		} | null;
	}

	interface ClientPreferencesAPI {
		getCached: () => ClientPreferences;
		get: () => Promise<ClientPreferences>;
		update: (patch: Partial<ClientPreferences>) => Promise<ClientPreferences>;
	}

	type AppUpdateStatus =
		| "idle"
		| "checking"
		| "available"
		| "downloading"
		| "downloaded"
		| "installing"
		| "not_available"
		| "error"
		| "unsupported";

	type AppUpdateKind = "client" | "backend" | "combined" | null;

	interface AppUpdateComponentState {
		status: AppUpdateStatus;
		currentVersion: string | null;
		availableVersion: string | null;
		releaseName: string | null;
		releaseDate: string | null;
		progress: number | null;
		errorMessage: string | null;
	}

	interface AppUpdateState {
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
	}

	interface AppUpdateAPI {
		getState: () => Promise<AppUpdateState>;
		check: () => Promise<AppUpdateState>;
		download: () => Promise<AppUpdateState>;
		acknowledge: () => Promise<AppUpdateState>;
		onStateChanged: (callback: (state: AppUpdateState) => void) => () => void;
	}

	interface ClipboardAPI {
		writeText: (text: string) => Promise<{ written: true }>;
	}

	type NativeNotificationKind = "run_completed" | "approval_required" | "clarification_required";

	interface NativeNotificationPayload {
		kind: NativeNotificationKind;
		sessionId?: string | null;
		requestId?: string | null;
		title: string;
		body: string;
		dedupeKey: string;
	}

	interface NativeNotificationResult {
		shown: boolean;
		reason?: "foreground" | "deduped" | "unsupported" | "invalid" | "no_window" | "failed";
	}

	interface NativeNotificationAPI {
		show: (payload: NativeNotificationPayload) => Promise<NativeNotificationResult>;
		clearAttention: () => Promise<{ cleared: true }>;
	}

	interface TrayRecentSession {
		id: string;
		title: string;
	}

	interface TrayAPI {
		updateRecentSessions: (sessions: TrayRecentSession[]) => Promise<{ updated: true }>;
		onNewChat: (callback: () => void) => () => void;
		onOpenSession: (callback: (sessionId: string) => void) => () => void;
	}

	interface TerminalState {
		terminalId: string;
		shell: string;
		cwd: string;
		running: boolean;
	}

	interface TerminalDataEvent {
		terminalId: string;
		data: string;
	}

	interface TerminalExitEvent {
		terminalId: string;
		exitCode: number;
		signal: number | string | null;
	}

	interface TerminalAPI {
		create: (params: { terminalId?: string | null; cwd?: string | null; cols: number; rows: number }) => Promise<TerminalState>;
		write: (params: { terminalId: string; data: string }) => Promise<{ written: true }>;
		resize: (params: { terminalId: string; cols: number; rows: number }) => Promise<{ resized: true }>;
		kill: (params: { terminalId: string }) => Promise<{ killed: true }>;
		getState: (params?: { terminalId?: string | null }) => Promise<TerminalState | null>;
		onData: (callback: (event: TerminalDataEvent) => void) => () => void;
		onExit: (callback: (event: TerminalExitEvent) => void) => () => void;
	}

	interface SessionFsAPI {
		openSessionDirectory: (sessionId: string) => Promise<{ opened: true }>;
	}

	interface DiskSpaceInfo {
		drive: string;
		free: number;
		total: number;
	}

	interface PackageInfo {
		name: string;
		version: string;
		description: string;
		license: string;
		author: string;
	}

	interface AppInfoAPI {
		getPackageInfo: () => Promise<PackageInfo>;
	}

	type WorkspaceLaunchTargetId = "file-explorer" | "terminal" | "vscode" | "visual-studio" | "github-desktop" | "git-bash" | "godot";

	type GodotProjectPluginStatus =
		| "not_installed"
		| "current"
		| "outdated"
		| "disabled"
		| "modified"
		| "pending"
		| "pending_restart"
		| "failed";

	interface GodotProjectInfo {
		id: string;
		name: string;
		path: string;
		godotVersion: string | null;
		pluginVersion: string | null;
		bundledPluginVersion: string | null;
		enabled: boolean;
		status: GodotProjectPluginStatus;
		errorMessage: string | null;
	}

	interface GodotProjectScanResult {
		projects: GodotProjectInfo[];
		plugin: {
			available: boolean;
			version: string | null;
			studioVersion: string | null;
			errorMessage: string | null;
		};
	}

	interface GodotProjectsAPI {
		scan: () => Promise<GodotProjectScanResult>;
		add: () => Promise<GodotProjectScanResult>;
		install: (projectPath: string) => Promise<GodotProjectScanResult>;
		repair: (projectPath: string) => Promise<GodotProjectScanResult>;
		uninstall: (projectPath: string) => Promise<GodotProjectScanResult>;
		setEnabled: (projectPath: string, enabled: boolean) => Promise<GodotProjectScanResult>;
		upgradeAll: () => Promise<GodotProjectScanResult>;
		retryPending: () => Promise<GodotProjectScanResult>;
	}

	interface ElectronAPI {
		versions: ElectronVersions;
		backend: BackendAPI;
		backendBootstrap: BackendBootstrapAPI;
		clientPreferences: ClientPreferencesAPI;
		clipboard: ClipboardAPI;
		nativeNotifications: NativeNotificationAPI;
		tray: TrayAPI;
		appUpdate: AppUpdateAPI;
		terminal: TerminalAPI;
		sessionFs: SessionFsAPI;
		checkDiskSpace: () => Promise<DiskSpaceInfo | null>;
		workspaceFs: {
			listChildren: (params: {
				workspaceRoot: string;
				relativePath?: string;
			}) => Promise<{
				entries: Array<{
					name: string;
					relativePath: string;
					resourcePath: string;
					kind: "file" | "folder";
				}>;
			}>;
			pickWorkspaceDirectory: () => Promise<string | null>;
			pickWorkspaceFiles: (params: { workspaceRoot: string }) => Promise<Array<{
				name: string;
				relativePath: string;
				resourcePath: string;
				kind: "file" | "folder";
			}> | null>;
			pickWorkspaceFolder: (params: { workspaceRoot: string }) => Promise<Array<{
				name: string;
				relativePath: string;
				resourcePath: string;
				kind: "file" | "folder";
			}> | null>;
			getPathForFile: (file: File) => string;
			createEntriesFromPaths: (params: { workspaceRoot: string; paths: string[] }) => Promise<Array<{
				name: string;
				relativePath: string;
				resourcePath: string;
				kind: "file" | "folder";
			}>>;
			openWorkspaceDirectory: (workspaceRoot: string) => Promise<{ opened: true }>;
			listLaunchTargets: (params?: {
				godotExecutablePath?: string | null;
			}) => Promise<Array<{
				id: WorkspaceLaunchTargetId;
				label: string;
			}>>;
			openLaunchTarget: (params: {
				workspaceRoot: string;
				targetId: WorkspaceLaunchTargetId;
				godotExecutablePath?: string | null;
				godotRunMode?: "editor" | "project" | "scene";
				godotScenePath?: string;
			}) => Promise<{ opened: true; targetId: WorkspaceLaunchTargetId }>;
		};
		skillFs: {
			pickSkillZip: () => Promise<string | null>;
			pickSkillDirectory: () => Promise<string | null>;
		};
		godotProjects: GodotProjectsAPI;
		skillCli: {
			listGlobalCodexSkills: () => Promise<Array<{ name: string; path: string; slug: string }>>;
		};
		pickGodotExecutable: () => Promise<string | null>;
		appInfo: AppInfoAPI;
	}

	interface Window {
		electronAPI: ElectronAPI;
	}
}

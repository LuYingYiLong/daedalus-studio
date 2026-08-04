import { describe, expect, it } from "vitest";
import { readRepoFile } from "../../../helpers/repo-paths";

describe("BootSplash", () => {
	const windowProvidersSource: string = readRepoFile("src", "renderer", "src", "app", "WindowProviders.tsx");
	const mainWindowRootSource: string = readRepoFile("src", "renderer", "src", "app", "MainWindowRoot.tsx");
	const settingsWindowSource: string = readRepoFile("src", "renderer", "src", "app", "SettingsWindow.tsx");
	const splashSource: string = readRepoFile("src", "renderer", "src", "app", "BootSplash.tsx");
	const bootstrapSource: string = readRepoFile("src", "renderer", "src", "app", "bootstrap.ts");
	const appSource: string = readRepoFile("src", "renderer", "src", "app", "App.tsx");
	const agentSource: string = readRepoFile("src", "renderer", "src", "pages", "home", "HomePage.tsx");
	const workspaceTreeSource: string = readRepoFile("src", "renderer", "src", "features", "workspace", "WorkspaceTree.tsx");
	const preloadSource: string = readRepoFile("src", "preload", "index.ts");
	const viteEnvSource: string = readRepoFile("src", "renderer", "src", "vite-env.d.ts");

	it("renders BootSplash before App and passes bootstrap data into App", () => {
		expect(windowProvidersSource).toContain("<AntdApp component=\"div\"");
		expect(windowProvidersSource).toContain("className={styles.root}");
		expect(mainWindowRootSource).toContain("<MainTitlebar appReady={isAppReady} />");
		expect(mainWindowRootSource).toContain("bootstrapData === null");
		const titlebarSource: string = readRepoFile("src", "renderer", "src", "app", "layout", "Titlebar.tsx");
		expect(titlebarSource).toContain("{appReady ? (");
		expect(titlebarSource).toContain("className={styles.workspaceSidebarButton}");
		expect(mainWindowRootSource).toContain("<BootSplash loadData={loadData} onReady={handleBootstrapReady} />");
		expect(mainWindowRootSource).toContain("loadBootstrapData(onProgress, t)");
		expect(mainWindowRootSource).toContain("bootstrapData.clientPreferences.onboarding.completed");
		expect(mainWindowRootSource).toContain("<OnboardingWizard bootstrapData={bootstrapData} onComplete={handleOnboardingComplete} />");
		expect(mainWindowRootSource).toContain("<App bootstrapData={bootstrapData} />");
		expect(settingsWindowSource).toContain("DEFAULT_CLIENT_PREFERENCES");
		expect(settingsWindowSource).toContain("DEFAULT_GENERAL_SETTINGS");
		expect(settingsWindowSource).not.toContain("bootstrapData");
		expect(appSource).toContain("bootstrapData: BootstrapData");
		expect(appSource).toContain("createPreferredHomeDraft(bootstrapData.clientPreferences, bootstrapData.providerModelSelection)");
		expect(agentSource).toContain("initialWorkspaces={initialWorkspaces}");
		expect(workspaceTreeSource).toContain("initialWorkspaces?: WorkspaceConfig[]");
	});

	it("uses AntD Result failure actions for startup failures", () => {
		expect(splashSource).toContain("Result");
		expect(splashSource).toContain("app.boot.actions.retry");
		expect(splashSource).toContain("app.boot.actions.retryInstall");
		expect(splashSource).toContain("app.boot.actions.repairBackend");
		expect(splashSource).toContain("app.boot.actions.restartBackend");
		expect(splashSource).toContain("marked_backend_missing");
		expect(splashSource).toContain("app.boot.error.markedBackendMissing");
		expect(splashSource).toContain("window.electronAPI.backendBootstrap.repair()");
		expect(splashSource).toContain("window.electronAPI.backendBootstrap.retryStart()");
		expect(splashSource).not.toContain("Spin");
	});

	it("preloads backend and first-screen data before entering the app", () => {
		expect(splashSource).toContain("window.electronAPI.backendBootstrap.prepare()");
		expect(splashSource).toContain("window.electronAPI.backendBootstrap.onStateChanged");
		expect(splashSource).toContain("BACKEND_BOOTSTRAP_PROGRESS_WEIGHT");
		expect(splashSource).toContain("state.progress * BACKEND_BOOTSTRAP_PROGRESS_WEIGHT / 100");
		expect(splashSource).toContain("setState(createBackendErrorState(backendState, t));");
		expect(bootstrapSource).toContain("window.electronAPI.backend.healthCheck()");
		expect(bootstrapSource).toContain("\"backend.health\"");
		expect(bootstrapSource).toContain("fetchClientPreferences()");
		expect(bootstrapSource).toContain("fetchGeneralSettings()");
		expect(bootstrapSource).toContain("fetchProviderModelSelection()");
		expect(bootstrapSource).toContain("fetchWorkspaces()");
		expect(bootstrapSource).toContain("fetchSessions()");
		expect(bootstrapSource).toContain("fetchWorkspaceTreeOrder()");
		expect(bootstrapSource).toContain('t("app.boot.resources.workspaceTreeOrder")');
		expect(bootstrapSource).toContain('t("app.boot.progress.loadingWorkspaceData")');
		expect(bootstrapSource).toContain('t("app.boot.error.resourceTimeout"');
		expect(bootstrapSource).toContain("fetchSlashCommands()");
		expect(bootstrapSource).toContain("fetchSkills()");
		expect(bootstrapSource).not.toContain("loadSettingsBootstrapData");
	});

	it("exposes backend bootstrap through preload and renderer types", () => {
		expect(preloadSource).toContain("restart: (): Promise<void> => ipcRenderer.invoke(\"backend:restart\")");
		expect(preloadSource).toContain("backendBootstrap: {");
		expect(preloadSource).toContain("ipcRenderer.invoke(\"backend-bootstrap:prepare\")");
		expect(preloadSource).toContain("ipcRenderer.invoke(\"backend-bootstrap:repair\")");
		expect(preloadSource).toContain("ipcRenderer.invoke(\"backend-bootstrap:retry-start\")");
		expect(preloadSource).toContain("ipcRenderer.on(\"backend-bootstrap:state-changed\", handler)");
		expect(viteEnvSource).toContain("restart: () => Promise<void>;");
		expect(viteEnvSource).toContain("interface BackendBootstrapAPI");
		expect(viteEnvSource).toContain("prepare: () => Promise<BackendBootstrapState>;");
	});
});

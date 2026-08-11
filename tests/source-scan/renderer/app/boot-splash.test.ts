import { describe, expect, it } from "vitest";
import { readAppImplementation, readRepoFile } from "../../../helpers/repo-paths";

describe("BootSplash", () => {
	const windowProvidersSource: string = readRepoFile("src", "renderer", "src", "app", "shell", "WindowProviders.tsx");
	const mainWindowRootSource: string = readRepoFile("src", "renderer", "src", "app", "shell", "MainWindowRoot.tsx");
	const mainWindowRootStyleSource: string = readRepoFile("src", "renderer", "src", "app", "shell", "MainWindowRoot.module.css");
	const mainWindowErrorBoundarySource: string = readRepoFile("src", "renderer", "src", "app", "errors", "MainWindowErrorBoundary.tsx");
	const settingsWindowSource: string = readRepoFile("src", "renderer", "src", "app", "shell", "SettingsWindow.tsx");
	const splashSource: string = readRepoFile("src", "renderer", "src", "app", "bootstrap", "BootSplash.tsx");
	const bootstrapSource: string = readRepoFile("src", "renderer", "src", "app", "bootstrap", "bootstrap.ts");
	const appSource: string = readAppImplementation();
	const agentSource: string = readRepoFile("src", "renderer", "src", "widgets", "home", "HomePage.tsx");
	const workspaceTreeSource: string = readRepoFile("src", "renderer", "src", "widgets", "workspace", "WorkspaceTree.tsx");
	const preloadSource: string = readRepoFile("src", "preload", "index.ts");
	const viteEnvSource: string = readRepoFile("src", "renderer", "src", "vite-env.d.ts");

	it("renders BootSplash before App and passes bootstrap data into App", () => {
		expect(windowProvidersSource).toContain("<AntdApp component=\"div\"");
		expect(windowProvidersSource).toContain("className={styles.root}");
		expect(mainWindowRootSource).toContain("<MainTitlebar appReady={isAppReady} />");
		expect(mainWindowRootSource).toContain("bootstrapData === null");
		const titlebarSource: string = readRepoFile("src", "renderer", "src", "app", "shell", "Titlebar.tsx");
		expect(titlebarSource).toContain("{appReady ? (");
		expect(titlebarSource).toContain("className={styles.actionButton}");
		expect(mainWindowRootSource).toContain("<BootSplash loadData={loadData} onReady={handleBootstrapReady} onPaintReady={handleBootSplashPaintReady} />");
		expect(mainWindowRootSource).toContain("loadBootstrapData(onProgress, t)");
		expect(mainWindowRootSource).toContain("data.clientPreferences?.onboarding?.completed");
		expect(mainWindowRootSource).toContain("onPrewarmApp={preloadAppModule}");
		expect(mainWindowRootSource).toContain('type AppHandoffPhase = "idle" | "preparing" | "entering" | "ready";');
		expect(mainWindowRootSource).toContain("setHandoffPhase(\"preparing\")");
		expect(mainWindowRootSource).toContain("event.target === event.currentTarget");
		expect(mainWindowRootStyleSource).toContain("animation: app-enter 160ms");
		expect(mainWindowRootStyleSource).toContain("translateY(2px)");
		expect(mainWindowRootStyleSource).toContain("opacity: .001");
		expect(mainWindowRootSource).toContain('inert={handoffPhase === "preparing" ? true : undefined}');
		expect(mainWindowRootStyleSource).toContain("prefers-reduced-motion: reduce");
		expect(mainWindowRootSource).toContain("<App bootstrapData={appBootstrapData} onReady={handleAppPaintReady} />");
		expect(mainWindowRootSource).toContain("const App = lazy(loadAppModule)");
		expect(mainWindowErrorBoundarySource).toContain("getDerivedStateFromError");
		expect(mainWindowErrorBoundarySource).toContain("Skip onboarding and enter Studio");
		expect(mainWindowErrorBoundarySource).toContain("createCompletedOnboardingPreferences");
		expect(mainWindowErrorBoundarySource).toContain("Reset onboarding and restart");
		expect(mainWindowErrorBoundarySource).toContain("createDefaultOnboardingPreferences");
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

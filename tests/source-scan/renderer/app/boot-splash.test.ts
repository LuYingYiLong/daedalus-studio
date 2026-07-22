import { describe, expect, it } from "vitest";
import { readRepoFile } from "../../../helpers/repo-paths";

describe("BootSplash", () => {
	const studioThemeRootSource: string = readRepoFile("src", "renderer", "src", "app", "StudioThemeRoot.tsx");
	const splashSource: string = readRepoFile("src", "renderer", "src", "app", "BootSplash.tsx");
	const bootstrapSource: string = readRepoFile("src", "renderer", "src", "app", "bootstrap.ts");
	const appSource: string = readRepoFile("src", "renderer", "src", "app", "App.tsx");
	const agentSource: string = readRepoFile("src", "renderer", "src", "pages", "agent", "AgentPage.tsx");
	const workspaceTreeSource: string = readRepoFile("src", "renderer", "src", "features", "workspace", "WorkspaceTree.tsx");
	const preloadSource: string = readRepoFile("src", "preload", "index.ts");
	const viteEnvSource: string = readRepoFile("src", "renderer", "src", "vite-env.d.ts");

	it("renders BootSplash before App and passes bootstrap data into App", () => {
		expect(studioThemeRootSource).toContain("<BootSplash onReady={handleBootstrapReady} />");
		expect(studioThemeRootSource).toContain("<App bootstrapData={bootstrapData} />");
		expect(appSource).toContain("bootstrapData: BootstrapData");
		expect(appSource).toContain("createPreferredHomeDraft(bootstrapData.clientPreferences, bootstrapData.providerModelSelection)");
		expect(agentSource).toContain("initialWorkspaces={initialWorkspaces}");
		expect(workspaceTreeSource).toContain("initialWorkspaces?: WorkspaceConfig[]");
	});

	it("uses AntD Result failure actions for startup failures", () => {
		expect(splashSource).toContain("Result");
		expect(splashSource).toContain("Retry");
		expect(splashSource).toContain("Retry install");
		expect(splashSource).toContain("Repair backend");
		expect(splashSource).toContain("Restart backend");
		expect(splashSource).toContain("window.electronAPI.backendBootstrap.repair()");
		expect(splashSource).toContain("window.electronAPI.backendBootstrap.retryStart()");
		expect(splashSource).not.toContain("Spin");
	});

	it("preloads backend and first-screen data before entering the app", () => {
		expect(splashSource).toContain("window.electronAPI.backendBootstrap.prepare()");
		expect(splashSource).toContain("window.electronAPI.backendBootstrap.onStateChanged");
		expect(bootstrapSource).toContain("window.electronAPI.backend.healthCheck()");
		expect(bootstrapSource).toContain("\"backend.health\"");
		expect(bootstrapSource).toContain("fetchClientPreferences()");
		expect(bootstrapSource).toContain("fetchGeneralSettings()");
		expect(bootstrapSource).toContain("fetchProviderModelSelection()");
		expect(bootstrapSource).toContain("fetchWorkspaces()");
		expect(bootstrapSource).toContain("fetchSessions()");
		expect(bootstrapSource).toContain("fetchSlashCommands()");
		expect(bootstrapSource).toContain("fetchSkills()");
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

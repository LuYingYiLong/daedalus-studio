import { describe, expect, it } from "vitest";
import { readRepoFile } from "../../../helpers/repo-paths";

describe("BootSplash", () => {
	const mainSource: string = readRepoFile("src", "renderer", "src", "main.tsx");
	const splashSource: string = readRepoFile("src", "renderer", "src", "app", "BootSplash.tsx");
	const bootstrapSource: string = readRepoFile("src", "renderer", "src", "app", "bootstrap.ts");
	const appSource: string = readRepoFile("src", "renderer", "src", "app", "App.tsx");
	const agentSource: string = readRepoFile("src", "renderer", "src", "pages", "agent", "AgentPage.tsx");
	const workspaceTreeSource: string = readRepoFile("src", "renderer", "src", "features", "workspace", "WorkspaceTree.tsx");
	const preloadSource: string = readRepoFile("src", "preload", "index.ts");
	const viteEnvSource: string = readRepoFile("src", "renderer", "src", "vite-env.d.ts");

	it("renders BootSplash before App and passes bootstrap data into App", () => {
		expect(mainSource).toContain("<BootSplash onReady={handleBootstrapReady} />");
		expect(mainSource).toContain("<App bootstrapData={bootstrapData} />");
		expect(appSource).toContain("bootstrapData: BootstrapData");
		expect(appSource).toContain("createPreferredHomeDraft(bootstrapData.clientPreferences, bootstrapData.providerModelSelection)");
		expect(agentSource).toContain("initialWorkspaces={initialWorkspaces}");
		expect(workspaceTreeSource).toContain("initialWorkspaces?: WorkspaceConfig[]");
	});

	it("uses AntD Result failure actions for startup failures", () => {
		expect(splashSource).toContain("Result");
		expect(splashSource).toContain("Retry");
		expect(splashSource).toContain("Restart backend");
		expect(splashSource).toContain("window.electronAPI.backend.restart()");
		expect(splashSource).not.toContain("Spin");
	});

	it("preloads backend and first-screen data before entering the app", () => {
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

	it("exposes backend restart through preload and renderer types", () => {
		expect(preloadSource).toContain("restart: (): Promise<void> => ipcRenderer.invoke(\"backend:restart\")");
		expect(viteEnvSource).toContain("restart: () => Promise<void>;");
	});
});

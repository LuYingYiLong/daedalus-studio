import { describe, expect, it } from "vitest";
import { readRepoFile } from "../../helpers/repo-paths";

describe("app update source", () => {
	const packageSource: string = readRepoFile("package.json");
	const builderSource: string = readRepoFile("electron-builder.yml");
	const mainSource: string = readRepoFile("src", "main", "index.ts");
	const serviceSource: string = readRepoFile("src", "main", "services", "app-update.ts");
	const preloadSource: string = readRepoFile("src", "preload", "index.ts");
	const viteEnvSource: string = readRepoFile("src", "renderer", "src", "vite-env.d.ts");
	const titlebarSource: string = readRepoFile("src", "renderer", "src", "components", "Titlebar.tsx");
	const titlebarCss: string = readRepoFile("src", "renderer", "src", "components", "Titlebar.module.css");

	it("configures electron-updater and GitHub publishing", () => {
		expect(packageSource).toContain("\"electron-updater\"");
		expect(builderSource).toContain("provider: github");
		expect(builderSource).toContain("owner: LuYingYiLong");
		expect(builderSource).toContain("repo: daedalus-studio");
		expect(serviceSource).toContain("autoDownload = false");
		expect(serviceSource).toContain("allowPrerelease = false");
	});

	it("registers main-process app update IPC and startup check", () => {
		expect(mainSource).toContain("appUpdateService.registerIpc();");
		expect(mainSource).toContain("checkForUpdatesIfEnabled(preferences.autoCheckForUpdates)");
		expect(serviceSource).toContain("ipcMain.handle(\"app-update:get-state\"");
		expect(serviceSource).toContain("ipcMain.handle(\"app-update:download\"");
		expect(serviceSource).toContain("ipcMain.handle(\"app-update:acknowledge\"");
		expect(serviceSource).toContain("backend.update.check");
		expect(serviceSource).toContain("backend.update.install");
		expect(serviceSource).toContain("restartAndWaitHealthy");
		expect(serviceSource).toContain("app-update:state-changed");
		expect(serviceSource).toContain("quitAndInstall(false, true)");
	});

	it("exposes appUpdate through preload and renderer types", () => {
		expect(preloadSource).toContain("appUpdate: {");
		expect(preloadSource).toContain("ipcRenderer.invoke(\"app-update:get-state\")");
		expect(preloadSource).toContain("ipcRenderer.invoke(\"app-update:download\")");
		expect(preloadSource).toContain("ipcRenderer.invoke(\"app-update:acknowledge\")");
		expect(preloadSource).toContain("ipcRenderer.on(\"app-update:state-changed\", handler)");
		expect(viteEnvSource).toContain("type AppUpdateStatus");
		expect(viteEnvSource).toContain("type AppUpdateKind");
		expect(viteEnvSource).toContain("interface AppUpdateComponentState");
		expect(viteEnvSource).toContain("interface AppUpdateAPI");
		expect(viteEnvSource).toContain("appUpdate: AppUpdateAPI;");
	});

	it("renders update affordance in the titlebar", () => {
		expect(titlebarSource).toContain("window.electronAPI.appUpdate.getState");
		expect(titlebarSource).toContain("window.electronAPI.appUpdate.onStateChanged");
		expect(titlebarSource).toContain("window.electronAPI.appUpdate.download");
		expect(titlebarSource).toContain("window.electronAPI.appUpdate.acknowledge");
		expect(titlebarSource).toContain("<Modal");
		expect(titlebarSource).toContain("mask={{ closable:");
		expect(titlebarSource).not.toContain("maskClosable");
		expect(titlebarSource).toContain("Update");
		expect(titlebarSource).toContain("Backend");
		expect(titlebarSource).toContain("Restarting to install");
		expect(titlebarCss).toContain("-webkit-app-region: no-drag;");
		expect(titlebarCss).toContain(".brandCluster");
		expect(titlebarCss).toContain(".updateButton");
	});
});

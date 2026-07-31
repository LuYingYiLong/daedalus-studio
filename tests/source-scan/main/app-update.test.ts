import { describe, expect, it } from "vitest";
import { readRepoFile } from "../../helpers/repo-paths";

describe("app update source", () => {
	const packageSource: string = readRepoFile("package.json");
	const builderSource: string = readRepoFile("electron-builder.yml");
	const releaseWorkflowSource: string = readRepoFile(".github", "workflows", "build-release.yml");
	const mainSource: string = readRepoFile("src", "main", "index.ts");
	const serviceSource: string = readRepoFile("src", "main", "services", "app-update.ts");
	const binaryStoreSource: string = readRepoFile("src", "main", "services", "backend-binary-store.ts");
	const windowLifecycleSource: string = readRepoFile("src", "main", "services", "window-lifecycle.ts");
	const bootstrapSource: string = readRepoFile("src", "main", "services", "backend-bootstrap.ts");
	const preloadSource: string = readRepoFile("src", "preload", "index.ts");
	const viteEnvSource: string = readRepoFile("src", "renderer", "src", "vite-env.d.ts");
	const titlebarSource: string = readRepoFile("src", "renderer", "src", "app", "layout", "Titlebar.tsx");
	const updateVisibilitySource: string = readRepoFile("src", "renderer", "src", "features", "app-update", "update-visibility.ts");
	const titlebarCss: string = readRepoFile("src", "renderer", "src", "app", "layout", "Titlebar.module.css");
	const updateDialogSource: string = readRepoFile("src", "renderer", "src", "features", "app-update", "AppUpdateDialog.tsx");
	const aboutSettingsSource: string = readRepoFile("src", "renderer", "src", "pages", "settings", "AboutSettingsPage.tsx");

	it("configures electron-updater and GitHub publishing", () => {
		expect(packageSource).toContain("\"electron-updater\"");
		expect(builderSource).toContain("provider: github");
		expect(builderSource).toContain("owner: LuYingYiLong");
		expect(builderSource).toContain("repo: daedalus-studio");
		expect(builderSource).toContain("artifactName: \"Daedalus-Studio-Setup-${version}.${ext}\"");
		expect(releaseWorkflowSource).toContain("Verify updater metadata");
		expect(releaseWorkflowSource).toContain("latest.yml points to a missing installer");
		expect(releaseWorkflowSource).toContain("Installer asset names must not contain whitespace");
		expect(releaseWorkflowSource).toContain("overwrite_files: true");
		expect(serviceSource).toContain("autoDownload = false");
		expect(serviceSource).toContain("allowPrerelease = false");
		expect(serviceSource).toContain("Cannot download differentially, fallback to full download:");
		expect(serviceSource).toContain("downloadPhase: \"full\"");
	});

	it("does not enable client updates for unpacked builds without update metadata", () => {
		expect(serviceSource).toContain("app-update.yml");
		expect(serviceSource).toContain("existsSync(join(process.resourcesPath, \"app-update.yml\"))");
	});

	it("registers main-process app update IPC and startup check", () => {
		expect(mainSource).toContain("appUpdateService.registerIpc();");
		expect(mainSource).toContain("checkForUpdatesIfEnabled(preferences.autoCheckForUpdates)");
		expect(serviceSource).toContain("ipcMain.handle(\"app-update:get-state\"");
		expect(serviceSource).toContain("ipcMain.handle(\"app-update:check\"");
		expect(serviceSource).toContain("ipcMain.handle(\"app-update:download\"");
		expect(serviceSource).toContain("ipcMain.handle(\"app-update:acknowledge\"");
		expect(serviceSource).toContain("fetchBackendReleaseManifest");
		expect(serviceSource).toContain("resolveBackendUpdateBaselineVersion");
		expect(serviceSource).toContain("packageJson.backendBootstrapVersion");
		expect(serviceSource).toContain("stageBackendRelease");
		expect(serviceSource).toContain("activateBackendCandidate");
		expect(serviceSource).toContain("commitBackendCandidate");
		expect(serviceSource).toContain("rollbackBackendCandidate");
		expect(serviceSource).not.toContain("backend.update.check");
		expect(serviceSource).not.toContain("backend.update.install");
		expect(serviceSource).toContain("backendManager.getLaunchTargetInfo()");
		expect(binaryStoreSource).toContain("export async function fetchBackendReleaseManifest");
		expect(binaryStoreSource).toContain("export async function stageBackendRelease");
		expect(binaryStoreSource).toContain("export async function commitBackendCandidate");
		expect(binaryStoreSource).toContain("export async function rollbackBackendCandidate");
		expect(bootstrapSource).not.toContain("npm install");
		expect(serviceSource).toContain("restartAndWaitHealthy");
		expect(serviceSource).toContain("verifyInstalledVersion(result.version)");
		expect(serviceSource).toContain("cleanupPreviousVersion(result.version, result.previousVersion)");
		expect(serviceSource).toContain("app-update:state-changed");
		expect(serviceSource).toContain("await this.beforeClientInstall()");
		expect(serviceSource).toContain("quitAndInstall(false, true)");
		expect(mainSource).toContain("appUpdateService.setBeforeClientInstall");
		expect(mainSource).toContain("windowLifecycleController.markQuitting()");
		expect(windowLifecycleSource).toContain("markQuitting(): void");
		expect(windowLifecycleSource).toContain("this.destroyTray();");
	});

	it("exposes appUpdate through preload and renderer types", () => {
		expect(preloadSource).toContain("appUpdate: {");
		expect(preloadSource).toContain("ipcRenderer.invoke(\"app-update:get-state\")");
		expect(preloadSource).toContain("ipcRenderer.invoke(\"app-update:check\")");
		expect(preloadSource).toContain("ipcRenderer.invoke(\"app-update:download\")");
		expect(preloadSource).toContain("ipcRenderer.invoke(\"app-update:acknowledge\")");
		expect(preloadSource).toContain("ipcRenderer.on(\"app-update:state-changed\", handler)");
		expect(viteEnvSource).toContain("type AppUpdateStatus");
		expect(viteEnvSource).toContain("type AppUpdateKind");
		expect(viteEnvSource).toContain("interface AppUpdateComponentState");
		expect(viteEnvSource).toContain("interface AppUpdateAPI");
		expect(viteEnvSource).toContain("appUpdate: AppUpdateAPI;");
	});

	it("shares the update dialog between the titlebar and About settings", () => {
		expect(titlebarSource).toContain("window.electronAPI.appUpdate.getState");
		expect(titlebarSource).toContain("window.electronAPI.appUpdate.check");
		expect(titlebarSource).toContain("window.electronAPI.appUpdate.onStateChanged");
		expect(titlebarSource).toContain("window.electronAPI.appUpdate.download");
		expect(titlebarSource).toContain("window.electronAPI.appUpdate.acknowledge");
		expect(titlebarSource).toContain("shouldShowUpdateButton(updateState)");
		expect(updateVisibilitySource).toContain("const hasKnownUpdate: boolean");
		expect(updateVisibilitySource).toContain("if (!hasKnownUpdate)");
		expect(updateVisibilitySource).toContain("state.updateKind !== null");
		expect(titlebarSource).toContain('&& state.status === "idle"');
		expect(titlebarSource).not.toContain('state.status === "not_available" || state.status === "error"');
		expect(titlebarSource).toContain("clientPreferences.autoCheckForUpdates");
		expect(titlebarSource).not.toContain("!preferences.autoCheckForUpdates");
		expect(titlebarSource).toContain("<AppUpdateDialog");
		expect(titlebarSource).toContain("Update");
		expect(updateDialogSource).toContain("<Modal");
		expect(updateDialogSource).toContain("mask={{ closable:");
		expect(updateDialogSource).not.toContain("maskClosable");
		expect(updateDialogSource).toContain("appUpdate.components.backend");
		expect(updateDialogSource).toContain("appUpdate.status.restarting");
		expect(updateDialogSource).toContain("appUpdate.fallback.description");
		expect(updateDialogSource).toContain('state.client.downloadPhase === "full"');
		expect(updateDialogSource).toContain("https://github.com/LuYingYiLong/godot-daedalus/releases");
		expect(updateDialogSource).toContain("copyable={{ text: entry.message }}");
		expect(aboutSettingsSource).toContain("<AppUpdateDialog");
		expect(aboutSettingsSource).toContain("window.electronAPI.appUpdate.check()");
		expect(aboutSettingsSource).toContain("settings.about.actions.checkForUpdates");
		expect(titlebarCss).toContain("-webkit-app-region: no-drag;");
		expect(titlebarCss).toContain(".brandCluster");
		expect(titlebarCss).toContain(".updateButton");
		expect(serviceSource).toContain("browserWindow.webContents.isDestroyed()");
	});
});

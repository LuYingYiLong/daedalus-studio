import { describe, expect, it } from "vitest";
import { readRepoFile } from "../../helpers/repo-paths";

describe("backend bootstrap service", () => {
	const serviceSource: string = readRepoFile("src", "main", "services", "backend-bootstrap.ts");
	const managerSource: string = readRepoFile("src", "main", "services", "backend-manager.ts");
	const mainSource: string = readRepoFile("src", "main", "index.ts");
	const preloadSource: string = readRepoFile("src", "preload", "index.ts");
	const viteEnvSource: string = readRepoFile("src", "renderer", "src", "vite-env.d.ts");

	it("installs a managed backend during packaged first-run bootstrap", () => {
		expect(serviceSource).toContain("BACKEND_PACKAGE_NAME: string = \"daedalus-backend\"");
		expect(serviceSource).toContain("npm_config_dry_run");
		expect(serviceSource).toContain("[\"view\", BACKEND_PACKAGE_NAME, \"version\"]");
		expect(serviceSource).toContain("[\"install\", \"--prefix\", stagingDir, \"--prefer-online\", packageSpec]");
		expect(serviceSource).toContain("getManagedBackendCurrentPath()");
		expect(serviceSource).toContain("backendBootstrapCompleted");
	});

	it("moves backend startup orchestration behind bootstrap service", () => {
		expect(mainSource).toContain("backendBootstrapService.registerIpc();");
		expect(mainSource).toContain("backendBootstrapService.attachWindow(mainWindow);");
		expect(mainSource).toContain("backendBootstrapService.onDidChangeState(checkStartupUpdates);");
		expect(mainSource).toContain("backendBootstrapService.prepare().then");
		expect(mainSource).not.toContain("backendManager.start(mainWindow)");
		expect(managerSource).toContain("hasLaunchTarget()");
		expect(managerSource).toContain("getLaunchTargetInfo()");
		expect(managerSource).toContain("startAndWaitHealthy");
	});

	it("stops startup when the marked managed backend version is missing", () => {
		expect(serviceSource).toContain("getMarkedBackendMissingError");
		expect(serviceSource).toContain("marked_backend_missing");
		expect(serviceSource).toContain("options.forceInstall ? null : await getMarkedBackendMissingError()");
		expect(serviceSource).toContain("Use Repair backend to reinstall the managed backend.");
	});

	it("exposes bootstrap IPC without exposing npm or file paths to renderer code", () => {
		expect(serviceSource).toContain("ipcMain.handle(\"backend-bootstrap:get-state\"");
		expect(serviceSource).toContain("ipcMain.handle(\"backend-bootstrap:prepare\"");
		expect(serviceSource).toContain("ipcMain.handle(\"backend-bootstrap:repair\"");
		expect(serviceSource).toContain("ipcMain.handle(\"backend-bootstrap:retry-start\"");
		expect(preloadSource).toContain("backendBootstrap: {");
		expect(viteEnvSource).toContain("interface BackendBootstrapState");
		expect(viteEnvSource).toContain("interface BackendBootstrapAPI");
		expect(preloadSource).not.toContain("node:child_process");
	});
});

import { describe, expect, it } from "vitest";
import { readRepoFile } from "../../helpers/repo-paths";

describe("backend bootstrap service", () => {
	const serviceSource: string = readRepoFile("src", "main", "services", "backend-bootstrap.ts");
	const storeSource: string = readRepoFile("src", "main", "services", "backend-binary-store.ts");
	const managerSource: string = readRepoFile("src", "main", "services", "backend-manager.ts");
	const mainSource: string = readRepoFile("src", "main", "index.ts");
	const preloadSource: string = readRepoFile("src", "preload", "index.ts");
	const viteEnvSource: string = readRepoFile("src", "renderer", "src", "vite-env.d.ts");

	it("installs a managed backend during packaged first-run bootstrap", () => {
		expect(serviceSource).toContain("stageBundledBackend()");
		expect(serviceSource).toContain("activateBackendCandidate(installed)");
		expect(serviceSource).toContain("commitBackendCandidate(version)");
		expect(storeSource).toContain("runBackendSelfTest(installed)");
		expect(serviceSource).toContain("getManagedBackendCurrentPath()");
		expect(serviceSource).toContain("backendBootstrapCompleted");
		expect(serviceSource).not.toContain("npm_config_dry_run");
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

	it("waits for a normal client shutdown so a stale runtime is not reused next launch", () => {
		expect(mainSource).toContain("await backendManager.stopAndWait();");
		expect(mainSource).toContain("event.preventDefault();");
		expect(mainSource).toContain("preserveBackendForClientInstall");
		expect(mainSource).toContain("allowAppQuit = true;");
	});

	it("stops startup when the marked managed backend version is missing", () => {
		expect(serviceSource).toContain("inspectCurrentBackend()");
		expect(serviceSource).toContain("marked_backend_missing");
		expect(serviceSource).toContain("Use Repair backend to restore the verified backend bundled with Daedalus Studio.");
	});

	it("replaces incompatible managed backends with the verified bundled version", () => {
		expect(serviceSource).toContain("error instanceof BackendManifestCompatibilityError");
		expect(serviceSource).toContain("lacksSharedRuntimeCompatibilityMetadata");
		expect(serviceSource).toContain("Replacing an incompatible managed backend with the bundled backend.");
		expect(serviceSource).toContain("await backendManager.stopAndWait();");
		expect(serviceSource).toContain("return await this.installBundledAndStart();");
	});

	it("replaces a compatible managed backend when it is older than the bundled backend", () => {
		expect(serviceSource).toContain("compareSemanticVersions(current.version, packageJson.backendBootstrapVersion) < 0");
		expect(serviceSource).toContain("Replacing a managed backend older than the bundled backend.");
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

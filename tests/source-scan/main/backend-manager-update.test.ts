import { describe, expect, it } from "vitest";
import { readRepoFile } from "../../helpers/repo-paths";

describe("backend manager update support", () => {
	const source: string = readRepoFile("src", "main", "services", "backend-manager.ts");
	const storeSource: string = readRepoFile("src", "main", "services", "backend-binary-store.ts");
	const preloadSource: string = readRepoFile("src", "preload", "index.ts");

	it("prefers managed backend and falls back to bundled backend in packaged builds", () => {
		expect(source).toContain("resolveManagedBackendLaunchTarget");
		expect(storeSource).toContain("\"current.json\"");
		expect(storeSource).toContain("\"versions\"");
		expect(source).toContain("daedalus-backend.exe");
		expect(source).toContain("return resolveBundledBackendLaunchTarget();");
		expect(source).not.toContain("node_modules");
	});

	it("acquires the shared runtime and uses its authenticated health connection", () => {
		expect(source).toContain("spawn(launchTarget.executablePath");
		expect(source).toContain("\"runtime\"");
		expect(source).toContain("\"acquire\"");
		expect(source).toContain("\"--client\"");
		expect(source).toContain("record.authProtocol");
		expect(source).not.toContain("DAEDALUS_BACKEND_AUTH_TOKEN");
		expect(source).toContain("backend.health");
		expect(source).not.toContain("ELECTRON_RUN_AS_NODE");
		expect(source).toContain('NODE_USE_SYSTEM_CA: process.env.NODE_USE_SYSTEM_CA ?? "1"');
		expect(source).toContain("restartAndWaitHealthy");
		expect(source).toContain("waitUntilHealthy");
		expect(preloadSource).toContain("backend:restart");
		expect(preloadSource).toContain("backend:get-connection-info");
	});

	it("keeps a main-process runtime lease while Studio is open", () => {
		expect(source).toContain("runtimeLeaseSocket");
		expect(source).toContain("ensureRuntimeLease");
		expect(source).toContain("openRuntimeLease");
		expect(source).toContain("closeRuntimeLease");
		expect(source).toContain("await this.ensureRuntimeLease();");
		expect(source).toContain("Daedalus Studio is releasing the backend runtime");
	});

	it("waits for a healthy runtime before returning connection details to a window", () => {
		expect(source).toContain("getReadyConnectionInfo");
		expect(source).toContain("await this.restartAndWaitHealthy()");
		expect(source).toContain("await this.ensureRuntimeLease()");
		expect(source).toContain("await this.getReadyConnectionInfo()");
	});
});

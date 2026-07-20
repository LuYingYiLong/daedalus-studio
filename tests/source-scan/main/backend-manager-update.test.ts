import { describe, expect, it } from "vitest";
import { readRepoFile } from "../../helpers/repo-paths";

describe("backend manager update support", () => {
	const source: string = readRepoFile("src", "main", "services", "backend-manager.ts");
	const preloadSource: string = readRepoFile("src", "preload", "index.ts");

	it("prefers managed backend and falls back to bundled backend in packaged builds", () => {
		expect(source).toContain("resolveManagedBackendLaunchTarget");
		expect(source).toContain("\"current.json\"");
		expect(source).toContain("\"versions\"");
		expect(source).toContain("node_modules\", MANAGED_BACKEND_PACKAGE_NAME");
		expect(source).toContain("return this.resolveBundledBackendLaunchTarget();");
	});

	it("runs backend through Electron as Node and waits for healthy restart", () => {
		expect(source).toContain("ELECTRON_RUN_AS_NODE");
		expect(source).toContain("restartAndWaitHealthy");
		expect(source).toContain("waitUntilHealthy");
		expect(preloadSource).toContain("backend:restart");
	});
});

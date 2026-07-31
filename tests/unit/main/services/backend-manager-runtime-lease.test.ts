import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("electron", (): object => ({
	app: {
		isPackaged: true,
		getAppPath: vi.fn((): string => "C:\\Daedalus Studio")
	},
	BrowserWindow: vi.fn(),
	ipcMain: {
		handle: vi.fn()
	}
}));

import { backendManager } from "@main/services/backend-manager";

type TestBackendManager = {
	authToken: string | null;
	connectionInfoPromise: Promise<unknown> | null;
	ping: () => Promise<boolean>;
	ensureRuntimeLease: () => Promise<void>;
};

describe("BackendManager runtime lease recovery", () => {
	const manager: TestBackendManager = backendManager as unknown as TestBackendManager;

	beforeEach((): void => {
		vi.restoreAllMocks();
		manager.authToken = "test-auth-token";
		manager.connectionInfoPromise = null;
	});

	it("returns connection details only after recovering an unavailable runtime", async () => {
		vi.spyOn(manager, "ping").mockResolvedValue(false);
		const restart = vi.spyOn(backendManager, "restartAndWaitHealthy").mockResolvedValue();
		const ensureLease = vi.spyOn(manager, "ensureRuntimeLease").mockResolvedValue();

		await expect(backendManager.getReadyConnectionInfo()).resolves.toEqual({
			port: 38180,
			authProtocol: "daedalus-auth.test-auth-token"
		});
		expect(restart).toHaveBeenCalledOnce();
		expect(ensureLease).toHaveBeenCalledOnce();
	});

	it("reuses a healthy runtime while restoring its main-process lease", async () => {
		vi.spyOn(manager, "ping").mockResolvedValue(true);
		const restart = vi.spyOn(backendManager, "restartAndWaitHealthy").mockResolvedValue();
		const ensureLease = vi.spyOn(manager, "ensureRuntimeLease").mockResolvedValue();

		await expect(backendManager.getReadyConnectionInfo()).resolves.toEqual({
			port: 38180,
			authProtocol: "daedalus-auth.test-auth-token"
		});
		expect(restart).not.toHaveBeenCalled();
		expect(ensureLease).toHaveBeenCalledOnce();
	});
});

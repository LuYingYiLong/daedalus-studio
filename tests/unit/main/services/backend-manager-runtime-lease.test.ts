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
	connectionReadyGate: (() => Promise<void>) | null;
	ping: () => Promise<boolean>;
	ensureRuntimeLease: () => Promise<void>;
	process: { exitCode: number | null; signalCode: string | null; kill: () => void } | null;
};

describe("BackendManager runtime lease recovery", () => {
	const manager: TestBackendManager = backendManager as unknown as TestBackendManager;

	beforeEach((): void => {
		vi.restoreAllMocks();
		manager.authToken = "test-auth-token";
		manager.connectionInfoPromise = null;
		manager.connectionReadyGate = null;
		manager.process = null;
	});

	it("waits for the packaged bootstrap gate before inspecting the runtime", async () => {
		const order: string[] = [];
		backendManager.setConnectionReadyGate(async (): Promise<void> => {
			order.push("bootstrap");
		});
		vi.spyOn(manager, "ping").mockImplementation(async (): Promise<boolean> => {
			order.push("ping");
			return true;
		});
		vi.spyOn(manager, "ensureRuntimeLease").mockResolvedValue();

		await backendManager.getReadyConnectionInfo();

		expect(order).toEqual(["bootstrap", "ping"]);
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

	it("force stop only kills a live process owned by Studio", () => {
		const kill = vi.fn();
		manager.process = { exitCode: null, signalCode: null, kill };
		backendManager.forceStop();
		expect(kill).toHaveBeenCalledOnce();
		expect(manager.process).toBeNull();
		backendManager.forceStop();
		expect(kill).toHaveBeenCalledOnce();
	});

	it("force stop does not send a signal to an exited process", () => {
		const kill = vi.fn();
		manager.process = { exitCode: 0, signalCode: null, kill };
		backendManager.forceStop();
		expect(kill).not.toHaveBeenCalled();
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

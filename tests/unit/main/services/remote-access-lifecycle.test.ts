import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ start: vi.fn(), stop: vi.fn(), created: vi.fn() }));
vi.mock("electron", () => ({
	app: { getPath: () => ".", getVersion: () => "test" },
	BrowserWindow: { getAllWindows: () => [] }, ipcMain: { handle: vi.fn() },
	safeStorage: { isEncryptionAvailable: () => true },
}));
vi.mock("@main/services/backend-manager", () => ({ backendManager: {} }));
vi.mock("@main/services/logger", () => ({ createLogger: () => ({ info: vi.fn(), error: vi.fn() }) }));
vi.mock("node:os", async (importOriginal) => ({
	...await importOriginal<typeof import("node:os")>(),
	networkInterfaces: () => ({ test: [{ family: "IPv4", internal: false, address: "192.168.1.2" }] }),
}));
vi.mock("@main/services/remote-gateway", () => ({
	isPrivateIpv4: () => true,
	RemoteGateway: class {
		constructor() { mocks.created(); }
		start = mocks.start;
		stop = mocks.stop;
		forceStop = vi.fn();
	},
}));

beforeEach(() => { vi.resetModules(); vi.clearAllMocks(); mocks.start.mockResolvedValue(undefined); mocks.stop.mockResolvedValue(undefined); });
type ServiceInternals = { ensureCertificates: () => Promise<unknown>; startGateway: () => Promise<void> };
const bundle = { server: { certificatePem: "test", privateKeyPem: "test" }, ca: { certificatePem: "test" }, fingerprint: "test" };

describe("remote access shutdown races", () => {
	it("does not launch after certificate preparation finishes late", async () => {
		const { remoteAccessService } = await import("@main/services/remote-access");
		const service = remoteAccessService as unknown as ServiceInternals;
		let finish!: (value: unknown) => void;
		service.ensureCertificates = () => new Promise((resolve) => { finish = resolve; });
		const starting = service.startGateway();
		await remoteAccessService.stop();
		finish(bundle);
		await starting;
		expect(mocks.created).not.toHaveBeenCalled();
	});

	it("stops an already-created gateway while its listener is still starting", async () => {
		const { remoteAccessService } = await import("@main/services/remote-access");
		const service = remoteAccessService as unknown as ServiceInternals;
		service.ensureCertificates = async () => bundle;
		let finish!: () => void;
		mocks.start.mockImplementation(() => new Promise<void>((resolve) => { finish = resolve; }));
		const starting = service.startGateway();
		await vi.waitFor(() => expect(mocks.start).toHaveBeenCalledOnce());
		await remoteAccessService.stop();
		expect(mocks.stop).toHaveBeenCalledOnce();
		finish(); await starting;
		expect(remoteAccessService.getState().status).not.toBe("running");
	});
});

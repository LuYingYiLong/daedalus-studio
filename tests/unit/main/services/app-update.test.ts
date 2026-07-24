import { describe, expect, it, vi } from "vitest";
import {
	AppUpdateService,
	type AppUpdateState,
	type BackendUpdateCheckResult,
	type BackendUpdateClient,
	type BackendUpdateInstallResult
} from "@main/services/app-update";

type FakeUpdaterEventName =
	| "checking-for-update"
	| "update-available"
	| "update-not-available"
	| "download-progress"
	| "update-downloaded"
	| "error";

type FakeUpdateInfo = {
	version: string;
	releaseName?: string;
	releaseDate?: string;
	files: [];
	path: string;
	sha512: string;
};

function createUpdateInfo(version: string): FakeUpdateInfo {
	return {
		version,
		releaseName: `Daedalus Studio ${version}`,
		releaseDate: "2026-07-20T10:00:00.000Z",
		files: [],
		path: "",
		sha512: ""
	};
}

function createBackendCheckResult(updateAvailable: boolean = false): BackendUpdateCheckResult {
	return {
		currentVersion: "1.0.8",
		installedVersion: "1.0.8",
		latestVersion: updateAvailable ? "1.0.9" : "1.0.8",
		updateAvailable,
		checkedAt: "2026-07-20T10:00:00.000Z",
		errorMessage: null
	};
}

class FakeAutoUpdater {
	public autoDownload: boolean = true;
	public allowPrerelease: boolean = true;
	public checkCount: number = 0;
	public downloadCount: number = 0;
	public quitAndInstallArgs: Array<[boolean, boolean]> = [];
	public installEvents: string[] = [];
	private readonly handlers: Map<FakeUpdaterEventName, Array<(...args: unknown[]) => void>> = new Map();

	public on(eventName: FakeUpdaterEventName, handler: (...args: unknown[]) => void): this {
		const currentHandlers: Array<(...args: unknown[]) => void> = this.handlers.get(eventName) ?? [];
		this.handlers.set(eventName, [...currentHandlers, handler]);
		return this;
	}

	public async checkForUpdates(): Promise<null> {
		this.checkCount += 1;
		this.emit("checking-for-update");
		this.emit("update-not-available", createUpdateInfo("1.0.0"));
		return null;
	}

	public async downloadUpdate(): Promise<string[]> {
		this.downloadCount += 1;
		this.emit("download-progress", {
			percent: 42,
			bytesPerSecond: 100,
			total: 1000,
			transferred: 420
		});
		this.emit("update-downloaded", createUpdateInfo("1.1.0"));
		return ["installer.exe"];
	}

	public quitAndInstall(isSilent: boolean, isForceRunAfter: boolean): void {
		this.installEvents.push("quitAndInstall");
		this.quitAndInstallArgs.push([isSilent, isForceRunAfter]);
	}

	public emit(eventName: FakeUpdaterEventName, ...args: unknown[]): void {
		for (const handler of this.handlers.get(eventName) ?? []) {
			handler(...args);
		}
	}
}

class FakeBackendUpdateClient implements BackendUpdateClient {
	public checkCount: number = 0;
	public installCount: number = 0;
	public restartCount: number = 0;
	public verifyCount: number = 0;
	public cleanupCount: number = 0;
	public cleanupArgs: Array<[string, string | null]> = [];
	public checkResult: BackendUpdateCheckResult = createBackendCheckResult(false);
	public checkError: Error | null = null;
	public installError: Error | null = null;
	public restartError: Error | null = null;
	public verifyError: Error | null = null;

	public async check(): Promise<BackendUpdateCheckResult> {
		this.checkCount += 1;
		if (this.checkError !== null) {
			throw this.checkError;
		}
		return this.checkResult;
	}

	public async install(version: string | null): Promise<BackendUpdateInstallResult> {
		this.installCount += 1;
		if (this.installError !== null) {
			throw this.installError;
		}
		return {
			installed: true,
			version: version ?? "1.0.9",
			previousVersion: "1.0.8",
			installedAt: "2026-07-20T10:00:00.000Z"
		};
	}

	public async restartAndWaitHealthy(): Promise<void> {
		this.restartCount += 1;
		if (this.restartError !== null) {
			throw this.restartError;
		}
	}

	public async verifyInstalledVersion(): Promise<void> {
		this.verifyCount += 1;
		if (this.verifyError !== null) {
			throw this.verifyError;
		}
	}

	public async cleanupPreviousVersion(currentVersion: string, previousVersion: string | null): Promise<void> {
		this.cleanupCount += 1;
		this.cleanupArgs.push([currentVersion, previousVersion]);
	}
}

describe("app update service", () => {
	it("keeps client updater disabled for unpackaged builds while checking backend updates", async () => {
		const fakeUpdater = new FakeAutoUpdater();
		const fakeBackend = new FakeBackendUpdateClient();
		const events: AppUpdateState[] = [];
		const service = new AppUpdateService({
			isPackaged: false,
			currentVersion: "1.0.0",
			autoUpdater: fakeUpdater,
			backendUpdateClient: fakeBackend,
			sendEvent: (_channel, state): void => {
				events.push(state);
			}
		});

		await expect(service.checkForUpdatesIfEnabled(true)).resolves.toMatchObject({
			status: "not_available",
			client: { status: "unsupported" },
			backend: { status: "not_available" }
		});

		expect(fakeUpdater.autoDownload).toBe(false);
		expect(fakeUpdater.allowPrerelease).toBe(false);
		expect(fakeUpdater.checkCount).toBe(0);
		expect(fakeBackend.checkCount).toBe(1);
		expect(events.at(-1)?.status).toBe("not_available");
	});

	it("does not check when auto check is disabled", async () => {
		const fakeUpdater = new FakeAutoUpdater();
		const fakeBackend = new FakeBackendUpdateClient();
		const service = new AppUpdateService({
			isPackaged: true,
			currentVersion: "1.0.0",
			autoUpdater: fakeUpdater,
			backendUpdateClient: fakeBackend,
			sendEvent: (): void => {}
		});

		await expect(service.checkForUpdatesIfEnabled(false)).resolves.toMatchObject({
			status: "idle"
		});
		expect(fakeUpdater.checkCount).toBe(0);
		expect(fakeBackend.checkCount).toBe(0);
	});

	it("tracks client update availability, download progress and install restart", async () => {
		vi.useFakeTimers();
		try {
			const fakeUpdater = new FakeAutoUpdater();
			const fakeBackend = new FakeBackendUpdateClient();
			const events: AppUpdateState[] = [];
			const beforeClientInstall = vi.fn((): void => {
				fakeUpdater.installEvents.push("beforeClientInstall");
			});
			const service = new AppUpdateService({
				isPackaged: true,
				currentVersion: "1.0.0",
				autoUpdater: fakeUpdater,
				backendUpdateClient: fakeBackend,
				installDelayMs: 1,
				beforeClientInstall,
				sendEvent: (_channel, state): void => {
					events.push(state);
				}
			});

			fakeUpdater.emit("update-available", createUpdateInfo("1.1.0"));
			expect(service.getState()).toMatchObject({
				status: "available",
				updateKind: "client",
				availableVersion: "1.1.0",
				releaseName: "Daedalus Studio 1.1.0"
			});

			await expect(service.download()).resolves.toMatchObject({
				status: "downloaded",
				progress: 100
			});
			expect(fakeUpdater.downloadCount).toBe(1);
			expect(events.some((state: AppUpdateState): boolean => state.status === "downloading" && state.progress === 42)).toBe(true);

			vi.advanceTimersByTime(1);
			expect(service.getState().status).toBe("installing");
			expect(beforeClientInstall).toHaveBeenCalledTimes(1);
			expect(fakeUpdater.installEvents).toEqual(["beforeClientInstall", "quitAndInstall"]);
			expect(fakeUpdater.quitAndInstallArgs).toEqual([[false, true]]);
		} finally {
			vi.useRealTimers();
		}
	});

	it("installs backend-only updates and acknowledge hides the completed prompt", async () => {
		const fakeUpdater = new FakeAutoUpdater();
		const fakeBackend = new FakeBackendUpdateClient();
		fakeBackend.checkResult = createBackendCheckResult(true);
		const service = new AppUpdateService({
			isPackaged: true,
			currentVersion: "1.0.0",
			autoUpdater: fakeUpdater,
			backendUpdateClient: fakeBackend,
			sendEvent: (): void => {}
		});

		await expect(service.checkForUpdates()).resolves.toMatchObject({
			status: "available",
			updateKind: "backend",
			backend: {
				availableVersion: "1.0.9"
			}
		});
		await expect(service.download()).resolves.toMatchObject({
			status: "downloaded",
			updateKind: "backend",
			backend: {
				status: "downloaded",
				currentVersion: "1.0.9"
			}
		});
		expect(fakeBackend.installCount).toBe(1);
		expect(fakeBackend.restartCount).toBe(1);
		expect(fakeBackend.verifyCount).toBe(1);
		expect(fakeBackend.cleanupCount).toBe(1);
		expect(fakeBackend.cleanupArgs).toEqual([["1.0.9", "1.0.8"]]);
		expect(service.acknowledge()).toMatchObject({
			status: "not_available",
			updateKind: null
		});
	});

	it("installs backend before downloading client updates for combined updates", async () => {
		const fakeUpdater = new FakeAutoUpdater();
		const fakeBackend = new FakeBackendUpdateClient();
		fakeBackend.checkResult = createBackendCheckResult(true);
		const service = new AppUpdateService({
			isPackaged: true,
			currentVersion: "1.0.0",
			autoUpdater: fakeUpdater,
			backendUpdateClient: fakeBackend,
			sendEvent: (): void => {}
		});

		await service.checkForUpdates();
		fakeUpdater.emit("update-available", createUpdateInfo("1.1.0"));
		await service.download();

		expect(fakeBackend.installCount).toBe(1);
		expect(fakeBackend.restartCount).toBe(1);
		expect(fakeBackend.verifyCount).toBe(1);
		expect(fakeBackend.cleanupCount).toBe(1);
		expect(fakeUpdater.downloadCount).toBe(1);
		expect(service.getState().updateKind).toBe("combined");
	});

	it("keeps the previous backend when installed backend verification fails", async () => {
		const fakeUpdater = new FakeAutoUpdater();
		const fakeBackend = new FakeBackendUpdateClient();
		fakeBackend.checkResult = createBackendCheckResult(true);
		fakeBackend.verifyError = new Error("version mismatch");
		const service = new AppUpdateService({
			isPackaged: true,
			currentVersion: "1.0.0",
			autoUpdater: fakeUpdater,
			backendUpdateClient: fakeBackend,
			sendEvent: (): void => {}
		});

		await service.checkForUpdates();
		await expect(service.download()).resolves.toMatchObject({
			status: "error",
			errorMessage: "version mismatch",
			backend: {
				status: "error"
			}
		});
		expect(fakeBackend.installCount).toBe(1);
		expect(fakeBackend.restartCount).toBe(1);
		expect(fakeBackend.verifyCount).toBe(1);
		expect(fakeBackend.cleanupCount).toBe(0);
	});

	it("does not continue to client download when backend install fails", async () => {
		const fakeUpdater = new FakeAutoUpdater();
		const fakeBackend = new FakeBackendUpdateClient();
		fakeBackend.checkResult = createBackendCheckResult(true);
		fakeBackend.installError = new Error("install failed");
		const service = new AppUpdateService({
			isPackaged: true,
			currentVersion: "1.0.0",
			autoUpdater: fakeUpdater,
			backendUpdateClient: fakeBackend,
			sendEvent: (): void => {}
		});

		await service.checkForUpdates();
		fakeUpdater.emit("update-available", createUpdateInfo("1.1.0"));
		await expect(service.download()).resolves.toMatchObject({
			status: "available",
			errorMessage: "install failed",
			backend: {
				status: "error"
			}
		});
		expect(fakeUpdater.downloadCount).toBe(0);
	});

	it("converts updater errors to renderer state", () => {
		const fakeUpdater = new FakeAutoUpdater();
		const fakeBackend = new FakeBackendUpdateClient();
		const service = new AppUpdateService({
			isPackaged: true,
			currentVersion: "1.0.0",
			autoUpdater: fakeUpdater,
			backendUpdateClient: fakeBackend,
			sendEvent: (): void => {}
		});

		fakeUpdater.emit("error", new Error("network failed"));
		expect(service.getState()).toMatchObject({
			status: "error",
			errorMessage: "network failed",
			client: {
				status: "error"
			}
		});
	});
});

import { describe, expect, it, vi } from "vitest";
import {
	AppUpdateService,
	getDifferentialDownloadFallbackReason,
	resolveBackendUpdateBaselineVersion,
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
	public logger: {
		info: (message?: unknown) => void;
		warn: (message?: unknown) => void;
		error: (message?: unknown) => void;
		debug?: (message: string) => void;
	} | null = null;
	public checkCount: number = 0;
	public downloadCount: number = 0;
	public downloadScenario: (() => void) | null = null;
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
		if (this.downloadScenario !== null) {
			this.downloadScenario();
			return ["installer.exe"];
		}
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
	public rollbackCount: number = 0;
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

	public async rollbackFailedInstall(): Promise<void> {
		this.rollbackCount += 1;
	}
}

describe("app update service", () => {
	it("extracts a bounded one-line differential fallback reason", () => {
		expect(getDifferentialDownloadFallbackReason(
			"Cannot download differentially, fallback to full download: Error: old blockmap unavailable\n at updater"
		)).toBe("Error: old blockmap unavailable");
		expect(getDifferentialDownloadFallbackReason("ordinary updater error")).toBeNull();
	});

	it("uses the newer bundled backend as the online update baseline", () => {
		expect(resolveBackendUpdateBaselineVersion("1.1.7", "1.1.8")).toBe("1.1.8");
		expect(resolveBackendUpdateBaselineVersion("1.1.9", "1.1.8")).toBe("1.1.9");
		expect(resolveBackendUpdateBaselineVersion("1.1.8", "1.1.8")).toBe("1.1.8");
	});

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

			await vi.advanceTimersByTimeAsync(1);
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

	it("reports the official differential fallback as a full-installer download phase", async () => {
		const fakeUpdater = new FakeAutoUpdater();
		const fakeBackend = new FakeBackendUpdateClient();
		const events: AppUpdateState[] = [];
		const service = new AppUpdateService({
			isPackaged: true,
			currentVersion: "1.0.6",
			autoUpdater: fakeUpdater,
			backendUpdateClient: fakeBackend,
			sendEvent: (_channel, state): void => {
				events.push(state);
			}
		});
		fakeUpdater.downloadScenario = (): void => {
			fakeUpdater.emit("download-progress", {
				percent: 100,
				bytesPerSecond: 100,
				total: 1000,
				transferred: 1000
			});
			fakeUpdater.logger?.error(
				"Cannot download differentially, fallback to full download: Error: GitHub range request failed\n at updater"
			);
			fakeUpdater.emit("download-progress", {
				percent: 12,
				bytesPerSecond: 100,
				total: 2000,
				transferred: 240
			});
			fakeUpdater.emit("update-downloaded", createUpdateInfo("1.0.7"));
		};

		fakeUpdater.emit("update-available", createUpdateInfo("1.0.7"));
		await service.download();

		expect(events).toContainEqual(expect.objectContaining({
			status: "downloading",
			progress: 0,
			client: expect.objectContaining({
				downloadPhase: "full",
				downloadAttempt: 2,
				downloadFallbackReason: "Error: GitHub range request failed"
			})
		}));
		expect(events).toContainEqual(expect.objectContaining({
			status: "downloading",
			progress: 12,
			client: expect.objectContaining({ downloadPhase: "full" })
		}));
		expect(service.getState().client.status).toBe("downloaded");
	});

	it("infers a full-installer fallback when updater progress restarts without a log hook", async () => {
		const fakeUpdater = new FakeAutoUpdater();
		const fakeBackend = new FakeBackendUpdateClient();
		const events: AppUpdateState[] = [];
		const service = new AppUpdateService({
			isPackaged: true,
			currentVersion: "1.0.6",
			autoUpdater: fakeUpdater,
			backendUpdateClient: fakeBackend,
			sendEvent: (_channel, state): void => {
				events.push(state);
			}
		});
		fakeUpdater.downloadScenario = (): void => {
			fakeUpdater.emit("download-progress", {
				percent: 96,
				bytesPerSecond: 100,
				total: 1000,
				transferred: 960
			});
			fakeUpdater.emit("download-progress", {
				percent: 4,
				bytesPerSecond: 100,
				total: 2000,
				transferred: 80
			});
			fakeUpdater.emit("update-downloaded", createUpdateInfo("1.0.7"));
		};

		fakeUpdater.emit("update-available", createUpdateInfo("1.0.7"));
		await service.download();

		expect(events).toContainEqual(expect.objectContaining({
			status: "downloading",
			progress: 4,
			client: expect.objectContaining({
				downloadPhase: "full",
				downloadAttempt: 2
			})
		}));
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
		expect(fakeBackend.rollbackCount).toBe(1);
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
			status: "error",
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

	it("preserves updater diagnostics while removing sensitive URL parameters", () => {
		const fakeUpdater = new FakeAutoUpdater();
		const fakeBackend = new FakeBackendUpdateClient();
		const service = new AppUpdateService({
			isPackaged: true,
			currentVersion: "1.0.0",
			autoUpdater: fakeUpdater,
			backendUpdateClient: fakeBackend,
			sendEvent: (): void => {}
		});
		const networkError: Error & {
			code: string;
			statusCode: number;
			url: string;
			cause: Error;
		} = Object.assign(new Error("request failed"), {
			code: "ERR_NETWORK_CHANGED",
			statusCode: 503,
			url: "https://github.com/LuYingYiLong/godot-daedalus/releases/download/v1.0.7/setup.exe?token=secret",
			cause: new Error("socket disconnected")
		});

		fakeUpdater.emit("error", networkError);
		const errorMessage: string | null = service.getState().client.errorMessage;
		expect(errorMessage).toContain("request failed");
		expect(errorMessage).toContain("Error code: ERR_NETWORK_CHANGED");
		expect(errorMessage).toContain("HTTP status: 503");
		expect(errorMessage).toContain("URL: https://github.com/LuYingYiLong/godot-daedalus/releases/download/v1.0.7/setup.exe");
		expect(errorMessage).toContain("Cause: socket disconnected");
		expect(errorMessage).not.toContain("token=secret");
	});
});

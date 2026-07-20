import { describe, expect, it, vi } from "vitest";
import { AppUpdateService, type AppUpdateState } from "@main/services/app-update";

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

class FakeAutoUpdater {
	public autoDownload: boolean = true;
	public allowPrerelease: boolean = true;
	public checkCount: number = 0;
	public downloadCount: number = 0;
	public quitAndInstallArgs: Array<[boolean, boolean]> = [];
	private readonly handlers: Map<FakeUpdaterEventName, Array<(...args: unknown[]) => void>> = new Map();

	public on(eventName: FakeUpdaterEventName, handler: (...args: unknown[]) => void): this {
		const currentHandlers: Array<(...args: unknown[]) => void> = this.handlers.get(eventName) ?? [];
		this.handlers.set(eventName, [...currentHandlers, handler]);
		return this;
	}

	public async checkForUpdates(): Promise<null> {
		this.checkCount += 1;
		this.emit("checking-for-update");
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
		this.quitAndInstallArgs.push([isSilent, isForceRunAfter]);
	}

	public emit(eventName: FakeUpdaterEventName, ...args: unknown[]): void {
		for (const handler of this.handlers.get(eventName) ?? []) {
			handler(...args);
		}
	}
}

describe("app update service", () => {
	it("keeps updater disabled for unpackaged builds", async () => {
		const fakeUpdater = new FakeAutoUpdater();
		const events: AppUpdateState[] = [];
		const service = new AppUpdateService({
			isPackaged: false,
			currentVersion: "1.0.0",
			autoUpdater: fakeUpdater,
			sendEvent: (_channel, state): void => {
				events.push(state);
			}
		});

		await expect(service.checkForUpdatesIfEnabled(true)).resolves.toMatchObject({
			status: "unsupported",
			currentVersion: "1.0.0"
		});

		expect(fakeUpdater.autoDownload).toBe(false);
		expect(fakeUpdater.allowPrerelease).toBe(false);
		expect(fakeUpdater.checkCount).toBe(0);
		expect(events.at(-1)?.status).toBe("unsupported");
	});

	it("does not check when auto check is disabled", async () => {
		const fakeUpdater = new FakeAutoUpdater();
		const service = new AppUpdateService({
			isPackaged: true,
			currentVersion: "1.0.0",
			autoUpdater: fakeUpdater,
			sendEvent: (): void => {}
		});

		await expect(service.checkForUpdatesIfEnabled(false)).resolves.toMatchObject({
			status: "idle"
		});
		expect(fakeUpdater.checkCount).toBe(0);
	});

	it("tracks update availability, download progress and install restart", async () => {
		vi.useFakeTimers();
		try {
			const fakeUpdater = new FakeAutoUpdater();
			const events: AppUpdateState[] = [];
			const service = new AppUpdateService({
				isPackaged: true,
				currentVersion: "1.0.0",
				autoUpdater: fakeUpdater,
				installDelayMs: 1,
				sendEvent: (_channel, state): void => {
					events.push(state);
				}
			});

			fakeUpdater.emit("update-available", createUpdateInfo("1.1.0"));
			expect(service.getState()).toMatchObject({
				status: "available",
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
			expect(fakeUpdater.quitAndInstallArgs).toEqual([[false, true]]);
		} finally {
			vi.useRealTimers();
		}
	});

	it("converts updater errors to renderer state", () => {
		const fakeUpdater = new FakeAutoUpdater();
		const service = new AppUpdateService({
			isPackaged: true,
			currentVersion: "1.0.0",
			autoUpdater: fakeUpdater,
			sendEvent: (): void => {}
		});

		fakeUpdater.emit("error", new Error("network failed"));
		expect(service.getState()).toMatchObject({
			status: "error",
			errorMessage: "network failed"
		});
	});
});

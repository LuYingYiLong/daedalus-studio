import { BrowserWindow, app, ipcMain } from "electron";
import { existsSync } from "node:fs";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import packageJson from "../../../package.json";
import {
	activateBackendCandidate,
	commitBackendCandidate,
	getBackendPendingUpdatePath,
	getDaedalusDir,
	getManagedBackendCurrentPath,
	hasLegacyBackendMarker,
	inspectCurrentBackend,
	readCurrentBackendFile,
	readPendingBackendUpdate,
	removeLegacyManagedBackends,
	rollbackBackendCandidate,
	stageBundledBackend,
	type BackendCurrentFileV2,
	type InstalledBackendBinary
} from "./backend-binary-store";
import {
	backendManager,
	type BackendLaunchTarget
} from "./backend-manager";
import {
	BackendManifestCompatibilityError,
	compareSemanticVersions
} from "./backend-binary-manifest";
import { createLogger } from "./logger";

const logger = createLogger("backend-bootstrap");

export type BackendBootstrapStatus =
	| "idle"
	| "checking"
	| "installing"
	| "starting"
	| "healthy"
	| "error"
	| "unsupported";

export type BackendBootstrapPhase =
	| "detect"
	| "recover"
	| "install"
	| "verify"
	| "write_metadata"
	| "start"
	| "health_check"
	| "rollback"
	| "ready"
	| "error";

export type BackendBootstrapState = {
	status: BackendBootstrapStatus;
	phase: BackendBootstrapPhase;
	packaged: boolean;
	firstRun: boolean;
	progress: number;
	backendVersion: string | null;
	port: number;
	errorCode: string | null;
	errorMessage: string | null;
	suggestedAction: string | null;
};

type BackendBootstrapMarker = {
	backendBootstrapCompleted?: unknown;
	backendBootstrapCompletedAt?: unknown;
	backendVersion?: unknown;
};

type RunPrepareOptions = {
	forceInstall: boolean;
};

function createInitialState(): BackendBootstrapState {
	return {
		status: "idle",
		phase: "detect",
		packaged: app?.isPackaged === true,
		firstRun: true,
		progress: 0,
		backendVersion: null,
		port: backendManager.getPort(),
		errorCode: null,
		errorMessage: null,
		suggestedAction: null
	};
}

function getBootstrapMarkerPath(): string {
	return join(getDaedalusDir(), "client", "bootstrap.json");
}

async function readJsonFile<TValue>(filePath: string): Promise<TValue | null> {
	try {
		return JSON.parse(await readFile(filePath, "utf8")) as TValue;
	} catch {
		return null;
	}
}

async function lacksBridgeCompatibilityMetadata(
	current: BackendCurrentFileV2
): Promise<boolean> {
	const manifest: unknown | null = await readJsonFile<unknown>(current.manifestPath);
	if (typeof manifest !== "object" || manifest === null || Array.isArray(manifest)) {
		return false;
	}
	const record: Record<string, unknown> = manifest as Record<string, unknown>;
	return !Number.isSafeInteger(record.minBridgeProtocolVersion)
		|| !Number.isSafeInteger(record.maxBridgeProtocolVersion);
}

async function writeJsonFileAtomic(filePath: string, value: unknown): Promise<void> {
	await mkdir(dirname(filePath), { recursive: true });
	const tempPath: string = `${filePath}.${process.pid}.${Date.now()}.tmp`;
	await writeFile(tempPath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
	await rename(tempPath, filePath);
}

async function hasCompletedBackendBootstrap(): Promise<boolean> {
	const marker: BackendBootstrapMarker | null = await readJsonFile<BackendBootstrapMarker>(
		getBootstrapMarkerPath()
	);
	return marker?.backendBootstrapCompleted === true;
}

async function writeCompletedBackendBootstrap(version: string): Promise<void> {
	await writeJsonFileAtomic(getBootstrapMarkerPath(), {
		backendBootstrapCompleted: true,
		backendBootstrapCompletedAt: new Date().toISOString(),
		backendVersion: version
	});
}

function broadcastBackendBootstrapEvent(payload: BackendBootstrapState): void {
	for (const browserWindow of BrowserWindow?.getAllWindows?.() ?? []) {
		if (!browserWindow.isDestroyed()) {
			browserWindow.webContents.send("backend-bootstrap:state-changed", payload);
		}
	}
}

function getErrorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

export class BackendBootstrapService {
	private mainWindow: BrowserWindow | null = null;
	private state: BackendBootstrapState = createInitialState();
	private preparePromise: Promise<BackendBootstrapState> | null = null;
	private runtimeBusy: boolean = false;
	private initialized: boolean = false;
	private readonly stateListeners: Set<(state: BackendBootstrapState) => void> = new Set();

	public attachWindow(mainWindow: BrowserWindow): void {
		this.mainWindow = mainWindow;
	}

	public getState(): BackendBootstrapState {
		return { ...this.state };
	}

	public setRuntimeBusy(runtimeBusy: boolean): void {
		this.runtimeBusy = runtimeBusy;
	}

	public onDidChangeState(listener: (state: BackendBootstrapState) => void): () => void {
		this.stateListeners.add(listener);
		return (): void => {
			this.stateListeners.delete(listener);
		};
	}

	public registerIpc(): void {
		if (this.initialized) {
			return;
		}
		this.initialized = true;
		if (typeof ipcMain?.handle !== "function") {
			return;
		}
		ipcMain.handle("backend-bootstrap:get-state", (): BackendBootstrapState => this.getState());
		ipcMain.handle("backend-bootstrap:prepare", async (): Promise<BackendBootstrapState> => await this.prepare());
		ipcMain.handle("backend-bootstrap:repair", async (): Promise<BackendBootstrapState> => await this.repair());
		ipcMain.handle("backend-bootstrap:retry-start", async (): Promise<BackendBootstrapState> => await this.retryStart());
	}

	public async prepare(): Promise<BackendBootstrapState> {
		return await this.runExclusive((): Promise<BackendBootstrapState> =>
			this.runPrepare({ forceInstall: false })
		);
	}

	public async repair(): Promise<BackendBootstrapState> {
		return await this.runExclusive((): Promise<BackendBootstrapState> =>
			this.runPrepare({ forceInstall: true })
		);
	}

	public async retryStart(): Promise<BackendBootstrapState> {
		return await this.runExclusive((): Promise<BackendBootstrapState> => this.runStartOnly());
	}

	private async runExclusive(task: () => Promise<BackendBootstrapState>): Promise<BackendBootstrapState> {
		if (this.preparePromise !== null) {
			return await this.preparePromise;
		}
		this.preparePromise = this.runAndCaptureErrors(task);
		try {
			return await this.preparePromise;
		} finally {
			this.preparePromise = null;
		}
	}

	private async runPrepare(options: RunPrepareOptions): Promise<BackendBootstrapState> {
		if (options.forceInstall && this.runtimeBusy) {
			return this.fail({
				status: "error",
				phase: "detect",
				progress: 100,
				errorCode: "runtime_busy",
				errorMessage: "The backend cannot be repaired while an AI response is active.",
				suggestedAction: "Wait for the active response to finish, then retry."
			});
		}
		if (this.state.status === "healthy" && !options.forceInstall) {
			return this.getState();
		}
		const packaged: boolean = app?.isPackaged === true;
		const firstRunCompleted: boolean = await hasCompletedBackendBootstrap();
		this.updateState({
			status: "checking",
			phase: "detect",
			packaged,
			firstRun: !firstRunCompleted,
			progress: 5,
			errorCode: null,
			errorMessage: null,
			suggestedAction: null
		});
		if (!packaged) {
			return await this.startDevelopmentBackend();
		}

		if (options.forceInstall) {
			await backendManager.stopAndWait();
			await rollbackBackendCandidate();
			return await this.installBundledAndStart();
		}

		const pendingUpdate = await readPendingBackendUpdate();
		if (existsSync(getBackendPendingUpdatePath()) && pendingUpdate === null) {
			return this.fail({
				status: "error",
				phase: "recover",
				progress: 100,
				errorCode: "pending_backend_update_invalid",
				errorMessage: "The pending backend update transaction is damaged.",
				suggestedAction: "Use Repair backend to restore the bundled backend."
			});
		}
		if (pendingUpdate !== null) {
			const recovered: BackendBootstrapState | null = await this.recoverPendingUpdate();
			if (recovered !== null) {
				return recovered;
			}
		}

		const currentMarkerExists: boolean = existsSync(getManagedBackendCurrentPath());
		const current: BackendCurrentFileV2 | null = await readCurrentBackendFile();
		if (current !== null) {
			try {
				await inspectCurrentBackend();
			} catch (error: unknown) {
				if (
					error instanceof BackendManifestCompatibilityError
					|| await lacksBridgeCompatibilityMetadata(current)
				) {
					logger.info("Replacing an incompatible managed backend with the bundled backend.", {
						version: current.version,
						reason: getErrorMessage(error)
					});
					await backendManager.stopAndWait();
					return await this.installBundledAndStart();
				}
				return this.fail({
					status: "error",
					phase: "detect",
					progress: 100,
					errorCode: "marked_backend_missing",
					errorMessage: getErrorMessage(error),
					suggestedAction: "Use Repair backend to restore the verified backend bundled with Daedalus Studio."
				});
			}
			if (compareSemanticVersions(current.version, packageJson.backendBootstrapVersion) < 0) {
				logger.info("Replacing a managed backend older than the bundled backend.", {
					currentVersion: current.version,
					bundledVersion: packageJson.backendBootstrapVersion
				});
				await backendManager.stopAndWait();
				return await this.installBundledAndStart();
			}
			return await this.startAndCommitCurrent(current.version, false);
		}

		if (currentMarkerExists && !(await hasLegacyBackendMarker())) {
			return this.fail({
				status: "error",
				phase: "detect",
				progress: 100,
				errorCode: "backend_marker_invalid",
				errorMessage: "The managed backend state file is invalid.",
				suggestedAction: "Use Repair backend to restore the bundled backend."
			});
		}

		// Legacy npm markers are recognized only so they can be replaced; their TypeScript entry is never executed.
		return await this.installBundledAndStart();
	}

	private async recoverPendingUpdate(): Promise<BackendBootstrapState | null> {
		this.updateState({
			status: "checking",
			phase: "recover",
			progress: 15,
			errorCode: null,
			errorMessage: null,
			suggestedAction: null
		});
		const pending = await readPendingBackendUpdate();
		const current: BackendCurrentFileV2 | null = await readCurrentBackendFile();
		if (pending !== null && current?.version === pending.candidate.version) {
			try {
				await inspectCurrentBackend();
				return await this.startAndCommitCurrent(current.version, true);
			} catch (error: unknown) {
				logger.warn("Pending backend candidate failed recovery.", {
					message: getErrorMessage(error),
					version: current.version
				});
			}
		}
		await backendManager.stopAndWait();
		this.updateState({
			status: "checking",
			phase: "rollback",
			progress: 30
		});
		const previous: BackendCurrentFileV2 | null = await rollbackBackendCandidate();
		if (previous === null) {
			return null;
		}
		try {
			await inspectCurrentBackend();
			return await this.startCurrent(previous.version);
		} catch (error: unknown) {
			logger.error("Previous backend also failed after rollback.", error as Error);
			return null;
		}
	}

	private async installBundledAndStart(): Promise<BackendBootstrapState> {
		this.updateState({
			status: "installing",
			phase: "install",
			progress: 20,
			errorCode: null,
			errorMessage: null,
			suggestedAction: null
		});
		const installed: InstalledBackendBinary = await stageBundledBackend();
		this.updateState({
			status: "installing",
			phase: "verify",
			progress: 50,
			backendVersion: installed.version
		});
		await activateBackendCandidate(installed);
		this.updateState({
			status: "installing",
			phase: "write_metadata",
			progress: 60
		});
		return await this.startAndCommitCurrent(installed.version, true);
	}

	private async startAndCommitCurrent(
		version: string,
		hasPendingTransaction: boolean
	): Promise<BackendBootstrapState> {
		try {
			const state: BackendBootstrapState = await this.startCurrent(version);
			if (hasPendingTransaction) {
				await commitBackendCandidate(version);
			}
			await removeLegacyManagedBackends();
			await writeCompletedBackendBootstrap(version);
			return state;
		} catch (error: unknown) {
			if (!hasPendingTransaction) {
				throw error;
			}
			await backendManager.stopAndWait();
			this.updateState({
				status: "checking",
				phase: "rollback",
				progress: 90
			});
			const previous: BackendCurrentFileV2 | null = await rollbackBackendCandidate();
			if (previous !== null) {
				try {
					return await this.startCurrent(previous.version);
				} catch (rollbackError: unknown) {
					throw new Error(
						`Backend ${version} failed and rollback to ${previous.version} also failed: ${getErrorMessage(rollbackError)}`
					);
				}
			}
			throw error;
		}
	}

	private async startDevelopmentBackend(): Promise<BackendBootstrapState> {
		try {
			return await this.startCurrent(null);
		} catch {
			return this.fail({
				status: "unsupported",
				phase: "health_check",
				progress: 100,
				errorCode: "dev_backend_unavailable",
				errorMessage: `Development backend did not become healthy on port ${backendManager.getPort()}.`,
				suggestedAction: "Run `npm run dev` in the daedalus-backend repository, then retry."
			});
		}
	}

	private async startCurrent(version: string | null): Promise<BackendBootstrapState> {
		const mainWindow: BrowserWindow = this.requireMainWindow();
		this.updateState({
			status: "starting",
			phase: "start",
			progress: Math.max(this.state.progress, 65),
			backendVersion: version,
			errorCode: null,
			errorMessage: null,
			suggestedAction: null
		});
		await backendManager.start(mainWindow);
		this.updateState({
			status: "starting",
			phase: "health_check",
			progress: 75
		});
		await backendManager.waitUntilHealthy();
		await new Promise((resolveWait): void => {
			setTimeout(resolveWait, 500);
		});
		await backendManager.waitUntilHealthy(5000);
		const launchTarget: Pick<BackendLaunchTarget, "kind" | "version"> | null =
			app?.isPackaged === true ? backendManager.getLaunchTargetInfo() : null;
		this.updateState({
			status: "healthy",
			phase: "ready",
			progress: 100,
			backendVersion: app?.isPackaged === true
				? launchTarget?.version ?? version
				: null,
			errorCode: null,
			errorMessage: null,
			suggestedAction: null
		});
		return this.getState();
	}

	private async runStartOnly(): Promise<BackendBootstrapState> {
		if (this.runtimeBusy) {
			return this.fail({
				status: "error",
				phase: "detect",
				progress: 100,
				errorCode: "runtime_busy",
				errorMessage: "The backend cannot be restarted while an AI response is active.",
				suggestedAction: "Wait for the active response to finish, then retry."
			});
		}
		await backendManager.stopAndWait();
		if (app?.isPackaged === true) {
			const current: BackendCurrentFileV2 | null = await readCurrentBackendFile();
			if (current === null) {
				return this.fail({
					status: "error",
					phase: "detect",
					progress: 100,
					errorCode: "backend_missing",
					errorMessage: "No active verified backend binary is installed.",
					suggestedAction: "Use Repair backend to restore the bundled backend."
				});
			}
			try {
				await inspectCurrentBackend();
			} catch (error: unknown) {
				return this.fail({
					status: "error",
					phase: "detect",
					progress: 100,
					errorCode: "marked_backend_missing",
					errorMessage: getErrorMessage(error),
					suggestedAction: "Use Repair backend to restore the bundled backend."
				});
			}
		}
		if (app?.isPackaged === true && backendManager.getLaunchTargetInfo() === null) {
			return this.fail({
				status: "error",
				phase: "detect",
				progress: 100,
				errorCode: "backend_missing",
				errorMessage: "No verified backend binary is available.",
				suggestedAction: "Use Repair backend to restore the bundled backend."
			});
		}
		return await this.startCurrent(backendManager.getLaunchTargetInfo()?.version ?? null);
	}

	private requireMainWindow(): BrowserWindow {
		if (this.mainWindow === null || this.mainWindow.isDestroyed()) {
			throw new Error("Main window is not ready.");
		}
		return this.mainWindow;
	}

	private fail(patch: {
		status: "error" | "unsupported";
		phase: BackendBootstrapPhase;
		progress: number;
		errorCode: string;
		errorMessage: string;
		suggestedAction: string;
	}): BackendBootstrapState {
		this.updateState({
			...patch,
			packaged: app?.isPackaged === true
		});
		return this.getState();
	}

	private async runAndCaptureErrors(
		task: () => Promise<BackendBootstrapState>
	): Promise<BackendBootstrapState> {
		try {
			return await task();
		} catch (error: unknown) {
			logger.error("Backend bootstrap failed.", error as Error);
			if (this.state.status === "error" || this.state.status === "unsupported") {
				return this.getState();
			}
			return this.fail({
				status: app?.isPackaged === true ? "error" : "unsupported",
				phase: "error",
				progress: 100,
				errorCode: "bootstrap_failed",
				errorMessage: getErrorMessage(error),
				suggestedAction: app?.isPackaged === true
					? "Retry startup or repair the verified backend installation."
					: "Start daedalus-backend in development mode, then retry."
			});
		}
	}

	private updateState(patch: Partial<BackendBootstrapState>): void {
		this.state = {
			...this.state,
			...patch,
			port: backendManager.getPort()
		};
		const nextState: BackendBootstrapState = this.getState();
		broadcastBackendBootstrapEvent(nextState);
		for (const listener of this.stateListeners) {
			listener(nextState);
		}
	}
}

export const backendBootstrapService: BackendBootstrapService = new BackendBootstrapService();

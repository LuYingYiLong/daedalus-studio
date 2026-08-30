import { app, ipcMain } from "electron";
import { join } from "node:path";
import {
	DEFAULT_CLIENT_PREFERENCES,
	loadClientPreferencesFile,
	normalizeClientPreferencesPatch,
	saveClientPreferencesFile,
	type ClientPreferences,
	type ClientPreferencesPatch
} from "./client-preferences-store";

class ClientPreferencesService {
	private preferences: ClientPreferences = { ...DEFAULT_CLIENT_PREFERENCES };
	private loaded: boolean = false;
	private loadPromise: Promise<ClientPreferences> | null = null;
	private updateTail: Promise<void> = Promise.resolve();
	private readonly changeListeners: Set<(preferences: ClientPreferences) => void> = new Set();

	getPreferencesPath(): string {
		return join(app.getPath("userData"), "client-preferences.json");
	}

	getCachedPreferences(): ClientPreferences {
		return { ...this.preferences };
	}

	onDidChange(listener: (preferences: ClientPreferences) => void): () => void {
		this.changeListeners.add(listener);
		return (): void => {
			this.changeListeners.delete(listener);
		};
	}

	async load(): Promise<ClientPreferences> {
		if (this.loaded) {
			return this.getCachedPreferences();
		}
		if (this.loadPromise !== null) {
			return await this.loadPromise;
		}

		this.loadPromise = this.loadInternal();
		try {
			return await this.loadPromise;
		} finally {
			this.loadPromise = null;
		}
	}

	async update(patch: ClientPreferencesPatch): Promise<ClientPreferences> {
		await this.load();
		const normalizedPatch: ClientPreferencesPatch = normalizeClientPreferencesPatch(patch);
		const updateOperation: Promise<ClientPreferences> = this.updateTail.then(async (): Promise<ClientPreferences> => {
			const nextPreferences: ClientPreferences = {
				...this.preferences,
				...normalizedPatch
			};
			await saveClientPreferencesFile(this.getPreferencesPath(), nextPreferences);
			this.preferences = nextPreferences;
			this.loaded = true;
			const persistedPreferences: ClientPreferences = this.getCachedPreferences();
			setTimeout((): void => this.notifyChange(persistedPreferences), 0);
			return persistedPreferences;
		});
		this.updateTail = updateOperation.then(
			(): void => {},
			(): void => {}
		);
		try {
			return await updateOperation;
		} catch (error: unknown) {
			console.error("[ClientPreferences] update failed", {
				fields: Object.keys(normalizedPatch),
				error
			});
			throw error;
		}
	}

	registerIpc(): void {
		ipcMain.on("client-preferences:get-cached", (event): void => {
			event.returnValue = this.getCachedPreferences();
		});
		ipcMain.handle("client-preferences:get", async (): Promise<ClientPreferences> => await this.load());
		ipcMain.handle("client-preferences:update", async (_event, patch: unknown): Promise<ClientPreferences> => {
			if (patch && typeof patch === "object" && "allowComputerObservation" in patch) throw new Error("computer_settings_sender_not_allowed");
			return await this.update(normalizeClientPreferencesPatch(patch));
		});
	}

	private async loadInternal(): Promise<ClientPreferences> {
		const loaded = await loadClientPreferencesFile(this.getPreferencesPath());
		this.preferences = loaded.preferences;
		this.loaded = true;
		return this.getCachedPreferences();
	}

	private notifyChange(preferences: ClientPreferences = this.getCachedPreferences()): void {
		for (const listener of this.changeListeners) {
			listener(preferences);
		}
	}
}

export const clientPreferencesService = new ClientPreferencesService();
export type { ClientPreferences, ClientPreferencesPatch };

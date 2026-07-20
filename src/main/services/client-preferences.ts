import { app, ipcMain } from "electron";
import { join } from "node:path";
import {
	DEFAULT_CLIENT_PREFERENCES,
	loadClientPreferencesFile,
	normalizeClientPreferencesPatch,
	updateClientPreferencesFile,
	type ClientPreferences,
	type ClientPreferencesPatch
} from "./client-preferences-store";

class ClientPreferencesService {
	private preferences: ClientPreferences = { ...DEFAULT_CLIENT_PREFERENCES };
	private loaded: boolean = false;
	private loadPromise: Promise<ClientPreferences> | null = null;
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
		this.preferences = await updateClientPreferencesFile(this.getPreferencesPath(), patch);
		this.loaded = true;
		this.notifyChange();
		return this.getCachedPreferences();
	}

	registerIpc(): void {
		ipcMain.on("client-preferences:get-cached", (event): void => {
			event.returnValue = this.getCachedPreferences();
		});
		ipcMain.handle("client-preferences:get", async (): Promise<ClientPreferences> => await this.load());
		ipcMain.handle("client-preferences:update", async (_event, patch: unknown): Promise<ClientPreferences> => {
			return await this.update(normalizeClientPreferencesPatch(patch));
		});
	}

	private async loadInternal(): Promise<ClientPreferences> {
		const loaded = await loadClientPreferencesFile(this.getPreferencesPath());
		this.preferences = loaded.preferences;
		this.loaded = true;
		return this.getCachedPreferences();
	}

	private notifyChange(): void {
		const preferences: ClientPreferences = this.getCachedPreferences();
		for (const listener of this.changeListeners) {
			listener(preferences);
		}
	}
}

export const clientPreferencesService = new ClientPreferencesService();
export type { ClientPreferences, ClientPreferencesPatch };

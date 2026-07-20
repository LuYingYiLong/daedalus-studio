export type ClientPreferences = {
	minimizeToTrayOnClose: boolean;
	theme: "system" | "light" | "dark";
	lastComposerModel: {
		providerId: string;
		modelId: string;
	} | null;
};

export type ClientPreferencesPatch = Partial<ClientPreferences>;

export const DEFAULT_CLIENT_PREFERENCES: ClientPreferences = {
	minimizeToTrayOnClose: false,
	theme: "system",
	lastComposerModel: null
};

export const CLIENT_PREFERENCES_CHANGED_EVENT = "daedalus:client-preferences-changed";

export async function fetchClientPreferences(): Promise<ClientPreferences> {
	return await window.electronAPI.clientPreferences.get();
}

export function getCachedClientPreferences(): ClientPreferences {
	if (window.electronAPI?.clientPreferences === undefined) {
		return DEFAULT_CLIENT_PREFERENCES;
	}
	return window.electronAPI.clientPreferences.getCached();
}

export async function updateClientPreferences(patch: ClientPreferencesPatch): Promise<ClientPreferences> {
	const preferences: ClientPreferences = await window.electronAPI.clientPreferences.update(patch);
	window.dispatchEvent(new CustomEvent<ClientPreferences>(CLIENT_PREFERENCES_CHANGED_EVENT, {
		detail: preferences
	}));
	return preferences;
}

export type ClientPreferences = {
	minimizeToTrayOnClose: boolean;
	lastComposerModel: {
		providerId: string;
		modelId: string;
	} | null;
};

export type ClientPreferencesPatch = Partial<ClientPreferences>;

export const DEFAULT_CLIENT_PREFERENCES: ClientPreferences = {
	minimizeToTrayOnClose: false,
	lastComposerModel: null
};

export async function fetchClientPreferences(): Promise<ClientPreferences> {
	return await window.electronAPI.clientPreferences.get();
}

export async function updateClientPreferences(patch: ClientPreferencesPatch): Promise<ClientPreferences> {
	return await window.electronAPI.clientPreferences.update(patch);
}

import { createBackendClient } from "./backend-client";

export type GeneralSettings = {
	schemaVersion: 1;
	autoExpandTodoList: boolean;
	updatedAt: string;
};

export type GeneralSettingsPatch = {
	autoExpandTodoList?: boolean;
};

export const DEFAULT_GENERAL_SETTINGS: GeneralSettings = {
	schemaVersion: 1,
	autoExpandTodoList: false,
	updatedAt: ""
};

export async function fetchGeneralSettings(): Promise<GeneralSettings> {
	const client = await createBackendClient();

	return client.request<GeneralSettings>("generalSettings.get");
}

export async function updateGeneralSettings(patch: GeneralSettingsPatch): Promise<GeneralSettings> {
	const client = await createBackendClient();

	return client.request<GeneralSettings>("generalSettings.update", patch);
}

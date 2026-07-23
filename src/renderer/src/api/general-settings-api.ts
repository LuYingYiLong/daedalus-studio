import { createBackendClient } from "./backend-client";

export type GeneralSettings = {
	schemaVersion: 2;
	autoExpandTodoList: boolean;
	godotExecutablePath: string | null;
	godotExecutableVersion: string | null;
	godotExecutableStatus: "unconfigured" | "ready" | "unavailable";
	godotExecutableError: string | null;
	updatedAt: string;
};

export type GeneralSettingsPatch = {
	autoExpandTodoList?: boolean;
	godotExecutablePath?: string | null;
};

export const DEFAULT_GENERAL_SETTINGS: GeneralSettings = {
	schemaVersion: 2,
	autoExpandTodoList: false,
	godotExecutablePath: null,
	godotExecutableVersion: null,
	godotExecutableStatus: "unconfigured",
	godotExecutableError: null,
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

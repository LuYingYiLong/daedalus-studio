import { createBackendClient } from "@/platform/rpc/transport/backend-client";
import type { GeneralSettings } from "../../../../contracts/general-settings";

export type { GeneralSettings } from "../../../../contracts/general-settings";

export type GeneralSettingsPatch = {
	nextStepHintsEnabled?: boolean;
	godotExecutablePath?: string | null;
};

export const DEFAULT_GENERAL_SETTINGS: GeneralSettings = {
	schemaVersion: 3,
	nextStepHintsEnabled: false,
	godotExecutablePath: null,
	godotExecutableVersion: null,
	godotExecutableStatus: "unconfigured",
	godotExecutableError: null,
	updatedAt: "",
};

export const GENERAL_SETTINGS_CHANGED_EVENT: string =
	"daedalus:general-settings-changed";

export function dispatchGeneralSettingsChanged(
	settings: GeneralSettings,
): void {
	window.dispatchEvent(
		new CustomEvent<GeneralSettings>(GENERAL_SETTINGS_CHANGED_EVENT, {
			detail: settings,
		}),
	);
}

export async function fetchGeneralSettings(): Promise<GeneralSettings> {
	const client = await createBackendClient();

	const settings: GeneralSettings = await client.request<GeneralSettings>(
		"generalSettings.get",
	);
	dispatchGeneralSettingsChanged(settings);
	return settings;
}

export async function updateGeneralSettings(
	patch: GeneralSettingsPatch,
): Promise<GeneralSettings> {
	const client = await createBackendClient();

	const settings: GeneralSettings = await client.request<GeneralSettings>(
		"generalSettings.update",
		patch,
	);
	dispatchGeneralSettingsChanged(settings);
	window.electronAPI.generalSettings?.notifyChanged(settings);
	return settings;
}

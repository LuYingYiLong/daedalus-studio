import { createBackendClient } from "@/platform/rpc/transport/backend-client";
import type { GeneralSettings } from "../../../../contracts/general-settings";

export type { GeneralSettings } from "../../../../contracts/general-settings";

export type GeneralSettingsPatch = {
	nextStepHintsEnabled?: boolean;
	fontFamily?: string;
	fontFamilyCode?: string;
	godotExecutablePath?: string | null;
};

export const DEFAULT_FONT_FAMILY: string = '"Mona Sans", "Wen Yuan Sans SC", "Microsoft YaHei UI", "Microsoft YaHei", system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
export const DEFAULT_FONT_FAMILY_CODE: string = '"Fira Code", "Cascadia Code", "SFMono-Regular", Consolas, "Liberation Mono", Menlo, Courier, "Mona Sans", "Wen Yuan Sans SC", "Microsoft YaHei UI", "Microsoft YaHei", system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", monospace';

export const DEFAULT_GENERAL_SETTINGS: GeneralSettings = {
	schemaVersion: 2,
	nextStepHintsEnabled: false,
	fontFamily: DEFAULT_FONT_FAMILY,
	fontFamilyCode: DEFAULT_FONT_FAMILY_CODE,
	godotExecutablePath: null,
	godotExecutableVersion: null,
	godotExecutableStatus: "unconfigured",
	godotExecutableError: null,
	updatedAt: ""
};

export const GENERAL_SETTINGS_CHANGED_EVENT: string = "daedalus:general-settings-changed";

export function dispatchGeneralSettingsChanged(settings: GeneralSettings): void {
	window.dispatchEvent(new CustomEvent<GeneralSettings>(GENERAL_SETTINGS_CHANGED_EVENT, {
		detail: settings
	}));
}

export async function fetchGeneralSettings(): Promise<GeneralSettings> {
	const client = await createBackendClient();

	const settings: GeneralSettings = await client.request<GeneralSettings>("generalSettings.get");
	dispatchGeneralSettingsChanged(settings);
	return settings;
}

export async function updateGeneralSettings(patch: GeneralSettingsPatch): Promise<GeneralSettings> {
	const client = await createBackendClient();

	const settings: GeneralSettings = await client.request<GeneralSettings>("generalSettings.update", patch);
	dispatchGeneralSettingsChanged(settings);
	window.electronAPI.generalSettings?.notifyChanged(settings);
	return settings;
}

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

export type ClientPreferences = {
	autoCheckForUpdates: boolean;
	minimizeToTrayOnClose: boolean;
	theme: "system" | "light" | "dark";
	language: "system" | "en-US" | "zh-CN";
	lastComposerModel: {
		providerId: string;
		modelId: string;
	} | null;
};

export type ClientPreferencesPatch = Partial<ClientPreferences>;

export const DEFAULT_CLIENT_PREFERENCES: ClientPreferences = {
	autoCheckForUpdates: true,
	minimizeToTrayOnClose: false,
	theme: "system",
	language: "system",
	lastComposerModel: null
};

type ClientPreferencesStoreIo = {
	readText(path: string): Promise<string>;
	writeText(path: string, text: string): Promise<void>;
	ensureDirectory(path: string): Promise<void>;
};

const DEFAULT_IO: ClientPreferencesStoreIo = {
	async readText(path: string): Promise<string> {
		return await readFile(path, "utf8");
	},
	async writeText(path: string, text: string): Promise<void> {
		await writeFile(path, text, "utf8");
	},
	async ensureDirectory(path: string): Promise<void> {
		await mkdir(path, { recursive: true });
	}
};

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function normalizeClientPreferences(value: unknown): { preferences: ClientPreferences; normalized: boolean } {
	if (!isRecord(value)) {
		return {
			preferences: { ...DEFAULT_CLIENT_PREFERENCES },
			normalized: true
		};
	}

	const autoCheckForUpdates: boolean = typeof value.autoCheckForUpdates === "boolean"
		? value.autoCheckForUpdates
		: DEFAULT_CLIENT_PREFERENCES.autoCheckForUpdates;
	const minimizeToTrayOnClose: boolean = typeof value.minimizeToTrayOnClose === "boolean"
		? value.minimizeToTrayOnClose
		: DEFAULT_CLIENT_PREFERENCES.minimizeToTrayOnClose;
	const themePreference: ClientPreferences["theme"] =
		value.theme === "light" || value.theme === "dark" || value.theme === "system"
			? value.theme
			: DEFAULT_CLIENT_PREFERENCES.theme;
	const languagePreference: ClientPreferences["language"] =
		value.language === "en-US" || value.language === "zh-CN" || value.language === "system"
			? value.language
			: DEFAULT_CLIENT_PREFERENCES.language;
	const lastComposerModel = isRecord(value.lastComposerModel)
		&& typeof value.lastComposerModel.providerId === "string"
		&& value.lastComposerModel.providerId.trim().length > 0
		&& typeof value.lastComposerModel.modelId === "string"
		&& value.lastComposerModel.modelId.trim().length > 0
		? {
			providerId: value.lastComposerModel.providerId.trim(),
			modelId: value.lastComposerModel.modelId.trim()
		}
		: DEFAULT_CLIENT_PREFERENCES.lastComposerModel;

	return {
		preferences: {
			autoCheckForUpdates,
			minimizeToTrayOnClose,
			theme: themePreference,
			language: languagePreference,
			lastComposerModel
		},
		normalized: value.autoCheckForUpdates !== autoCheckForUpdates
			|| value.minimizeToTrayOnClose !== minimizeToTrayOnClose
			|| value.theme !== themePreference
			|| value.language !== languagePreference
			|| JSON.stringify(value.lastComposerModel ?? null) !== JSON.stringify(lastComposerModel)
			|| Object.keys(value).some((key: string): boolean => key !== "autoCheckForUpdates" && key !== "minimizeToTrayOnClose" && key !== "theme" && key !== "language" && key !== "lastComposerModel")
	};
}

export function normalizeClientPreferencesPatch(value: unknown): ClientPreferencesPatch {
	if (!isRecord(value)) {
		return {};
	}

	const patch: ClientPreferencesPatch = {};
	if (typeof value.autoCheckForUpdates === "boolean") {
		patch.autoCheckForUpdates = value.autoCheckForUpdates;
	}
	if (typeof value.minimizeToTrayOnClose === "boolean") {
		patch.minimizeToTrayOnClose = value.minimizeToTrayOnClose;
	}
	if (value.theme === "light" || value.theme === "dark" || value.theme === "system") {
		patch.theme = value.theme;
	}
	if (value.language === "en-US" || value.language === "zh-CN" || value.language === "system") {
		patch.language = value.language;
	}
	if (value.lastComposerModel === null) {
		patch.lastComposerModel = null;
	} else if (
		isRecord(value.lastComposerModel)
		&& typeof value.lastComposerModel.providerId === "string"
		&& value.lastComposerModel.providerId.trim().length > 0
		&& typeof value.lastComposerModel.modelId === "string"
		&& value.lastComposerModel.modelId.trim().length > 0
	) {
		patch.lastComposerModel = {
			providerId: value.lastComposerModel.providerId.trim(),
			modelId: value.lastComposerModel.modelId.trim()
		};
	}
	return patch;
}

export async function loadClientPreferencesFile(
	filePath: string,
	io: ClientPreferencesStoreIo = DEFAULT_IO
): Promise<{ preferences: ClientPreferences; normalized: boolean }> {
	try {
		const rawText: string = await io.readText(filePath);
		const parsed: unknown = JSON.parse(rawText) as unknown;
		return normalizeClientPreferences(parsed);
	} catch {
		return {
			preferences: { ...DEFAULT_CLIENT_PREFERENCES },
			normalized: true
		};
	}
}

export async function saveClientPreferencesFile(
	filePath: string,
	preferences: ClientPreferences,
	io: ClientPreferencesStoreIo = DEFAULT_IO
): Promise<void> {
	await io.ensureDirectory(dirname(filePath));
	await io.writeText(filePath, `${JSON.stringify(preferences, null, 2)}\n`);
}

export async function updateClientPreferencesFile(
	filePath: string,
	patch: ClientPreferencesPatch,
	io: ClientPreferencesStoreIo = DEFAULT_IO
): Promise<ClientPreferences> {
	const loaded = await loadClientPreferencesFile(filePath, io);
	const nextPreferences: ClientPreferences = {
		...loaded.preferences,
		...patch
	};
	await saveClientPreferencesFile(filePath, nextPreferences, io);
	return nextPreferences;
}

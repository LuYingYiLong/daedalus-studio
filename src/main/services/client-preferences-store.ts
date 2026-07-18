import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

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

	const minimizeToTrayOnClose: boolean = typeof value.minimizeToTrayOnClose === "boolean"
		? value.minimizeToTrayOnClose
		: DEFAULT_CLIENT_PREFERENCES.minimizeToTrayOnClose;
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
			minimizeToTrayOnClose,
			lastComposerModel
		},
		normalized: value.minimizeToTrayOnClose !== minimizeToTrayOnClose
			|| JSON.stringify(value.lastComposerModel ?? null) !== JSON.stringify(lastComposerModel)
			|| Object.keys(value).some((key: string): boolean => key !== "minimizeToTrayOnClose" && key !== "lastComposerModel")
	};
}

export function normalizeClientPreferencesPatch(value: unknown): ClientPreferencesPatch {
	if (!isRecord(value)) {
		return {};
	}

	const patch: ClientPreferencesPatch = {};
	if (typeof value.minimizeToTrayOnClose === "boolean") {
		patch.minimizeToTrayOnClose = value.minimizeToTrayOnClose;
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

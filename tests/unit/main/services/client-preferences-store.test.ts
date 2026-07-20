import { describe, expect, it } from "vitest";
import {
	DEFAULT_CLIENT_PREFERENCES,
	loadClientPreferencesFile,
	normalizeClientPreferences,
	updateClientPreferencesFile
} from "@main/services/client-preferences-store";

function createMemoryIo(initialText: string | null = null): {
	writes: string[];
	io: {
		readText(path: string): Promise<string>;
		writeText(path: string, text: string): Promise<void>;
		ensureDirectory(path: string): Promise<void>;
	};
} {
	let text: string | null = initialText;
	const writes: string[] = [];
	return {
		writes,
		io: {
			async readText(): Promise<string> {
				if (text === null) {
					throw new Error("missing");
				}
				return text;
			},
			async writeText(_path: string, nextText: string): Promise<void> {
				text = nextText;
				writes.push(nextText);
			},
			async ensureDirectory(): Promise<void> {}
		}
	};
}

describe("client preferences store", () => {
	it("returns defaults for missing or damaged files", async () => {
		await expect(loadClientPreferencesFile("prefs.json", createMemoryIo(null).io)).resolves.toEqual({
			preferences: DEFAULT_CLIENT_PREFERENCES,
			normalized: true
		});
		await expect(loadClientPreferencesFile("prefs.json", createMemoryIo("{").io)).resolves.toEqual({
			preferences: DEFAULT_CLIENT_PREFERENCES,
			normalized: true
		});
	});

	it("normalizes missing fields and strips unknown fields", () => {
		expect(normalizeClientPreferences({
			autoExpandTodoList: false,
			lastComposerModel: {
				providerId: "minimax",
				modelId: "MiniMax-M3"
			},
			extra: true
		})).toEqual({
			preferences: {
				minimizeToTrayOnClose: false,
				theme: "system",
				lastComposerModel: {
					providerId: "minimax",
					modelId: "MiniMax-M3"
				}
			},
			normalized: true
		});
	});

	it("updates only requested fields and persists normalized JSON", async () => {
		const memory = createMemoryIo(JSON.stringify({
			autoExpandTodoList: false,
			minimizeToTrayOnClose: false
		}));

		const nextPreferences = await updateClientPreferencesFile("prefs.json", {
			minimizeToTrayOnClose: true
		}, memory.io);

		expect(nextPreferences).toEqual({
			minimizeToTrayOnClose: true,
			theme: "system",
			lastComposerModel: null
		});
		expect(memory.writes.at(-1)).toBe(`${JSON.stringify(nextPreferences, null, 2)}\n`);
	});

	it("updates the hidden last composer model preference", async () => {
		const memory = createMemoryIo(JSON.stringify(DEFAULT_CLIENT_PREFERENCES));

		const nextPreferences = await updateClientPreferencesFile("prefs.json", {
			lastComposerModel: {
				providerId: "opencode_go",
				modelId: "minimax-m3"
			}
		}, memory.io);

		expect(nextPreferences.lastComposerModel).toEqual({
			providerId: "opencode_go",
			modelId: "minimax-m3"
		});
	});

	it("updates the theme preference", async () => {
		const memory = createMemoryIo(JSON.stringify(DEFAULT_CLIENT_PREFERENCES));

		const nextPreferences = await updateClientPreferencesFile("prefs.json", {
			theme: "dark"
		}, memory.io);

		expect(nextPreferences.theme).toBe("dark");
	});
});

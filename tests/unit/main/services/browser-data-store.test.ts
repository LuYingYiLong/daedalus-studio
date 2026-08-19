import { afterEach, describe, expect, it } from "vitest";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { BrowserDataStore } from "@main/services/browser/browser-data-store";

const temporaryDirectories: string[] = [];

async function createStore(initial?: unknown): Promise<BrowserDataStore> {
	const directory = await mkdtemp(join(tmpdir(), "daedalus-browser-store-"));
	temporaryDirectories.push(directory);
	const filePath = join(directory, "browser-data.json");
	if (initial !== undefined) await writeFile(filePath, JSON.stringify(initial), "utf8");
	return new BrowserDataStore(filePath);
}

afterEach(async (): Promise<void> => {
	await Promise.all(temporaryDirectories.splice(0).map(async (directory): Promise<void> => rm(directory, { recursive: true, force: true })));
});

describe("browser data store", () => {
	it("uses bounded defaults and persists browser settings", async () => {
		const store = await createStore();
		await expect(store.getSettings()).resolves.toMatchObject({
			downloadDirectory: null,
			askWhereToSave: false,
			savePasswordsEnabled: true,
			aiCdpEnabled: false,
			permissionRules: []
		});
		await expect(store.updateSettings({ aiCdpEnabled: true })).resolves.toMatchObject({ aiCdpEnabled: true });
		await expect(store.updateSettings({ askWhereToSave: true, downloadDirectory: "D:/Downloads" })).resolves.toMatchObject({
			askWhereToSave: true,
			downloadDirectory: "D:/Downloads"
		});
	});

	it("caps persisted history and download records", async () => {
		const history = Array.from({ length: 2100 }, (_, index) => ({ id: `history-${index}`, url: `https://example.com/${index}`, title: `Page ${index}`, visitedAt: new Date(index).toISOString() }));
		const downloads = Array.from({ length: 600 }, (_, index) => ({ id: `download-${index}`, url: `https://example.com/${index}.zip`, fileName: `${index}.zip`, savePath: `D:/Downloads/${index}.zip`, receivedBytes: 1, totalBytes: 1, state: "completed", startedAt: new Date(index).toISOString(), finishedAt: new Date(index).toISOString() }));
		const store = await createStore({ version: 1, settings: {}, permissions: [], history, downloads });

		await expect(store.listHistory()).resolves.toHaveLength(2000);
		await expect(store.listDownloads()).resolves.toHaveLength(500);
	});

	it("merges adjacent duplicate navigation and keeps permission rules unique", async () => {
		const store = await createStore();
		await store.addHistory({ id: "first", url: "https://example.com/", title: "Old", visitedAt: "2026-01-01T00:00:00.000Z" });
		await store.addHistory({ id: "second", url: "https://example.com/", title: "New", visitedAt: "2026-01-02T00:00:00.000Z" });
		await expect(store.listHistory()).resolves.toEqual([{ id: "second", url: "https://example.com/", title: "New", visitedAt: "2026-01-02T00:00:00.000Z" }]);

		await store.setPermission("https://example.com/path", "notifications", "allow");
		const permissions = await store.setPermission("https://example.com/other", "notifications", "block");
		expect(permissions).toHaveLength(1);
		expect(permissions[0]).toMatchObject({ origin: "https://example.com", permission: "notifications", decision: "block" });
	});

	it("clears only recent history and download records when a cutoff is provided", async () => {
		const store = await createStore();
		await store.addHistory({ id: "old", url: "https://example.com/old", title: "Old", visitedAt: "2026-01-01T00:00:00.000Z" });
		await store.addHistory({ id: "recent", url: "https://example.com/recent", title: "Recent", visitedAt: "2026-08-19T00:00:00.000Z" });
		for (const [id, startedAt] of [["old", "2026-01-01T00:00:00.000Z"], ["recent", "2026-08-19T00:00:00.000Z"]] as const) {
			await store.upsertDownload({ id, url: `https://example.com/${id}.zip`, fileName: `${id}.zip`, savePath: `D:/Downloads/${id}.zip`, receivedBytes: 1, totalBytes: 1, state: "completed", startedAt, finishedAt: startedAt });
		}

		const cutoff: number = Date.parse("2026-08-01T00:00:00.000Z");
		await store.clearHistory(cutoff);
		await store.clearDownloads(cutoff);

		await expect(store.listHistory()).resolves.toEqual([expect.objectContaining({ id: "old" })]);
		await expect(store.listDownloads()).resolves.toEqual([expect.objectContaining({ id: "old" })]);
	});
});

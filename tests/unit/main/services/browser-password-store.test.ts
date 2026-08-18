import { afterEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

const encryption = vi.hoisted(() => ({ available: true }));

vi.mock("electron", (): object => ({
	safeStorage: {
		isEncryptionAvailable: (): boolean => encryption.available,
		getSelectedStorageBackend: (): string => "kwallet",
		encryptString: (value: string): Buffer => Buffer.from(`protected:${value}`, "utf8"),
		decryptString: (value: Buffer): string => value.toString("utf8").replace(/^protected:/u, "")
	}
}));

import { BrowserPasswordStore } from "@main/services/browser/browser-password-store";

const temporaryDirectories: string[] = [];

afterEach(async (): Promise<void> => {
	vi.useRealTimers();
	encryption.available = true;
	await Promise.all(temporaryDirectories.splice(0).map(async (directory): Promise<void> => rm(directory, { recursive: true, force: true })));
});

describe("browser password store", () => {
	it("stores only encrypted password bytes and can reveal them explicitly", async () => {
		const directory = await mkdtemp(join(tmpdir(), "daedalus-browser-passwords-"));
		temporaryDirectories.push(directory);
		const filePath = join(directory, "passwords.json");
		const store = new BrowserPasswordStore(filePath);
		const saved = await store.save("https://example.com/login", "alice", "plain-secret");

		expect(saved).toMatchObject({ origin: "https://example.com", username: "alice" });
		expect(await store.reveal(saved.id)).toBe("plain-secret");
		expect(await readFile(filePath, "utf8")).not.toContain("plain-secret");
	});

	it("refuses password persistence when secure storage is unavailable", async () => {
		const directory = await mkdtemp(join(tmpdir(), "daedalus-browser-passwords-"));
		temporaryDirectories.push(directory);
		encryption.available = false;
		const store = new BrowserPasswordStore(join(directory, "passwords.json"));
		await expect(store.save("https://example.com", "alice", "secret")).rejects.toThrow("browser_password_encryption_unavailable");
	});

	it("keeps credentials older than a bounded clear-data cutoff", async () => {
		vi.useFakeTimers();
		const directory = await mkdtemp(join(tmpdir(), "daedalus-browser-passwords-"));
		temporaryDirectories.push(directory);
		const store = new BrowserPasswordStore(join(directory, "passwords.json"));
		vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"));
		await store.save("https://old.example.com", "old", "old-secret");
		vi.setSystemTime(new Date("2026-08-19T00:00:00.000Z"));
		await store.save("https://recent.example.com", "recent", "recent-secret");

		await store.clear(Date.parse("2026-08-01T00:00:00.000Z"));

		await expect(store.list()).resolves.toEqual([expect.objectContaining({ username: "old" })]);
	});
});

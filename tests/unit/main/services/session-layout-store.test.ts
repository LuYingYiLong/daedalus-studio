import { afterEach, describe, expect, it } from "vitest";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
	BOTTOM_DOCK_MAX_SIZE,
	SIDE_DOCK_MIN_SIZE,
	SessionLayoutStore,
	createDefaultSessionLayout,
	normalizeSessionLayout
} from "@main/services/session-layout-store";

const temporaryDirectories: string[] = [];

async function createStore(initialValue?: unknown): Promise<{
	filePath: string;
	store: SessionLayoutStore;
}> {
	const directory: string = await mkdtemp(join(tmpdir(), "daedalus-session-layout-"));
	temporaryDirectories.push(directory);
	const filePath: string = join(directory, "session-layouts.json");
	if (initialValue !== undefined) {
		const text: string = typeof initialValue === "string"
			? initialValue
			: JSON.stringify(initialValue);
		await writeFile(filePath, text, "utf8");
	}
	return {
		filePath,
		store: new SessionLayoutStore(filePath)
	};
}

afterEach(async (): Promise<void> => {
	await Promise.all(
		temporaryDirectories.splice(0).map(
			async (directory: string): Promise<void> => rm(directory, { recursive: true, force: true })
		)
	);
});

describe("session layout store", () => {
	it("returns an empty map for missing and damaged repositories", async () => {
		await expect((await createStore()).store.getAll()).resolves.toEqual({});
		await expect((await createStore("{")).store.getAll()).resolves.toEqual({});
	});

	it("normalizes sizes, duplicate keys and invalid active tabs", () => {
		const defaults = createDefaultSessionLayout();
		const normalized = normalizeSessionLayout({
			side: {
				open: true,
				size: 20,
				tabs: [
					{ key: "side:review:1", kind: "review", index: 1 },
					{ key: "side:review:1", kind: "review", index: 2 }
				],
				activeTabKey: "missing"
			},
			bottom: {
				open: true,
				size: 999,
				tabs: [],
				activeTabKey: "missing"
			}
		});

		expect(normalized.side.size).toBe(SIDE_DOCK_MIN_SIZE);
		expect(normalized.side.tabs).toHaveLength(1);
		expect(normalized.side.activeTabKey).toBe("side:review:1");
		expect(normalized.bottom.size).toBe(BOTTOM_DOCK_MAX_SIZE);
		expect(normalized.bottom.activeTabKey).toBeNull();
		expect(normalized.fullscreenDock).toBeNull();
		expect(defaults.side.open).toBe(false);
	});

	it("persists a valid fullscreen dock placement", () => {
		const normalized = normalizeSessionLayout({
			...createDefaultSessionLayout(),
			fullscreenDock: "side"
		});

		expect(normalized.fullscreenDock).toBe("side");
	});

	it("falls back to the fixed default when an unknown tab kind is present", () => {
		expect(normalizeSessionLayout({
			side: {
				open: true,
				size: 400,
				tabs: [{ key: "side:unknown:1", kind: "unknown", index: 1 }],
				activeTabKey: "side:unknown:1"
			},
			bottom: createDefaultSessionLayout().bottom
		})).toEqual(createDefaultSessionLayout());
	});

	it("rejects invalid session ids", async () => {
		const { store } = await createStore();
		await expect(store.save("../session-bad", createDefaultSessionLayout())).rejects.toThrow("Invalid session id");
		await expect(store.remove(["bad"])).rejects.toThrow("Invalid session ids");
	});

	it("serializes saves and lets the last save replace the previous layout", async () => {
		const { filePath, store } = await createStore();
		const first = createDefaultSessionLayout();
		first.side.open = true;
		const second = createDefaultSessionLayout();
		second.bottom.open = true;
		second.bottom.size = 420;

		await Promise.all([
			store.save("session-layout-test", first),
			store.save("session-layout-test", second)
		]);

		await expect(store.getAll()).resolves.toEqual({
			"session-layout-test": second
		});
		const diskValue = JSON.parse(await readFile(filePath, "utf8")) as {
			version: number;
			sessions: Record<string, unknown>;
		};
		expect(diskValue.version).toBe(1);
		expect(diskValue.sessions["session-layout-test"]).toEqual(second);
	});

	it("removes multiple layouts without affecting other sessions", async () => {
		const { store } = await createStore();
		const layout = createDefaultSessionLayout();
		await store.save("session-one", layout);
		await store.save("session-two", layout);
		await store.save("session-three", layout);

		await expect(store.remove(["session-one", "session-three", "session-three"])).resolves.toEqual({
			removed: 2
		});
		await expect(store.getAll()).resolves.toEqual({
			"session-two": layout
		});
	});
});

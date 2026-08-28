import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";

type Manifest = {
	files: Record<string, { sha256: string }>;
};

type SyncUtilities = {
	diffManifests(
		manifest: Manifest,
		previous: Manifest | null,
	): { changedPaths: string[]; removedPaths: string[] };
	isSafeRelativePath(value: unknown): boolean;
	isSuccessfulBuildLine(value: string): boolean;
	parseArguments(values: string[]): {
		watch: boolean;
		clear: boolean;
		restart: boolean;
		serial: string;
	};
};

const require = createRequire(import.meta.url);
const utilities = require("../../../scripts/sync-android-remote.cjs") as SyncUtilities;

describe("Android Remote ADB sync", () => {
	it("transfers changed files and removes stale hashed assets", () => {
		const current: Manifest = {
			files: {
				"connect.html": { sha256: "a".repeat(64) },
				"assets/remote-new.js": { sha256: "b".repeat(64) },
			},
		};
		const previous: Manifest = {
			files: {
				"connect.html": { sha256: "a".repeat(64) },
				"assets/remote-old.js": { sha256: "c".repeat(64) },
			},
		};

		expect(utilities.diffManifests(current, previous)).toEqual({
			changedPaths: ["assets/remote-new.js"],
			removedPaths: ["assets/remote-old.js"],
		});
	});

	it("rejects paths that could escape the generated asset root", () => {
		expect(utilities.isSafeRelativePath("assets/remote.js")).toBe(true);
		expect(utilities.isSafeRelativePath("../shared-secret.json")).toBe(false);
		expect(utilities.isSafeRelativePath("assets\\remote.js")).toBe(false);
		expect(utilities.isSafeRelativePath("/absolute.js")).toBe(false);
	});

	it("keeps watch and clear modes mutually exclusive", () => {
		expect(() => utilities.parseArguments(["--watch", "--clear"]))
			.toThrow("--watch and --clear cannot be combined");
		expect(utilities.parseArguments(["--watch", "--no-restart", "--serial", "device-1"]))
			.toMatchObject({ watch: true, clear: false, restart: false, serial: "device-1" });
	});

	it("recognizes both interactive and plain Vite watch success messages", () => {
		expect(utilities.isSuccessfulBuildLine("✓ built in 17.61s")).toBe(true);
		expect(utilities.isSuccessfulBuildLine("built in 17612ms.")).toBe(true);
		expect(utilities.isSuccessfulBuildLine("✔ built in 842 ms")).toBe(true);
		expect(utilities.isSuccessfulBuildLine("Some chunks are larger than 500 kB"))
			.toBe(false);
	});
});

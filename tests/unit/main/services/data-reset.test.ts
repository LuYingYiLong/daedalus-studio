import { access, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { resetDaedalusData } from "@main/services/data-reset";

let profileDir: string | null = null;

async function pathExists(filePath: string): Promise<boolean> {
	try {
		await access(filePath);
		return true;
	} catch {
		return false;
	}
}

afterEach(async () => {
	if (profileDir !== null) {
		await rm(profileDir, { force: true, recursive: true });
		profileDir = null;
	}
});

describe("Daedalus data reset", () => {
	it("clears Studio and backend data while preserving the managed backend versions", async () => {
		profileDir = await mkdtemp(join(tmpdir(), "daedalus-studio-reset-"));
		const daedalusRoot: string = join(profileDir, ".daedalus");
		const studioDataRoot: string = join(profileDir, "studio-user-data");
		const preservedVersionFile: string = join(daedalusRoot, "backend", "versions", "1.1.0", "daedalus-backend.exe");
		await mkdir(join(daedalusRoot, "backend", "versions", "1.1.0"), { recursive: true });
		await mkdir(join(daedalusRoot, "config"), { recursive: true });
		await mkdir(join(daedalusRoot, "sessions"), { recursive: true });
		await mkdir(studioDataRoot, { recursive: true });
		await writeFile(preservedVersionFile, "backend", "utf8");
		await writeFile(join(daedalusRoot, "config", "provider.json"), "secret-free config", "utf8");
		await writeFile(join(daedalusRoot, "sessions.sqlite"), "session data", "utf8");
		await writeFile(join(studioDataRoot, "client-preferences.json"), "broken preferences", "utf8");

		await resetDaedalusData({ daedalusRoot, userProfile: profileDir, studioDataRoot });

		expect(await pathExists(preservedVersionFile)).toBe(true);
		expect(await readFile(preservedVersionFile, "utf8")).toBe("backend");
		expect(await pathExists(join(daedalusRoot, "config"))).toBe(false);
		expect(await pathExists(join(daedalusRoot, "sessions.sqlite"))).toBe(false);
		expect(await pathExists(join(studioDataRoot, "client-preferences.json"))).toBe(false);
	});

	it("rejects a data root that is not the current user's .daedalus directory", async () => {
		profileDir = await mkdtemp(join(tmpdir(), "daedalus-studio-reset-"));
		await expect(resetDaedalusData({
			daedalusRoot: join(profileDir, "other-data"),
			userProfile: profileDir,
			studioDataRoot: join(profileDir, "studio-user-data")
		})).rejects.toThrow(/unrecognized Daedalus data directory/u);
	});
});

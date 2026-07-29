import { access, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
	activateBackendCandidate,
	assertBackendSelfTestResponse,
	commitBackendCandidate,
	getBackendPendingUpdatePath,
	getManagedBackendCurrentPath,
	getManagedBackendVersionsDir,
	readCurrentBackendFile,
	readPendingBackendUpdate,
	rollbackBackendCandidate,
	type InstalledBackendBinary
} from "@main/services/backend-binary-store";

let profileDir: string;
let previousUserProfile: string | undefined;

async function pathExists(filePath: string): Promise<boolean> {
	try {
		await access(filePath);
		return true;
	} catch {
		return false;
	}
}

async function createInstalledBackend(version: string): Promise<InstalledBackendBinary> {
	const versionDir: string = join(getManagedBackendVersionsDir(), version);
	const executablePath: string = join(versionDir, "daedalus-backend.exe");
	const manifestPath: string = join(versionDir, "backend-manifest.json");
	await mkdir(versionDir, { recursive: true });
	await writeFile(executablePath, `fake backend ${version}`, "utf8");
	await writeFile(manifestPath, JSON.stringify({ version }), "utf8");
	return {
		version,
		versionDir,
		executablePath,
		manifestPath,
		manifest: {
			schemaVersion: 1,
			version,
			buildId: `${version}-test`,
			platform: "win32",
			arch: "x64",
			nodeVersion: "24.18.0",
			protocolVersion: 3,
			minPluginProtocolVersion: 3,
			maxPluginProtocolVersion: 3,
			minStudioVersion: "1.0.1",
			publishedAt: "2026-07-24T12:00:00.000Z",
			authenticode: "unsigned",
			executable: {
				fileName: "daedalus-backend.exe",
				size: 1,
				sha256: "a".repeat(64)
			}
		}
	};
}

beforeEach(async () => {
	previousUserProfile = process.env.USERPROFILE;
	profileDir = await mkdtemp(join(tmpdir(), "daedalus-studio-backend-store-"));
	process.env.USERPROFILE = profileDir;
});

afterEach(async () => {
	if (previousUserProfile === undefined) {
		delete process.env.USERPROFILE;
	} else {
		process.env.USERPROFILE = previousUserProfile;
	}
	await rm(profileDir, { recursive: true, force: true });
});

describe("backend binary update transactions", () => {
	it("validates the nested structured self-test identity and required checks", async () => {
		const installed = await createInstalledBackend("1.1.2");
		const validResponse = {
			ok: true,
			build: {
				version: installed.version,
				buildId: installed.manifest.buildId,
				buildNodeVersion: installed.manifest.nodeVersion,
				runtimeNodeVersion: installed.manifest.nodeVersion,
				distribution: "sea",
				platform: installed.manifest.platform,
				arch: installed.manifest.arch,
				protocolVersion: installed.manifest.protocolVersion
			},
			checks: [
				{ name: "runtime-assets", ok: true },
				{ name: "sqlite", ok: true },
				{ name: "secret-store", ok: true }
			]
		};

		expect(() => assertBackendSelfTestResponse(validResponse, installed)).not.toThrow();
		expect(() => assertBackendSelfTestResponse({
			...validResponse,
			build: { ...validResponse.build, buildId: "unexpected-build" }
		}, installed)).toThrow(/invalid self-test result/u);
		expect(() => assertBackendSelfTestResponse({
			...validResponse,
			checks: validResponse.checks.slice(0, 2)
		}, installed)).toThrow(/invalid self-test result/u);
	});

	it("writes a canonical v2 current marker only after pending transaction creation", async () => {
		const installed = await createInstalledBackend("1.1.2");
		await activateBackendCandidate(installed);

		expect(await readPendingBackendUpdate()).toMatchObject({
			candidate: { version: "1.1.2" },
			previous: null
		});
		expect(await readCurrentBackendFile()).toMatchObject({
			schemaVersion: 2,
			distribution: "binary",
			version: "1.1.2",
			protocolVersion: 3
		});

		await commitBackendCandidate("1.1.2");
		expect(await pathExists(getBackendPendingUpdatePath())).toBe(false);
		const persisted = JSON.parse(await readFile(getManagedBackendCurrentPath(), "utf8")) as Record<string, unknown>;
		expect(persisted.previousVersion).toBeUndefined();
	});

	it("rolls back the marker and candidate directory after failed activation", async () => {
		const previous = await createInstalledBackend("1.1.1");
		await activateBackendCandidate(previous);
		await commitBackendCandidate(previous.version);
		const candidate = await createInstalledBackend("1.1.2");
		await activateBackendCandidate(candidate);

		await expect(rollbackBackendCandidate()).resolves.toMatchObject({ version: "1.1.1" });
		expect(await readCurrentBackendFile()).toMatchObject({ version: "1.1.1" });
		expect(await pathExists(candidate.versionDir)).toBe(false);
		expect(await pathExists(previous.versionDir)).toBe(true);
	});

	it("deletes the previous binary only after the candidate is committed", async () => {
		const previous = await createInstalledBackend("1.1.1");
		await activateBackendCandidate(previous);
		await commitBackendCandidate(previous.version);
		const candidate = await createInstalledBackend("1.1.2");
		await activateBackendCandidate(candidate);

		expect(await pathExists(previous.versionDir)).toBe(true);
		await commitBackendCandidate(candidate.version);
		expect(await pathExists(previous.versionDir)).toBe(false);
		expect(await pathExists(candidate.versionDir)).toBe(true);
		expect(await readCurrentBackendFile()).toMatchObject({ version: "1.1.2" });
	});
});

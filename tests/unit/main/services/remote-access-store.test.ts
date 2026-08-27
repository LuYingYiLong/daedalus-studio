import { afterEach, describe, expect, it } from "vitest";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { RemoteAccessStore } from "@main/services/remote-access-store";

const directories: string[] = [];

async function createStore(): Promise<{ directory: string; configPath: string; secretsPath: string; store: RemoteAccessStore }> {
	const directory: string = await mkdtemp(join(tmpdir(), "daedalus-remote-store-"));
	directories.push(directory);
	const configPath: string = join(directory, "remote-access.json");
	const secretsPath: string = join(directory, "remote-access-secrets.json");
	return { directory, configPath, secretsPath, store: new RemoteAccessStore(configPath, secretsPath) };
}

afterEach(async (): Promise<void> => {
	await Promise.all(directories.splice(0).map(async (directory: string): Promise<void> => rm(directory, { recursive: true, force: true })));
});

describe("remote access store", () => {
	it("defaults to disabled with fixed ports", async () => {
		const { store } = await createStore();
		await expect(store.loadConfig()).resolves.toEqual({ schemaVersion: 1, enabled: false, httpsPort: 38190, bootstrapPort: 38191, devices: [] });
	});

	it("normalizes devices and never requires a plaintext token", async () => {
		const { configPath, store } = await createStore();
		await writeFile(configPath, JSON.stringify({
			schemaVersion: 1,
			enabled: true,
			httpsPort: 38190,
			bootstrapPort: 38191,
			devices: [{ id: "device-a", name: "Pixel", origin: "https://192.168.1.2:38190", tokenHash: "a".repeat(64), createdAt: "2026-08-27T00:00:00.000Z" }],
		}), "utf8");
		const config = await store.loadConfig();
		expect(config.devices[0]).toMatchObject({ name: "Pixel", origin: "https://192.168.1.2:38190", tokenHash: "a".repeat(64) });
		expect(await readFile(configPath, "utf8")).not.toContain("deviceToken");
	});

	it("can erase encrypted identity material during rotation", async () => {
		const { secretsPath, store } = await createStore();
		await store.saveSecrets({ schemaVersion: 1, caCertificatePem: "ca", encryptedCaPrivateKey: "encrypted-ca", serverCertificatePem: "server", encryptedServerPrivateKey: "encrypted-server", serverAddresses: ["192.168.1.2"], certificateFingerprint: "fingerprint", certificateExpiresAt: "2027-01-01T00:00:00.000Z" });
		await store.clearSecrets();
		await expect(readFile(secretsPath, "utf8")).rejects.toMatchObject({ code: "ENOENT" });
	});
});

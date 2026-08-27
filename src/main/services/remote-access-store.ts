import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

export type PersistedRemoteDevice = {
	id: string;
	name: string;
	origin: string;
	tokenHash: string;
	createdAt: string;
	lastSeenAt: string | null;
};

export type RemoteAccessConfig = {
	schemaVersion: 1;
	enabled: boolean;
	httpsPort: number;
	bootstrapPort: number;
	devices: PersistedRemoteDevice[];
};

export type RemoteAccessSecrets = {
	schemaVersion: 1;
	caCertificatePem: string;
	encryptedCaPrivateKey: string;
	serverCertificatePem: string;
	encryptedServerPrivateKey: string;
	serverAddresses: string[];
	certificateFingerprint: string;
	certificateExpiresAt: string;
};

export const DEFAULT_REMOTE_ACCESS_CONFIG: RemoteAccessConfig = {
	schemaVersion: 1,
	enabled: false,
	httpsPort: 38190,
	bootstrapPort: 38191,
	devices: [],
};

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizePort(value: unknown, fallback: number): number {
	return typeof value === "number"
		&& Number.isSafeInteger(value)
		&& value >= 1024
		&& value <= 65535
		? value
		: fallback;
}

function normalizeDevices(value: unknown): PersistedRemoteDevice[] {
	if (!Array.isArray(value)) return [];
	const devices: PersistedRemoteDevice[] = [];
	for (const item of value.slice(0, 10)) {
		if (!isRecord(item)
			|| typeof item.id !== "string"
			|| typeof item.name !== "string"
			|| typeof item.tokenHash !== "string"
			|| typeof item.createdAt !== "string") {
			continue;
		}
		devices.push({
			id: item.id.slice(0, 160),
			name: item.name.trim().slice(0, 80) || "Remote device",
			origin: typeof item.origin === "string" ? item.origin : "",
			tokenHash: item.tokenHash,
			createdAt: item.createdAt,
			lastSeenAt: typeof item.lastSeenAt === "string" ? item.lastSeenAt : null,
		});
	}
	return devices;
}

function normalizeConfig(value: unknown): RemoteAccessConfig {
	if (!isRecord(value) || value.schemaVersion !== 1) {
		return { ...DEFAULT_REMOTE_ACCESS_CONFIG, devices: [] };
	}
	const httpsPort: number = normalizePort(
		value.httpsPort,
		DEFAULT_REMOTE_ACCESS_CONFIG.httpsPort,
	);
	let bootstrapPort: number = normalizePort(
		value.bootstrapPort,
		DEFAULT_REMOTE_ACCESS_CONFIG.bootstrapPort,
	);
	if (bootstrapPort === httpsPort) {
		bootstrapPort = httpsPort === 65535 ? httpsPort - 1 : httpsPort + 1;
	}
	return {
		schemaVersion: 1,
		enabled: value.enabled === true,
		httpsPort,
		bootstrapPort,
		devices: normalizeDevices(value.devices),
	};
}

function normalizeSecrets(value: unknown): RemoteAccessSecrets | null {
	if (!isRecord(value)
		|| value.schemaVersion !== 1
		|| typeof value.caCertificatePem !== "string"
		|| typeof value.encryptedCaPrivateKey !== "string"
		|| typeof value.serverCertificatePem !== "string"
		|| typeof value.encryptedServerPrivateKey !== "string"
		|| !Array.isArray(value.serverAddresses)
		|| !value.serverAddresses.every((address: unknown): address is string => typeof address === "string")
		|| typeof value.certificateFingerprint !== "string"
		|| typeof value.certificateExpiresAt !== "string") {
		return null;
	}
	return {
		schemaVersion: 1,
		caCertificatePem: value.caCertificatePem,
		encryptedCaPrivateKey: value.encryptedCaPrivateKey,
		serverCertificatePem: value.serverCertificatePem,
		encryptedServerPrivateKey: value.encryptedServerPrivateKey,
		serverAddresses: [...value.serverAddresses].sort(),
		certificateFingerprint: value.certificateFingerprint,
		certificateExpiresAt: value.certificateExpiresAt,
	};
}

async function readJson(path: string): Promise<unknown> {
	try {
		return JSON.parse(await readFile(path, "utf8")) as unknown;
	} catch (error: unknown) {
		if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
		throw error;
	}
}

async function writeJson(path: string, value: unknown): Promise<void> {
	await mkdir(dirname(path), { recursive: true });
	await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

export class RemoteAccessStore {
	public constructor(
		private readonly configPath: string,
		private readonly secretsPath: string,
	) {}

	public async loadConfig(): Promise<RemoteAccessConfig> {
		return normalizeConfig(await readJson(this.configPath));
	}

	public async saveConfig(config: RemoteAccessConfig): Promise<void> {
		await writeJson(this.configPath, config);
	}

	public async loadSecrets(): Promise<RemoteAccessSecrets | null> {
		return normalizeSecrets(await readJson(this.secretsPath));
	}

	public async saveSecrets(secrets: RemoteAccessSecrets): Promise<void> {
		await writeJson(this.secretsPath, secrets);
	}

	public async clearSecrets(): Promise<void> {
		await rm(this.secretsPath, { force: true });
	}
}

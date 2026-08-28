import { app, BrowserWindow, ipcMain, safeStorage } from "electron";
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { networkInterfaces, type NetworkInterfaceInfo } from "node:os";
import { join } from "node:path";
import type {
	RemoteAccessDevice,
	RemoteAccessPairingSession,
	RemoteAccessPortPatch,
	RemoteAccessState,
} from "../../contracts/remote-access";
import { backendManager } from "./backend-manager";
import {
	createRemoteCertificateBundle,
	shouldRenewRemoteServerCertificate,
	type RemoteCertificateAuthority,
	type RemoteCertificateBundle,
} from "./remote-certificate";
import {
	DEFAULT_REMOTE_ACCESS_CONFIG,
	RemoteAccessStore,
	type PersistedRemoteDevice,
	type RemoteAccessConfig,
	type RemoteAccessSecrets,
} from "./remote-access-store";
import {
	RemoteGateway,
	isPrivateIpv4,
	type RemoteGatewayDevice,
	type RemoteGatewayPairResult,
} from "./remote-gateway";
import { createLogger } from "./logger";

const logger = createLogger("remote-access");
const PAIRING_LIFETIME_MS: number = 5 * 60 * 1000;
const DEVICE_LAST_SEEN_WRITE_INTERVAL_MS: number = 60_000;

type PendingPairing = {
	codeHash: Buffer;
	expiresAt: number;
};

function hashToken(value: string): string {
	return createHash("sha256").update(value, "utf8").digest("hex");
}

function collectPrivateIpv4Addresses(): string[] {
	const addresses: string[] = [];
	for (const entries of Object.values(networkInterfaces())) {
		for (const entry of entries ?? []) {
			const candidate: NetworkInterfaceInfo = entry;
			if (candidate.family === "IPv4"
				&& !candidate.internal
				&& isPrivateIpv4(candidate.address)) {
				addresses.push(candidate.address);
			}
		}
	}
	return [...new Set(addresses)].sort();
}

function normalizePortPatch(value: unknown): RemoteAccessPortPatch {
	if (typeof value !== "object" || value === null || Array.isArray(value)) {
		throw new Error("remote_access_ports_invalid");
	}
	const record = value as Record<string, unknown>;
	const httpsPort: number = Number(record.httpsPort);
	const bootstrapPort: number = Number(record.bootstrapPort);
	if (!Number.isSafeInteger(httpsPort)
		|| !Number.isSafeInteger(bootstrapPort)
		|| httpsPort < 1024
		|| httpsPort > 65535
		|| bootstrapPort < 1024
		|| bootstrapPort > 65535
		|| httpsPort === bootstrapPort) {
		throw new Error("remote_access_ports_invalid");
	}
	return { httpsPort, bootstrapPort };
}

function toPublicDevice(device: PersistedRemoteDevice): RemoteAccessDevice {
	return {
		id: device.id,
		name: device.name,
		createdAt: device.createdAt,
		lastSeenAt: device.lastSeenAt,
	};
}

class RemoteAccessService {
	private store: RemoteAccessStore | null = null;
	private config: RemoteAccessConfig = { ...DEFAULT_REMOTE_ACCESS_CONFIG, devices: [] };
	private secrets: RemoteAccessSecrets | null = null;
	private gateway: RemoteGateway | null = null;
	private pendingPairing: PendingPairing | null = null;
	private status: RemoteAccessState["status"] = "disabled";
	private addresses: string[] = [];
	private error: string | null = null;
	private updateTail: Promise<void> = Promise.resolve();
	private loaded: boolean = false;
	private readonly lastSeenWrites: Map<string, number> = new Map();

	public registerIpc(): void {
		ipcMain.handle("remote-access:get-state", async (): Promise<RemoteAccessState> => {
			await this.load();
			return this.getState();
		});
		ipcMain.handle("remote-access:set-enabled", async (_event, enabled: unknown): Promise<RemoteAccessState> => {
			if (typeof enabled !== "boolean") throw new Error("remote_access_enabled_invalid");
			await this.setEnabled(enabled);
			return this.getState();
		});
		ipcMain.handle("remote-access:update-ports", async (_event, patch: unknown): Promise<RemoteAccessState> => {
			await this.updatePorts(normalizePortPatch(patch));
			return this.getState();
		});
		ipcMain.handle("remote-access:begin-pairing", async (): Promise<RemoteAccessPairingSession> => {
			return await this.beginPairing();
		});
		ipcMain.handle("remote-access:revoke-device", async (_event, deviceId: unknown): Promise<RemoteAccessState> => {
			if (typeof deviceId !== "string" || deviceId.length === 0) throw new Error("remote_device_id_invalid");
			await this.revokeDevice(deviceId);
			return this.getState();
		});
		ipcMain.handle("remote-access:revoke-all", async (_event, rotateIdentity: unknown): Promise<RemoteAccessState> => {
			await this.revokeAll(rotateIdentity === true);
			return this.getState();
		});
	}

	public async start(): Promise<void> {
		await this.load();
		if (this.config.enabled) await this.startGateway();
	}

	public async stop(): Promise<void> {
		this.pendingPairing = null;
		await this.gateway?.stop();
		this.gateway = null;
		this.status = this.config.enabled ? "error" : "disabled";
		this.addresses = [];
		this.broadcast();
	}

	public getState(): RemoteAccessState {
		return {
			schemaVersion: 1,
			enabled: this.config.enabled,
			status: this.status,
			httpsPort: this.config.httpsPort,
			bootstrapPort: this.config.bootstrapPort,
			addresses: [...this.addresses],
			certificateFingerprint: this.secrets?.certificateFingerprint ?? null,
			certificateExpiresAt: this.secrets?.certificateExpiresAt ?? null,
			devices: this.config.devices.map(toPublicDevice),
			error: this.error,
		};
	}

	private async load(): Promise<void> {
		if (this.loaded) return;
		const userData: string = app.getPath("userData");
		this.store = new RemoteAccessStore(
			join(userData, "remote-access.json"),
			join(userData, "remote-access-secrets.json"),
		);
		this.config = await this.store.loadConfig();
		this.secrets = await this.store.loadSecrets();
		this.status = this.config.enabled ? "starting" : "disabled";
		this.loaded = true;
	}

	private async setEnabled(enabled: boolean): Promise<void> {
		await this.load();
		if (this.config.enabled === enabled
			&& ((enabled && this.gateway !== null) || (!enabled && this.gateway === null))) return;
		this.config = { ...this.config, enabled };
		await this.persistConfig();
		if (!enabled) {
			this.pendingPairing = null;
			await this.gateway?.stop();
			this.gateway = null;
			this.addresses = [];
			this.status = "disabled";
			this.error = null;
			this.broadcast();
			return;
		}
		await this.startGateway();
	}

	private async updatePorts(patch: RemoteAccessPortPatch): Promise<void> {
		await this.load();
		const changed: boolean = patch.httpsPort !== this.config.httpsPort
			|| patch.bootstrapPort !== this.config.bootstrapPort;
		if (!changed) return;
		this.config = { ...this.config, ...patch };
		await this.persistConfig();
		if (this.gateway !== null) {
			await this.gateway.stop();
			this.gateway = null;
			await this.startGateway();
		}
	}

	private async startGateway(forceCertificateRotation: boolean = false): Promise<void> {
		this.status = "starting";
		this.error = null;
		this.broadcast();
		try {
			if (!safeStorage.isEncryptionAvailable()) {
				throw new Error("remote_access_secure_storage_unavailable");
			}
			const addresses: string[] = collectPrivateIpv4Addresses();
			if (addresses.length === 0) throw new Error("remote_access_private_network_unavailable");
			const bundle: RemoteCertificateBundle = await this.ensureCertificates(
				addresses,
				forceCertificateRotation,
			);
			const gateway = new RemoteGateway({
				addresses,
				httpsPort: this.config.httpsPort,
				bootstrapPort: this.config.bootstrapPort,
				serverCertificatePem: `${bundle.server.certificatePem}\n${bundle.ca.certificatePem}`,
				serverPrivateKeyPem: bundle.server.privateKeyPem,
				caCertificatePem: bundle.ca.certificatePem,
				certificateFingerprint: bundle.fingerprint,
				studioVersion: app.getVersion(),
				assetsDirectory: join(__dirname, "../renderer"),
				getBackendConnectionInfo: async () => await backendManager.getReadyConnectionInfo(),
				authenticate: async (credential: string, origin: string) => await this.authenticate(credential, origin),
				pair: async (code: string, deviceName: string, origin: string) => await this.consumePairing(code, deviceName, origin),
				onDeviceSeen: (deviceId: string): void => this.markDeviceSeen(deviceId),
			});
			await gateway.start();
			this.gateway = gateway;
			this.addresses = addresses;
			this.status = "running";
			this.error = null;
			logger.info("started", { addresses, port: this.config.httpsPort });
		} catch (error: unknown) {
			this.gateway = null;
			this.addresses = [];
			this.status = "error";
			this.error = error instanceof Error ? error.message : String(error);
			logger.error(
				"start_failed",
				error instanceof Error ? error : new Error(String(error)),
			);
		}
		this.broadcast();
	}

	private async beginPairing(): Promise<RemoteAccessPairingSession> {
		await this.load();
		if (this.gateway === null || this.status !== "running" || this.secrets === null) {
			throw new Error("remote_access_not_running");
		}
		if (this.config.devices.length >= 10) throw new Error("remote_device_limit_reached");
		const code: string = randomBytes(32).toString("base64url");
		const expiresAt: number = Date.now() + PAIRING_LIFETIME_MS;
		this.pendingPairing = {
			codeHash: Buffer.from(hashToken(code), "hex"),
			expiresAt,
		};
		await this.gateway.beginBootstrap(expiresAt);
		const installUrlFor = (address: string): string => (
			`http://${address}:${this.config.bootstrapPort}/install`
		);
		return {
			expiresAt: new Date(expiresAt).toISOString(),
			installUrls: this.addresses.map(installUrlFor),
			pairingUrls: this.addresses.map((address: string): string => (
				`https://${address}:${this.config.httpsPort}/remote.html`
				+ `#pair=${encodeURIComponent(code)}`
				+ `&install=${encodeURIComponent(installUrlFor(address))}`
				+ `&fingerprint=${encodeURIComponent(this.secrets!.certificateFingerprint)}`
				+ "&protocol=3&ui=1"
			)),
			certificateFingerprint: this.secrets.certificateFingerprint,
		};
	}

	private async consumePairing(code: string, deviceName: string, origin: string): Promise<RemoteGatewayPairResult | null> {
		const pairing: PendingPairing | null = this.pendingPairing;
		if (pairing === null || pairing.expiresAt < Date.now()) {
			this.pendingPairing = null;
			return null;
		}
		const candidateHash: Buffer = Buffer.from(hashToken(code), "hex");
		if (candidateHash.length !== pairing.codeHash.length
			|| !timingSafeEqual(candidateHash, pairing.codeHash)) return null;
		this.pendingPairing = null;
		if (this.config.devices.length >= 10) return null;
		const token: string = randomBytes(32).toString("base64url");
		const device: PersistedRemoteDevice = {
			id: `remote-${randomBytes(12).toString("base64url")}`,
			name: deviceName || "Android device",
			origin,
			tokenHash: hashToken(token),
			createdAt: new Date().toISOString(),
			lastSeenAt: null,
		};
		this.config = {
			...this.config,
			devices: [...this.config.devices, device],
		};
		await this.persistConfig();
		this.broadcast();
		return {
			device: { id: device.id, name: device.name },
			token,
		};
	}

	private async authenticate(credential: string, origin: string): Promise<RemoteGatewayDevice | null> {
		const separator: number = credential.indexOf(".");
		if (separator <= 0) return null;
		const deviceId: string = credential.slice(0, separator);
		const token: string = credential.slice(separator + 1);
		const device: PersistedRemoteDevice | undefined = this.config.devices.find(
			(candidate: PersistedRemoteDevice): boolean => candidate.id === deviceId,
		);
		if (device === undefined || device.origin !== origin) return null;
		const expected: Buffer = Buffer.from(device.tokenHash, "hex");
		const actual: Buffer = Buffer.from(hashToken(token), "hex");
		return expected.length === actual.length && timingSafeEqual(expected, actual)
			? { id: device.id, name: device.name }
			: null;
	}

	private async revokeDevice(deviceId: string): Promise<void> {
		await this.load();
		this.config = {
			...this.config,
			devices: this.config.devices.filter(
				(device: PersistedRemoteDevice): boolean => device.id !== deviceId,
			),
		};
		await this.persistConfig();
		this.gateway?.closeDevice(deviceId);
		this.broadcast();
	}

	private async revokeAll(rotateIdentity: boolean): Promise<void> {
		await this.load();
		for (const device of this.config.devices) this.gateway?.closeDevice(device.id);
		this.config = { ...this.config, devices: [] };
		await this.persistConfig();
		if (rotateIdentity) {
			this.secrets = null;
			await this.store!.clearSecrets();
			if (this.config.enabled) {
				await this.gateway?.stop();
				this.gateway = null;
				await this.startGateway(true);
			}
		}
		this.broadcast();
	}

	private markDeviceSeen(deviceId: string): void {
		const now: number = Date.now();
		if (now - (this.lastSeenWrites.get(deviceId) ?? 0) < DEVICE_LAST_SEEN_WRITE_INTERVAL_MS) return;
		this.lastSeenWrites.set(deviceId, now);
		const index: number = this.config.devices.findIndex(
			(device: PersistedRemoteDevice): boolean => device.id === deviceId,
		);
		if (index < 0) return;
		const devices: PersistedRemoteDevice[] = [...this.config.devices];
		devices[index] = { ...devices[index]!, lastSeenAt: new Date(now).toISOString() };
		this.config = { ...this.config, devices };
		void this.persistConfig().then((): void => this.broadcast());
	}

	private async ensureCertificates(
		addresses: string[],
		forceRotation: boolean,
	): Promise<RemoteCertificateBundle> {
		let ca: RemoteCertificateAuthority | undefined;
		if (!forceRotation && this.secrets !== null) {
			ca = {
				certificatePem: this.secrets.caCertificatePem,
				privateKeyPem: safeStorage.decryptString(
					Buffer.from(this.secrets.encryptedCaPrivateKey, "base64"),
				),
			};
			if (!shouldRenewRemoteServerCertificate(
				this.secrets.serverAddresses,
				this.secrets.certificateExpiresAt,
				addresses,
			)) {
				return {
					ca,
					server: {
						certificatePem: this.secrets.serverCertificatePem,
						privateKeyPem: safeStorage.decryptString(
							Buffer.from(this.secrets.encryptedServerPrivateKey, "base64"),
						),
						expiresAt: this.secrets.certificateExpiresAt,
					},
					fingerprint: this.secrets.certificateFingerprint,
					addresses: [...this.secrets.serverAddresses],
				};
			}
		}
		const bundle: RemoteCertificateBundle = await createRemoteCertificateBundle(addresses, ca);
		this.secrets = {
			schemaVersion: 1,
			caCertificatePem: bundle.ca.certificatePem,
			encryptedCaPrivateKey: safeStorage.encryptString(bundle.ca.privateKeyPem).toString("base64"),
			serverCertificatePem: bundle.server.certificatePem,
			encryptedServerPrivateKey: safeStorage.encryptString(bundle.server.privateKeyPem).toString("base64"),
			serverAddresses: [...bundle.addresses],
			certificateFingerprint: bundle.fingerprint,
			certificateExpiresAt: bundle.server.expiresAt,
		};
		await this.store!.saveSecrets(this.secrets);
		return bundle;
	}

	private async persistConfig(): Promise<void> {
		const config: RemoteAccessConfig = this.config;
		const operation: Promise<void> = this.updateTail.then(async (): Promise<void> => {
			await this.store!.saveConfig(config);
		});
		this.updateTail = operation.catch((): void => {});
		await operation;
	}

	private broadcast(): void {
		const state: RemoteAccessState = this.getState();
		for (const window of BrowserWindow.getAllWindows()) {
			if (!window.isDestroyed()) window.webContents.send("remote-access:state-changed", state);
		}
	}
}

export const remoteAccessService = new RemoteAccessService();

import { randomUUID } from "node:crypto";
import { safeStorage } from "electron";
import type { BrowserCredentialSummary } from "../../../contracts/browser";
import { readJsonFile, writeJsonFileAtomic } from "./browser-store";

type StoredCredential = BrowserCredentialSummary & {
	password: string;
};

type PasswordRepository = {
	version: 1;
	credentials: StoredCredential[];
};

const EMPTY_REPOSITORY: PasswordRepository = { version: 1, credentials: [] };

export function isBrowserPasswordEncryptionAvailable(): boolean {
	return safeStorage.isEncryptionAvailable()
		&& (process.platform !== "linux" || safeStorage.getSelectedStorageBackend() !== "basic_text");
}

export class BrowserPasswordStore {
	private repository: PasswordRepository | null = null;
	private writeTail: Promise<void> = Promise.resolve();

	constructor(private readonly filePath: string) {}

	async list(): Promise<BrowserCredentialSummary[]> {
		return (await this.load()).credentials.map(({ password: _password, ...summary }): BrowserCredentialSummary => ({ ...summary }));
	}

	async save(origin: string, username: string, password: string): Promise<BrowserCredentialSummary> {
		if (!isBrowserPasswordEncryptionAvailable()) throw new Error("browser_password_encryption_unavailable");
		if (origin.length > 2048 || username.length === 0 || username.length > 500 || password.length === 0 || password.length > 10_000) {
			throw new Error("browser_password_invalid");
		}
		const repository: PasswordRepository = await this.load();
		const now: string = new Date().toISOString();
		const parsedOrigin: URL = new URL(origin);
		if (parsedOrigin.protocol !== "https:" && parsedOrigin.protocol !== "http:") throw new Error("browser_password_origin_invalid");
		const normalizedOrigin: string = parsedOrigin.origin;
		const existing: StoredCredential | undefined = repository.credentials.find((item: StoredCredential): boolean => item.origin === normalizedOrigin && item.username === username);
		const encryptedPassword: string = safeStorage.encryptString(password).toString("base64");
		const record: StoredCredential = existing === undefined
			? { id: randomUUID(), origin: normalizedOrigin, username, password: encryptedPassword, createdAt: now, updatedAt: now }
			: { ...existing, password: encryptedPassword, updatedAt: now };
		if (existing === undefined) repository.credentials.push(record);
		else repository.credentials[repository.credentials.indexOf(existing)] = record;
		await this.persist(repository);
		const { password: _password, ...summary } = record;
		return summary;
	}

	async reveal(id: string): Promise<string> {
		if (!isBrowserPasswordEncryptionAvailable()) throw new Error("browser_password_encryption_unavailable");
		const record: StoredCredential | undefined = (await this.load()).credentials.find((item: StoredCredential): boolean => item.id === id);
		if (record === undefined) throw new Error("browser_password_not_found");
		return safeStorage.decryptString(Buffer.from(record.password, "base64"));
	}

	async remove(id: string): Promise<void> {
		const repository: PasswordRepository = await this.load();
		repository.credentials = repository.credentials.filter((item: StoredCredential): boolean => item.id !== id);
		await this.persist(repository);
	}

	async clear(sinceMs: number | null = null): Promise<void> {
		if (sinceMs === null) {
			await this.persist({ version: 1, credentials: [] });
			return;
		}
		const repository: PasswordRepository = await this.load();
		repository.credentials = repository.credentials.filter((item: StoredCredential): boolean => Date.parse(item.updatedAt) < sinceMs);
		await this.persist(repository);
	}

	async findForUrl(rawUrl: string): Promise<BrowserCredentialSummary[]> {
		const origin: string = new URL(rawUrl).origin;
		return (await this.list()).filter((item: BrowserCredentialSummary): boolean => item.origin === origin);
	}

	private async load(): Promise<PasswordRepository> {
		if (this.repository !== null) return this.repository;
		const value: PasswordRepository = await readJsonFile(this.filePath, EMPTY_REPOSITORY);
		this.repository = value.version === 1 && Array.isArray(value.credentials)
			? { version: 1, credentials: value.credentials.slice(0, 1000) }
			: { version: 1, credentials: [] };
		return this.repository;
	}

	private async persist(repository: PasswordRepository): Promise<void> {
		this.repository = repository;
		this.writeTail = this.writeTail.then(async (): Promise<void> => writeJsonFileAtomic(this.filePath, repository));
		await this.writeTail;
	}
}

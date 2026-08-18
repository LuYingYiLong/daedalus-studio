import type {
	BrowserDownloadRecord,
	BrowserHistoryEntry,
	BrowserPermissionRule,
	BrowserSettings
} from "../../../contracts/browser";
import { readJsonFile, writeJsonFileAtomic } from "./browser-store";

type BrowserDataRepository = {
	version: 1;
	settings: Omit<BrowserSettings, "permissionRules">;
	permissions: BrowserPermissionRule[];
	history: BrowserHistoryEntry[];
	downloads: BrowserDownloadRecord[];
};

const DEFAULT_REPOSITORY: BrowserDataRepository = {
	version: 1,
	settings: { downloadDirectory: null, askWhereToSave: false, savePasswordsEnabled: true },
	permissions: [],
	history: [],
	downloads: []
};

export class BrowserDataStore {
	private repository: BrowserDataRepository | null = null;
	private writeTail: Promise<void> = Promise.resolve();

	constructor(private readonly filePath: string) {}

	async getSettings(): Promise<BrowserSettings> {
		const repository: BrowserDataRepository = await this.load();
		return { ...repository.settings, permissionRules: repository.permissions.map((rule: BrowserPermissionRule): BrowserPermissionRule => ({ ...rule })) };
	}

	async updateSettings(patch: Partial<Omit<BrowserSettings, "permissionRules">>): Promise<BrowserSettings> {
		const repository: BrowserDataRepository = await this.load();
		repository.settings = { ...repository.settings, ...patch };
		await this.persist(repository);
		return await this.getSettings();
	}

	async setPermission(origin: string, permission: string, decision: "allow" | "block"): Promise<BrowserPermissionRule[]> {
		const repository: BrowserDataRepository = await this.load();
		const parsedOrigin: URL = new URL(origin);
		if (parsedOrigin.protocol !== "https:" && parsedOrigin.protocol !== "http:") throw new Error("browser_permission_invalid");
		const normalizedOrigin: string = parsedOrigin.origin;
		repository.permissions = repository.permissions.filter((rule: BrowserPermissionRule): boolean => !(rule.origin === normalizedOrigin && rule.permission === permission));
		repository.permissions.push({ origin: normalizedOrigin, permission, decision, updatedAt: new Date().toISOString() });
		await this.persist(repository);
		return repository.permissions.map((rule: BrowserPermissionRule): BrowserPermissionRule => ({ ...rule }));
	}

	async removePermission(origin: string, permission: string): Promise<BrowserPermissionRule[]> {
		const repository: BrowserDataRepository = await this.load();
		repository.permissions = repository.permissions.filter((rule: BrowserPermissionRule): boolean => !(rule.origin === origin && rule.permission === permission));
		await this.persist(repository);
		return repository.permissions.map((rule: BrowserPermissionRule): BrowserPermissionRule => ({ ...rule }));
	}

	async addHistory(entry: BrowserHistoryEntry): Promise<void> {
		const repository: BrowserDataRepository = await this.load();
		if (repository.history[0]?.url === entry.url) repository.history[0] = entry;
		else repository.history.unshift(entry);
		repository.history = repository.history.slice(0, 2000);
		await this.persist(repository);
	}

	async listHistory(): Promise<BrowserHistoryEntry[]> {
		return (await this.load()).history.map((entry: BrowserHistoryEntry): BrowserHistoryEntry => ({ ...entry }));
	}

	async clearHistory(sinceMs: number | null = null): Promise<void> {
		const repository: BrowserDataRepository = await this.load();
		repository.history = sinceMs === null
			? []
			: repository.history.filter((entry: BrowserHistoryEntry): boolean => Date.parse(entry.visitedAt) < sinceMs);
		await this.persist(repository);
	}

	async upsertDownload(record: BrowserDownloadRecord): Promise<void> {
		const repository: BrowserDataRepository = await this.load();
		const index: number = repository.downloads.findIndex((item: BrowserDownloadRecord): boolean => item.id === record.id);
		if (index < 0) repository.downloads.unshift(record);
		else repository.downloads[index] = record;
		repository.downloads = repository.downloads.slice(0, 500);
		await this.persist(repository);
	}

	async listDownloads(): Promise<BrowserDownloadRecord[]> {
		return (await this.load()).downloads.map((entry: BrowserDownloadRecord): BrowserDownloadRecord => ({ ...entry }));
	}

	async removeDownload(id: string): Promise<void> {
		const repository: BrowserDataRepository = await this.load();
		repository.downloads = repository.downloads.filter((item: BrowserDownloadRecord): boolean => item.id !== id);
		await this.persist(repository);
	}

	async clearDownloads(sinceMs: number | null = null): Promise<void> {
		const repository: BrowserDataRepository = await this.load();
		repository.downloads = sinceMs === null
			? []
			: repository.downloads.filter((entry: BrowserDownloadRecord): boolean => Date.parse(entry.startedAt) < sinceMs);
		await this.persist(repository);
	}

	private async load(): Promise<BrowserDataRepository> {
		if (this.repository !== null) return this.repository;
		const value: BrowserDataRepository = await readJsonFile(this.filePath, DEFAULT_REPOSITORY);
		this.repository = value.version === 1 ? {
			version: 1,
			settings: { ...DEFAULT_REPOSITORY.settings, ...(value.settings ?? {}) },
			permissions: Array.isArray(value.permissions) ? value.permissions.slice(0, 1000) : [],
			history: Array.isArray(value.history) ? value.history.slice(0, 2000) : [],
			downloads: Array.isArray(value.downloads) ? value.downloads.slice(0, 500) : []
		} : structuredClone(DEFAULT_REPOSITORY);
		return this.repository;
	}

	private async persist(repository: BrowserDataRepository): Promise<void> {
		this.repository = repository;
		this.writeTail = this.writeTail.then(async (): Promise<void> => writeJsonFileAtomic(this.filePath, repository));
		await this.writeTail;
	}
}

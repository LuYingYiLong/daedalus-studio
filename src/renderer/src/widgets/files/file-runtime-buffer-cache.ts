export type RuntimeBufferCacheStats = {
	entryCount: number;
	cleanEntryCount: number;
	cleanBytes: number;
};

type RuntimeBuffer = {
	content: string;
	savedContent?: string;
	isDirty: boolean;
};

type RuntimeBufferEntry<T extends RuntimeBuffer> = {
	value: T;
	bytes: number;
	lastAccess: number;
};

const DEFAULT_MAX_CLEAN_ENTRIES: number = 16;
const DEFAULT_MAX_CLEAN_BYTES: number = 32 * 1024 * 1024;

export class FileRuntimeBufferCache<T extends RuntimeBuffer> {
	private readonly entries: Map<string, RuntimeBufferEntry<T>> = new Map();

	private cleanBytes: number = 0;

	private nextAccess: number = 0;

	public constructor(
		private readonly maxCleanEntries: number = DEFAULT_MAX_CLEAN_ENTRIES,
		private readonly maxCleanBytes: number = DEFAULT_MAX_CLEAN_BYTES
	) {}

	public get(key: string): T | undefined {
		const entry: RuntimeBufferEntry<T> | undefined = this.entries.get(key);
		if (entry === undefined) return undefined;
		entry.lastAccess = this.nextAccess++;
		return entry.value;
	}

	public set(key: string, value: T): void {
		this.delete(key);
		const entry: RuntimeBufferEntry<T> = {
			value,
			bytes: this.estimateBytes(value),
			lastAccess: this.nextAccess++
		};
		this.entries.set(key, entry);
		if (!value.isDirty) this.cleanBytes += entry.bytes;
		this.evictCleanEntries();
	}

	public delete(key: string): boolean {
		const entry: RuntimeBufferEntry<T> | undefined = this.entries.get(key);
		if (entry === undefined) return false;
		this.entries.delete(key);
		if (!entry.value.isDirty) this.cleanBytes -= entry.bytes;
		return true;
	}

	public clearClean(): void {
		for (const [key, entry] of this.entries) {
			if (!entry.value.isDirty) this.entries.delete(key);
		}
		this.cleanBytes = 0;
	}

	public hasDirtyWhere(predicate: (key: string) => boolean): boolean {
		for (const [key, entry] of this.entries) {
			if (entry.value.isDirty && predicate(key)) {
				return true;
			}
		}
		return false;
	}

	public deleteCleanWhere(predicate: (key: string) => boolean): void {
		for (const [key, entry] of this.entries) {
			if (!entry.value.isDirty && predicate(key)) {
				this.delete(key);
			}
		}
	}

	public stats(): RuntimeBufferCacheStats {
		let cleanEntryCount: number = 0;
		for (const entry of this.entries.values()) {
			if (!entry.value.isDirty) cleanEntryCount += 1;
		}
		return { entryCount: this.entries.size, cleanEntryCount, cleanBytes: this.cleanBytes };
	}

	private estimateBytes(value: T): number {
		return Math.max(1, value.content.length * 2 + (value.savedContent?.length ?? 0) * 2);
	}

	private evictCleanEntries(): void {
		while (this.stats().cleanEntryCount > this.maxCleanEntries || this.cleanBytes > this.maxCleanBytes) {
			let oldestKey: string | undefined;
			let oldestAccess: number = Number.POSITIVE_INFINITY;
			for (const [key, entry] of this.entries) {
				if (!entry.value.isDirty && entry.lastAccess < oldestAccess) {
					oldestKey = key;
					oldestAccess = entry.lastAccess;
				}
			}
			if (oldestKey === undefined) return;
			this.delete(oldestKey);
		}
	}
}

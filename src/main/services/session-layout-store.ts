import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

export type DockTabKind = "review" | "terminal";

export type DockTabPreferences = {
	key: string;
	kind: DockTabKind;
	index: number;
};

export type DockFullscreenPlacement = "side" | "bottom";

export type DockLayoutPreferences = {
	open: boolean;
	size: number;
	tabs: DockTabPreferences[];
	activeTabKey: string | null;
};

export type SessionLayoutPreferences = {
	side: DockLayoutPreferences;
	bottom: DockLayoutPreferences;
	fullscreenDock: DockFullscreenPlacement | null;
};

export type SessionLayoutMap = Record<string, SessionLayoutPreferences>;

type SessionLayoutRepository = {
	version: 1;
	sessions: SessionLayoutMap;
};

export const SESSION_LAYOUT_VERSION = 1;
export const SIDE_DOCK_MIN_SIZE = 150;
export const SIDE_DOCK_MAX_SIZE = 720;
export const SIDE_DOCK_DEFAULT_SIZE = 520;
export const BOTTOM_DOCK_MIN_SIZE = 120;
export const BOTTOM_DOCK_MAX_SIZE = 520;
export const BOTTOM_DOCK_DEFAULT_SIZE = 280;

const SESSION_ID_PATTERN: RegExp = /^session-[A-Za-z0-9_-]+$/u;
const TAB_KEY_PATTERN: RegExp = /^[A-Za-z0-9:_-]{1,120}$/u;

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function clamp(value: number, minimum: number, maximum: number): number {
	return Math.min(maximum, Math.max(minimum, value));
}

function cloneDockLayout(layout: DockLayoutPreferences): DockLayoutPreferences {
	return {
		...layout,
		tabs: layout.tabs.map((tab: DockTabPreferences): DockTabPreferences => ({ ...tab }))
	};
}

export function cloneSessionLayout(layout: SessionLayoutPreferences): SessionLayoutPreferences {
	return {
		fullscreenDock: layout.fullscreenDock,
		side: cloneDockLayout(layout.side),
		bottom: cloneDockLayout(layout.bottom)
	};
}

export function createDefaultSessionLayout(): SessionLayoutPreferences {
	return {
		fullscreenDock: null,
		side: {
			open: false,
			size: SIDE_DOCK_DEFAULT_SIZE,
			tabs: [{ key: "side:review:1", kind: "review", index: 1 }],
			activeTabKey: "side:review:1"
		},
		bottom: {
			open: false,
			size: BOTTOM_DOCK_DEFAULT_SIZE,
			tabs: [{ key: "bottom:terminal:1", kind: "terminal", index: 1 }],
			activeTabKey: "bottom:terminal:1"
		}
	};
}

export function isValidSessionId(sessionId: string): boolean {
	return SESSION_ID_PATTERN.test(sessionId);
}

function normalizeDockLayout(
	value: unknown,
	defaultLayout: DockLayoutPreferences,
	minimumSize: number,
	maximumSize: number
): DockLayoutPreferences | null {
	if (!isRecord(value) || typeof value.open !== "boolean" || !Array.isArray(value.tabs)) {
		return null;
	}

	const tabs: DockTabPreferences[] = [];
	const seenKeys: Set<string> = new Set();
	for (const candidate of value.tabs) {
		if (
			!isRecord(candidate)
			|| (candidate.kind !== "review" && candidate.kind !== "terminal")
			|| typeof candidate.key !== "string"
			|| !TAB_KEY_PATTERN.test(candidate.key)
			|| typeof candidate.index !== "number"
			|| !Number.isInteger(candidate.index)
			|| candidate.index < 1
		) {
			return null;
		}
		if (seenKeys.has(candidate.key)) {
			continue;
		}
		seenKeys.add(candidate.key);
		tabs.push({
			key: candidate.key,
			kind: candidate.kind,
			index: candidate.index
		});
	}

	const rawSize: number = typeof value.size === "number" && Number.isFinite(value.size)
		? value.size
		: defaultLayout.size;
	const requestedActiveKey: string | null = typeof value.activeTabKey === "string"
		? value.activeTabKey
		: null;
	const activeTabKey: string | null = tabs.some((tab: DockTabPreferences): boolean => tab.key === requestedActiveKey)
		? requestedActiveKey
		: tabs[0]?.key ?? null;

	return {
		open: value.open,
		size: clamp(rawSize, minimumSize, maximumSize),
		tabs,
		activeTabKey
	};
}

export function normalizeSessionLayout(value: unknown): SessionLayoutPreferences {
	const defaults: SessionLayoutPreferences = createDefaultSessionLayout();
	if (!isRecord(value)) {
		return defaults;
	}

	const side: DockLayoutPreferences | null = normalizeDockLayout(
		value.side,
		defaults.side,
		SIDE_DOCK_MIN_SIZE,
		SIDE_DOCK_MAX_SIZE
	);
	const bottom: DockLayoutPreferences | null = normalizeDockLayout(
		value.bottom,
		defaults.bottom,
		BOTTOM_DOCK_MIN_SIZE,
		BOTTOM_DOCK_MAX_SIZE
	);
	if (side === null || bottom === null) {
		return defaults;
	}

	const fullscreenDock: DockFullscreenPlacement | null = value.fullscreenDock === "side" || value.fullscreenDock === "bottom"
		? value.fullscreenDock
		: null;
	return { fullscreenDock, side, bottom };
}

export function normalizeSessionLayoutRepository(value: unknown): SessionLayoutRepository {
	if (!isRecord(value) || value.version !== SESSION_LAYOUT_VERSION || !isRecord(value.sessions)) {
		return { version: SESSION_LAYOUT_VERSION, sessions: {} };
	}

	const sessions: SessionLayoutMap = {};
	for (const [sessionId, layout] of Object.entries(value.sessions)) {
		if (!isValidSessionId(sessionId)) {
			continue;
		}
		sessions[sessionId] = normalizeSessionLayout(layout);
	}
	return { version: SESSION_LAYOUT_VERSION, sessions };
}

export class SessionLayoutStore {
	private repository: SessionLayoutRepository | null = null;
	private loadPromise: Promise<SessionLayoutRepository> | null = null;
	private writeQueue: Promise<void> = Promise.resolve();

	constructor(private readonly filePath: string) {}

	async getAll(): Promise<SessionLayoutMap> {
		const repository: SessionLayoutRepository = await this.load();
		return Object.fromEntries(
			Object.entries(repository.sessions).map(([sessionId, layout]): [string, SessionLayoutPreferences] => [
				sessionId,
				cloneSessionLayout(layout)
			])
		);
	}

	async save(sessionId: string, layout: unknown): Promise<SessionLayoutPreferences> {
		if (!isValidSessionId(sessionId)) {
			throw new Error("Invalid session id.");
		}
		const normalizedLayout: SessionLayoutPreferences = normalizeSessionLayout(layout);
		await this.enqueueWrite(async (): Promise<void> => {
			const repository: SessionLayoutRepository = await this.load();
			repository.sessions[sessionId] = normalizedLayout;
			await this.writeRepository(repository);
		});
		return cloneSessionLayout(normalizedLayout);
	}

	async remove(sessionIds: unknown): Promise<{ removed: number }> {
		if (!Array.isArray(sessionIds) || sessionIds.some((sessionId: unknown): boolean => typeof sessionId !== "string" || !isValidSessionId(sessionId))) {
			throw new Error("Invalid session ids.");
		}
		let removed: number = 0;
		await this.enqueueWrite(async (): Promise<void> => {
			const repository: SessionLayoutRepository = await this.load();
			for (const sessionId of new Set(sessionIds as string[])) {
				if (Object.hasOwn(repository.sessions, sessionId)) {
					delete repository.sessions[sessionId];
					removed += 1;
				}
			}
			if (removed > 0) {
				await this.writeRepository(repository);
			}
		});
		return { removed };
	}

	private async load(): Promise<SessionLayoutRepository> {
		if (this.repository !== null) {
			return this.repository;
		}
		if (this.loadPromise !== null) {
			return await this.loadPromise;
		}
		this.loadPromise = this.loadFromDisk();
		try {
			this.repository = await this.loadPromise;
			return this.repository;
		} finally {
			this.loadPromise = null;
		}
	}

	private async loadFromDisk(): Promise<SessionLayoutRepository> {
		try {
			const rawText: string = await readFile(this.filePath, "utf8");
			return normalizeSessionLayoutRepository(JSON.parse(rawText) as unknown);
		} catch {
			return { version: SESSION_LAYOUT_VERSION, sessions: {} };
		}
	}

	private async enqueueWrite(operation: () => Promise<void>): Promise<void> {
		const queued: Promise<void> = this.writeQueue.then(operation, operation);
		this.writeQueue = queued.catch((): void => undefined);
		await queued;
	}

	private async writeRepository(repository: SessionLayoutRepository): Promise<void> {
		await mkdir(dirname(this.filePath), { recursive: true });
		const temporaryPath: string = `${this.filePath}.${process.pid}.${Date.now()}.tmp`;
		try {
			await writeFile(temporaryPath, `${JSON.stringify(repository, null, 2)}\n`, "utf8");
			await rename(temporaryPath, this.filePath);
		} finally {
			await rm(temporaryPath, { force: true }).catch((): void => undefined);
		}
	}
}

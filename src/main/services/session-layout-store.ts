import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname, isAbsolute } from "node:path";

export type DockTabKind = "review" | "terminal" | "files" | "browser" | "trajectory";

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

export type FileTabPreferences = {
	key: string;
	sourceFolderId: string;
	relativePath: string;
	pinned: boolean;
};

export type FilePanelLayoutPreferences = {
	sidebarOpen: boolean;
	splitSize: number;
	selectedSourceFolderId: string | null;
	expandedPathsBySourceFolder: Record<string, string[]>;
	tabs: FileTabPreferences[];
	activeTabKey: string | null;
	previewTabKey: string | null;
};

export type BrowserPanelLayoutPreferences = {
	lastUrl: string | null;
};

export type SessionLayoutPreferences = {
	side: DockLayoutPreferences;
	bottom: DockLayoutPreferences;
	fullscreenDock: DockFullscreenPlacement | null;
	filePanels: Record<string, FilePanelLayoutPreferences>;
	browserPanels: Record<string, BrowserPanelLayoutPreferences>;
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
const SOURCE_FOLDER_ID_PATTERN: RegExp = /^[A-Za-z0-9._:-]{1,200}$/u;
const MAX_FILE_TABS: number = 30;
const MAX_EXPANDED_PATHS_PER_SOURCE: number = 500;

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
		browserPanels: Object.fromEntries(Object.entries(layout.browserPanels).map(([key, browserPanel]): [string, BrowserPanelLayoutPreferences] => [key, { ...browserPanel }])),
		filePanels: Object.fromEntries(Object.entries(layout.filePanels).map(([key, filePanel]): [string, FilePanelLayoutPreferences] => [
			key,
			{
				...filePanel,
				expandedPathsBySourceFolder: Object.fromEntries(Object.entries(filePanel.expandedPathsBySourceFolder).map(([sourceFolderId, paths]): [string, string[]] => [sourceFolderId, [...paths]])),
				tabs: filePanel.tabs.map((tab: FileTabPreferences): FileTabPreferences => ({ ...tab }))
			}
		])),
		side: cloneDockLayout(layout.side),
		bottom: cloneDockLayout(layout.bottom)
	};
}

export function createDefaultSessionLayout(): SessionLayoutPreferences {
	return {
		fullscreenDock: null,
		filePanels: {},
		browserPanels: {},
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
			|| (candidate.kind !== "review" && candidate.kind !== "terminal" && candidate.kind !== "files" && candidate.kind !== "browser" && candidate.kind !== "trajectory")
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

function isSafeRelativePath(value: string): boolean {
	if (value.length === 0 || value.length > 1000 || isAbsolute(value)) {
		return false;
	}
	const normalized: string = value.replaceAll("\\", "/");
	return !normalized.split("/").some((segment: string): boolean => segment === ".." || segment.length === 0);
}

function isValidFileTabKey(value: string): boolean {
	return value.length > 0 && value.length <= 1200 && !/[\u0000-\u001f\u007f]/u.test(value);
}

function normalizeFilePanelLayout(value: unknown): FilePanelLayoutPreferences {
	const defaults: FilePanelLayoutPreferences = {
		sidebarOpen: true,
		splitSize: 70,
		selectedSourceFolderId: null,
		expandedPathsBySourceFolder: {},
		tabs: [],
		activeTabKey: null,
		previewTabKey: null
	};
	if (!isRecord(value)) {
		return defaults;
	}
	const tabs: FileTabPreferences[] = [];
	const seenKeys: Set<string> = new Set();
	if (Array.isArray(value.tabs)) {
		for (const candidate of value.tabs.slice(0, MAX_FILE_TABS)) {
			if (!isRecord(candidate)
				|| typeof candidate.key !== "string"
				|| !isValidFileTabKey(candidate.key)
				|| typeof candidate.sourceFolderId !== "string"
				|| !SOURCE_FOLDER_ID_PATTERN.test(candidate.sourceFolderId)
				|| typeof candidate.relativePath !== "string"
				|| !isSafeRelativePath(candidate.relativePath)
				|| typeof candidate.pinned !== "boolean"
				|| seenKeys.has(candidate.key)) {
				continue;
			}
			seenKeys.add(candidate.key);
			tabs.push({
				key: candidate.key,
				sourceFolderId: candidate.sourceFolderId,
				relativePath: candidate.relativePath.replaceAll("\\", "/"),
				pinned: candidate.pinned
			});
		}
	}
	const expandedPathsBySourceFolder: Record<string, string[]> = {};
	if (isRecord(value.expandedPathsBySourceFolder)) {
		for (const [sourceFolderId, paths] of Object.entries(value.expandedPathsBySourceFolder)) {
			if (!SOURCE_FOLDER_ID_PATTERN.test(sourceFolderId) || !Array.isArray(paths)) {
				continue;
			}
			expandedPathsBySourceFolder[sourceFolderId] = paths
				.filter((path: unknown): path is string => typeof path === "string" && isSafeRelativePath(path))
				.slice(0, MAX_EXPANDED_PATHS_PER_SOURCE);
		}
	}
	const requestedActiveKey: string | null = typeof value.activeTabKey === "string" ? value.activeTabKey : null;
	const activeTabKey: string | null = tabs.some((tab: FileTabPreferences): boolean => tab.key === requestedActiveKey)
		? requestedActiveKey
		: tabs[0]?.key ?? null;
	const requestedPreviewKey: string | null = typeof value.previewTabKey === "string" ? value.previewTabKey : null;
	const previewTabKey: string | null = tabs.some((tab: FileTabPreferences): boolean => tab.key === requestedPreviewKey && !tab.pinned)
		? requestedPreviewKey
		: null;
	return {
		sidebarOpen: typeof value.sidebarOpen === "boolean" ? value.sidebarOpen : defaults.sidebarOpen,
		splitSize: clamp(typeof value.splitSize === "number" && Number.isFinite(value.splitSize) ? value.splitSize : defaults.splitSize, 25, 85),
		selectedSourceFolderId: typeof value.selectedSourceFolderId === "string" && SOURCE_FOLDER_ID_PATTERN.test(value.selectedSourceFolderId)
			? value.selectedSourceFolderId
			: null,
		expandedPathsBySourceFolder,
		tabs,
		activeTabKey,
		previewTabKey
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
	const fileTabKeys: Set<string> = new Set([...side.tabs, ...bottom.tabs]
		.filter((tab: DockTabPreferences): boolean => tab.kind === "files")
		.map((tab: DockTabPreferences): string => tab.key));
	const filePanels: Record<string, FilePanelLayoutPreferences> = {};
	if (isRecord(value.filePanels)) {
		for (const [tabKey, filePanel] of Object.entries(value.filePanels)) {
			if (fileTabKeys.has(tabKey)) {
				filePanels[tabKey] = normalizeFilePanelLayout(filePanel);
			}
		}
	}
	const browserTabKeys: Set<string> = new Set([...side.tabs, ...bottom.tabs]
		.filter((tab: DockTabPreferences): boolean => tab.kind === "browser")
		.map((tab: DockTabPreferences): string => tab.key));
	const browserPanels: Record<string, BrowserPanelLayoutPreferences> = {};
	if (isRecord(value.browserPanels)) {
		for (const [tabKey, browserPanel] of Object.entries(value.browserPanels)) {
			if (!browserTabKeys.has(tabKey) || !isRecord(browserPanel)) {
				continue;
			}
			const lastUrl: string | null = typeof browserPanel.lastUrl === "string"
				&& browserPanel.lastUrl.length <= 2048
				&& /^https?:\/\//iu.test(browserPanel.lastUrl)
				? browserPanel.lastUrl
				: null;
			browserPanels[tabKey] = { lastUrl };
		}
	}
	return { fullscreenDock, side, bottom, filePanels, browserPanels };
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

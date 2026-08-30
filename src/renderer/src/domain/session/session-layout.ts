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

export const SIDE_DOCK_MIN_SIZE = 150;
export const SIDE_DOCK_MAX_SIZE = 720;
export const SIDE_DOCK_DEFAULT_SIZE = 520;
export const BOTTOM_DOCK_MIN_SIZE = 120;
export const BOTTOM_DOCK_MAX_SIZE = 520;
export const BOTTOM_DOCK_DEFAULT_SIZE = 280;
const MAX_TERMINAL_RUNTIME_ID_LENGTH = 80;

export function createDefaultFilePanelLayout(): FilePanelLayoutPreferences {
	return {
		sidebarOpen: true,
		splitSize: 70,
		selectedSourceFolderId: null,
		expandedPathsBySourceFolder: {},
		tabs: [],
		activeTabKey: null,
		previewTabKey: null
	};
}

export function createDefaultBrowserPanelLayout(): BrowserPanelLayoutPreferences {
	return {
		lastUrl: null
	};
}

export function resetSessionFilePanelWorkspaceState(layout: SessionLayoutPreferences): SessionLayoutPreferences {
	return {
		...cloneSessionLayout(layout),
		filePanels: Object.fromEntries(
			Object.entries(layout.filePanels).map(([panelKey, filePanel]): [string, FilePanelLayoutPreferences] => [
				panelKey,
				{
					...filePanel,
					selectedSourceFolderId: null,
					expandedPathsBySourceFolder: {},
					tabs: [],
					activeTabKey: null,
					previewTabKey: null
				}
			])
		)
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
		side: {
			...layout.side,
			tabs: layout.side.tabs.map((tab: DockTabPreferences): DockTabPreferences => ({ ...tab }))
		},
		bottom: {
			...layout.bottom,
			tabs: layout.bottom.tabs.map((tab: DockTabPreferences): DockTabPreferences => ({ ...tab }))
		}
	};
}

export function createTerminalRuntimeId(sessionId: string | null, tabKey: string): string {
	const scope: string = sessionId ?? "temporary";
	const runtimeId: string = `${scope}:${tabKey}`;
	if (runtimeId.length <= MAX_TERMINAL_RUNTIME_ID_LENGTH) {
		return runtimeId;
	}

	function hashPart(value: string, seed: number): string {
		let hash: number = seed;
		for (let index: number = 0; index < value.length; index += 1) {
			hash = Math.imul(hash ^ value.charCodeAt(index), 16777619);
		}
		return (hash >>> 0).toString(36).padStart(7, "0");
	}

	const scopeHash: string = hashPart(scope, 2166136261);
	const tabHash: string = hashPart(tabKey, 2654435761);
	const prefix: string = `terminal:${scopeHash}${tabHash}:`;
	return `${prefix}${tabKey.slice(-(MAX_TERMINAL_RUNTIME_ID_LENGTH - prefix.length))}`;
}

export function listTerminalRuntimeIds(
	sessionId: string | null,
	layout: SessionLayoutPreferences
): string[] {
	return [...layout.side.tabs, ...layout.bottom.tabs]
		.filter((tab: DockTabPreferences): boolean => tab.kind === "terminal")
		.map((tab: DockTabPreferences): string => createTerminalRuntimeId(sessionId, tab.key));
}

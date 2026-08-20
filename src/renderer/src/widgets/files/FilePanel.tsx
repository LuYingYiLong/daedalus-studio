import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Alert, Breadcrumb, Button, Divider, Dropdown, Empty, Input, message, Modal, Select, Space, Spin, Splitter, Tabs, Tooltip, Tree, Typography } from "antd";
import type { MenuProps, TreeDataNode, TreeProps } from "antd";
import { useTranslation } from "react-i18next";
import { Icon } from "@/assets/icons";
import { getFileIconName } from "@/domain/markdown/file-icon";
import type { FilePanelLayoutPreferences, FileTabPreferences } from "@/domain/session/session-layout";
import type { WorkspaceLaunchTargetId } from "@/domain/workspace/workspace-launch";
import { copyTextToClipboard } from "@/platform/electron/clipboard";
import type { AdditionalContextItem, WorkspaceConfig, WorkspaceSourceFolder } from "@/platform/rpc/types";
import { createContextId } from "@/features/workspace/controllers/context-helpers";
import MonacoFileEditor, { type FileBuffer } from "./MonacoFileEditor";
import { FILE_RUNTIME_BUFFERS } from "./file-runtime-buffers";
import styles from "./FilePanel.module.css";

type WorkspaceFsEntry = {
	name: string;
	relativePath: string;
	resourcePath: string;
	kind: "file" | "folder";
};

type LaunchTarget = { id: WorkspaceLaunchTargetId; label: string };

type FileTreeNode = TreeDataNode & {
	key: string;
	entry: WorkspaceFsEntry;
	isLeaf: boolean;
	children?: FileTreeNode[];
};

type PendingClose = { tab: FileTabPreferences; dirty: boolean };

type FilePanelProps = {
	panelKey: string;
	sessionId: string | null;
	workspace: WorkspaceConfig | null;
	layout: FilePanelLayoutPreferences;
	launchTargets: LaunchTarget[];
	workspaceLaunchTargetId: WorkspaceLaunchTargetId;
	onLayoutChange: (layout: FilePanelLayoutPreferences) => void;
	onAddContext: (item: AdditionalContextItem) => void;
};

const RUNTIME_BUFFERS = FILE_RUNTIME_BUFFERS;
const MAX_SELECTION_CHARS: number = 8000;
const EXTERNAL_CHANGE_POLL_MS: number = 2500;
const FILE_PANEL_MIN_EDITOR_SPLIT: number = 25;
const FILE_PANEL_MAX_EDITOR_SPLIT: number = 85;
const FILE_PANEL_DEFAULT_EDITOR_SPLIT: number = 70;
const EXPANDED_PATHS_PERSIST_DELAY_MS: number = 180;
const MAX_DIRECTORY_CACHE_ENTRIES: number = 256;
function normalizeRelativePath(path: string): string {
	return path.replaceAll("\\", "/").replace(/^\/+|\/+$/gu, "");
}

function getDirectoryCacheKey(sourceFolder: WorkspaceSourceFolder, relativePath: string): string {
	return `${sourceFolder.path}\u0000${normalizeRelativePath(relativePath)}`;
}

function cacheDirectoryEntries(cache: Map<string, FileTreeNode[]>, key: string, entries: FileTreeNode[]): void {
	cache.delete(key);
	cache.set(key, entries);
	while (cache.size > MAX_DIRECTORY_CACHE_ENTRIES) {
		const oldestKey: string | undefined = cache.keys().next().value;
		if (oldestKey === undefined) break;
		cache.delete(oldestKey);
	}
}

function getFileName(path: string): string {
	return normalizeRelativePath(path).split("/").at(-1) ?? path;
}

function getSourceFolderLabel(folder: WorkspaceSourceFolder): string {
	return folder.path.replaceAll("\\", "/").split("/").filter(Boolean).at(-1) ?? folder.path;
}

function getAbsolutePath(root: string, relativePath: string): string {
	const separator: string = root.includes("\\") ? "\\" : "/";
	return `${root.replace(/[\\/]$/u, "")}${separator}${normalizeRelativePath(relativePath).replaceAll("/", separator)}`;
}

function getBufferKey(sessionId: string | null, panelKey: string, tab: FileTabPreferences): string {
	return `${sessionId ?? "temporary"}\u0000${panelKey}\u0000${tab.sourceFolderId}\u0000${tab.relativePath}`;
}

function createTreeNode(entry: WorkspaceFsEntry): FileTreeNode {
	return {
		key: entry.relativePath,
		entry,
		isLeaf: entry.kind === "file",
		selectable: entry.kind === "file",
		title: entry.name,
		icon: <Icon name={entry.kind === "folder" ? "folder" : getFileIconName(entry.relativePath)} />
	};
}

function replaceTreeChildren(nodes: FileTreeNode[], key: string, children: FileTreeNode[]): FileTreeNode[] {
	let changed: boolean = false;
	const nextNodes: FileTreeNode[] = nodes.map((node: FileTreeNode): FileTreeNode => {
		if (node.key === key) {
			changed = true;
			return { ...node, children };
		}
		if (node.children === undefined || !key.startsWith(`${node.key}/`)) return node;
		const nextChildren: FileTreeNode[] = replaceTreeChildren(node.children, key, children);
		if (nextChildren === node.children) return node;
		changed = true;
		return { ...node, children: nextChildren };
	});
	return changed ? nextNodes : nodes;
}

function normalizeEditorSplitSize(value: number): number {
	if (!Number.isFinite(value)) return FILE_PANEL_DEFAULT_EDITOR_SPLIT;
	return Math.min(FILE_PANEL_MAX_EDITOR_SPLIT, Math.max(FILE_PANEL_MIN_EDITOR_SPLIT, value));
}

function getEditorSplitSizeFromPixels(sizes: number[]): number | null {
	const totalSize: number = sizes.reduce((total: number, size: number): number => total + size, 0);
	const firstPanelSize: number | undefined = sizes[0];
	if (firstPanelSize === undefined || !Number.isFinite(totalSize) || totalSize <= 0 || !Number.isFinite(firstPanelSize)) return null;
	return normalizeEditorSplitSize((firstPanelSize / totalSize) * 100);
}

function createEmptyBuffer(): FileBuffer {
	return {
		content: "",
		isDirty: false,
		sha256: "",
		modifiedAtMs: 0,
		byteSize: 0,
		readable: false,
		binary: false,
		oversized: false,
		loading: true,
		saving: false,
		conflict: false,
		error: null
	};
}

export function FilePanel({
	panelKey,
	sessionId,
	workspace,
	layout,
	launchTargets,
	workspaceLaunchTargetId,
	onLayoutChange,
	onAddContext
}: FilePanelProps): React.JSX.Element {
	const { t } = useTranslation();
	const [messageApi, messageHolder] = message.useMessage();
	const [treeData, setTreeData] = useState<FileTreeNode[]>([]);
	const [loadedKeys, setLoadedKeys] = useState<React.Key[]>([]);
	const [search, setSearch] = useState<string>("");
	const [searchResults, setSearchResults] = useState<FileTreeNode[]>([]);
	const [searching, setSearching] = useState<boolean>(false);
	const [buffers, setBuffers] = useState<Record<string, FileBuffer>>({});
	const [pendingClose, setPendingClose] = useState<PendingClose | null>(null);
	const searchRequestRef = useRef<number>(0);
	const directoryCacheRef = useRef<Map<string, FileTreeNode[]>>(new Map());
	const directoryRequestsRef = useRef<Map<string, Promise<FileTreeNode[]>>>(new Map());
	const layoutRef = useRef<FilePanelLayoutPreferences>(layout);
	const onLayoutChangeRef = useRef<FilePanelProps["onLayoutChange"]>(onLayoutChange);
	const expandedPathsPersistTimerRef = useRef<number | null>(null);
	const pendingExpandedPathsRef = useRef<Record<string, string[]> | null>(null);
	const [visualEditorSplitSize, setVisualEditorSplitSize] = useState<number>(() => normalizeEditorSplitSize(layout.splitSize));
	const [visualExpandedKeys, setVisualExpandedKeys] = useState<React.Key[]>([]);
	layoutRef.current = layout;
	onLayoutChangeRef.current = onLayoutChange;

	const sourceFolders: WorkspaceSourceFolder[] = workspace?.sourceFolders ?? [];
	const selectedSourceFolder: WorkspaceSourceFolder | null = useMemo((): WorkspaceSourceFolder | null => {
		if (sourceFolders.length === 0) return null;
		return sourceFolders.find((folder: WorkspaceSourceFolder): boolean => folder.id === layout.selectedSourceFolderId)
			?? sourceFolders.find((folder: WorkspaceSourceFolder): boolean => folder.id === workspace?.primarySourceFolderId)
			?? sourceFolders[0]
			?? null;
	}, [layout.selectedSourceFolderId, sourceFolders, workspace?.primarySourceFolderId]);
	const activeTab: FileTabPreferences | null = layout.tabs.find((tab: FileTabPreferences): boolean => tab.key === layout.activeTabKey)
		?? layout.tabs[0]
		?? null;
	const activeBuffer: FileBuffer | null = activeTab === null ? null : buffers[activeTab.key] ?? null;
	const isDirty: boolean = activeBuffer?.isDirty === true;
	const editorSplitSize: number = visualEditorSplitSize;

	const patchLayout = useCallback((patch: Partial<FilePanelLayoutPreferences>): void => {
		const currentLayout: FilePanelLayoutPreferences = layoutRef.current;
		const nextLayout: FilePanelLayoutPreferences = {
			...currentLayout,
			...patch,
			splitSize: normalizeEditorSplitSize(patch.splitSize ?? currentLayout.splitSize)
		};
		layoutRef.current = nextLayout;
		onLayoutChangeRef.current(nextLayout);
	}, []);

	const handleSplitterResize = useCallback((sizes: number[]): void => {
		const nextSplitSize: number | null = getEditorSplitSizeFromPixels(sizes);
		if (nextSplitSize !== null) setVisualEditorSplitSize(nextSplitSize);
	}, []);

	const handleSplitterResizeEnd = useCallback((sizes: number[]): void => {
		const nextSplitSize: number | null = getEditorSplitSizeFromPixels(sizes);
		if (nextSplitSize === null) return;
		setVisualEditorSplitSize(nextSplitSize);
		patchLayout({ splitSize: nextSplitSize });
	}, [patchLayout]);

	useEffect((): void => {
		setVisualEditorSplitSize(normalizeEditorSplitSize(layout.splitSize));
	}, [layout.splitSize]);

	const flushExpandedPaths = useCallback((): void => {
		if (expandedPathsPersistTimerRef.current !== null) {
			window.clearTimeout(expandedPathsPersistTimerRef.current);
			expandedPathsPersistTimerRef.current = null;
		}
		const pendingExpandedPaths: Record<string, string[]> | null = pendingExpandedPathsRef.current;
		pendingExpandedPathsRef.current = null;
		if (pendingExpandedPaths !== null) patchLayout({ expandedPathsBySourceFolder: pendingExpandedPaths });
	}, [patchLayout]);

	const scheduleExpandedPathsPersist = useCallback((sourceFolderId: string, keys: React.Key[]): void => {
		const currentExpandedPaths: Record<string, string[]> = pendingExpandedPathsRef.current
			?? layoutRef.current.expandedPathsBySourceFolder;
		pendingExpandedPathsRef.current = {
			...currentExpandedPaths,
			[sourceFolderId]: keys.map(String)
		};
		if (expandedPathsPersistTimerRef.current !== null) window.clearTimeout(expandedPathsPersistTimerRef.current);
		expandedPathsPersistTimerRef.current = window.setTimeout(flushExpandedPaths, EXPANDED_PATHS_PERSIST_DELAY_MS);
	}, [flushExpandedPaths]);

	useEffect((): void => {
		if (expandedPathsPersistTimerRef.current !== null) window.clearTimeout(expandedPathsPersistTimerRef.current);
		expandedPathsPersistTimerRef.current = null;
		pendingExpandedPathsRef.current = null;
		const sourceFolderId: string | undefined = selectedSourceFolder?.id;
		setVisualExpandedKeys(sourceFolderId === undefined
			? []
			: layoutRef.current.expandedPathsBySourceFolder[sourceFolderId] ?? []);
	}, [panelKey, selectedSourceFolder?.id, sessionId]);

	useEffect((): (() => void) => {
		return (): void => {
			if (expandedPathsPersistTimerRef.current !== null) window.clearTimeout(expandedPathsPersistTimerRef.current);
		};
	}, []);

	const loadBuffer = useCallback(async (tab: FileTabPreferences, force: boolean = false): Promise<void> => {
		const sourceFolder: WorkspaceSourceFolder | undefined = sourceFolders.find((folder: WorkspaceSourceFolder): boolean => folder.id === tab.sourceFolderId);
		if (sourceFolder === undefined) return;
		const runtimeKey: string = getBufferKey(sessionId, panelKey, tab);
		const existing: FileBuffer | undefined = RUNTIME_BUFFERS.get(runtimeKey);
		if (!force && existing !== undefined) {
			setBuffers((current) => ({ ...current, [tab.key]: existing }));
			return;
		}
		setBuffers((current) => ({ ...current, [tab.key]: { ...(current[tab.key] ?? createEmptyBuffer()), loading: true, error: null } }));
		try {
			const result = await window.electronAPI.workspaceFs.readTextFile({ workspaceRoot: sourceFolder.path, filePath: tab.relativePath });
			const content: string = result.content ?? "";
			const next: FileBuffer = {
				content,
				isDirty: false,
				sha256: result.sha256,
				modifiedAtMs: result.modifiedAtMs,
				byteSize: result.byteSize,
				readable: result.readable,
				binary: result.binary,
				oversized: result.oversized,
				loading: false,
				saving: false,
				conflict: false,
				error: null
			};
			if (!layoutRef.current.tabs.some((candidate: FileTabPreferences): boolean => candidate.key === tab.key)) return;
			RUNTIME_BUFFERS.set(runtimeKey, next);
			setBuffers((current) => ({ ...current, [tab.key]: next }));
		} catch (error: unknown) {
			setBuffers((current) => ({ ...current, [tab.key]: { ...(current[tab.key] ?? createEmptyBuffer()), loading: false, error: String(error) } }));
		}
	}, [panelKey, sessionId, sourceFolders]);

	useEffect((): void => {
		for (const tab of layout.tabs) void loadBuffer(tab);
	}, [layout.tabs, loadBuffer]);

	const handleEditorContentChange = useCallback((tab: FileTabPreferences, nextContent: string): void => {
		setBuffers((current) => {
			const currentBuffer: FileBuffer | undefined = current[tab.key];
			if (currentBuffer === undefined || currentBuffer.content === nextContent) return current;
			const savedContent: string = currentBuffer.isDirty ? currentBuffer.savedContent ?? currentBuffer.content : currentBuffer.content;
			const nextIsDirty: boolean = nextContent !== savedContent;
			const next: FileBuffer = {
				...currentBuffer,
				content: nextContent,
				savedContent: nextIsDirty ? savedContent : undefined,
				isDirty: nextIsDirty
			};
			RUNTIME_BUFFERS.set(getBufferKey(sessionId, panelKey, tab), next);
			return { ...current, [tab.key]: next };
		});
	}, [panelKey, sessionId]);

	useEffect((): void => {
		RUNTIME_BUFFERS.clearClean();
		setBuffers({});
	}, [panelKey, sessionId]);

	useEffect((): void => {
		if (selectedSourceFolder === null || layout.selectedSourceFolderId === selectedSourceFolder.id) return;
		patchLayout({ selectedSourceFolderId: selectedSourceFolder.id });
	}, [layout.selectedSourceFolderId, patchLayout, selectedSourceFolder]);

	const loadDirectory = useCallback(async (sourceFolder: WorkspaceSourceFolder, relativePath: string): Promise<FileTreeNode[]> => {
		const cacheKey: string = getDirectoryCacheKey(sourceFolder, relativePath);
		const cachedEntries: FileTreeNode[] | undefined = directoryCacheRef.current.get(cacheKey);
		if (cachedEntries !== undefined) {
			cacheDirectoryEntries(directoryCacheRef.current, cacheKey, cachedEntries);
			return cachedEntries;
		}
		const pendingRequest: Promise<FileTreeNode[]> | undefined = directoryRequestsRef.current.get(cacheKey);
		if (pendingRequest !== undefined) return pendingRequest;
		const request: Promise<FileTreeNode[]> = window.electronAPI.workspaceFs.listChildren({ workspaceRoot: sourceFolder.path, relativePath })
			.then((result): FileTreeNode[] => {
				const entries: FileTreeNode[] = result.entries.map(createTreeNode);
				cacheDirectoryEntries(directoryCacheRef.current, cacheKey, entries);
				return entries;
			})
			.finally((): void => {
				directoryRequestsRef.current.delete(cacheKey);
			});
		directoryRequestsRef.current.set(cacheKey, request);
		return request;
	}, []);

	const loadRoot = useCallback(async (): Promise<void> => {
		if (selectedSourceFolder === null) {
			setTreeData([]);
			return;
		}
		try {
			setTreeData(await loadDirectory(selectedSourceFolder, ""));
			setLoadedKeys([]);
		} catch (error: unknown) {
			void messageApi.error(String(error));
		}
	}, [loadDirectory, messageApi, selectedSourceFolder?.id, selectedSourceFolder?.path]);

	useEffect((): void => { void loadRoot(); }, [loadRoot]);

	useEffect((): (() => void) => {
		const query: string = search.trim();
		if (query.length === 0 || selectedSourceFolder === null) {
			setSearchResults([]);
			setSearching(false);
			return (): void => undefined;
		}
		const requestId: number = ++searchRequestRef.current;
		setSearching(true);
		const timer: number = window.setTimeout((): void => {
			void window.electronAPI.workspaceFs.search({ workspaceRoot: selectedSourceFolder.path, query, maxResults: 500 })
				.then((result): void => {
					if (searchRequestRef.current === requestId) setSearchResults(result.entries.map(createTreeNode));
				})
				.catch((error: unknown): void => { if (searchRequestRef.current === requestId) void messageApi.error(String(error)); })
				.finally((): void => { if (searchRequestRef.current === requestId) setSearching(false); });
		}, 180);
		return (): void => window.clearTimeout(timer);
	}, [messageApi, search, selectedSourceFolder]);

	const pinTab = useCallback((key: string): void => {
		const targetTab: FileTabPreferences | undefined = layout.tabs.find((tab: FileTabPreferences): boolean => tab.key === key);
		if (targetTab === undefined || targetTab.pinned) return;
		patchLayout({
			previewTabKey: layout.previewTabKey === key ? null : layout.previewTabKey,
			tabs: layout.tabs.map((tab: FileTabPreferences): FileTabPreferences => tab.key === key ? { ...tab, pinned: true } : tab)
		});
	}, [layout.previewTabKey, layout.tabs, patchLayout]);

	const openEntry = useCallback((entry: WorkspaceFsEntry, pinned: boolean): void => {
		if (entry.kind !== "file" || selectedSourceFolder === null) return;
		const key: string = `${selectedSourceFolder.id}:${normalizeRelativePath(entry.relativePath)}`;
		const existing: FileTabPreferences | undefined = layout.tabs.find((tab: FileTabPreferences): boolean => tab.key === key);
		if (existing !== undefined) {
			patchLayout({
				activeTabKey: key,
				...(pinned ? {
					previewTabKey: layout.previewTabKey === key ? null : layout.previewTabKey,
					tabs: layout.tabs.map((tab: FileTabPreferences): FileTabPreferences => tab.key === key ? { ...tab, pinned: true } : tab)
				} : {})
			});
			return;
		}
		const nextTab: FileTabPreferences = { key, sourceFolderId: selectedSourceFolder.id, relativePath: normalizeRelativePath(entry.relativePath), pinned };
		const previewKey: string | null = pinned ? layout.previewTabKey : key;
		const replaceIndex: number = pinned || layout.previewTabKey === null
			? -1
			: layout.tabs.findIndex((tab: FileTabPreferences): boolean => tab.key === layout.previewTabKey && !tab.pinned);
		const nextTabs: FileTabPreferences[] = [...layout.tabs];
		if (replaceIndex >= 0) {
			const replacedTab: FileTabPreferences | undefined = nextTabs[replaceIndex];
			if (replacedTab !== undefined) {
				RUNTIME_BUFFERS.delete(getBufferKey(sessionId, panelKey, replacedTab));
				setBuffers((current) => {
					const next = { ...current };
					delete next[replacedTab.key];
					return next;
				});
			}
			nextTabs.splice(replaceIndex, 1, nextTab);
		}
		else nextTabs.push(nextTab);
		patchLayout({ tabs: nextTabs, activeTabKey: key, previewTabKey: previewKey });
	}, [layout.previewTabKey, layout.tabs, panelKey, patchLayout, selectedSourceFolder, sessionId]);

	const removeTab = useCallback((tab: FileTabPreferences): void => {
		RUNTIME_BUFFERS.delete(getBufferKey(sessionId, panelKey, tab));
		setBuffers((current) => {
			const next = { ...current };
			delete next[tab.key];
			return next;
		});
		const index: number = layout.tabs.findIndex((candidate: FileTabPreferences): boolean => candidate.key === tab.key);
		const nextTabs: FileTabPreferences[] = layout.tabs.filter((candidate: FileTabPreferences): boolean => candidate.key !== tab.key);
		patchLayout({
			tabs: nextTabs,
			activeTabKey: layout.activeTabKey === tab.key ? nextTabs[Math.max(0, index - 1)]?.key ?? nextTabs[0]?.key ?? null : layout.activeTabKey,
			previewTabKey: layout.previewTabKey === tab.key ? null : layout.previewTabKey
		});
	}, [layout.activeTabKey, layout.previewTabKey, layout.tabs, panelKey, patchLayout, sessionId]);

	const closeTab = useCallback((tab: FileTabPreferences): void => {
		const buffer: FileBuffer | undefined = buffers[tab.key];
		if (buffer?.isDirty === true) {
			setPendingClose({ tab, dirty: true });
			return;
		}
		removeTab(tab);
	}, [buffers, removeTab]);

	const saveTab = useCallback(async (tab: FileTabPreferences): Promise<boolean> => {
		const sourceFolder: WorkspaceSourceFolder | undefined = sourceFolders.find((folder: WorkspaceSourceFolder): boolean => folder.id === tab.sourceFolderId);
		const buffer: FileBuffer | undefined = buffers[tab.key];
		if (sourceFolder === undefined || buffer === undefined || !buffer.readable || buffer.conflict || buffer.saving) return false;
		setBuffers((current) => ({ ...current, [tab.key]: { ...buffer, saving: true, error: null } }));
		try {
			const result = await window.electronAPI.workspaceFs.writeTextFile({
				workspaceRoot: sourceFolder.path,
				filePath: tab.relativePath,
				content: buffer.content,
				expectedSha256: buffer.sha256,
				expectedModifiedAtMs: buffer.modifiedAtMs
			});
			const next: FileBuffer = { ...buffer, savedContent: undefined, isDirty: false, sha256: result.sha256, modifiedAtMs: result.modifiedAtMs, byteSize: result.byteSize, saving: false, conflict: false };
			RUNTIME_BUFFERS.set(getBufferKey(sessionId, panelKey, tab), next);
			setBuffers((current) => ({ ...current, [tab.key]: next }));
			pinTab(tab.key);
			void messageApi.success(t("files.saved"));
			return true;
		} catch (error: unknown) {
			const conflict: boolean = String(error).includes("workspace_file_conflict");
			setBuffers((current) => ({ ...current, [tab.key]: { ...buffer, saving: false, conflict, error: String(error) } }));
			void messageApi.error(conflict ? t("files.conflict") : String(error));
			return false;
		}
	}, [buffers, messageApi, panelKey, pinTab, sessionId, sourceFolders, t]);

	const saveAs = useCallback(async (tab: FileTabPreferences, entry?: WorkspaceFsEntry): Promise<void> => {
		const sourceFolder: WorkspaceSourceFolder | undefined = sourceFolders.find((folder: WorkspaceSourceFolder): boolean => folder.id === tab.sourceFolderId);
		if (sourceFolder === undefined) return;
		let content: string | undefined = buffers[tab.key]?.content;
		if (content === undefined && entry !== undefined) {
			const result = await window.electronAPI.workspaceFs.readTextFile({ workspaceRoot: sourceFolder.path, filePath: entry.relativePath });
			content = result.content;
			if (content === undefined) {
				const copied = await window.electronAPI.workspaceFs.saveFileAs({ workspaceRoot: sourceFolder.path, filePath: entry.relativePath });
				if (copied.saved) void messageApi.success(t("files.savedAs"));
				return;
			}
		}
		if (content === undefined) return;
		const result = await window.electronAPI.workspaceFs.saveTextFileAs({ workspaceRoot: sourceFolder.path, filePath: tab.relativePath, content });
		if (result.saved) void messageApi.success(t("files.savedAs"));
	}, [buffers, messageApi, sourceFolders, t]);

	useEffect((): void => {
		const dirtyUnpinnedTab: FileTabPreferences | undefined = layout.tabs.find((tab: FileTabPreferences): boolean => {
			const buffer: FileBuffer | undefined = buffers[tab.key];
			return !tab.pinned && buffer?.isDirty === true;
		});
		if (dirtyUnpinnedTab === undefined) return;
		patchLayout({
			previewTabKey: layout.previewTabKey === dirtyUnpinnedTab.key ? null : layout.previewTabKey,
			tabs: layout.tabs.map((tab: FileTabPreferences): FileTabPreferences => tab.key === dirtyUnpinnedTab.key ? { ...tab, pinned: true } : tab)
		});
	}, [buffers, layout.previewTabKey, layout.tabs, patchLayout]);

	const addPathContext = useCallback((entry: WorkspaceFsEntry): void => {
		if (workspace === null || selectedSourceFolder === null) return;
		onAddContext({
			id: createContextId(), kind: entry.kind, title: entry.name, subtitle: entry.resourcePath, source: "manual", resourcePath: entry.resourcePath,
			data: { workspaceId: workspace.id, workspaceRoot: selectedSourceFolder.path, sourceFolderId: selectedSourceFolder.id, relativePath: normalizeRelativePath(entry.relativePath) }
		});
		void messageApi.success(t("files.contextAdded"));
	}, [messageApi, onAddContext, selectedSourceFolder, t, workspace]);

	const openWith = useCallback(async (entry: WorkspaceFsEntry, targetId: WorkspaceLaunchTargetId): Promise<void> => {
		if (selectedSourceFolder === null) return;
		await window.electronAPI.workspaceFs.openLaunchTarget({
			workspaceRoot: selectedSourceFolder.path,
			filePath: entry.relativePath,
			targetId,
			godotExecutablePath: workspace?.godotExecutablePath ?? null
		});
	}, [selectedSourceFolder, workspace?.godotExecutablePath]);

	const menuForEntry = useCallback((entry: WorkspaceFsEntry): MenuProps => {
		const selectedTarget: LaunchTarget = launchTargets.find((target: LaunchTarget): boolean => target.id === workspaceLaunchTargetId) ?? launchTargets[0] ?? { id: "file-explorer", label: "File Explorer" };
		const tab: FileTabPreferences = {
			key: selectedSourceFolder === null ? entry.relativePath : `${selectedSourceFolder.id}:${entry.relativePath}`,
			sourceFolderId: selectedSourceFolder?.id ?? "",
			relativePath: entry.relativePath,
			pinned: true
		};
		return {
			items: [
				{ key: "open", label: t("files.menu.openFrom", { target: selectedTarget.label }), icon: <Icon name="external-link" /> },
				{ key: "open-with", label: t("files.menu.openWith"), children: launchTargets.map((target: LaunchTarget) => ({ key: `open-with:${target.id}`, label: target.label })) },
				{ type: "divider" },
				{ key: "save-as", label: t("files.menu.saveAs"), disabled: entry.kind === "folder" },
				{ key: "copy-path", label: t("files.menu.copyPath") },
				{ key: "copy-relative", label: t("files.menu.copyRelativePath") },
				{ key: "context", label: t("files.menu.addContext") }
			],
			onClick: ({ key }): void => {
				if (key === "open") void openWith(entry, selectedTarget.id).catch((error: unknown): void => { void messageApi.error(String(error)); });
				else if (key.startsWith("open-with:")) void openWith(entry, key.slice("open-with:".length) as WorkspaceLaunchTargetId).catch((error: unknown): void => { void messageApi.error(String(error)); });
				else if (key === "save-as") void saveAs(tab, entry).catch((error: unknown): void => { void messageApi.error(String(error)); });
				else if (key === "copy-path" && selectedSourceFolder !== null) void copyTextToClipboard(getAbsolutePath(selectedSourceFolder.path, entry.relativePath));
				else if (key === "copy-relative") void copyTextToClipboard(normalizeRelativePath(entry.relativePath));
				else if (key === "context") addPathContext(entry);
			}
		};
	}, [addPathContext, launchTargets, messageApi, openWith, saveAs, selectedSourceFolder, t, workspaceLaunchTargetId]);

	const titleRender: TreeProps<FileTreeNode>["titleRender"] = useCallback((node: FileTreeNode): React.ReactNode => {
		return (
			<Dropdown menu={menuForEntry(node.entry)} trigger={["contextMenu"]}>
				<span className={styles.treeTitle} onDoubleClick={(): void => openEntry(node.entry, true)}>{node.entry.name}</span>
			</Dropdown>
		);
	}, [menuForEntry, openEntry]);

	const loadData = useCallback(async (node: FileTreeNode): Promise<void> => {
		if (selectedSourceFolder === null || node.entry.kind !== "folder") return;
		const entries: FileTreeNode[] = await loadDirectory(selectedSourceFolder, node.entry.relativePath);
		setTreeData((current: FileTreeNode[]): FileTreeNode[] => replaceTreeChildren(current, node.key, entries));
	}, [loadDirectory, selectedSourceFolder?.id, selectedSourceFolder?.path]);

	useEffect((): (() => void) => {
		if (layout.tabs.length === 0) return (): void => undefined;
		const timer: number = window.setInterval((): void => {
			for (const tab of layout.tabs) {
				const sourceFolder: WorkspaceSourceFolder | undefined = sourceFolders.find((folder: WorkspaceSourceFolder): boolean => folder.id === tab.sourceFolderId);
				const buffer: FileBuffer | undefined = buffers[tab.key];
				if (sourceFolder === undefined || buffer === undefined || buffer.loading || buffer.saving || !buffer.readable) continue;
				void window.electronAPI.workspaceFs.statFile({ workspaceRoot: sourceFolder.path, filePath: tab.relativePath }).then((revision): void => {
					if (revision.sha256 === buffer.sha256 && revision.modifiedAtMs === buffer.modifiedAtMs) return;
					if (!buffer.isDirty) void loadBuffer(tab, true);
					else setBuffers((current) => ({ ...current, [tab.key]: { ...(current[tab.key] ?? buffer), conflict: true } }));
				}).catch((): void => undefined);
			}
		}, EXTERNAL_CHANGE_POLL_MS);
		return (): void => window.clearInterval(timer);
	}, [buffers, layout.tabs, loadBuffer, sourceFolders]);

	useEffect((): (() => void) => {
		const handleKeyDown = (event: KeyboardEvent): void => {
			if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s" && activeTab !== null) {
				event.preventDefault();
				void saveTab(activeTab);
			}
		};
		window.addEventListener("keydown", handleKeyDown);
		return (): void => window.removeEventListener("keydown", handleKeyDown);
	}, [activeTab, saveTab]);

	if (workspace === null) {
		return <div className={styles.empty}><Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t("files.noWorkspace")} /></div>;
	}

	const activeSourceFolder: WorkspaceSourceFolder | null = activeTab === null
		? selectedSourceFolder
		: sourceFolders.find((folder: WorkspaceSourceFolder): boolean => folder.id === activeTab.sourceFolderId) ?? selectedSourceFolder;
	const breadcrumbItems = activeTab === null
		? [{ title: workspace.name }, { title: selectedSourceFolder === null ? t("files.noSourceFolder") : getSourceFolderLabel(selectedSourceFolder) }]
		: [{ title: workspace.name }, { title: activeSourceFolder === null ? t("files.noSourceFolder") : getSourceFolderLabel(activeSourceFolder) }, ...normalizeRelativePath(activeTab.relativePath).split("/").map((part: string) => ({ title: part }))];

	const tabItems = layout.tabs.map((tab: FileTabPreferences) => {
		const buffer: FileBuffer | undefined = buffers[tab.key];
		const dirty: boolean = buffer?.isDirty === true;
		const isPreview: boolean = tab.pinned !== true;
		return {
			key: tab.key,
			label: (
				<span
					className={`${styles.tabLabel} ${isPreview ? styles.previewTab : styles.pinnedTab}`}
					data-file-preview={isPreview ? "true" : "false"}
					onDoubleClick={(event: React.MouseEvent<HTMLSpanElement>): void => {
						event.preventDefault();
						event.stopPropagation();
						pinTab(tab.key);
					}}
				>
					<Icon name={getFileIconName(tab.relativePath)} />
					<span className={styles.tabText}>
						{getFileName(tab.relativePath)}{dirty ? " •" : ""}
					</span>
				</span>
			),
			children: null
		};
	});

	return (
		<div className={styles.panel}>
			{messageHolder}
			<header className={styles.header}>
				<Breadcrumb className={styles.breadcrumb} items={breadcrumbItems} />
				<Space size={2}>
					{activeTab !== null 
						? <Tooltip title={t("files.save")}>
							<Button
								type="text"
								shape="circle"
								icon={<Icon name="download" />}
								loading={activeBuffer?.saving}
								disabled={!isDirty || activeBuffer?.conflict === true || activeBuffer?.readable !== true}
								onClick={(): void => { void saveTab(activeTab); }}
								aria-label={t("files.save")} /></Tooltip> : null}
					<Tooltip title={layout.sidebarOpen ? t("files.hideSidebar") : t("files.showSidebar")}>
						<Button
							type="text"
							shape="circle"
							icon={<Icon name="layout-right" />}
							onClick={(): void => patchLayout({ sidebarOpen: !layout.sidebarOpen })}
							aria-label={layout.sidebarOpen ? t("files.hideSidebar") : t("files.showSidebar")}
						/>
					</Tooltip>
				</Space>
			</header>
			<Tabs
				type="editable-card"
				hideAdd
				size="small"
				className={styles.tabs}
				activeKey={activeTab?.key}
				items={tabItems}
				onChange={(key: string): void => patchLayout({ activeTabKey: key })}
				onEdit={(targetKey): void => {
					const tab: FileTabPreferences | undefined = layout.tabs.find((candidate: FileTabPreferences): boolean => candidate.key === String(targetKey));
					if (tab !== undefined) closeTab(tab);
				}}
			/>
			<div className={styles.body}>
				<Splitter onResize={handleSplitterResize} onResizeEnd={handleSplitterResizeEnd}>
					<Splitter.Panel min={`${FILE_PANEL_MIN_EDITOR_SPLIT}%`} size={layout.sidebarOpen ? `${editorSplitSize}%` : "100%"}>
						<div className={styles.editorPane}>
							{activeTab === null ? <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t("files.noFileSelected")} /> : activeBuffer?.loading ? <Typography.Text type="secondary">{t("files.loading")}</Typography.Text> : activeBuffer?.error !== null && activeBuffer?.error !== undefined ? <Alert type="error" showIcon message={activeBuffer.error} /> : activeBuffer?.readable !== true ? (
								<Empty
									description={
										activeBuffer?.oversized ? t("files.oversized") : t("files.binary")
									}
								>
									<Button
										onClick={(): void => {
											const entry: WorkspaceFsEntry = {
												name: getFileName(activeTab.relativePath),
												relativePath: activeTab.relativePath,
												resourcePath: `res://${activeTab.relativePath}`,
												kind: "file"
											}; void openWith(entry, workspaceLaunchTargetId);
										}
										}>
										{t("files.openExternal")}
									</Button>
								</Empty>
							) : (
								<>
									{activeBuffer.conflict
										? <Alert className={styles.conflict}
											type="warning"
											showIcon
											title={t("files.conflict")}
											action={
												<Space>
													<Button
														onClick={(): void => {
															void loadBuffer(activeTab, true);
														}}
													>
														{t("files.reload")}
													</Button>
													<Button
														onClick={(): void => {
															void saveAs(activeTab);
														}}
													>
														{t("files.menu.saveAs")}
													</Button>
												</Space>}
										/> : null}
									<MonacoFileEditor
										activeTab={activeTab}
										activeBuffer={activeBuffer}
										tabKeys={layout.tabs.map((tab: FileTabPreferences): string => tab.key)}
										panelKey={panelKey}
										workspace={workspace}
										bottomSafeArea={0}
										onContentChange={handleEditorContentChange}
										onAddContext={onAddContext}
									/>
								</>
							)}
						</div>
					</Splitter.Panel>
					{layout.sidebarOpen ? <Splitter.Panel min={`${100 - FILE_PANEL_MAX_EDITOR_SPLIT}%`} size={`${100 - editorSplitSize}%`}>
						<aside className={styles.sidebar}>
							<div className={styles.sidebarControls}>
								<div className={styles.sidebarPadding}>
									<Select
										className={styles.sourceSelect}
										value={selectedSourceFolder?.id}
										options={
											sourceFolders.map((folder: WorkspaceSourceFolder) => ({
												value: folder.id, label: getSourceFolderLabel(folder)
											}))
										}
										onChange={(id: string): void => patchLayout({ selectedSourceFolderId: id })}
										suffixIcon={<Icon name="arrow-down" style={{ pointerEvents: "none" }} />}
									/>
								</div>
								<Divider className={styles.divider} />
								<div className={styles.sidebarPadding2}>
									<Input
										allowClear
										prefix={<Icon name="search" />}
										suffix={searching ? <Spin size="small" /> : null}
										value={search}
										placeholder={t("files.search")}
										onChange={(event): void => setSearch(event.target.value)}
									/>
								</div>
							</div>
							<div className={styles.treeViewport}>
								<Tree<FileTreeNode>
									showIcon
									showLine
									blockNode
									virtual={false}
									autoExpandParent={false}
									motion={false}
									className={styles.tree}
									classNames={{
										item: styles.treeItem,
										itemIcon: styles.treeItemIcon,
										itemTitle: styles.treeItemTitle,
										itemSwitcher: styles.treeItemSwitcher
									}}
									treeData={search.trim().length > 0 ? searchResults : treeData}
									loadedKeys={loadedKeys}
									expandAction="click"
									expandedKeys={search.trim().length > 0 ? [] : visualExpandedKeys}
									loadData={loadData}
									switcherIcon={null}
									titleRender={titleRender}
									onLoad={(keys): void => setLoadedKeys(keys)}
									onExpand={(keys): void => {
										setVisualExpandedKeys(keys);
										if (selectedSourceFolder !== null) scheduleExpandedPathsPersist(selectedSourceFolder.id, keys);
									}}
									onSelect={(_keys, info): void => {
										if (info.node.entry.kind === "file") openEntry(info.node.entry, false);
									}}
								/>
							</div>
						</aside>
					</Splitter.Panel> : null}
				</Splitter>
			</div>
			<Modal open={pendingClose !== null} title={t("files.closeTitle")} closable={false} mask={{ closable: false }} footer={[
				<Button key="cancel" onClick={(): void => setPendingClose(null)}>{t("files.cancel")}</Button>,
				<Button key="discard" onClick={(): void => { const tab = pendingClose?.tab; setPendingClose(null); if (tab !== undefined) { const buffer = buffers[tab.key]; if (buffer !== undefined) { const next: FileBuffer = { ...buffer, content: buffer.savedContent ?? buffer.content, savedContent: undefined, isDirty: false }; RUNTIME_BUFFERS.set(getBufferKey(sessionId, panelKey, tab), next); setBuffers((current) => ({ ...current, [tab.key]: next })); } removeTab(tab); } }}>{t("files.discard")}</Button>,
				<Button key="save" type="primary" onClick={(): void => { const tab = pendingClose?.tab; if (tab !== undefined) void saveTab(tab).then((saved: boolean): void => { if (saved) { setPendingClose(null); removeTab(tab); } }); }}>{t("files.save")}</Button>
			]}>{pendingClose?.dirty ? t("files.closeDirty", { name: pendingClose.tab.relativePath }) : null}</Modal>
		</div>
	);
}

export default FilePanel;

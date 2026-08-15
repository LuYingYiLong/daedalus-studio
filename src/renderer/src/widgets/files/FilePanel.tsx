import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Alert, Breadcrumb, Button, Divider, Dropdown, Empty, Input, message, Modal, Select, Space, Spin, Splitter, Tabs, Tooltip, Tree, Typography } from "antd";
import type { MenuProps, TreeDataNode, TreeProps } from "antd";
import type * as MonacoNamespace from "monaco-editor";
import { useTranslation } from "react-i18next";
import { Icon } from "@/assets/icons";
import { getFileIconName } from "@/domain/markdown/file-icon";
import type { FilePanelLayoutPreferences, FileTabPreferences } from "@/domain/session/session-layout";
import type { WorkspaceLaunchTargetId } from "@/domain/workspace/workspace-launch";
import { copyTextToClipboard } from "@/platform/electron/clipboard";
import type { AdditionalContextItem, WorkspaceConfig, WorkspaceSourceFolder } from "@/platform/rpc/types";
import { createContextId } from "@/features/workspace/controllers/context-helpers";
import styles from "./FilePanel.module.css";

type WorkspaceFsEntry = {
	name: string;
	relativePath: string;
	resourcePath: string;
	kind: "file" | "folder";
};

type LaunchTarget = { id: WorkspaceLaunchTargetId; label: string };

type FileBuffer = {
	content: string;
	savedContent: string;
	sha256: string;
	modifiedAtMs: number;
	byteSize: number;
	readable: boolean;
	binary: boolean;
	oversized: boolean;
	loading: boolean;
	saving: boolean;
	conflict: boolean;
	error: string | null;
};

type FileTreeNode = TreeDataNode & {
	key: string;
	entry: WorkspaceFsEntry;
	isLeaf: boolean;
	children?: FileTreeNode[];
};

type SelectionRange = {
	start: number;
	end: number;
	text: string;
	lineStart: number;
	lineEnd: number;
	columnStart: number;
	columnEnd: number;
	top: number;
	left: number;
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

const RUNTIME_BUFFERS = new Map<string, FileBuffer>();
const MAX_SELECTION_CHARS: number = 8000;
const EXTERNAL_CHANGE_POLL_MS: number = 2500;
const FILE_PANEL_MIN_EDITOR_SPLIT: number = 25;
const FILE_PANEL_MAX_EDITOR_SPLIT: number = 85;
const FILE_PANEL_DEFAULT_EDITOR_SPLIT: number = 70;

type MonacoApi = typeof MonacoNamespace;

type MonacoEnvironment = {
	getWorker: (_moduleId: string, label: string) => Worker;
};

function normalizeRelativePath(path: string): string {
	return path.replaceAll("\\", "/").replace(/^\/+|\/+$/gu, "");
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

function getMonacoLanguage(monaco: MonacoApi, path: string): string {
	const extension: string = path.split(".").at(-1)?.toLowerCase() ?? "";
	const aliases: Record<string, string> = {
		cjs: "javascript", cs: "csharp", htm: "html", js: "javascript", jsx: "javascript", md: "markdown",
		mjs: "javascript", ps1: "powershell", py: "python", sh: "shell", ts: "typescript", tsx: "typescript", yml: "yaml"
	};
	const language: string = aliases[extension] ?? extension;
	return monaco.languages.getLanguages().some(({ id }): boolean => id === language) ? language : "plaintext";
}

function createTreeNode(entry: WorkspaceFsEntry): FileTreeNode {
	return {
		key: entry.relativePath,
		entry,
		isLeaf: entry.kind === "file",
		title: entry.name,
		icon: <Icon name={entry.kind === "folder" ? "folder" : getFileIconName(entry.relativePath)} />
	};
}

function replaceTreeChildren(nodes: FileTreeNode[], key: string, children: FileTreeNode[]): FileTreeNode[] {
	return nodes.map((node: FileTreeNode): FileTreeNode => node.key === key
		? { ...node, children }
		: node.children === undefined ? node : { ...node, children: replaceTreeChildren(node.children, key, children) });
}

function createMonacoModelUri(monaco: MonacoApi, panelKey: string, tab: FileTabPreferences): MonacoNamespace.Uri {
	return monaco.Uri.parse(`daedalus://file/${encodeURIComponent(`${panelKey}/${tab.sourceFolderId}/${tab.relativePath}`)}`);
}

function getEditorFontFamily(container: HTMLElement): string {
	const fontFamily: string = getComputedStyle(container).fontFamily.trim();
	return fontFamily.length > 0 ? fontFamily : "SFMono-Regular, Consolas, 'Liberation Mono', monospace";
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
		savedContent: "",
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
	const [selection, setSelection] = useState<SelectionRange | null>(null);
	const [commenting, setCommenting] = useState<boolean>(false);
	const [annotation, setAnnotation] = useState<string>("");
	const [pendingClose, setPendingClose] = useState<PendingClose | null>(null);
	const [editorContainerNode, setEditorContainerNode] = useState<HTMLDivElement | null>(null);
	const editorContainerRef = useCallback((node: HTMLDivElement | null): void => setEditorContainerNode(node), []);
	const monacoRef = useRef<MonacoApi | null>(null);
	const editorRef = useRef<MonacoNamespace.editor.IStandaloneCodeEditor | null>(null);
	const modelsRef = useRef<Map<string, MonacoNamespace.editor.ITextModel>>(new Map());
	const suppressModelChangeRef = useRef<boolean>(false);
	const searchRequestRef = useRef<number>(0);
	const [monacoReady, setMonacoReady] = useState<boolean>(false);
	const [editorGeneration, setEditorGeneration] = useState<number>(0);
	const [monacoError, setMonacoError] = useState<string | null>(null);
	const [visualEditorSplitSize, setVisualEditorSplitSize] = useState<number>(() => normalizeEditorSplitSize(layout.splitSize));

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
	const isDirty: boolean = activeBuffer !== null && activeBuffer.content !== activeBuffer.savedContent;
	const editorSplitSize: number = visualEditorSplitSize;

	const patchLayout = useCallback((patch: Partial<FilePanelLayoutPreferences>): void => {
		onLayoutChange({
			...layout,
			...patch,
			splitSize: normalizeEditorSplitSize(patch.splitSize ?? layout.splitSize)
		});
	}, [layout, onLayoutChange]);

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

	useEffect((): (() => void) | undefined => {
		const container: HTMLDivElement | null = editorContainerNode;
		if (container === null) return undefined;
		let disposed: boolean = false;
		let themeObserver: MutationObserver | null = null;
		const initialize = async (): Promise<void> => {
			try {
				setMonacoError(null);
				const [monacoModule, editorWorkerModule, jsonWorkerModule, cssWorkerModule, htmlWorkerModule, typescriptWorkerModule] = await Promise.all([
					import("monaco-editor"),
					import("../../../../../node_modules/monaco-editor/esm/vs/editor/editor.worker.js?worker"),
					import("../../../../../node_modules/monaco-editor/esm/vs/language/json/json.worker.js?worker"),
					import("../../../../../node_modules/monaco-editor/esm/vs/language/css/css.worker.js?worker"),
					import("../../../../../node_modules/monaco-editor/esm/vs/language/html/html.worker.js?worker"),
					import("../../../../../node_modules/monaco-editor/esm/vs/language/typescript/ts.worker.js?worker")
				]);
				if (disposed) return;
				const editorWorker = editorWorkerModule.default;
				const jsonWorker = jsonWorkerModule.default;
				const cssWorker = cssWorkerModule.default;
				const htmlWorker = htmlWorkerModule.default;
				const typescriptWorker = typescriptWorkerModule.default;
				(globalThis as typeof globalThis & { MonacoEnvironment?: MonacoEnvironment }).MonacoEnvironment = {
					getWorker: (_moduleId: string, label: string): Worker => {
						if (label === "json") return new jsonWorker();
						if (label === "css" || label === "scss" || label === "less") return new cssWorker();
						if (label === "html" || label === "handlebars" || label === "razor") return new htmlWorker();
						if (label === "typescript" || label === "javascript") return new typescriptWorker();
						return new editorWorker();
					}
				};
				const monaco: MonacoApi = monacoModule;
				monacoRef.current = monaco;
				const editor: MonacoNamespace.editor.IStandaloneCodeEditor = monaco.editor.create(container, {
					automaticLayout: true,
					ariaLabel: t("files.editorAriaLabel"),
					autoIndent: "full",
					bracketPairColorization: { enabled: true },
					cursorBlinking: "smooth",
					fontFamily: getEditorFontFamily(container),
					fontSize: 13,
					lineHeight: 22,
					lineNumbers: "on",
					minimap: { enabled: false },
					padding: { top: 12, bottom: 24 },
					renderWhitespace: "selection",
					scrollBeyondLastLine: false,
					tabSize: 4,
					wordWrap: "off",
					theme: document.documentElement.dataset.theme === "light" ? "vs" : "vs-dark"
				});
				editorRef.current = editor;
				setMonacoReady(true);
				setEditorGeneration((generation: number): number => generation + 1);
				const updateTheme = (): void => {
					monaco.editor.setTheme(document.documentElement.dataset.theme === "light" ? "vs" : "vs-dark");
				};
				themeObserver = new MutationObserver(updateTheme);
				themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
			} catch (error: unknown) {
				if (!disposed) setMonacoError(String(error));
			}
		};
		void initialize();
		return (): void => {
			disposed = true;
			themeObserver?.disconnect();
			editorRef.current?.dispose();
			editorRef.current = null;
			monacoRef.current = null;
			for (const model of modelsRef.current.values()) model.dispose();
			modelsRef.current.clear();
		};
	}, [editorContainerNode, t]);

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
				savedContent: content,
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
			RUNTIME_BUFFERS.set(runtimeKey, next);
			setBuffers((current) => ({ ...current, [tab.key]: next }));
		} catch (error: unknown) {
			setBuffers((current) => ({ ...current, [tab.key]: { ...(current[tab.key] ?? createEmptyBuffer()), loading: false, error: String(error) } }));
		}
	}, [panelKey, sessionId, sourceFolders]);

	useEffect((): void => {
		for (const tab of layout.tabs) void loadBuffer(tab);
	}, [layout.tabs, loadBuffer]);

	useEffect((): void => {
		const editor: MonacoNamespace.editor.IStandaloneCodeEditor | null = editorRef.current;
		const monaco: MonacoApi | null = monacoRef.current;
		if (editor === null || monaco === null || !monacoReady) return;
		if (activeTab === null || activeBuffer === null || activeBuffer.loading || !activeBuffer.readable) {
			if (editor.getModel() !== null) editor.setModel(null);
			setSelection(null);
			return;
		}
		let model: MonacoNamespace.editor.ITextModel | undefined = modelsRef.current.get(activeTab.key);
		if (model === undefined || model.isDisposed()) {
			const tabKey: string = activeTab.key;
			model = monaco.editor.createModel(
				activeBuffer.content,
				getMonacoLanguage(monaco, activeTab.relativePath),
				createMonacoModelUri(monaco, panelKey, activeTab)
			);
			model.onDidChangeContent((): void => {
				if (suppressModelChangeRef.current) return;
				const nextContent: string = model?.getValue() ?? "";
				setBuffers((current) => {
					const currentBuffer: FileBuffer | undefined = current[tabKey];
					if (currentBuffer === undefined || currentBuffer.content === nextContent) return current;
					const next: FileBuffer = { ...currentBuffer, content: nextContent };
					RUNTIME_BUFFERS.set(getBufferKey(sessionId, panelKey, activeTab), next);
					return { ...current, [tabKey]: next };
				});
			});
			modelsRef.current.set(activeTab.key, model);
		}
		if (model.getValue() !== activeBuffer.content) {
			suppressModelChangeRef.current = true;
			model.setValue(activeBuffer.content);
			suppressModelChangeRef.current = false;
		}
		if (editor.getModel() !== model) editor.setModel(model);
	}, [activeBuffer, activeTab, editorGeneration, monacoReady, panelKey, sessionId]);

	useEffect((): void => {
		if (selectedSourceFolder === null || layout.selectedSourceFolderId === selectedSourceFolder.id) return;
		patchLayout({ selectedSourceFolderId: selectedSourceFolder.id });
	}, [layout.selectedSourceFolderId, patchLayout, selectedSourceFolder]);

	const loadRoot = useCallback(async (): Promise<void> => {
		if (selectedSourceFolder === null) {
			setTreeData([]);
			return;
		}
		try {
			const result = await window.electronAPI.workspaceFs.listChildren({ workspaceRoot: selectedSourceFolder.path });
			setTreeData(result.entries.map(createTreeNode));
			setLoadedKeys([]);
		} catch (error: unknown) {
			void messageApi.error(String(error));
		}
	}, [messageApi, selectedSourceFolder]);

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
		if (replaceIndex >= 0) nextTabs.splice(replaceIndex, 1, nextTab);
		else nextTabs.push(nextTab);
		patchLayout({ tabs: nextTabs, activeTabKey: key, previewTabKey: previewKey });
	}, [layout.previewTabKey, layout.tabs, patchLayout, selectedSourceFolder]);

	const removeTab = useCallback((tab: FileTabPreferences): void => {
		const index: number = layout.tabs.findIndex((candidate: FileTabPreferences): boolean => candidate.key === tab.key);
		const nextTabs: FileTabPreferences[] = layout.tabs.filter((candidate: FileTabPreferences): boolean => candidate.key !== tab.key);
		patchLayout({
			tabs: nextTabs,
			activeTabKey: layout.activeTabKey === tab.key ? nextTabs[Math.max(0, index - 1)]?.key ?? nextTabs[0]?.key ?? null : layout.activeTabKey,
			previewTabKey: layout.previewTabKey === tab.key ? null : layout.previewTabKey
		});
	}, [layout.activeTabKey, layout.previewTabKey, layout.tabs, patchLayout]);

	const closeTab = useCallback((tab: FileTabPreferences): void => {
		const buffer: FileBuffer | undefined = buffers[tab.key];
		if (buffer !== undefined && buffer.content !== buffer.savedContent) {
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
			const next: FileBuffer = { ...buffer, savedContent: buffer.content, sha256: result.sha256, modifiedAtMs: result.modifiedAtMs, byteSize: result.byteSize, saving: false, conflict: false };
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

	const updateSelection = useCallback((): void => {
		const editor: MonacoNamespace.editor.IStandaloneCodeEditor | null = editorRef.current;
		const model: MonacoNamespace.editor.ITextModel | null = editor?.getModel() ?? null;
		const range: MonacoNamespace.Selection | null = editor?.getSelection() ?? null;
		if (editor === null || model === null || activeBuffer === null || activeTab === null || range === null || range.isEmpty()) {
			setSelection(null);
			setCommenting(false);
			return;
		}
		const start: number = model.getOffsetAt(range.getStartPosition());
		const end: number = Math.min(model.getOffsetAt(range.getEndPosition()), start + MAX_SELECTION_CHARS);
		const selectedText: string = activeBuffer.content.slice(start, end);
		if (selectedText.length === 0) return;
		const startPosition: MonacoNamespace.Position = model.getPositionAt(start);
		const endPosition: MonacoNamespace.Position = model.getPositionAt(end);
		const anchorPosition = editor.getScrolledVisiblePosition(startPosition);
		const editorNode: HTMLElement | null = editor.getDomNode();
		const anchor = {
			top: Math.max(8, (anchorPosition?.top ?? 38) - 38),
			left: Math.min(Math.max(8, anchorPosition?.left ?? 8), Math.max(8, (editorNode?.clientWidth ?? 240) - 240))
		};
		setSelection({
			start,
			end,
			text: selectedText,
			lineStart: startPosition.lineNumber,
			lineEnd: endPosition.lineNumber,
			columnStart: startPosition.column,
			columnEnd: endPosition.column,
			top: anchor.top,
			left: anchor.left
		});
	}, [activeBuffer, activeTab]);

	useEffect((): (() => void) | undefined => {
		const editor: MonacoNamespace.editor.IStandaloneCodeEditor | null = editorRef.current;
		if (editor === null) return undefined;
		const selectionDisposable = editor.onDidChangeCursorSelection(updateSelection);
		const scrollDisposable = editor.onDidScrollChange(updateSelection);
		const layoutDisposable = editor.onDidLayoutChange(updateSelection);
		window.addEventListener("resize", updateSelection);
		return (): void => {
			selectionDisposable.dispose();
			scrollDisposable.dispose();
			layoutDisposable.dispose();
			window.removeEventListener("resize", updateSelection);
		};
	}, [activeTab?.key, editorGeneration, monacoReady, updateSelection]);

	useEffect((): void => {
		const dirtyUnpinnedTab: FileTabPreferences | undefined = layout.tabs.find((tab: FileTabPreferences): boolean => {
			const buffer: FileBuffer | undefined = buffers[tab.key];
			return !tab.pinned && buffer !== undefined && buffer.content !== buffer.savedContent;
		});
		if (dirtyUnpinnedTab === undefined) return;
		patchLayout({
			previewTabKey: layout.previewTabKey === dirtyUnpinnedTab.key ? null : layout.previewTabKey,
			tabs: layout.tabs.map((tab: FileTabPreferences): FileTabPreferences => tab.key === dirtyUnpinnedTab.key ? { ...tab, pinned: true } : tab)
		});
	}, [buffers, layout.previewTabKey, layout.tabs, patchLayout]);

	const addSelectionContext = useCallback((comment: string): void => {
		if (selection === null || activeTab === null || workspace === null) return;
		const resourcePath: string = `res://${normalizeRelativePath(activeTab.relativePath)}`;
		onAddContext({
			id: createContextId(),
			kind: "file_selection",
			title: getFileName(activeTab.relativePath),
			subtitle: `${resourcePath}:${selection.lineStart}-${selection.lineEnd}`,
			pinned: false,
			source: "manual",
			resourcePath,
			data: {
				selectedText: selection.text,
				annotation: comment.trim(),
				lineStart: selection.lineStart,
				lineEnd: selection.lineEnd,
				columnStart: selection.columnStart,
				columnEnd: selection.columnEnd,
				workspaceId: workspace.id,
				sourceFolderId: activeTab.sourceFolderId,
				relativePath: normalizeRelativePath(activeTab.relativePath)
			}
		});
		setSelection(null);
		setCommenting(false);
		setAnnotation("");
		void messageApi.success(t("files.contextAdded"));
	}, [activeTab, messageApi, onAddContext, selection, t, workspace]);

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

	const titleRender: TreeProps<FileTreeNode>["titleRender"] = useCallback((node: FileTreeNode): React.ReactNode => (
		<Dropdown menu={menuForEntry(node.entry)} trigger={["contextMenu"]}>
			<span className={styles.treeTitle} onDoubleClick={(): void => openEntry(node.entry, true)}>{node.entry.name}</span>
		</Dropdown>
	), [menuForEntry, openEntry]);

	const loadData = useCallback(async (node: FileTreeNode): Promise<void> => {
		if (selectedSourceFolder === null || node.entry.kind !== "folder") return;
		const result = await window.electronAPI.workspaceFs.listChildren({ workspaceRoot: selectedSourceFolder.path, relativePath: node.entry.relativePath });
		setTreeData((current: FileTreeNode[]): FileTreeNode[] => replaceTreeChildren(current, node.key, result.entries.map(createTreeNode)));
		setLoadedKeys((current: React.Key[]): React.Key[] => current.includes(node.key) ? current : [...current, node.key]);
	}, [selectedSourceFolder]);

	useEffect((): (() => void) => {
		if (layout.tabs.length === 0) return (): void => undefined;
		const timer: number = window.setInterval((): void => {
			for (const tab of layout.tabs) {
				const sourceFolder: WorkspaceSourceFolder | undefined = sourceFolders.find((folder: WorkspaceSourceFolder): boolean => folder.id === tab.sourceFolderId);
				const buffer: FileBuffer | undefined = buffers[tab.key];
				if (sourceFolder === undefined || buffer === undefined || buffer.loading || buffer.saving || !buffer.readable) continue;
				void window.electronAPI.workspaceFs.statFile({ workspaceRoot: sourceFolder.path, filePath: tab.relativePath }).then((revision): void => {
					if (revision.sha256 === buffer.sha256 && revision.modifiedAtMs === buffer.modifiedAtMs) return;
					if (buffer.content === buffer.savedContent) void loadBuffer(tab, true);
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
		const dirty: boolean = buffer !== undefined && buffer.content !== buffer.savedContent;
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
									<div className={styles.editor}>
										<div ref={editorContainerRef} className={styles.monacoEditor} aria-label={t("files.editorAriaLabel")} />
										{monacoError !== null ? <Alert className={styles.editorError} type="error" showIcon title={monacoError} /> : null}
										{selection !== null ? <div className={styles.selectionTools} style={{ top: selection.top, left: selection.left }} onMouseDown={(event): void => event.preventDefault()}>
											{commenting
												? <Input
													autoFocus
													size="small"
													maxLength={1200}
													value={annotation}
													placeholder={t("files.commentPlaceholder")}
													onChange={(event): void => setAnnotation(event.target.value)}
													onKeyDown={(event): void => {
														if (event.key === "Enter") addSelectionContext(annotation);
														else if (event.key === "Escape") {
															setCommenting(false); setAnnotation("");
														}
													}} />
												: <Space.Compact>
													<Button
														onClick={(): void => addSelectionContext("")}
													>
														{t("files.addSelectionContext")}
													</Button>
													<Button
														onClick={(): void => setCommenting(true)}
													>
														{t("files.comment")}
													</Button>
												</Space.Compact>}
										</div> : null}
									</div>
								</>
							)}
						</div>
					</Splitter.Panel>
					{layout.sidebarOpen ? <Splitter.Panel min={`${100 - FILE_PANEL_MAX_EDITOR_SPLIT}%`} size={`${100 - editorSplitSize}%`}>
						<aside className={styles.sidebar}>
							<div className={styles.sidebarControls}>
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
								<Divider className={styles.divider} />
								<Input
									allowClear
									prefix={<Icon name="search" />}
									suffix={searching ? <Spin size="small" /> : null}
									value={search}
									placeholder={t("files.search")}
									onChange={(event): void => setSearch(event.target.value)}
								/>
							</div>
							<Tree<FileTreeNode>
								showIcon
														showLine
														blockNode
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
														expandedKeys={search.trim().length > 0 ? [] : layout.expandedPathsBySourceFolder[selectedSourceFolder?.id ?? ""] ?? []}
										loadData={loadData}
										switcherIcon={null}
										titleRender={titleRender}
									onLoad={(keys): void => setLoadedKeys(keys)}
								onExpand={(keys): void => {
									if (selectedSourceFolder !== null) patchLayout({ expandedPathsBySourceFolder: { ...layout.expandedPathsBySourceFolder, [selectedSourceFolder.id]: keys.map(String) } });
								}}
														onSelect={(_keys, info): void => {
															if (info.node.entry.kind === "file") openEntry(info.node.entry, false);
															}}
							/>
						</aside>
					</Splitter.Panel> : null}
				</Splitter>
			</div>
			<Modal open={pendingClose !== null} title={t("files.closeTitle")} closable={false} maskClosable={false} footer={[
				<Button key="cancel" onClick={(): void => setPendingClose(null)}>{t("files.cancel")}</Button>,
				<Button key="discard" onClick={(): void => { const tab = pendingClose?.tab; setPendingClose(null); if (tab !== undefined) { const buffer = buffers[tab.key]; if (buffer !== undefined) { const next = { ...buffer, content: buffer.savedContent }; RUNTIME_BUFFERS.set(getBufferKey(sessionId, panelKey, tab), next); setBuffers((current) => ({ ...current, [tab.key]: next })); } removeTab(tab); } }}>{t("files.discard")}</Button>,
				<Button key="save" type="primary" onClick={(): void => { const tab = pendingClose?.tab; if (tab !== undefined) void saveTab(tab).then((saved: boolean): void => { if (saved) { setPendingClose(null); removeTab(tab); } }); }}>{t("files.save")}</Button>
			]}>{pendingClose?.dirty ? t("files.closeDirty", { name: pendingClose.tab.relativePath }) : null}</Modal>
		</div>
	);
}

export default FilePanel;

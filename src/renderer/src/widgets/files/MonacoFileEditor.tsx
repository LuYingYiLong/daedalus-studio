import { Alert, Button, Input, message, Space } from "antd";
import type * as MonacoNamespace from "monaco-editor";
import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type { FileTabPreferences } from "@/domain/session/session-layout";
import { createContextId } from "@/features/workspace/controllers/context-helpers";
import type { AdditionalContextItem, WorkspaceConfig } from "@/platform/rpc/types";
import styles from "./MonacoFileEditor.module.css";

export type FileBuffer = {
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

type MonacoApi = typeof MonacoNamespace;

type MonacoEnvironment = {
	getWorker: (_moduleId: string, label: string) => Worker;
};

type DaedalusThemeName = "daedalus-light" | "daedalus-dark";

type SelectionRange = {
	text: string;
	lineStart: number;
	lineEnd: number;
	columnStart: number;
	columnEnd: number;
	top: number;
	left: number;
};

type MonacoFileEditorProps = {
	activeTab: FileTabPreferences | null;
	activeBuffer: FileBuffer | null;
	panelKey: string;
	workspace: WorkspaceConfig | null;
	bottomSafeArea: number;
	onContentChange: (tab: FileTabPreferences, content: string) => void;
	onAddContext: (item: AdditionalContextItem) => void;
};

const MAX_SELECTION_CHARS: number = 8000;

function normalizeRelativePath(path: string): string {
	return path.replaceAll("\\", "/").replace(/^\/+|\/+$/gu, "");
}

function getFileName(path: string): string {
	return normalizeRelativePath(path).split("/").at(-1) ?? path;
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

function createMonacoModelUri(monaco: MonacoApi, panelKey: string, tab: FileTabPreferences): MonacoNamespace.Uri {
	return monaco.Uri.parse(`daedalus://file/${encodeURIComponent(`${panelKey}/${tab.sourceFolderId}/${tab.relativePath}`)}`);
}

function getEditorFontFamily(container: HTMLElement): string {
	const fontFamily: string = getComputedStyle(container).fontFamily.trim();
	return fontFamily.length > 0 ? fontFamily : "SFMono-Regular, Consolas, 'Liberation Mono', monospace";
}

function getDaedalusThemeName(): DaedalusThemeName {
	return document.documentElement.dataset.theme === "light" ? "daedalus-light" : "daedalus-dark";
}

function defineDaedalusThemes(monaco: MonacoApi): void {
	monaco.editor.defineTheme("daedalus-light", {
		base: "vs",
		inherit: true,
		rules: [],
		colors: {
			"editorWidget.background": "#ffffff",
			"editorWidget.foreground": "#1f2937",
			"editorWidget.border": "#d9d9d9",
			"editorWidget.resizeBorder": "#9ca3af",
			"input.background": "#ffffff",
			"input.foreground": "#1f2937",
			"input.border": "#d9d9d9",
			"input.placeholderForeground": "#9ca3af",
			"inputOption.activeBackground": "#e8f1ff",
			"inputOption.activeForeground": "#2563eb",
			"inputOption.activeBorder": "#4f8cff",
			"inputOption.hoverBackground": "#f1f5f9",
			"editor.findMatchBackground": "#ffd84d66",
			"editor.findMatchHighlightBackground": "#ffd84d33",
			"editor.findMatchBorder": "#d6a700",
			"editor.findMatchHighlightBorder": "#d6a700",
			"editorOverviewRuler.findMatchForeground": "#d6a700",
		}
	});
	monaco.editor.defineTheme("daedalus-dark", {
		base: "vs-dark",
		inherit: true,
		rules: [],
		colors: {
			"editorWidget.background": "#202124",
			"editorWidget.foreground": "#f3f4f6",
			"editorWidget.border": "#4b5563",
			"editorWidget.resizeBorder": "#6b7280",
			"input.background": "#292a2d",
			"input.foreground": "#f3f4f6",
			"input.border": "#4b5563",
			"input.placeholderForeground": "#9ca3af",
			"inputOption.activeBackground": "#263b63",
			"inputOption.activeForeground": "#93c5fd",
			"inputOption.activeBorder": "#60a5fa",
			"inputOption.hoverBackground": "#374151",
			"editor.findMatchBackground": "#eab30866",
			"editor.findMatchHighlightBackground": "#eab30833",
			"editor.findMatchBorder": "#facc15",
			"editor.findMatchHighlightBorder": "#facc15",
			"editorOverviewRuler.findMatchForeground": "#facc15",
		}
	});
}

export function MonacoFileEditor({
	activeTab,
	activeBuffer,
	panelKey,
	workspace,
	bottomSafeArea,
	onContentChange,
	onAddContext
}: MonacoFileEditorProps): React.JSX.Element {
	const { t } = useTranslation();
	const [messageApi, messageHolder] = message.useMessage();
	const [editorContainerNode, setEditorContainerNode] = useState<HTMLDivElement | null>(null);
	const editorContainerRef = useCallback((node: HTMLDivElement | null): void => setEditorContainerNode(node), []);
	const monacoRef = useRef<MonacoApi | null>(null);
	const editorRef = useRef<MonacoNamespace.editor.IStandaloneCodeEditor | null>(null);
	const modelsRef = useRef<Map<string, MonacoNamespace.editor.ITextModel>>(new Map());
	const suppressModelChangeRef = useRef<boolean>(false);
	const [monacoReady, setMonacoReady] = useState<boolean>(false);
	const [editorGeneration, setEditorGeneration] = useState<number>(0);
	const [monacoError, setMonacoError] = useState<string | null>(null);
	const [selection, setSelection] = useState<SelectionRange | null>(null);
	const [commenting, setCommenting] = useState<boolean>(false);
	const [annotation, setAnnotation] = useState<string>("");

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
				defineDaedalusThemes(monaco);
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
					find: {
						addExtraSpaceOnTop: true,
						autoFindInSelection: "never",
						seedSearchStringFromSelection: "selection",
						loop: true
					},
					theme: getDaedalusThemeName()
				});
				editorRef.current = editor;
				setMonacoReady(true);
				setEditorGeneration((generation: number): number => generation + 1);
				const updateTheme = (): void => {
					monaco.editor.setTheme(getDaedalusThemeName());
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
			setMonacoReady(false);
			for (const model of modelsRef.current.values()) model.dispose();
			modelsRef.current.clear();
		};
	}, [editorContainerNode, t]);

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
			const tab: FileTabPreferences = activeTab;
			model = monaco.editor.createModel(
				activeBuffer.content,
				getMonacoLanguage(monaco, tab.relativePath),
				createMonacoModelUri(monaco, panelKey, tab)
			);
			model.onDidChangeContent((): void => {
				if (suppressModelChangeRef.current) return;
				onContentChange(tab, model?.getValue() ?? "");
			});
			modelsRef.current.set(tab.key, model);
		}
		if (model.getValue() !== activeBuffer.content) {
			suppressModelChangeRef.current = true;
			model.setValue(activeBuffer.content);
			suppressModelChangeRef.current = false;
		}
		if (editor.getModel() !== model) editor.setModel(model);
	}, [activeBuffer, activeTab, editorGeneration, monacoReady, onContentChange, panelKey]);

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
		setSelection({
			text: selectedText,
			lineStart: startPosition.lineNumber,
			lineEnd: endPosition.lineNumber,
			columnStart: startPosition.column,
			columnEnd: endPosition.column,
			top: Math.max(8, (anchorPosition?.top ?? 38) - 38),
			left: Math.min(Math.max(8, anchorPosition?.left ?? 8), Math.max(8, (editorNode?.clientWidth ?? 240) - 240))
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

	return (
		<div className={styles.editor} style={bottomSafeArea > 0 ? { bottom: bottomSafeArea } : undefined}>
			{messageHolder}
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
								setCommenting(false);
								setAnnotation("");
							}
						}}
					/> 
					: <Space.Compact>
						<Button onClick={(): void => addSelectionContext("")}>{t("files.addSelectionContext")}</Button>
						<Button onClick={(): void => setCommenting(true)}>{t("files.comment")}</Button>
					</Space.Compact>}
			</div> : null}
		</div>
	);
}

export default MonacoFileEditor;

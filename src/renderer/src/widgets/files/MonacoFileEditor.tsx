import { Alert, Button, Dropdown, Input, message, Space } from "antd";
import type { MenuProps } from "antd";
import type * as MonacoNamespace from "monaco-editor";
import { useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type { FileTabPreferences } from "@/domain/session/session-layout";
import { createContextId } from "@/features/workspace/controllers/context-helpers";
import { copyTextToClipboard, readTextFromClipboard } from "@/platform/electron/clipboard";
import type { AdditionalContextItem, WorkspaceConfig } from "@/platform/rpc/types";
import { Icon } from "@/assets/icons";
import styles from "./MonacoFileEditor.module.css";

export type FileBuffer = {
	content: string;
	savedContent?: string;
	isDirty: boolean;
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
	mediaUrl?: string;
	mediaMimeType?: string;
	mediaKind?: "image" | "audio" | "video";
};

type MonacoApi = typeof MonacoNamespace;

type MonacoEnvironment = {
	getWorker: (_moduleId: string, label: string) => Worker;
};

type MonacoWorkerConstructor = new () => Worker;

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

type ContextMenuPosition = {
	left: number;
	top: number;
};

type MonacoFileEditorProps = {
	activeTab: FileTabPreferences | null;
	activeBuffer: FileBuffer | null;
	tabKeys: string[];
	panelKey: string;
	workspace: WorkspaceConfig | null;
	bottomSafeArea: number;
	onContentChange: (tab: FileTabPreferences, content: string) => void;
	onAddContext: (item: AdditionalContextItem) => void;
	editorHandleRef?: React.Ref<MonacoFileEditorHandle>;
	ariaLabel?: string;
	readOnly?: boolean;
	enableSelectionTools?: boolean;
};

export type MonacoFileEditorHandle = {
	format: () => Promise<void>;
	focus: () => void;
};

const MAX_SELECTION_CHARS: number = 8000;
const MONACO_TOOLTIP_DELAY_MS: number = 1000;
const FIND_WIDGET_BUTTON_SELECTOR: string = ".find-widget .button, .find-widget .codicon-find-selection, .find-widget .monaco-custom-toggle";

async function loadLanguageWorker(label: string): Promise<MonacoWorkerConstructor | null> {
	switch (label) {
		case "json":
			return (await import("../../../../../node_modules/monaco-editor/esm/vs/language/json/json.worker.js?worker")).default;
		case "css":
		case "scss":
		case "less":
			return (await import("../../../../../node_modules/monaco-editor/esm/vs/language/css/css.worker.js?worker")).default;
		case "html":
		case "handlebars":
		case "razor":
			return (await import("../../../../../node_modules/monaco-editor/esm/vs/language/html/html.worker.js?worker")).default;
		case "typescript":
		case "javascript":
			return (await import("../../../../../node_modules/monaco-editor/esm/vs/language/typescript/ts.worker.js?worker")).default;
		default:
			return null;
	}
}

const LANGUAGE_WORKER_CONSTRUCTORS: Map<string, MonacoWorkerConstructor> = new Map();
const LANGUAGE_WORKER_PROMISES: Map<string, Promise<void>> = new Map();

function ensureLanguageWorkerLoaded(label: string): Promise<void> {
	if (LANGUAGE_WORKER_CONSTRUCTORS.has(label)) return Promise.resolve();
	const existingPromise: Promise<void> | undefined = LANGUAGE_WORKER_PROMISES.get(label);
	if (existingPromise !== undefined) return existingPromise;
	const promise: Promise<void> = loadLanguageWorker(label).then((constructor: MonacoWorkerConstructor | null): void => {
		if (constructor !== null) LANGUAGE_WORKER_CONSTRUCTORS.set(label, constructor);
	}).finally((): void => {
		LANGUAGE_WORKER_PROMISES.delete(label);
	});
	LANGUAGE_WORKER_PROMISES.set(label, promise);
	return promise;
}

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

function findFindWidgetButton(target: EventTarget | null, container: HTMLElement): HTMLElement | null {
	if (!(target instanceof Element)) return null;
	const button: Element | null = target.closest(FIND_WIDGET_BUTTON_SELECTOR);
	return button instanceof HTMLElement && container.contains(button) ? button : null;
}

function installDelayedFindWidgetTooltips(container: HTMLElement, delayMs: number): () => void {
	const tooltip: HTMLDivElement = document.createElement("div");
	tooltip.className = styles.findTooltip;
	tooltip.setAttribute("role", "tooltip");
	tooltip.hidden = true;
	document.body.appendChild(tooltip);
	let activeButton: HTMLElement | null = null;
	let timer: number | null = null;
	let animationFrame: number | null = null;

	const hideTooltip = (): void => {
		if (timer !== null) window.clearTimeout(timer);
		timer = null;
		if (animationFrame !== null) window.cancelAnimationFrame(animationFrame);
		animationFrame = null;
		activeButton = null;
		tooltip.classList.remove(styles.findTooltipVisible);
		tooltip.style.visibility = "hidden";
		tooltip.hidden = true;
	};

	const positionTooltip = (button: HTMLElement): void => {
		const buttonRect: DOMRect = button.getBoundingClientRect();
		const tooltipWidth: number = tooltip.offsetWidth;
		const tooltipHeight: number = tooltip.offsetHeight;
		const horizontalPadding: number = 8;
		const left: number = Math.min(
			Math.max(horizontalPadding, buttonRect.left + (buttonRect.width - tooltipWidth) / 2),
			Math.max(horizontalPadding, window.innerWidth - tooltipWidth - horizontalPadding)
		);
		const preferredTop: number = buttonRect.bottom + 8;
		const top: number = preferredTop + tooltipHeight <= window.innerHeight - horizontalPadding
			? preferredTop
			: Math.max(horizontalPadding, buttonRect.top - tooltipHeight - 8);
		tooltip.style.left = `${left}px`;
		tooltip.style.top = `${top}px`;
	};

	const showTooltip = (button: HTMLElement): void => {
		const label: string = button.getAttribute("aria-label")?.trim() ?? "";
		if (label.length === 0 || activeButton !== button) return;
		tooltip.textContent = label;
		tooltip.hidden = false;
		tooltip.style.visibility = "hidden";
		positionTooltip(button);
		animationFrame = window.requestAnimationFrame((): void => {
			if (activeButton !== button) return;
			tooltip.style.visibility = "visible";
			tooltip.classList.add(styles.findTooltipVisible);
		});
	};

	const scheduleTooltip = (button: HTMLElement): void => {
		if (activeButton === button && (timer !== null || !tooltip.hidden)) return;
		hideTooltip();
		activeButton = button;
		timer = window.setTimeout((): void => {
			timer = null;
			showTooltip(button);
		}, delayMs);
	};

	const onMouseOver = (event: MouseEvent): void => {
		const button: HTMLElement | null = findFindWidgetButton(event.target, container);
		if (button === null) return;
		if (event.relatedTarget instanceof Node && button.contains(event.relatedTarget)) return;
		event.stopPropagation();
		scheduleTooltip(button);
	};
	const onMouseOut = (event: MouseEvent): void => {
		const button: HTMLElement | null = findFindWidgetButton(event.target, container);
		if (button === null) return;
		if (event.relatedTarget instanceof Node && button.contains(event.relatedTarget)) return;
		event.stopPropagation();
		hideTooltip();
	};
	const onFocus = (event: FocusEvent): void => {
		const button: HTMLElement | null = findFindWidgetButton(event.target, container);
		if (button === null) return;
		event.stopPropagation();
		scheduleTooltip(button);
	};
	const onBlur = (event: FocusEvent): void => {
		const button: HTMLElement | null = findFindWidgetButton(event.target, container);
		if (button === null) return;
		event.stopPropagation();
		hideTooltip();
	};
	const onResize = (): void => {
		if (activeButton !== null && !tooltip.hidden) positionTooltip(activeButton);
	};

	container.addEventListener("mouseover", onMouseOver, true);
	container.addEventListener("mouseout", onMouseOut, true);
	container.addEventListener("focus", onFocus, true);
	container.addEventListener("blur", onBlur, true);
	window.addEventListener("resize", onResize);
	return (): void => {
		container.removeEventListener("mouseover", onMouseOver, true);
		container.removeEventListener("mouseout", onMouseOut, true);
		container.removeEventListener("focus", onFocus, true);
		container.removeEventListener("blur", onBlur, true);
		window.removeEventListener("resize", onResize);
		hideTooltip();
		tooltip.remove();
	};
}

export function MonacoFileEditor({
	activeTab,
	activeBuffer,
	tabKeys,
	panelKey,
	workspace,
	bottomSafeArea,
	onContentChange,
	onAddContext,
	editorHandleRef,
	ariaLabel,
	readOnly = false,
	enableSelectionTools = true
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
	const [contextMenuPosition, setContextMenuPosition] = useState<ContextMenuPosition | null>(null);
	const contextMenuSelectionRef = useRef<MonacoNamespace.Selection | null>(null);
	const ensureLanguageWorker = useCallback((label: string): Promise<void> => ensureLanguageWorkerLoaded(label), []);

	useImperativeHandle(editorHandleRef, (): MonacoFileEditorHandle => ({
		format: async (): Promise<void> => {
			await editorRef.current?.getAction("editor.action.formatDocument")?.run();
		},
		focus: (): void => editorRef.current?.focus()
	}), []);

	useEffect((): (() => void) | undefined => {
		const container: HTMLDivElement | null = editorContainerNode;
		if (container === null) return undefined;
		let disposed: boolean = false;
		let themeObserver: MutationObserver | null = null;
		let fontObserver: MutationObserver | null = null;
		let disposeFindWidgetTooltips: (() => void) | null = null;
		const initialize = async (): Promise<void> => {
			try {
				setMonacoError(null);
				const [monacoModule, editorWorkerModule] = await Promise.all([
					import("monaco-editor"),
					import("../../../../../node_modules/monaco-editor/esm/vs/editor/editor.worker.js?worker")
				]);
				if (disposed) return;
				const editorWorker = editorWorkerModule.default;
				(globalThis as typeof globalThis & { MonacoEnvironment?: MonacoEnvironment }).MonacoEnvironment = {
					getWorker: (_moduleId: string, label: string): Worker => {
						const workerConstructor: MonacoWorkerConstructor = LANGUAGE_WORKER_CONSTRUCTORS.get(label) ?? editorWorker;
						return new workerConstructor();
					}
				};
				const monaco: MonacoApi = monacoModule;
				monacoRef.current = monaco;
				defineDaedalusThemes(monaco);
				const editor: MonacoNamespace.editor.IStandaloneCodeEditor = monaco.editor.create(container, {
					automaticLayout: true,
					ariaLabel: ariaLabel ?? t("files.editorAriaLabel"),
					autoIndent: "full",
					bracketPairColorization: { enabled: true },
					contextmenu: false,
					cursorBlinking: "smooth",
					fontFamily: getEditorFontFamily(container),
					fontSize: 13,
					lineHeight: 22,
					lineNumbers: "on",
					minimap: { enabled: false },
					readOnly,
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
				disposeFindWidgetTooltips = installDelayedFindWidgetTooltips(container, MONACO_TOOLTIP_DELAY_MS);
				setMonacoReady(true);
				setEditorGeneration((generation: number): number => generation + 1);
				const updateTheme = (): void => {
					monaco.editor.setTheme(getDaedalusThemeName());
				};
				themeObserver = new MutationObserver(updateTheme);
				themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
				fontObserver = new MutationObserver((): void => {
					editor.updateOptions({ fontFamily: getEditorFontFamily(container) });
				});
				fontObserver.observe(document.documentElement, { attributes: true, attributeFilter: ["style"] });
			} catch (error: unknown) {
				if (!disposed) setMonacoError(String(error));
			}
		};
		void initialize();
		return (): void => {
			disposed = true;
			disposeFindWidgetTooltips?.();
			disposeFindWidgetTooltips = null;
			themeObserver?.disconnect();
			fontObserver?.disconnect();
			editorRef.current?.dispose();
			editorRef.current = null;
			monacoRef.current = null;
			setMonacoReady(false);
			for (const model of modelsRef.current.values()) model.dispose();
			modelsRef.current.clear();
		};
	}, [ariaLabel, editorContainerNode, t]);

	useEffect((): void => {
		editorRef.current?.updateOptions({ readOnly });
	}, [readOnly]);

	useEffect((): void => {
		const openTabKeys: Set<string> = new Set(tabKeys);
		for (const [key, model] of modelsRef.current) {
			if (!openTabKeys.has(key)) {
				model.dispose();
				modelsRef.current.delete(key);
			}
		}
	}, [tabKeys]);

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
			void ensureLanguageWorker(getMonacoLanguage(monaco, tab.relativePath));
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
	}, [activeBuffer, activeTab, editorGeneration, ensureLanguageWorker, monacoReady, onContentChange, panelKey]);

	const updateSelection = useCallback((): void => {
		if (!enableSelectionTools) {
			setSelection(null);
			return;
		}
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
	}, [activeBuffer, activeTab, enableSelectionTools]);

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
		if (!enableSelectionTools || selection === null || activeTab === null || workspace === null) return;
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
	}, [activeTab, enableSelectionTools, messageApi, onAddContext, selection, t, workspace]);

	const handleEditorContextMenu = useCallback((event: React.MouseEvent<HTMLDivElement>): void => {
		const editor: MonacoNamespace.editor.IStandaloneCodeEditor | null = editorRef.current;
		if (editor === null || editor.getModel() === null || editorContainerNode === null) return;
		event.preventDefault();
		event.stopPropagation();
		contextMenuSelectionRef.current = editor.getSelection();
		const editorRect: DOMRect = editorContainerNode.getBoundingClientRect();
		setContextMenuPosition({
			left: Math.max(0, event.clientX - editorRect.left),
			top: Math.max(0, event.clientY - editorRect.top)
		});
	}, [editorContainerNode]);

	const handleEditorContextMenuAction: MenuProps["onClick"] = useCallback(({ key }): void => {
		setContextMenuPosition(null);
		const editor: MonacoNamespace.editor.IStandaloneCodeEditor | null = editorRef.current;
		const model: MonacoNamespace.editor.ITextModel | null = editor?.getModel() ?? null;
		if (editor === null || model === null) return;

		const savedSelection: MonacoNamespace.Selection | null = contextMenuSelectionRef.current;
		const currentSelection: MonacoNamespace.Selection | null = savedSelection ?? editor.getSelection();
		if (currentSelection !== null) editor.setSelection(currentSelection);
		editor.focus();
		contextMenuSelectionRef.current = null;

		switch (String(key)) {
			case "undo":
				editor.trigger("contextmenu", "undo", null);
				break;
			case "redo":
				editor.trigger("contextmenu", "redo", null);
				break;
			case "selectAll": {
				const fullRange: MonacoNamespace.Range = model.getFullModelRange();
				editor.setSelection(fullRange);
				editor.revealRangeInCenter(fullRange);
				break;
			}
			case "copy": {
				if (currentSelection === null || currentSelection.isEmpty()) break;
				const text: string = model.getValueInRange(currentSelection);
				void copyTextToClipboard(text).catch((error: unknown): void => {
					console.error("Failed to copy editor selection.", error);
				});
				break;
			}
			case "cut": {
				if (currentSelection === null || currentSelection.isEmpty()) break;
				const text: string = model.getValueInRange(currentSelection);
				void copyTextToClipboard(text).then((): void => {
					if (editor.getModel() !== model || model.isDisposed()) return;
					editor.pushUndoStop();
					editor.executeEdits("context-menu", [{ range: currentSelection, text: "", forceMoveMarkers: true }]);
					editor.pushUndoStop();
				}).catch((error: unknown): void => {
					console.error("Failed to cut editor selection.", error);
				});
				break;
			}
			case "paste": {
				const pasteSelection: MonacoNamespace.Selection | null = currentSelection;
				void readTextFromClipboard().then((text: string): void => {
					if (editor.getModel() !== model || model.isDisposed() || pasteSelection === null) return;
					editor.setSelection(pasteSelection);
					editor.pushUndoStop();
					editor.executeEdits("context-menu", [{ range: pasteSelection, text, forceMoveMarkers: true }]);
					editor.pushUndoStop();
					editor.focus();
				}).catch((error: unknown): void => {
					console.error("Failed to paste into editor.", error);
				});
				break;
			}
			default:
				break;
		}
	}, []);

	const editorContextMenu: MenuProps = useMemo((): MenuProps => ({
		items: [
			{ key: "undo", label: t("files.editorMenu.undo"), icon: <Icon name="undo" /> },
			{ key: "redo", label: t("files.editorMenu.redo"), icon: <Icon name="redo" /> },
			{ type: "divider" },
			{ key: "cut", label: t("files.editorMenu.cut") },
			{ key: "copy", label: t("files.editorMenu.copy") },
			{ key: "paste", label: t("files.editorMenu.paste") },
			{ type: "divider" },
			{ key: "selectAll", label: t("files.editorMenu.selectAll") }
		],
		onClick: handleEditorContextMenuAction
	}), [handleEditorContextMenuAction, t]);

	return (
		<div className={styles.editor} style={bottomSafeArea > 0 ? { bottom: bottomSafeArea } : undefined} onContextMenu={handleEditorContextMenu}>
			{messageHolder}
			{contextMenuPosition !== null ? <Dropdown
				open={true}
				menu={editorContextMenu}
				placement="bottomLeft"
				onOpenChange={(open: boolean): void => {
					if (!open) {
						setContextMenuPosition(null);
						contextMenuSelectionRef.current = null;
					}
				}}
			>
				<span
					className={styles.contextMenuAnchor}
					style={{ left: contextMenuPosition.left, top: contextMenuPosition.top }}
					aria-hidden="true"
				/>
			</Dropdown> : null}
			<div ref={editorContainerRef} className={styles.monacoEditor} aria-label={ariaLabel ?? t("files.editorAriaLabel")} />
			{monacoError !== null ? <Alert className={styles.editorError} type="error" showIcon title={monacoError} /> : null}
			{enableSelectionTools && selection !== null ? <div className={styles.selectionTools} style={{ top: selection.top, left: selection.left }} onMouseDown={(event): void => event.preventDefault()}>
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

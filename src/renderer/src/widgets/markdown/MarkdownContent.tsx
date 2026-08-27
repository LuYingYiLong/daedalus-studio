import { App, Button, Tooltip } from "antd";
import Markdown, { type Components } from "react-markdown";
import rehypeKatex from "rehype-katex";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import type { StrictFunction } from "katex";
import { Icon } from "@/assets/icons";
import { copyTextToClipboard } from "@/platform/electron/clipboard";
import hljs from "highlight.js";
import { memo, useEffect, useLayoutEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import styles from "./MarkdownContent.module.css";
import { MarkdownLink } from "./MarkdownResourceLink";
import { transformMarkdownUrl } from "@/domain/markdown/markdown-url-transform";
import { getFileExtensionForLanguage, normalizeHighlightLanguage as normalizeMarkdownHighlightLanguage } from "@/domain/markdown/file-icon";
import { useTimelineScrollFrameCoordinator } from "@/features/conversation/timeline-scroll-frame-context";
import { getPlatformRuntime } from "@/platform/runtime/platform-runtime";
import MermaidBlock from "./MermaidBlock";
import "highlight.js/styles/github-dark.css";
import "katex/dist/katex.min.css";

export type MarkdownContentProps = {
	children: string;
	streaming?: boolean;
	stickyCodeHeaders?: boolean; // 让代码块标题在所在滚动容器顶部吸附，方便持续使用复制按钮，默认关闭
};

type CodeBlockProps = {
	code: string;
	language: string;
	highlight: boolean;
	stickyHeader: boolean;
};

const MAX_HIGHLIGHT_CACHE_ENTRIES: number = 128;
const MAX_HIGHLIGHT_CACHE_SOURCE_CHARS: number = 1_500_000;
type HighlightCacheEntry = { html: string | null; sourceChars: number };
const highlightCache: Map<string, HighlightCacheEntry> = new Map();
let highlightCacheSourceChars: number = 0;

function normalizeHighlightLanguage(language: string): string {
	return normalizeMarkdownHighlightLanguage(language);
}

function highlightCode(code: string, language: string): string | null {
	const normalizedLanguage: string = normalizeHighlightLanguage(language);
	const cacheKey: string = `${normalizedLanguage}\u0000${code}`;
	const cached: HighlightCacheEntry | undefined = highlightCache.get(cacheKey);
	if (cached !== undefined) {
		highlightCache.delete(cacheKey);
		highlightCache.set(cacheKey, cached);
		return cached.html;
	}
	const html: string | null = hljs.getLanguage(normalizedLanguage) !== undefined
		? hljs.highlight(code, { language: normalizedLanguage }).value
		: null;
	if (code.length <= MAX_HIGHLIGHT_CACHE_SOURCE_CHARS) {
		const entry: HighlightCacheEntry = { html, sourceChars: code.length };
		highlightCache.set(cacheKey, entry);
		highlightCacheSourceChars += entry.sourceChars;
		while (highlightCache.size > MAX_HIGHLIGHT_CACHE_ENTRIES || highlightCacheSourceChars > MAX_HIGHLIGHT_CACHE_SOURCE_CHARS) {
			const oldest: [string, HighlightCacheEntry] | undefined = highlightCache.entries().next().value;
			if (oldest === undefined) {
				break;
			}
			highlightCache.delete(oldest[0]);
			highlightCacheSourceChars -= oldest[1].sourceChars;
		}
	}
	return html;
}

function formatLanguageLabel(language: string): string {
	if (language.length === 0 || language === "text" || language === "plain" || language === "plaintext") {
		return "Text";
	}

	if (language.length <= 4) {
		return language.toUpperCase();
	}

	return `${language.charAt(0).toUpperCase()}${language.slice(1)}`;
}

function findScrollContainer(element: HTMLElement): HTMLElement | null {
	let current: HTMLElement | null = element.parentElement;
	while (current !== null) {
		const overflowY: string = window.getComputedStyle(current).overflowY;
		if (overflowY === "auto" || overflowY === "scroll" || overflowY === "overlay") {
			return current;
		}
		current = current.parentElement;
	}
	return null;
}

function useStickyCodeHeader(enabled: boolean): {
	blockRef: React.RefObject<HTMLDivElement | null>;
	headerRef: React.RefObject<HTMLDivElement | null>;
	isPinned: boolean;
} {
	const blockRef = useRef<HTMLDivElement | null>(null);
	const headerRef = useRef<HTMLDivElement | null>(null);
	const [isPinned, setIsPinned] = useState<boolean>(false);
	const scrollFrameCoordinator = useTimelineScrollFrameCoordinator();

	useLayoutEffect((): (() => void) | void => {
		if (!enabled) {
			setIsPinned(false);
			return;
		}

		const block: HTMLDivElement | null = blockRef.current;
		const header: HTMLDivElement | null = headerRef.current;
		if (block === null || header === null) {
			return;
		}

		const scrollContainer: HTMLElement | null = findScrollContainer(block);
		const updatePinnedState = (): void => {
			const blockRect: DOMRect = block.getBoundingClientRect();
			const headerHeight: number = header.getBoundingClientRect().height;
			const containerTop: number = scrollContainer?.getBoundingClientRect().top ?? 0;
			const nextPinned: boolean = blockRect.top < containerTop && blockRect.bottom > containerTop + headerHeight;
			setIsPinned((currentPinned: boolean): boolean => currentPinned === nextPinned ? currentPinned : nextPinned);
		};
		const scheduleUpdate = (): void => {
			if (scrollFrameCoordinator === null) {
				updatePinnedState();
				return;
			}
			scrollFrameCoordinator.schedule();
		};
		const unsubscribe = scrollFrameCoordinator?.subscribe("sticky_code_header", updatePinnedState);
		const resizeObserver: ResizeObserver | null = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(scheduleUpdate);
		resizeObserver?.observe(block);
		if (scrollContainer !== null) {
			resizeObserver?.observe(scrollContainer);
		}
		window.addEventListener("resize", scheduleUpdate);
		updatePinnedState();
		scheduleUpdate();

		return (): void => {
			resizeObserver?.disconnect();
			unsubscribe?.();
			window.removeEventListener("resize", scheduleUpdate);
		};
	}, [enabled, scrollFrameCoordinator]);

	return { blockRef, headerRef, isPinned };
}

function CodeBlock({ code, language, highlight, stickyHeader }: CodeBlockProps): React.JSX.Element {
	const { message } = App.useApp();
	const { t } = useTranslation();
	const label: string = formatLanguageLabel(language);
	const highlightedCode: string | null = highlight ? highlightCode(code, language) : null;
	const { blockRef, headerRef, isPinned } = useStickyCodeHeader(stickyHeader);
	const fileExtension: string = getFileExtensionForLanguage(language);
	const saveText = getPlatformRuntime().system?.saveText;

	const exportCodeAsFile = (): void => {
		if (saveText === undefined) return;
		void saveText({
			defaultFileName: `snippet.${fileExtension}`,
			content: code
		}).then((result): void => {
			if (result.saved) {
				message.success(t("chat.codeBlock.exported"));
			}
		}).catch((error: unknown): void => {
			console.error("[MarkdownContent] code export failed", error);
			message.error(t("chat.codeBlock.exportFailed"));
		});
	};

	return (
		<div ref={blockRef} className={styles.codeBlock}>
			<div
				ref={headerRef}
				className={stickyHeader ? styles.codeHeaderSticky : undefined}
				data-code-header-pinned={stickyHeader && isPinned ? "true" : undefined}
			>
				<div className={styles.codeHeader} data-chat-search-ignore="true" data-message-selection-ignore="true">
					<div className={styles.codeTitle}>
						<span>{label}</span>
					</div>
					<div className={styles.codeActions}>
						{saveText === undefined ? null : <Tooltip title={t("chat.codeBlock.exportAsFile")}>
							<Button
								type="text"
								shape="circle"
								className={styles.codeAction}
								aria-label={t("chat.codeBlock.exportAsFile")}
								icon={<Icon name="download" />}
								onClick={exportCodeAsFile}
							/>
						</Tooltip>}
						<Tooltip title={t("chat.codeBlock.copy")}>
							<Button
								type="text"
								shape="circle"
								className={styles.codeAction}
								aria-label={t("chat.codeBlock.copy")}
								icon={<Icon name="copy" />}
								onClick={(): void => {
									void copyTextToClipboard(code).catch((error: unknown): void => {
										console.error("[MarkdownContent] code copy failed", error);
									});
								}}
							/>
						</Tooltip>
					</div>
				</div>
			</div>
			<div className={styles.codeScroller}>
				{highlightedCode === null ? (
					<code className={styles.code}>{code}</code>
				) : (
					<code
						className={styles.code}
						dangerouslySetInnerHTML={{ __html: highlightedCode }}
					/>
				)}
			</div>
		</div>
	);
}

const MemoizedCodeBlock = memo(CodeBlock);
const MARKDOWN_REMARK_PLUGINS = [remarkGfm, remarkMath];
const MARKDOWN_KATEX_STRICT_HANDLER: StrictFunction = (errorCode: string): "ignore" | "warn" => {
	// KaTeX can render CJK text with its fallback glyphs, but reports it as
	// LaTeX-incompatible when a model places the text inside math delimiters.
	// Keep other strict diagnostics visible so malformed formulas are still
	// actionable during development.
	return errorCode === "unicodeTextInMathMode" ? "ignore" : "warn";
};
const MARKDOWN_REHYPE_PLUGINS: Array<[typeof rehypeKatex, { strict: StrictFunction }]> = [[rehypeKatex, { strict: MARKDOWN_KATEX_STRICT_HANDLER }]];

function createMarkdownComponents(
	highlightCodeBlocks: boolean,
	stickyCodeHeaders: boolean,
	renderMermaidDiagrams: boolean
): Components {
	return {
		a: MarkdownLink,
		pre({ children, node: _node, ..._props }): React.JSX.Element {
			return <>{children}</>;
		},
		code({ children, className, node: _node, ...props }): React.JSX.Element {
			const classNames: string[] = className?.split(/\s+/u).filter(Boolean) ?? [];
			const isMath: boolean = classNames.some((name: string): boolean =>
				name === "language-math" || name === "math-inline" || name === "math-display"
			);
			if (isMath) {
				return (
					<code className={className} {...props}>
						{children}
					</code>
				);
			}

			const code: string = String(children).replace(/\n$/u, "");
			const language: string = /language-([\w-]+)/u.exec(className ?? "")?.[1] ?? "";
			const isBlock: boolean = language.length > 0 || code.includes("\n");

			if (renderMermaidDiagrams && language.toLowerCase() === "mermaid") {
				return <MermaidBlock source={code} />;
			}

			if (isBlock) {
				return <MemoizedCodeBlock code={code} language={language} highlight={highlightCodeBlocks} stickyHeader={stickyCodeHeaders} />;
			}

			return (
				<code className={className} {...props}>
					{children}
				</code>
			);
		}
	};
}

const MARKDOWN_COMPONENTS: Components = createMarkdownComponents(true, false, true);
const STICKY_MARKDOWN_COMPONENTS: Components = createMarkdownComponents(true, true, true);
const STREAMING_MARKDOWN_COMPONENTS: Components = createMarkdownComponents(false, false, false);
const STICKY_STREAMING_MARKDOWN_COMPONENTS: Components = createMarkdownComponents(false, true, false);

export function getStreamingMarkdownRenderIntervalMs(length: number): number {
	if (length < 4_000) {
		return 50;
	}
	if (length < 16_000) {
		return 80;
	}
	if (length < 48_000) {
		return 120;
	}
	return 180;
}

function useStreamingMarkdownSource(source: string, streaming: boolean): string {
	const [renderedSource, setRenderedSource] = useState<string>(source);
	const latestSourceRef = useRef<string>(source);
	const lastRenderedAtRef = useRef<number>(Date.now());

	useEffect((): (() => void) | void => {
		latestSourceRef.current = source;

		if (!streaming) {
			lastRenderedAtRef.current = Date.now();
			setRenderedSource((currentSource: string): string => currentSource === source ? currentSource : source);
			return;
		}

		if (source === renderedSource) {
			return;
		}

		const intervalMs: number = getStreamingMarkdownRenderIntervalMs(source.length);
		const elapsedMs: number = Date.now() - lastRenderedAtRef.current;
		const commitSource = (): void => {
			lastRenderedAtRef.current = Date.now();
			setRenderedSource(latestSourceRef.current);
		};
		const timeoutId: number = window.setTimeout(commitSource, Math.max(0, intervalMs - elapsedMs));

		return (): void => {
			window.clearTimeout(timeoutId);
		};
	}, [renderedSource, source, streaming]);

	return streaming ? renderedSource : source;
}

type RenderedMarkdownProps = {
	source: string;
	streaming: boolean;
	stickyCodeHeaders: boolean;
};

const RenderedMarkdown = memo(function RenderedMarkdown({ source, streaming, stickyCodeHeaders }: RenderedMarkdownProps): React.JSX.Element {
	const components: Components = streaming
		? (stickyCodeHeaders ? STICKY_STREAMING_MARKDOWN_COMPONENTS : STREAMING_MARKDOWN_COMPONENTS)
		: (stickyCodeHeaders ? STICKY_MARKDOWN_COMPONENTS : MARKDOWN_COMPONENTS);
	return (
		<Markdown
			remarkPlugins={MARKDOWN_REMARK_PLUGINS}
			rehypePlugins={MARKDOWN_REHYPE_PLUGINS}
			components={components}
			urlTransform={transformMarkdownUrl}
		>
			{source}
		</Markdown>
	);
});

function MarkdownContent({ children, streaming = false, stickyCodeHeaders = false }: MarkdownContentProps): React.JSX.Element {
	const renderedSource: string = useStreamingMarkdownSource(children, streaming);
	return <RenderedMarkdown source={renderedSource} streaming={streaming} stickyCodeHeaders={stickyCodeHeaders} />;
}

export default memo(MarkdownContent);

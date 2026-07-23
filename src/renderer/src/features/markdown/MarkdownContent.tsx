import { Button, Tooltip } from "antd";
import Markdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { Icon } from "@/assets/icons";
import { copyTextToClipboard } from "@/utils/clipboard";
import hljs from "highlight.js";
import { memo, useEffect, useRef, useState } from "react";
import styles from "./MarkdownContent.module.css";
import "highlight.js/styles/github-dark.css";

export type MarkdownContentProps = {
	children: string;
	streaming?: boolean;
};

type CodeBlockProps = {
	code: string;
	language: string;
	highlight: boolean;
};

const HIGHLIGHT_LANGUAGE_ALIASES: Record<string, string> = {
	gd: "gdscript",
	gds: "gdscript",
	sh: "bash",
	shell: "bash",
	ps1: "powershell",
	plain: "plaintext",
	text: "plaintext"
};

function normalizeHighlightLanguage(language: string): string {
	const normalized: string = language.trim().toLowerCase().replace(/^hljs-/u, "");
	return HIGHLIGHT_LANGUAGE_ALIASES[normalized] ?? normalized;
}

function highlightCode(code: string, language: string): string | null {
	const normalizedLanguage: string = normalizeHighlightLanguage(language);
	if (hljs.getLanguage(normalizedLanguage) !== undefined) {
		return hljs.highlight(code, { language: normalizedLanguage }).value;
	}
	return null;
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

function getCodeFileExtension(language: string): string {
	const normalized: string = language.toLowerCase();
	const extensions: Record<string, string> = {
		javascript: "js",
		typescript: "ts",
		tsx: "tsx",
		jsx: "jsx",
		json: "json",
		gdscript: "gd",
		python: "py",
		powershell: "ps1",
		shell: "sh",
		bash: "sh",
		html: "html",
		css: "css",
		markdown: "md",
		yaml: "yaml",
		yml: "yml"
	};

	return extensions[normalized] ?? (normalized.length > 0 ? normalized : "txt");
}

function CodeBlock({ code, language, highlight }: CodeBlockProps): React.JSX.Element {
	const label: string = formatLanguageLabel(language);
	const highlightedCode: string | null = highlight ? highlightCode(code, language) : null;

	return (
		<div className={styles.codeBlock}>
			<div className={styles.codeHeader}>
				<div className={styles.codeTitle}>
					<span>{label}</span>
				</div>
				<div className={styles.codeActions}>
					<Tooltip title="Copy code">
						<Button
							type="text"
							shape="circle"
							className={styles.codeAction}
							aria-label="Copy code"
							icon={<Icon name="copy" />}
							onClick={(): void => {
								void copyTextToClipboard(code);
							}}
						/>
					</Tooltip>
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
const MARKDOWN_REMARK_PLUGINS = [remarkGfm];

function createMarkdownComponents(highlightCodeBlocks: boolean): Components {
	return {
		pre({ children, node: _node, ..._props }): React.JSX.Element {
			return <>{children}</>;
		},
		code({ children, className, node: _node, ...props }): React.JSX.Element {
			const code: string = String(children).replace(/\n$/u, "");
			const language: string = /language-([\w-]+)/u.exec(className ?? "")?.[1] ?? "";
			const isBlock: boolean = language.length > 0 || code.includes("\n");

			if (isBlock) {
				return <MemoizedCodeBlock code={code} language={language} highlight={highlightCodeBlocks} />;
			}

			return (
				<code className={className} {...props}>
					{children}
				</code>
			);
		}
	};
}

const MARKDOWN_COMPONENTS: Components = createMarkdownComponents(true);
const STREAMING_MARKDOWN_COMPONENTS: Components = createMarkdownComponents(false);

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
};

const RenderedMarkdown = memo(function RenderedMarkdown({ source, streaming }: RenderedMarkdownProps): React.JSX.Element {
	return (
		<Markdown
			remarkPlugins={MARKDOWN_REMARK_PLUGINS}
			components={streaming ? STREAMING_MARKDOWN_COMPONENTS : MARKDOWN_COMPONENTS}
		>
			{source}
		</Markdown>
	);
});

function MarkdownContent({ children, streaming = false }: MarkdownContentProps): React.JSX.Element {
	const renderedSource: string = useStreamingMarkdownSource(children, streaming);
	return <RenderedMarkdown source={renderedSource} streaming={streaming} />;
}

export default memo(MarkdownContent);

import { Button, Tooltip } from "antd";
import Markdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { Icon } from "@/assets/icons";
import { copyTextToClipboard } from "@/utils/clipboard";
import styles from "./MarkdownContent.module.css";

export type MarkdownContentProps = {
	children: string;
};

type CodeBlockProps = {
	code: string;
	language: string;
};

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

function downloadCode(code: string, language: string): void {
	const extension: string = getCodeFileExtension(language);
	const blob: Blob = new Blob([code], { type: "text/plain;charset=utf-8" });
	const url: string = URL.createObjectURL(blob);
	const anchor: HTMLAnchorElement = document.createElement("a");
	anchor.href = url;
	anchor.download = `snippet.${extension}`;
	document.body.append(anchor);
	anchor.click();
	anchor.remove();
	URL.revokeObjectURL(url);
}

function CodeBlock({ code, language }: CodeBlockProps): React.JSX.Element {
	const label: string = formatLanguageLabel(language);

	return (
		<div className={styles.codeBlock}>
			<div className={styles.codeHeader}>
				<div className={styles.codeTitle}>
					<span className={styles.languageMark}>{"{}"}</span>
					<span>{label}</span>
				</div>
				<div className={styles.codeActions}>
					<Tooltip title="Copy code">
						<Button
							type="text"
							className={styles.codeAction}
							aria-label="Copy code"
							icon={<Icon name="copy" />}
							onClick={(): void => {
								void copyTextToClipboard(code);
							}}
						/>
					</Tooltip>
					<Tooltip title="Download code">
						<Button
							type="text"
							className={styles.codeAction}
							aria-label="Download code"
							icon={<Icon name="download" />}
							onClick={(): void => downloadCode(code, language)}
						/>
					</Tooltip>
				</div>
			</div>
			<div className={styles.codeScroller}>
				<code className={styles.code}>{code}</code>
			</div>
		</div>
	);
}

const markdownComponents: Components = {
	pre({ children, node: _node, ..._props }): React.JSX.Element {
		return <>{children}</>;
	},
	code({ children, className, node: _node, ...props }): React.JSX.Element {
		const code: string = String(children).replace(/\n$/u, "");
		const language: string = /language-([\w-]+)/u.exec(className ?? "")?.[1] ?? "";
		const isBlock: boolean = language.length > 0 || code.includes("\n");

		if (isBlock) {
			return <CodeBlock code={code} language={language} />;
		}

		return (
			<code className={className} {...props}>
				{children}
			</code>
		);
	}
};

function MarkdownContent({ children }: MarkdownContentProps): React.JSX.Element {
	return (
		<Markdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
			{children}
		</Markdown>
	);
}

export default MarkdownContent;

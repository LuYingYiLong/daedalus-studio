import { Button, Tooltip } from "antd";
import Markdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { Icon } from "@/assets/icons";
import { copyTextToClipboard } from "@/utils/clipboard";
import hljs from "highlight.js";
import styles from "./MarkdownContent.module.css";
import "highlight.js/styles/github-dark.css";

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

function CodeBlock({ code, language }: CodeBlockProps): React.JSX.Element {
	const label: string = formatLanguageLabel(language);

	const highlightedCode: string = language.length > 0
		? hljs.highlight(code, { language: language.replace(/^hljs/u, "") }).value
		: hljs.highlightAuto(code).value;

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
				<code
					className={styles.code}
					dangerouslySetInnerHTML={{ __html: highlightedCode }}
				/>
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

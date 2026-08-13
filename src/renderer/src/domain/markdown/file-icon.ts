export const HIGHLIGHT_LANGUAGE_ALIASES: Readonly<Record<string, string>> = {
	gd: "gdscript",
	gds: "gdscript",
	sh: "bash",
	shell: "bash",
	ps1: "powershell",
	plain: "plaintext",
	text: "plaintext",
};

const LANGUAGE_FILE_EXTENSIONS: Readonly<Record<string, string>> = {
	bash: "sh",
	c: "c",
	cpp: "cpp",
	csharp: "cs",
	css: "css",
	gdscript: "gd",
	go: "go",
	html: "html",
	java: "java",
	javascript: "js",
	json: "json",
	kotlin: "kt",
	lua: "lua",
	markdown: "md",
	perl: "pl",
	php: "php",
	powershell: "ps1",
	python: "py",
	ruby: "rb",
	rust: "rs",
	scss: "scss",
	shellsession: "sh",
	sql: "sql",
	swift: "swift",
	text: "txt",
	toml: "toml",
	tsx: "tsx",
	typescript: "ts",
	vue: "vue",
	xml: "xml",
	yaml: "yml",
	plaintext: "txt",
};

export function normalizeHighlightLanguage(language: string): string {
	const normalized: string = language.trim().toLowerCase().replace(/^hljs-/u, "");
	return HIGHLIGHT_LANGUAGE_ALIASES[normalized] ?? normalized;
}

export function getFileExtensionForLanguage(language: string): string {
	const normalized: string = normalizeHighlightLanguage(language);
	return LANGUAGE_FILE_EXTENSIONS[normalized] ?? (normalized.length > 0 && /^[a-z0-9]+$/u.test(normalized) ? normalized : "txt");
}

function getPathExtension(path: string | undefined): string {
	if (path === undefined) {
		return "";
	}

	const fileName: string = path.replaceAll("\\", "/").split("/").at(-1) ?? "";
	const dotIndex: number = fileName.lastIndexOf(".");
	return dotIndex < 0 ? "" : fileName.slice(dotIndex + 1).toLowerCase();
}

export function getFileIconName(path: string | undefined): string {
	switch (getPathExtension(path)) {
		case "rs":
			return "rust";
		case "py":
			return "python";
		case "ts":
			return "typescript";
		case "tsx":
		case "jsx":
			return "react";
		case "js":
			return "javascript";
		case "css":
			return "css";
		case "html":
		case "htm":
			return "html";
		case "txt":
			return "txt";
		case "php":
			return "php";
		case "cs":
			return "csharp";
		case "cpp":
		case "cc":
		case "cxx":
		case "hpp":
		case "hh":
			return "cpp";
		case "c":
		case "h":
			return "c";
		case "go":
			return "go";
		case "kt":
			return "kotlin";
		case "rb":
			return "ruby";
		case "vue":
			return "vue";
		case "sh":
		case "pash":
		case "zsh":
		case "ps1":
			return "shell";
		case "md":
			return "markdown";
		case "rst":
			return "restructuredtext";
		case "lua":
			return "lua";
		case "yml":
		case "yaml":
			return "yml";
		case "json":
		case "jsonl":
			return "json";
		case "sqlite":
		case "sql":
			return "sql";
		case "java":
			return "java";
		case "scss":
			return "scss";
		case "swift":
			return "swift";
		case "toml":
			return "toml";
		case "xml":
			return "xml";
		default:
			return "file";
	}
}

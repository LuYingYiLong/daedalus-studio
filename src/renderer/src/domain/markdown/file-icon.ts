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
		default:
			return "file";
	}
}

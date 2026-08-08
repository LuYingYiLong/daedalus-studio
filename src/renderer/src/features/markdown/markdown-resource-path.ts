export type MarkdownResourceRef = {
	kind: "file";
	absolutePath: string;
	displayPath: string;
	fileName: string;
	line?: number;
	column?: number;
};

function decodePath(value: string): string {
	try {
		return decodeURIComponent(value);
	} catch {
		return value;
	}
}

function normalizeLocalPath(value: string): string {
	const decoded: string = decodePath(value.trim());
	if (decoded.startsWith("\\\\")) {
		return `\\\\${decoded.slice(2).replaceAll("\\\\", "\\")}`;
	}

	return decoded.replaceAll("\\\\", "\\").replaceAll("/", "\\");
}

type MarkdownResourceLocation = {
	path: string;
	line?: number;
	column?: number;
};

function splitLineLocation(value: string): MarkdownResourceLocation {
	const decoded: string = decodePath(value.trim());
	const match: RegExpExecArray | null = /^(.+?):(\d+)(?::(\d+))?$/u.exec(decoded);
	if (match === null) {
		return { path: decoded };
	}

	const line: number = Number(match[2]);
	const column: number | undefined = match[3] === undefined ? undefined : Number(match[3]);
	if (!Number.isInteger(line) || line < 1 || (column !== undefined && (!Number.isInteger(column) || column < 1))) {
		return { path: decoded };
	}

	return { path: match[1], line, column };
}

function escapeRegExp(value: string): string {
	return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}

function isResourcePathLabel(label: string, resource: MarkdownResourceRef): boolean {
	const normalizedLabel: string = label.trim().replaceAll("/", "\\");
	const normalizedAbsolutePath: string = resource.absolutePath.replaceAll("/", "\\");
	if (normalizedLabel === normalizedAbsolutePath || normalizedLabel === resource.fileName) {
		return true;
	}
	const compactLocationPattern: RegExp = new RegExp(
		`^${escapeRegExp(resource.fileName)}:\\d+(?::\\d+)?$`,
		"iu"
	);
	if (compactLocationPattern.test(label.trim())) {
		return true;
	}
	const absoluteLocationPattern: RegExp = new RegExp(
		`^${escapeRegExp(normalizedAbsolutePath)}:\\d+(?::\\d+)?$`,
		"iu"
	);
	if (absoluteLocationPattern.test(normalizedLabel)) {
		return true;
	}

	const locationPattern: RegExp = new RegExp(
		`^${escapeRegExp(resource.fileName)}\\s+\\(lines?\\s+\\d+(?:\\s*[-\\u2013]\\s*\\d+)?(?:,\\s*columns?\\s+\\d+)?\\)$`,
		"iu"
	);
	return locationPattern.test(label.trim());
}

export function formatMarkdownResourceLabel(resource: MarkdownResourceRef, label?: string): string {
	const candidate: string = label?.trim() ?? "";
	if (candidate.length > 0 && !isResourcePathLabel(candidate, resource)) {
		return candidate;
	}
	if (resource.line === undefined) {
		return candidate.length > 0 ? candidate : resource.fileName;
	}
	if (resource.column === undefined) {
		return `${resource.fileName} (line ${resource.line})`;
	}
	return `${resource.fileName} (line ${resource.line}, column ${resource.column})`;
}

function parseFileUrl(href: string): string | null {
	if (!/^file:/iu.test(href)) {
		return null;
	}

	try {
		const url: URL = new URL(href);
		if (url.protocol !== "file:") {
			return null;
		}

		const pathname: string = decodePath(url.pathname);
		if (url.hostname.length > 0 && url.hostname !== "localhost") {
			return normalizeLocalPath(`\\\\${url.hostname}${pathname}`);
		}

		const windowsPath: string = /^[A-Za-z]:/u.test(pathname.slice(1)) ? pathname.slice(1) : pathname;
		return normalizeLocalPath(windowsPath);
	} catch {
		return null;
	}
}

export function parseMarkdownResourceHref(href: string | undefined): MarkdownResourceRef | null {
	if (href === undefined || href.trim().length === 0) {
		return null;
	}

	const fileUrlPath: string | null = parseFileUrl(href.trim());
	const location: MarkdownResourceLocation = splitLineLocation(fileUrlPath ?? href.trim());
	const candidatePath: string = location.path;
	const isWindowsAbsolute: boolean = /^[A-Za-z]:[\\/]/u.test(candidatePath);
	const isUncPath: boolean = /^\\\\/u.test(candidatePath);
	if (fileUrlPath === null && !isWindowsAbsolute && !isUncPath) {
		return null;
	}

	const absolutePath: string = normalizeLocalPath(candidatePath);
	const fileName: string = absolutePath.split("\\").at(-1) ?? absolutePath;
	return {
		kind: "file",
		absolutePath,
		displayPath: absolutePath,
		fileName,
		line: location.line,
		column: location.column
	};
}

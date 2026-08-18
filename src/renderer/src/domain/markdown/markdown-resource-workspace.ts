function normalizePathForCompare(value: string): string {
	const normalized: string = value.trim().replaceAll("\\", "/");
	const withoutTrailingSeparators: string = normalized.length > 1
		? normalized.replace(/\/+$/u, "")
		: normalized;
	return /^[A-Za-z]:\//u.test(withoutTrailingSeparators) || withoutTrailingSeparators.startsWith("//")
		? withoutTrailingSeparators.toLowerCase()
		: withoutTrailingSeparators;
}

function isPathInsideRoot(filePath: string, rootPath: string): boolean {
	const normalizedFilePath: string = normalizePathForCompare(filePath);
	const normalizedRootPath: string = normalizePathForCompare(rootPath);
	return normalizedFilePath === normalizedRootPath
		|| normalizedFilePath.startsWith(`${normalizedRootPath}/`);
}

export function resolveMarkdownResourceWorkspaceRoot(
	filePath: string,
	workspaceRoots: readonly string[],
): string | null {
	return workspaceRoots
		.filter((rootPath: string): boolean => isPathInsideRoot(filePath, rootPath))
		.sort((left: string, right: string): number => normalizePathForCompare(right).length - normalizePathForCompare(left).length)[0]
		?? null;
}

export function resolveWorkspaceProjectName(inputName: string, primarySourcePath: string): string {
	const explicitName: string = inputName.trim();
	if (explicitName.length > 0) {
		return explicitName;
	}

	const normalizedPath: string = primarySourcePath.trim().replace(/[\\/]+$/u, "");
	if (normalizedPath.length === 0) {
		return "";
	}

	const folderName: string = normalizedPath.split(/[\\/]/u).at(-1)?.trim() ?? "";
	// Windows 根目录（例如 C:\\）没有可用的文件夹名称。
	return /^[A-Za-z]:$/u.test(folderName) ? "" : folderName;
}

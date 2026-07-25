import type { AdditionalContextItem } from "@/api/types";

export type AdditionalContextDisplay = {
	iconName: string;
	title: string;
	meta: string;
	tooltip: string;
};

type SelectedPath = {
	kind?: string;
	resourcePath?: string;
};

const SCRIPT_EXTENSIONS: Set<string> = new Set(["gd", "cs", "shader", "gdshader", "glsl", "hlsl", "ts", "tsx", "js", "jsx", "py"]);

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function getDataRecord(item: AdditionalContextItem): Record<string, unknown> {
	return isRecord(item.data) ? item.data : {};
}

function getString(value: unknown): string {
	return typeof value === "string" ? value.trim() : "";
}

function getSelectedPaths(item: AdditionalContextItem): SelectedPath[] {
	const data: Record<string, unknown> = getDataRecord(item);
	const selectedPathsValue: unknown = data.selectedPaths;

	if (!Array.isArray(selectedPathsValue)) {
		return [];
	}

	return selectedPathsValue.flatMap((selectedPathValue: unknown): SelectedPath[] => {
		if (!isRecord(selectedPathValue)) {
			return [];
		}

		return [{
			kind: getString(selectedPathValue.kind),
			resourcePath: getString(selectedPathValue.resourcePath)
		}];
	});
}

function isScriptPath(resourcePath: string): boolean {
	const extensionIndex: number = resourcePath.lastIndexOf(".");

	if (extensionIndex < 0) {
		return false;
	}

	return SCRIPT_EXTENSIONS.has(resourcePath.slice(extensionIndex + 1).toLowerCase());
}

function getFilesystemSelectionMeta(item: AdditionalContextItem): string {
	const selectedPaths: SelectedPath[] = getSelectedPaths(item);

	if (selectedPaths.length === 0) {
		return item.subtitle ?? "Selection";
	}

	const fileCount: number = selectedPaths.filter((selectedPath: SelectedPath): boolean => selectedPath.kind === "file").length;
	const folderCount: number = selectedPaths.filter((selectedPath: SelectedPath): boolean => selectedPath.kind === "folder").length;
	const parts: string[] = [];

	if (fileCount > 0) {
		parts.push(`${fileCount} file${fileCount === 1 ? "" : "s"}`);
	}

	if (folderCount > 0) {
		parts.push(`${folderCount} folder${folderCount === 1 ? "" : "s"}`);
	}

	return parts.length > 0 ? parts.join(" · ") : `${selectedPaths.length} selected`;
}

function getIconName(item: AdditionalContextItem): string {
	if (item.kind === "folder") {
		return "folder";
	}

	if (item.kind === "script" || item.kind === "script_selection") {
		return "script";
	}

	if (item.kind === "file") {
		return item.resourcePath !== undefined && isScriptPath(item.resourcePath) ? "script" : "file";
	}

	if (item.kind === "filesystem_selection") {
		const selectedPaths: SelectedPath[] = getSelectedPaths(item);
		const hasFolder: boolean = selectedPaths.some((selectedPath: SelectedPath): boolean => selectedPath.kind === "folder");
		const onlyScripts: boolean = selectedPaths.length > 0 && selectedPaths.every((selectedPath: SelectedPath): boolean => {
			return selectedPath.kind === "file" && selectedPath.resourcePath !== undefined && isScriptPath(selectedPath.resourcePath);
		});

		if (hasFolder) {
			return "folder_browse";
		}

		return onlyScripts ? "script" : "file_browse";
	}

	if (item.kind === "scene") {
		return "scene_edit";
	}

	if (item.kind === "node") {
		return "node";
	}

	if (item.kind === "image") {
		return "file";
	}

	if (item.kind === "editor_selection") {
		return "read";
	}

	return "add";
}

function getMeta(item: AdditionalContextItem): string {
	if (item.kind === "filesystem_selection") {
		return getFilesystemSelectionMeta(item);
	}

	if (item.subtitle !== undefined && item.subtitle.trim().length > 0) {
		return item.subtitle.trim();
	}

	if (item.kind === "script_selection") {
		const data: Record<string, unknown> = getDataRecord(item);
		const lineStart: number = typeof data.lineStart === "number" ? data.lineStart : 0;
		const lineEnd: number = typeof data.lineEnd === "number" ? data.lineEnd : 0;

		if (lineStart > 0 && lineEnd > 0) {
			return lineStart === lineEnd ? `Line ${lineStart}` : `Lines ${lineStart}-${lineEnd}`;
		}
	}

	if (item.kind === "image") {
		const data: Record<string, unknown> = getDataRecord(item);
		const width: number = typeof data.width === "number" ? data.width : 0;
		const height: number = typeof data.height === "number" ? data.height : 0;

		if (width > 0 && height > 0) {
			return `${width}x${height}`;
		}
	}

	return item.kind.replaceAll("_", " ");
}

function getTooltipLines(item: AdditionalContextItem, meta: string): string[] {
	const lines: string[] = [item.title || "Context"];

	if (meta.length > 0) {
		lines.push(meta);
	}

	for (const value of [item.resourcePath, item.scriptPath, item.nodePath]) {
		if (value !== undefined && value.trim().length > 0 && !lines.includes(value.trim())) {
			lines.push(value.trim());
		}
	}

	if (item.kind === "filesystem_selection") {
		const selectedPaths: SelectedPath[] = getSelectedPaths(item);
		for (const selectedPath of selectedPaths.slice(0, 6)) {
			if (selectedPath.resourcePath !== undefined && selectedPath.resourcePath.length > 0) {
				lines.push(`${selectedPath.kind || "path"}: ${selectedPath.resourcePath}`);
			}
		}

		if (selectedPaths.length > 6) {
			lines.push(`... ${selectedPaths.length - 6} more`);
		}
	}

	if (item.pinned === true) {
		lines.push("Pinned");
	}

	return lines;
}

export function summarizeAdditionalContextItem(item: AdditionalContextItem): AdditionalContextDisplay {
	const meta: string = getMeta(item);
	const lines: string[] = getTooltipLines(item, meta);

	return {
		iconName: getIconName(item),
		title: item.title || "Context",
		meta,
		tooltip: lines.join("\n")
	};
}

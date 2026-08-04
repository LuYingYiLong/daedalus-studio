import type { TFunction } from "i18next";
import type { AdditionalContextItem } from "@/api/types";
import { getAdditionalContextIconName } from "./additional-context-icon";

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

function getFilesystemSelectionMeta(item: AdditionalContextItem, t: TFunction<"common">): string {
	const selectedPaths: SelectedPath[] = getSelectedPaths(item);

	if (selectedPaths.length === 0) {
		return item.subtitle ?? t("chat.contextStrip.display.selection");
	}

	const fileCount: number = selectedPaths.filter((selectedPath: SelectedPath): boolean => selectedPath.kind === "file").length;
	const folderCount: number = selectedPaths.filter((selectedPath: SelectedPath): boolean => selectedPath.kind === "folder").length;
	const parts: string[] = [];

	if (fileCount > 0) {
		parts.push(t("chat.contextStrip.display.fileCount", { count: fileCount }));
	}

	if (folderCount > 0) {
		parts.push(t("chat.contextStrip.display.folderCount", { count: folderCount }));
	}

	return parts.length > 0 ? parts.join(" · ") : t("chat.contextStrip.display.selectedCount", { count: selectedPaths.length });
}

function getMeta(item: AdditionalContextItem, t: TFunction<"common">): string {
	if (item.kind === "filesystem_selection") {
		return getFilesystemSelectionMeta(item, t);
	}

	if (item.subtitle !== undefined && item.subtitle.trim().length > 0) {
		return item.subtitle.trim();
	}

	if (item.kind === "script_selection") {
		const data: Record<string, unknown> = getDataRecord(item);
		const lineStart: number = typeof data.lineStart === "number" ? data.lineStart : 0;
		const lineEnd: number = typeof data.lineEnd === "number" ? data.lineEnd : 0;

		if (lineStart > 0 && lineEnd > 0) {
			return lineStart === lineEnd
				? t("chat.contextStrip.display.line", { line: lineStart })
				: t("chat.contextStrip.display.linesRange", { start: lineStart, end: lineEnd });
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

	if (item.kind === "text_attachment") {
		const data: Record<string, unknown> = getDataRecord(item);
		const byteSize: number = typeof data.byteSize === "number" ? data.byteSize : 0;
		return byteSize > 0 ? t("chat.contextStrip.display.fileSize", { size: Math.ceil(byteSize / 1024) }) : t("chat.contextStrip.display.textAttachment");
	}

	if (item.kind === "git_diff_comment") {
		const data: Record<string, unknown> = getDataRecord(item);
		const line: number = typeof data.newLine === "number" ? data.newLine : typeof data.oldLine === "number" ? data.oldLine : 0;
		return line > 0 ? t("chat.contextStrip.display.line", { line }) : t("chat.contextStrip.display.reviewComment");
	}

	if (item.kind === "message_selection") {
		return t("chat.contextStrip.display.selectedMessageText");
	}

	return item.kind.replaceAll("_", " ");
}

function getTooltipLines(item: AdditionalContextItem, meta: string, t: TFunction<"common">): string[] {
	const lines: string[] = [item.title || t("chat.contextStrip.display.contextFallback")];

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
				lines.push(t("chat.contextStrip.display.pathLabel", {
					kind: selectedPath.kind || t("chat.contextStrip.display.pathFallback"),
					path: selectedPath.resourcePath
				}));
			}
		}

		if (selectedPaths.length > 6) {
			lines.push(t("chat.contextStrip.display.more", { count: selectedPaths.length - 6 }));
		}
	}

	if (item.pinned === true) {
		lines.push(t("chat.contextStrip.pinned"));
	}

	return lines;
}

export function summarizeAdditionalContextItem(item: AdditionalContextItem, t: TFunction<"common">): AdditionalContextDisplay {
	const meta: string = getMeta(item, t);
	const lines: string[] = getTooltipLines(item, meta, t);

	return {
		iconName: getAdditionalContextIconName(item),
		title: item.title || t("chat.contextStrip.display.contextFallback"),
		meta,
		tooltip: lines.join("\n")
	};
}

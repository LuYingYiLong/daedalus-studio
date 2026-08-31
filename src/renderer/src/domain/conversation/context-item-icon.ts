import type { AdditionalContextItem } from "@/platform/rpc/types";
import { getFileIconName } from "@/domain/markdown/file-icon";

export function getAdditionalContextDataRecord(
	item: AdditionalContextItem,
): Record<string, unknown> {
	return typeof item.data === "object" && item.data !== null && !Array.isArray(item.data)
		? item.data as Record<string, unknown>
		: {};
}

function getItemPath(item: AdditionalContextItem): string | undefined {
	const data: Record<string, unknown> = getAdditionalContextDataRecord(item);
	return item.resourcePath ?? item.scriptPath ?? (typeof data.fileName === "string" ? data.fileName : undefined);
}

export function getAdditionalContextIconName(item: AdditionalContextItem): string {
	if (item.kind === "text_attachment") return "txt";
	if (item.kind === "folder") return "folder";
	if (item.kind === "filesystem_selection") {
		const selectedPaths: unknown = getAdditionalContextDataRecord(item).selectedPaths;
		if (Array.isArray(selectedPaths) && selectedPaths.some((entry: unknown): boolean => {
			return typeof entry === "object" && entry !== null && (entry as Record<string, unknown>).kind === "folder";
		})) return "folder_browse";
		return "file_browse";
	}
	if (item.kind === "scene") return "scene_edit";
	if (item.kind === "node") return "node";
	if (item.kind === "git_diff_comment") return "git-diff";
	if (item.kind === "message_selection") return "chat";
	if (item.kind === "file_selection") return getFileIconName(getItemPath(item));
	if (item.kind === "web_element") return "global";
	if (item.kind === "editor_selection") return "read";

	const fileIconName: string = getFileIconName(getItemPath(item));
	return fileIconName === "file" && (item.kind === "script" || item.kind === "script_selection")
		? "script"
		: fileIconName;
}

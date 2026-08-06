import { useRequest } from "ahooks";
import { Icon } from "@/assets/icons";
import { fetchImageAttachmentDataUrl } from "@/api/image-attachment-api";
import type { AdditionalContextItem } from "@/api/types";

type AdditionalContextIconProps = {
	item: AdditionalContextItem;
	className?: string;
};

function getDataRecord(item: AdditionalContextItem): Record<string, unknown> {
	return typeof item.data === "object" && item.data !== null && !Array.isArray(item.data)
		? item.data as Record<string, unknown>
		: {};
}

function getPathExtension(path: string | undefined): string {
	if (path === undefined) {
		return "";
	}
	const fileName: string = path.replaceAll("\\", "/").split("/").at(-1) ?? "";
	const dotIndex: number = fileName.lastIndexOf(".");
	return dotIndex < 0 ? "" : fileName.slice(dotIndex + 1).toLowerCase();
}

function getItemPath(item: AdditionalContextItem): string | undefined {
	const data: Record<string, unknown> = getDataRecord(item);
	return item.resourcePath ?? item.scriptPath ?? (typeof data.fileName === "string" ? data.fileName : undefined);
}

export function getAdditionalContextIconName(item: AdditionalContextItem): string {
	if (item.kind === "text_attachment") {
		return "txt";
	}
	if (item.kind === "folder") {
		return "folder";
	}
	if (item.kind === "filesystem_selection") {
		const selectedPaths: unknown = getDataRecord(item).selectedPaths;
		if (Array.isArray(selectedPaths) && selectedPaths.some((entry: unknown): boolean => {
			return typeof entry === "object" && entry !== null && (entry as Record<string, unknown>).kind === "folder";
		})) {
			return "folder_browse";
		}
		return "file_browse";
	}
	if (item.kind === "scene") {
		return "scene_edit";
	}
	if (item.kind === "node") {
		return "node";
	}
	if (item.kind === "git_diff_comment") {
		return "git-diff";
	}
	if (item.kind === "message_selection") {
		return "chat";
	}
	if (item.kind === "editor_selection") {
		return "read";
	}

	switch (getPathExtension(getItemPath(item))) {
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
			return item.kind === "script" || item.kind === "script_selection" ? "script" : "file";
	}
}

export function AdditionalContextIcon({ item, className }: AdditionalContextIconProps): React.JSX.Element | null {
	const data: Record<string, unknown> = getDataRecord(item);
	const thumbnailDataUrl: string = typeof data.thumbnailDataUrl === "string" ? data.thumbnailDataUrl : "";
	const attachmentId: string = item.kind === "image" && typeof data.attachmentId === "string" ? data.attachmentId : "";
	const { data: loadedImage } = useRequest(
		(): Promise<{ attachmentId: string; dataUrl: string }> => fetchImageAttachmentDataUrl(attachmentId),
		{
			ready: thumbnailDataUrl.length === 0 && attachmentId.length > 0,
			cacheKey: attachmentId.length > 0 ? `additional-context-image:${attachmentId}` : undefined,
			staleTime: 5 * 60 * 1000
		}
	);
	const imageDataUrl: string = thumbnailDataUrl || loadedImage?.dataUrl || "";
	if (imageDataUrl.length > 0) {
		return <img src={imageDataUrl} alt="" className={className} />;
	}
	return <Icon name={getAdditionalContextIconName(item)} className={className} />;
}

import { useRequest } from "ahooks";
import { Icon } from "@/assets/icons";
import { fetchImageAttachmentDataUrl } from "@/platform/rpc/image-attachment-api";
import type { AdditionalContextItem } from "@/platform/rpc/types";
import { getFileIconName } from "@/domain/markdown/file-icon";

type AdditionalContextIconProps = {
	item: AdditionalContextItem;
	className?: string;
};

function getDataRecord(item: AdditionalContextItem): Record<string, unknown> {
	return typeof item.data === "object" && item.data !== null && !Array.isArray(item.data)
		? item.data as Record<string, unknown>
		: {};
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

	const fileIconName: string = getFileIconName(getItemPath(item));
	return fileIconName === "file" && (item.kind === "script" || item.kind === "script_selection")
		? "script"
		: fileIconName;
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

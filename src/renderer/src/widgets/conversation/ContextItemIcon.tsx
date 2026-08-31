import { useRequest } from "ahooks";
import { Icon } from "@/assets/icons";
import { fetchImageAttachmentDataUrl } from "@/platform/rpc/image-attachment-api";
import type { AdditionalContextItem } from "@/platform/rpc/types";
import {
	getAdditionalContextDataRecord,
	getAdditionalContextIconName,
} from "@/domain/conversation/context-item-icon";

type AdditionalContextIconProps = {
	item: AdditionalContextItem;
	className?: string;
};

export function AdditionalContextIcon({ item, className }: AdditionalContextIconProps): React.JSX.Element | null {
	const data: Record<string, unknown> = getAdditionalContextDataRecord(item);
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

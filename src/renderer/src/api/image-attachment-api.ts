import { createBackendClient } from "./backend-client";
import type { AdditionalContextItem } from "./types";

export type SaveImageAttachmentParams = {
	sessionId: string;
	mimeType: "image/png" | "image/jpeg" | "image/webp" | "image/gif";
	dataUrl: string;
	byteSize: number;
	width?: number;
	height?: number;
	title?: string;
	sourcePath?: string;
};

export type SaveImageAttachmentResult = {
	attachment: AdditionalContextItem;
};

export async function saveImageAttachment(params: SaveImageAttachmentParams): Promise<SaveImageAttachmentResult> {
	const client = await createBackendClient();

	return client.request<SaveImageAttachmentResult>("attachment.image.save", params);
}

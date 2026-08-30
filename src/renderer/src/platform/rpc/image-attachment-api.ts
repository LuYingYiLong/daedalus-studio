import { createBackendClient } from "@/platform/rpc/transport/backend-client";
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

export type SaveTextAttachmentParams = {
	sessionId: string;
	content: string;
	title?: string;
};

export type SaveTextAttachmentResult = {
	attachment: AdditionalContextItem;
};

export type ImageAttachmentDataResult = {
	attachmentId: string;
	dataUrl: string;
};

export type TextAttachmentContentResult = {
	attachmentId: string;
	content: string;
};

export async function saveImageAttachment(
	params: SaveImageAttachmentParams,
	beforeSend?: () => void,
): Promise<SaveImageAttachmentResult> {
	const client = await createBackendClient();
	beforeSend?.();

	return client.request<SaveImageAttachmentResult>(
		"attachment.image.save",
		params,
	);
}

export async function saveTextAttachment(
	params: SaveTextAttachmentParams,
): Promise<SaveTextAttachmentResult> {
	const client = await createBackendClient();

	return client.request<SaveTextAttachmentResult>(
		"attachment.text.save",
		params,
	);
}

export async function fetchTextAttachmentContent(
	attachmentId: string,
): Promise<TextAttachmentContentResult> {
	const client = await createBackendClient();

	return client.request<TextAttachmentContentResult>("attachment.text.get", {
		attachmentId,
	});
}

export async function fetchImageAttachmentDataUrl(
	attachmentId: string,
): Promise<ImageAttachmentDataResult> {
	const client = await createBackendClient();

	return client.request<ImageAttachmentDataResult>("attachment.image.get", {
		attachmentId,
	});
}

import type { AdditionalContextItem } from "@/platform/rpc/types";
import type {
	SaveImageAttachmentParams,
	SaveImageAttachmentResult,
} from "@/platform/rpc/image-attachment-api";
import {
	getLocalPathForFile,
	readFileAsDataUrl,
	readImageDimensions,
	resolveSupportedImageMimeType,
} from "./context-helpers";

export type PreparedImage = Omit<SaveImageAttachmentParams, "sessionId">;
export type ImageImport = (
	image: PreparedImage,
	isCancelled?: () => boolean,
) => Promise<void>;

export function assertImageQuota(
	items: readonly AdditionalContextItem[],
	image: PreparedImage,
): void {
	if (
		!Number.isSafeInteger(image.byteSize) ||
		image.byteSize <= 0 ||
		image.byteSize > 5 * 1024 * 1024
	)
		throw new Error("image_import_size_limit");
	const images = items.filter((item) => item.kind === "image");
	if (images.length >= 3) throw new Error("image_import_count_limit");
	const bytes = images.reduce((sum, item) => {
		const data = item.data as { byteSize?: unknown } | undefined;
		return sum + (typeof data?.byteSize === "number" ? data.byteSize : 0);
	}, 0);
	if (bytes + image.byteSize > 12 * 1024 * 1024)
		throw new Error("image_import_total_limit");
}

export async function prepareImageFile(file: File): Promise<PreparedImage> {
	const mimeType = resolveSupportedImageMimeType(file);
	if (!mimeType) throw new Error("image_import_unsupported");
	assertImageQuota([], { mimeType, dataUrl: "", byteSize: file.size });
	const dataUrl = await readFileAsDataUrl(file, mimeType);
	const dimensions = await readImageDimensions(dataUrl);
	return {
		mimeType,
		dataUrl,
		byteSize: file.size,
		...dimensions,
		title: file.name,
		sourcePath: getLocalPathForFile(file) ?? undefined,
	};
}

export type ImageImportDependencies = {
	assertCurrent(): void;
	ensureSession(): Promise<string | null>;
	getSessionId(): string | null;
	getItems(): readonly AdditionalContextItem[];
	save(
		params: SaveImageAttachmentParams,
		assertCurrent: () => void,
	): Promise<SaveImageAttachmentResult>;
	commit(item: AdditionalContextItem, assertCurrent: () => void): Promise<void>;
};

// 调用方保留任务与原始草稿的绑定；临时会话只能由本次确认操作创建。
export function createImageImportTask(
	deps: ImageImportDependencies,
): ImageImport {
	let expectedSessionId = deps.getSessionId();
	let saved: {
		image: PreparedImage;
		attachment: AdditionalContextItem;
	} | null = null;
	return async (image, isCancelled = () => false): Promise<void> => {
		const assertCurrent = (): void => {
			deps.assertCurrent();
			if (isCancelled() || deps.getSessionId() !== expectedSessionId)
				throw new Error("image_import_scope_changed");
		};
		assertCurrent();
		assertImageQuota(deps.getItems(), image);
		if (expectedSessionId === null) {
			expectedSessionId = await deps.ensureSession();
		}
		assertCurrent();
		if (!expectedSessionId) throw new Error("image_import_no_session");
		assertImageQuota(deps.getItems(), image);
		if (saved?.image !== image) {
			const result = await deps.save(
				{ ...image, sessionId: expectedSessionId },
				assertCurrent,
			);
			saved = { image, attachment: result.attachment };
		}
		assertCurrent();
		assertImageQuota(deps.getItems(), image);
		await deps.commit(saved.attachment, assertCurrent);
		assertCurrent();
	};
}

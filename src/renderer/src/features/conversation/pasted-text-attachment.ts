import type { AdditionalContextItem } from "@/platform/rpc/types";

export const LONG_PASTED_TEXT_THRESHOLD = 256;

const PASTE_ANCHOR_CHARS = 128;

export type ComposerPasteOrigin = {
	version: 1;
	selectionStart: number;
	selectionEnd: number;
	prefix: string;
	selectedText: string;
	suffix: string;
};

export type PastedTextAttachmentInput = {
	content: string;
	origin: ComposerPasteOrigin;
};

export type ComposerTextRange = {
	start: number;
	end: number;
};

export function isLongPastedText(text: string): boolean {
	return text.trim().length > LONG_PASTED_TEXT_THRESHOLD;
}

export function createComposerPasteOrigin(value: string, selectionStart: number, selectionEnd: number): ComposerPasteOrigin {
	const start: number = Math.max(0, Math.min(selectionStart, value.length));
	const end: number = Math.max(start, Math.min(selectionEnd, value.length));
	return {
		version: 1,
		selectionStart: start,
		selectionEnd: end,
		prefix: value.slice(Math.max(0, start - PASTE_ANCHOR_CHARS), start),
		selectedText: value.slice(start, end),
		suffix: value.slice(end, end + PASTE_ANCHOR_CHARS)
	};
}

export function getComposerPasteOrigin(item: AdditionalContextItem): ComposerPasteOrigin | null {
	if (item.kind !== "text_attachment" || typeof item.data !== "object" || item.data === null || Array.isArray(item.data)) {
		return null;
	}
	const candidate: unknown = (item.data as Record<string, unknown>).composerPasteOrigin;
	if (typeof candidate !== "object" || candidate === null || Array.isArray(candidate)) {
		return null;
	}
	const record: Record<string, unknown> = candidate as Record<string, unknown>;
	if (
		record.version !== 1
		|| typeof record.selectionStart !== "number"
		|| typeof record.selectionEnd !== "number"
		|| typeof record.prefix !== "string"
		|| typeof record.selectedText !== "string"
		|| typeof record.suffix !== "string"
	) {
		return null;
	}
	return {
		version: 1,
		selectionStart: record.selectionStart,
		selectionEnd: record.selectionEnd,
		prefix: record.prefix,
		selectedText: record.selectedText,
		suffix: record.suffix
	};
}

function matchesOriginAt(value: string, origin: ComposerPasteOrigin, start: number): boolean {
	const end: number = start + origin.selectedText.length;
	return start >= 0
		&& end <= value.length
		&& value.slice(start, end) === origin.selectedText
		&& value.slice(Math.max(0, start - origin.prefix.length), start) === origin.prefix
		&& value.slice(end, end + origin.suffix.length) === origin.suffix;
}

export function resolveComposerPasteRange(value: string, origin: ComposerPasteOrigin): ComposerTextRange {
	const expectedStart: number = Math.max(0, Math.min(origin.selectionStart, value.length));
	if (matchesOriginAt(value, origin, expectedStart)) {
		return { start: expectedStart, end: expectedStart + origin.selectedText.length };
	}

	if (origin.prefix.length > 0 || origin.suffix.length > 0) {
		const candidates: number[] = [];
		for (let start = 0; start <= value.length; start += 1) {
			if (matchesOriginAt(value, origin, start)) {
				candidates.push(start);
				if (candidates.length > 1) {
					break;
				}
			}
		}
		if (candidates.length === 1) {
			return { start: candidates[0] as number, end: (candidates[0] as number) + origin.selectedText.length };
		}
	}

	// 锚点已因后续编辑失效时只插入，不删除无法确认仍属于原选区的文本
	return { start: expectedStart, end: expectedStart };
}

export function getTextAttachmentId(item: AdditionalContextItem): string | null {
	if (item.kind !== "text_attachment" || typeof item.data !== "object" || item.data === null || Array.isArray(item.data)) {
		return null;
	}
	const attachmentId: unknown = (item.data as Record<string, unknown>).attachmentId;
	return typeof attachmentId === "string" && attachmentId.length > 0 ? attachmentId : null;
}

import { describe, expect, it } from "vitest";
import type { AdditionalContextItem } from "@/platform/rpc/types";
import {
	LONG_PASTED_TEXT_THRESHOLD,
	createComposerPasteOrigin,
	getComposerPasteOrigin,
	isLongPastedText,
	resolveComposerPasteRange
} from "@/domain/conversation/pasted-text-attachment";

describe("pasted text attachments", () => {
	it("uses a 256 character long-text threshold", () => {
		expect(LONG_PASTED_TEXT_THRESHOLD).toBe(256);
		expect(isLongPastedText("a".repeat(256))).toBe(false);
		expect(isLongPastedText("a".repeat(257))).toBe(true);
	});

	it("restores text at its original selection", () => {
		const value = "before replace after";
		const origin = createComposerPasteOrigin(value, 7, 14);

		expect(resolveComposerPasteRange(value, origin)).toEqual({ start: 7, end: 14 });
	});

	it("relocates an origin after text is inserted before it", () => {
		const value = "before  after";
		const origin = createComposerPasteOrigin(value, 7, 7);

		expect(resolveComposerPasteRange(`prefix ${value}`, origin)).toEqual({ start: 14, end: 14 });
	});

	it("falls back to insertion without deleting text when the anchor is no longer reliable", () => {
		const origin = createComposerPasteOrigin("before replace after", 7, 14);

		expect(resolveComposerPasteRange("unrelated draft", origin)).toEqual({ start: 7, end: 7 });
	});

	it("reads persisted composer origin metadata", () => {
		const origin = createComposerPasteOrigin("draft", 2, 2);
		const item: AdditionalContextItem = {
			id: "text-1",
			kind: "text_attachment",
			title: "Pasted text",
			source: "manual",
			data: {
				attachmentId: "text-1",
				composerPasteOrigin: origin
			}
		};

		expect(getComposerPasteOrigin(item)).toEqual(origin);
	});
});

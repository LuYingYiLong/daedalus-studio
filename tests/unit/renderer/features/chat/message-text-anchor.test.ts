import { describe, expect, it } from "vitest";
import type { MessageTextAnchor } from "@/api/types";
import { getMessageAnchorKey, getMessageSelectionContextId } from "@/features/chat/message-text-anchor";

const anchor: MessageTextAnchor = {
	entryId: "assistant-1",
	requestId: "request-1",
	role: "assistant",
	segmentKey: "assistant:markdown:0",
	startOffset: 4,
	endOffset: 9,
	quote: "Godot",
	contextBefore: "Use ",
	contextAfter: " here"
};

describe("message text anchors", () => {
	it("creates stable context identities for the exact same selection", () => {
		expect(getMessageAnchorKey({ ...anchor })).toBe(getMessageAnchorKey(anchor));
		expect(getMessageSelectionContextId({ ...anchor })).toBe(getMessageSelectionContextId(anchor));
	});

	it("keeps adjacent selections independent", () => {
		const adjacent: MessageTextAnchor = { ...anchor, startOffset: 5, endOffset: 10 };
		expect(getMessageAnchorKey(adjacent)).not.toBe(getMessageAnchorKey(anchor));
		expect(getMessageSelectionContextId(adjacent)).not.toBe(getMessageSelectionContextId(anchor));
	});
});

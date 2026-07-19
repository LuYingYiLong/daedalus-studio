import { describe, expect, it } from "vitest";
import type { TimelineBlock } from "@/api/types";
import { shouldRenderTimelineBlock } from "@/features/chat/MessageList";

describe("MessageList", () => {
	it("filters completed empty assistant blocks before rendering", () => {
		const emptyAssistant: TimelineBlock = {
			id: "empty-assistant",
			type: "assistant",
			requestId: "request-a",
			content: "",
			startedAtUtc: "2026-07-19T00:00:00.000Z",
			completedAtUtc: "2026-07-19T00:00:01.000Z",
			bodyParts: []
		};
		const runningAssistant: TimelineBlock = {
			...emptyAssistant,
			id: "running-assistant",
			status: "running"
		};

		expect(shouldRenderTimelineBlock(emptyAssistant)).toBe(false);
		expect(shouldRenderTimelineBlock(runningAssistant)).toBe(true);
	});
});

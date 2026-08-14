import { describe, expect, it } from "vitest";
import type { TimelineBlock } from "@/platform/rpc/types";
import { getTimelineCopyText, shouldRenderTimelineBlock } from "@/widgets/conversation/MessageList";

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

	it("builds copy-all text from user and assistant visible message bodies", () => {
		const blocks: TimelineBlock[] = [
			{
				id: "divider-1",
				type: "divider",
				requestId: "request-1",
				createdAtUtc: "2026-07-18T23:59:59.000Z",
				dividerKind: "model_change",
				from: { provider: "openai", model: "gpt-a", label: "OpenAI/gpt-a" },
				to: { provider: "anthropic", model: "claude-b", label: "Anthropic/claude-b" }
			},
			{
				id: "user-1",
				type: "user",
				requestId: "request-1",
				content: "  Build a platformer.  ",
				sentAtUtc: "2026-07-19T00:00:00.000Z"
			},
			{
				id: "assistant-1",
				type: "assistant",
				requestId: "request-1",
				content: "",
				startedAtUtc: "2026-07-19T00:00:01.000Z",
				completedAtUtc: "2026-07-19T00:00:02.000Z",
				bodyParts: [
					{ type: "thinking", text: "Hidden reasoning", done: true },
					{ type: "markdown", text: "**Done.**" }
				]
			}
		];

		expect(getTimelineCopyText(blocks)).toBe("Build a platformer.\n\n**Done.**");
	});
});

import { describe, expect, it } from "vitest";
import type { TimelineBlock } from "@/platform/rpc/types";
import { timelineBlocksToSearchDocuments } from "@/features/conversation/useConversationSearch";

describe("conversation search documents", () => {
	it("indexes only the visible final Markdown after a summary marker", () => {
		const blocks: TimelineBlock[] = [{
			id: "assistant:req-summary",
			type: "assistant",
			requestId: "req-summary",
			content: "",
			startedAtUtc: "2026-08-02T00:00:00.000Z",
			completedAtUtc: "2026-08-02T00:00:01.000Z",
			bodyParts: [
				{ type: "markdown", text: "Hidden impact from the execution transcript." },
				{
					type: "summary_start",
					runId: "run-summary",
					stepId: "final",
					stepRunId: "summary-run",
					title: "Summary",
					foldTitle: "Process"
				},
				{ type: "markdown", text: "Visible impact in the final answer." }
			]
		}];

		expect(timelineBlocksToSearchDocuments(blocks, 4)).toEqual([{
			blockOffset: 4,
			requestId: "req-summary",
			role: "assistant",
			markdownSegments: ["Visible impact in the final answer."]
		}]);
	});
});

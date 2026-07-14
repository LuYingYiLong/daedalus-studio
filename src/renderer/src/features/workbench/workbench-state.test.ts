import { describe, expect, it } from "vitest";
import type { BackendEvent } from "@/api/backend-rpc-client";
import type { TimelineBlock, WorkbenchSnapshot } from "@/api/types";
import {
	applyBackendEventToTimeline,
	applyWorkbenchSnapshot,
	createTimelinePageFromTimelineResult,
	mergeTimelineAfter,
	mergeTimelineBefore
} from "./workbench-state";

function createWorkbench(revision: number, text: string): WorkbenchSnapshot {
	return {
		revision,
		sessionId: "session-a",
		composer: {
			text,
			chatMode: "ask",
			additionalContext: []
		},
		messageQueue: [],
		pendingGuides: [],
		activeRun: { status: "idle" },
		pendingApproval: null,
		nextStepHints: { hints: [] },
		activeSelection: { workspaceId: null }
	};
}

describe("workbench-state", () => {
	it("ignores older workbench revisions", () => {
		const current = createWorkbench(3, "new");
		const stale = createWorkbench(2, "old");

		expect(applyWorkbenchSnapshot(current, stale)).toBe(current);
		expect(applyWorkbenchSnapshot(current, createWorkbench(4, "latest")).composer.text).toBe("latest");
	});

	it("creates and updates a live assistant block from streaming events", () => {
		const delta: BackendEvent = {
			type: "event",
			id: "request-a",
			event: "agent.message.delta",
			data: { text: "hello" }
		};
		const done: BackendEvent = {
			type: "event",
			id: "request-a",
			event: "agent.run.done",
			data: {}
		};

		const withDelta: TimelineBlock[] = applyBackendEventToTimeline([], delta);
		const withDone: TimelineBlock[] = applyBackendEventToTimeline(withDelta, done);

		expect(withDelta).toHaveLength(1);
		expect(withDelta[0]?.type).toBe("assistant");
		expect(withDelta[0]?.content).toBe("hello");
		expect(withDone[0]?.type === "assistant" ? withDone[0].status : "missing").toBeUndefined();
	});

	it("keeps summary_start before summary markdown", () => {
		const blocks: TimelineBlock[] = applyBackendEventToTimeline([], {
			type: "event",
			id: "request-a",
			event: "agent.thinking.delta",
			data: { text: "process" }
		});
		const withSummary = applyBackendEventToTimeline(blocks, {
			type: "event",
			id: "request-a",
			event: "agent.summary.started",
			data: {
				runId: "run-a",
				stepId: "step-a",
				stepRunId: "step-run-a",
				title: "Summary",
				foldTitle: "Process"
			}
		});
		const withMarkdown = applyBackendEventToTimeline(withSummary, {
			type: "event",
			id: "request-a",
			event: "agent.message.delta",
			data: { text: "final" }
		});
		const assistant = withMarkdown[0];

		expect(assistant?.type).toBe("assistant");
		expect(assistant?.type === "assistant" ? assistant.bodyParts.map((part) => part.type) : []).toEqual([
			"thinking",
			"summary_start",
			"markdown"
		]);
	});

	it("merges timeline pages without duplicating block ids", () => {
		const current = createTimelinePageFromTimelineResult({
			timeline: true,
			sessionId: "session-a",
			blockCount: 3,
			blockOffset: 1,
			eventCount: 0,
			limit: 2,
			hasMoreBefore: true,
			hasMoreAfter: false,
			timelineBlocks: [
				{ id: "b", type: "user", requestId: "b", content: "b", sentAtUtc: "2026-01-01T00:00:00.000Z" },
				{ id: "c", type: "user", requestId: "c", content: "c", sentAtUtc: "2026-01-01T00:00:00.000Z" }
			],
			latestWorkflowSnapshot: null,
			latestAgentSnapshot: null
		});
		const previous = createTimelinePageFromTimelineResult({
			timeline: true,
			sessionId: "session-a",
			blockCount: 3,
			blockOffset: 0,
			eventCount: 0,
			limit: 2,
			hasMoreBefore: false,
			hasMoreAfter: true,
			timelineBlocks: [
				{ id: "a", type: "user", requestId: "a", content: "a", sentAtUtc: "2026-01-01T00:00:00.000Z" },
				{ id: "b", type: "user", requestId: "b", content: "b", sentAtUtc: "2026-01-01T00:00:00.000Z" }
			],
			latestWorkflowSnapshot: null,
			latestAgentSnapshot: null
		});
		const next = createTimelinePageFromTimelineResult({
			timeline: true,
			sessionId: "session-a",
			blockCount: 3,
			blockOffset: 2,
			eventCount: 0,
			limit: 2,
			hasMoreBefore: true,
			hasMoreAfter: false,
			timelineBlocks: [
				{ id: "c", type: "user", requestId: "c", content: "c", sentAtUtc: "2026-01-01T00:00:00.000Z" }
			],
			latestWorkflowSnapshot: null,
			latestAgentSnapshot: null
		});

		expect(mergeTimelineBefore(current, previous).blocks.map((block) => block.id)).toEqual(["a", "b", "c"]);
		expect(mergeTimelineAfter(current, next).blocks.map((block) => block.id)).toEqual(["b", "c"]);
	});
});

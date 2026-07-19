import { describe, expect, it } from "vitest";
import type { BackendEvent } from "@/api/backend-rpc-client";
import type { TimelineBlock, WorkbenchSnapshot } from "@/api/types";
import {
	applyBackendEventToTimeline,
	applyWorkbenchSnapshot,
	createTimelinePageFromTimelineResult,
	mergeTimelineAfter,
	mergeTimelineBefore
} from "@/features/workbench/workbench-state";

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
		pendingApproval: { count: 0, first: null },
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

	it("creates a live plan clarification status with structured replies", () => {
		const blocks: TimelineBlock[] = applyBackendEventToTimeline([], {
			type: "event",
			id: "request-plan",
			event: "plan.clarification.required",
			data: {
				planId: "plan-a",
				title: "Target shape",
				question: "Choose the target experience.",
				recommendedReplies: [
					{
						label: "Tool UI",
						text: "Plan the tool UI first.",
						description: "Best for validating interaction."
					}
				]
			}
		});
		const assistant = blocks[0];
		const statusPart = assistant?.type === "assistant"
			? assistant.bodyParts.find((part) => part.type === "status")
			: undefined;

		expect(blocks).toHaveLength(1);
		expect(statusPart).toMatchObject({
			type: "status",
			code: "plan.clarification.required",
			planId: "plan-a",
			title: "Target shape",
			details: "Choose the target experience.",
			recommendedReplies: [{
				label: "Tool UI",
				text: "Plan the tool UI first.",
				description: "Best for validating interaction."
			}]
		});
	});

	it("updates image generation body part from tool result", () => {
		const withCall = applyBackendEventToTimeline([], {
			type: "event",
			id: "request-image",
			event: "agent.tool.call",
			data: {
				toolCallId: "tool-image",
				toolName: "mcp_image_generate",
				args: { prompt: "blue castle" }
			}
		});
		const withResult = applyBackendEventToTimeline(withCall, {
			type: "event",
			id: "request-image",
			event: "agent.tool.result",
			data: {
				toolCallId: "tool-image",
				toolName: "mcp_image_generate",
				imageGeneration: {
					status: "completed",
					prompt: "blue castle",
					provider: "openai",
					model: "gpt-image-1",
					artifacts: [{
						imageId: "generated-image-a",
						sessionId: "session-a",
						mimeType: "image/png",
						byteSize: 12,
						provider: "openai",
						model: "gpt-image-1",
						prompt: "blue castle",
						createdAt: "2026-01-01T00:00:00.000Z",
						fileName: "generated-image-a.png"
					}]
				}
			}
		});
		const assistant = withResult[0];
		const parts = assistant?.type === "assistant" ? assistant.bodyParts : [];

		expect(parts.filter((part) => part.type === "image_generation")).toHaveLength(1);
		expect(parts.find((part) => part.type === "image_generation")).toMatchObject({
			type: "image_generation",
			status: "completed",
			prompt: "blue castle"
		});
	});

	it("merges approval continuation events by run id when rpc ids differ", () => {
		const withApprovalRequired = applyBackendEventToTimeline([], {
			type: "event",
			id: "chat-request",
			event: "agent.tool.approval_required",
			data: {
				runId: "run-approval",
				stepRunId: "step-run-approval",
				toolCallId: "tool-create",
				approvalId: "approval-a",
				toolName: "mcp_godot_create_text_file"
			}
		});
		const withApprovedResult = applyBackendEventToTimeline(withApprovalRequired, {
			type: "event",
			id: "approval-rpc",
			event: "agent.tool.result",
			data: {
				runId: "run-approval",
				stepRunId: "step-run-approval",
				toolCallId: "tool-create",
				toolName: "mcp_godot_create_text_file"
			}
		});
		const withFinalText = applyBackendEventToTimeline(withApprovedResult, {
			type: "event",
			id: "chat-request",
			event: "agent.message.delta",
			data: {
				runId: "run-approval",
				stepRunId: "step-run-approval",
				text: "done"
			}
		});
		const assistant = withFinalText[0];

		expect(withFinalText).toHaveLength(1);
		expect(assistant?.type).toBe("assistant");
		expect(assistant?.type === "assistant" ? assistant.content : "").toBe("done");
		expect(assistant?.type === "assistant" ? assistant.bodyParts.filter((part) => part.type === "tool") : []).toHaveLength(1);
	});

	it("merges approved tool events by approval id when tool call id is omitted", () => {
		const withApprovalRequired = applyBackendEventToTimeline([], {
			type: "event",
			id: "chat-request",
			event: "agent.tool.approval_required",
			data: {
				toolCallId: "tool-create",
				approvalId: "approval-a",
				toolName: "mcp_godot_create_text_file"
			}
		});
		const withApproved = applyBackendEventToTimeline(withApprovalRequired, {
			type: "event",
			id: "chat-request",
			event: "agent.tool.approved",
			data: {
				approvalId: "approval-a",
				toolName: "mcp_godot_create_text_file"
			}
		});
		const withResult = applyBackendEventToTimeline(withApproved, {
			type: "event",
			id: "chat-request",
			event: "agent.tool.result",
			data: {
				toolCallId: "tool-create",
				toolName: "mcp_godot_create_text_file"
			}
		});
		const assistant = withResult[0];
		const toolParts = assistant?.type === "assistant"
			? assistant.bodyParts.filter((part) => part.type === "tool")
			: [];

		expect(toolParts).toHaveLength(1);
		expect(toolParts[0]?.events.map((eventRecord) => eventRecord.type)).toEqual([
			"tool.approval_required",
			"tool.approved",
			"tool.result"
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

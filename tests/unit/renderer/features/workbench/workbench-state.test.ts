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
import {
	applyRunStateFromBackendEvent,
	applyRunStateFromWorkbench,
	createIdleRunState,
	createOptimisticRunState,
	isRunControllerActive,
	type RunControllerState
} from "@/features/workbench/run-state";

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
		pendingToolBudget: null,
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

	it("keeps newer active run state when a later workbench snapshot carries an older run sequence", () => {
		const current = createWorkbench(4, "draft");
		current.activeRun = {
			status: "streaming",
			requestId: "run-new",
			sequence: 5
		};
		const staleRun = createWorkbench(5, "server text");
		staleRun.activeRun = {
			status: "idle",
			sequence: 4
		};

		const applied = applyWorkbenchSnapshot(current, staleRun);

		expect(applied.revision).toBe(5);
		expect(applied.composer.text).toBe("server text");
		expect(applied.activeRun).toEqual(current.activeRun);
	});

	it("derives run controls from sequenced backend events and ignores stale workbench state", () => {
		const idle: RunControllerState = createIdleRunState();
		const started: RunControllerState = applyRunStateFromBackendEvent(idle, {
			type: "event",
			id: "run-a",
			event: "agent.run.started",
			data: {
				requestId: "run-a",
				status: "streaming",
				sequence: 3
			}
		});
		const staleWorkbench = createWorkbench(10, "");
		staleWorkbench.activeRun = {
			status: "idle",
			sequence: 2
		};
		const afterStaleWorkbench: RunControllerState = applyRunStateFromWorkbench(started, staleWorkbench);
		const done: RunControllerState = applyRunStateFromBackendEvent(afterStaleWorkbench, {
			type: "event",
			id: "run-a",
			event: "agent.run.done",
			data: {
				requestId: "run-a",
				status: "done",
				sequence: 3
			}
		});

		expect(isRunControllerActive(started)).toBe(true);
		expect(afterStaleWorkbench.status).toBe("streaming");
		expect(done.status).toBe("idle");
		expect(done.sequence).toBe(3);
	});

	it("optimistic run state keeps empty-draft composer controls stoppable until terminal state", () => {
		const running: RunControllerState = createOptimisticRunState(createIdleRunState(), "run-a", "2026-07-21T00:00:00.000Z");

		expect(running.status).toBe("streaming");
		expect(running.requestId).toBe("run-a");
		expect(isRunControllerActive(running)).toBe(true);
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

	it("creates a running assistant block when an agent run starts", () => {
		const blocks: TimelineBlock[] = applyBackendEventToTimeline([], {
			type: "event",
			id: "request-started",
			event: "agent.run.started",
			data: {
				runId: "request-started",
				requestId: "request-started"
			}
		});

		expect(blocks).toHaveLength(1);
		expect(blocks[0]?.type).toBe("assistant");
		if (blocks[0]?.type !== "assistant") {
			throw new Error("Expected assistant block");
		}
		expect(blocks[0].status).toBe("running");
		expect(blocks[0].requestId).toBe("request-started");
		expect(blocks[0].bodyParts).toEqual([]);
	});

	it("deduplicates repeated cancellation events in the assistant block", () => {
		const started: TimelineBlock[] = applyBackendEventToTimeline([], {
			type: "event",
			id: "request-cancelled",
			event: "agent.run.started",
			data: {
				runId: "request-cancelled",
				requestId: "request-cancelled"
			}
		});
		const withAgentCancel: TimelineBlock[] = applyBackendEventToTimeline(started, {
			type: "event",
			id: "request-cancelled",
			event: "agent.run.cancelled",
			data: {
				requestId: "request-cancelled"
			}
		});
		const withRepeatedCancel: TimelineBlock[] = applyBackendEventToTimeline(withAgentCancel, {
			type: "event",
			id: "request-cancelled",
			event: "agent.run.cancelled",
			data: {
				requestId: "request-cancelled"
			}
		});
		const assistant = withRepeatedCancel[0];

		expect(assistant?.type).toBe("assistant");
		if (assistant?.type !== "assistant") {
			throw new Error("Expected assistant block");
		}
		expect(assistant.status).toBeUndefined();
		expect(assistant.bodyParts.filter((part) => part.type === "status" && part.code === "cancelled")).toHaveLength(1);
	});

	it("deduplicates repeated terminal errors in the assistant block", () => {
		const started: TimelineBlock[] = applyBackendEventToTimeline([], {
			type: "event",
			id: "request-error",
			event: "agent.run.started",
			data: {
				runId: "request-error",
				requestId: "request-error"
			}
		});
		const withWorkflowError: TimelineBlock[] = applyBackendEventToTimeline(started, {
			type: "event",
			id: "request-error",
			event: "agent.run.error",
			data: {
				runId: "workflow-a",
				code: "agent_run_error",
				message: "oldText not found in file"
			}
		});
		const withProviderError: TimelineBlock[] = applyBackendEventToTimeline(withWorkflowError, {
			type: "event",
			id: "request-error",
			event: "agent.run.error",
			data: {
				runId: "request-error",
				code: "provider_error",
				message: "oldText not found in file"
			}
		});
		const assistant = withProviderError[0];

		expect(assistant?.type).toBe("assistant");
		if (assistant?.type !== "assistant") {
			throw new Error("Expected assistant block");
		}
		expect(assistant.status).toBe("failed");
		expect(assistant.bodyParts.filter((part) => part.type === "status" && part.status === "error")).toHaveLength(1);
	});

	it("marks an existing plan block running again when plan clarification resumes", () => {
		const withPlan: TimelineBlock[] = applyBackendEventToTimeline([], {
			type: "event",
			id: "request-plan",
			event: "plan.generated",
			data: {
				requestId: "request-plan",
				planId: "plan-a",
				status: "ready",
				title: "Plan",
				previewMarkdown: "Summary"
			}
		});
		const withDone: TimelineBlock[] = applyBackendEventToTimeline(withPlan, {
			type: "event",
			id: "request-plan",
			event: "agent.message.done",
			data: {
				requestId: "request-plan"
			}
		});
		const withStartedAgain: TimelineBlock[] = applyBackendEventToTimeline(withDone, {
			type: "event",
			id: "request-plan",
			event: "agent.run.started",
			data: {
				runId: "request-plan",
				requestId: "request-plan",
				operationRequestId: "plan-clarify-1",
				planId: "plan-a"
			}
		});
		const assistant = withStartedAgain[0];

		expect(assistant?.type).toBe("assistant");
		if (assistant?.type !== "assistant") {
			throw new Error("Expected assistant block");
		}
		expect(assistant.status).toBe("running");
	});

	it("renders historical plan.error events as visible backend errors", () => {
		const blocks: TimelineBlock[] = applyBackendEventToTimeline([], {
			type: "event",
			id: "plan-operation-1",
			event: "plan.error",
			data: {
				code: "plan_error",
				message: "工具结果总量达到 46034 字符，上限为 48000 字符"
			}
		});
		const assistant = blocks[0];

		expect(assistant?.type).toBe("assistant");
		if (assistant?.type !== "assistant") {
			throw new Error("Expected assistant block");
		}
		expect(assistant.status).toBe("failed");
		expect(assistant.bodyParts.some((part) => {
			return part.type === "status" && part.status === "error" && part.code === "plan_error";
		})).toBe(true);
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

	it("renders final summary text from agent.message.done when no delta was streamed", () => {
		const blocks: TimelineBlock[] = applyBackendEventToTimeline([], {
			type: "event",
			id: "request-summary",
			event: "agent.thinking.delta",
			data: { text: "process" }
		});
		const withSummaryStart: TimelineBlock[] = applyBackendEventToTimeline(blocks, {
			type: "event",
			id: "request-summary",
			event: "agent.summary.started",
			data: {
				runId: "run-summary",
				stepId: "summarize",
				stepRunId: "phase-run-summarize",
				title: "总结交付",
				foldTitle: "总结前的过程"
			}
		});
		const withDone: TimelineBlock[] = applyBackendEventToTimeline(withSummaryStart, {
			type: "event",
			id: "request-summary",
			event: "agent.message.done",
			data: {
				requestId: "request-summary",
				text: "## 交付总结\n\n已完成。"
			}
		});
		const assistant = withDone[0];

		expect(assistant?.type).toBe("assistant");
		expect(assistant?.type === "assistant" ? assistant.content : "").toBe("## 交付总结\n\n已完成。");
		expect(assistant?.type === "assistant" ? assistant.bodyParts.map((part) => part.type) : []).toEqual([
			"thinking",
			"summary_start",
			"markdown"
		]);
	});

	it("does not duplicate message.done text that already arrived through deltas", () => {
		const withDelta: TimelineBlock[] = applyBackendEventToTimeline([], {
			type: "event",
			id: "request-stream",
			event: "agent.message.delta",
			data: {
				text: "hello"
			}
		});
		const withDone: TimelineBlock[] = applyBackendEventToTimeline(withDelta, {
			type: "event",
			id: "request-stream",
			event: "agent.message.done",
			data: {
				requestId: "request-stream",
				text: "hello"
			}
		});
		const assistant = withDone[0];

		expect(assistant?.type).toBe("assistant");
		expect(assistant?.type === "assistant" ? assistant.content : "").toBe("hello");
		expect(assistant?.type === "assistant" ? assistant.bodyParts.filter((part) => part.type === "markdown") : []).toHaveLength(1);
	});

	it("keeps live plan clarification events out of visible timeline blocks", () => {
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

		expect(blocks).toHaveLength(0);
	});

	it("merges plan follow-up rpc events into the original assistant block", () => {
		const withPrelude: TimelineBlock[] = applyBackendEventToTimeline([], {
			type: "event",
			id: "request-plan",
			event: "agent.message.delta",
			data: {
				requestId: "request-plan",
				operationRequestId: "request-plan",
				planId: "plan-a",
				mode: "plan",
				text: "先确认目标。\n"
			}
		});
		const withThinking: TimelineBlock[] = applyBackendEventToTimeline(withPrelude, {
			type: "event",
			id: "plan-revise-rpc",
			event: "agent.thinking.delta",
			data: {
				requestId: "request-plan",
				operationRequestId: "plan-revise-rpc",
				planId: "plan-a",
				mode: "plan",
				text: "读取项目结构。"
			}
		});
		const withToolCall: TimelineBlock[] = applyBackendEventToTimeline(withThinking, {
			type: "event",
			id: "plan-revise-rpc",
			event: "agent.tool.call",
			data: {
				requestId: "request-plan",
				operationRequestId: "plan-revise-rpc",
				planId: "plan-a",
				runId: "request-plan",
				toolCallId: "tool-read",
				toolName: "mcp_godot_list_project_files"
			}
		});
		const withRevisedPlan: TimelineBlock[] = applyBackendEventToTimeline(withToolCall, {
			type: "event",
			id: "plan-revise-rpc",
			event: "plan.revised",
			data: {
				requestId: "request-plan",
				planId: "plan-a",
				title: "Build the game",
				status: "ready",
				previewMarkdown: "Use HTML/CSS/JS."
			}
		});
		const withDone: TimelineBlock[] = applyBackendEventToTimeline(withRevisedPlan, {
			type: "event",
			id: "plan-revise-rpc",
			event: "agent.message.done",
			data: {
				runId: "plan-revise-rpc",
				requestId: "request-plan",
				mode: "plan",
				planId: "plan-a"
			}
		});
		const assistant = withDone[0];

		expect(withDone).toHaveLength(1);
		expect(assistant?.type).toBe("assistant");
		expect(assistant?.type === "assistant" ? assistant.requestId : "").toBe("request-plan");
		expect(assistant?.type === "assistant" ? assistant.status : "missing").toBeUndefined();
		expect(assistant?.type === "assistant" ? assistant.bodyParts.map((part) => part.type) : []).toEqual(["markdown", "thinking", "tool", "plan"]);
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
			latestAgentSnapshot: null,
			latestPlanClarification: null,
			latestPlanApproval: null
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
			latestAgentSnapshot: null,
			latestPlanClarification: null,
			latestPlanApproval: null
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
			latestAgentSnapshot: null,
			latestPlanClarification: null,
			latestPlanApproval: null
		});

		expect(mergeTimelineBefore(current, previous).blocks.map((block) => block.id)).toEqual(["a", "b", "c"]);
		expect(mergeTimelineAfter(current, next).blocks.map((block) => block.id)).toEqual(["b", "c"]);
	});
});

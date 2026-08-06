import { describe, expect, it } from "vitest";
import type { BackendEvent } from "@/shared/api/transport/backend-rpc-client";
import type { TimelineBlock, WorkbenchSnapshot } from "@/api/types";
import {
	applyBackendEventToTimeline,
	applyBackendEventsToTimeline,
	applyWorkbenchSnapshot,
	createTimelinePageFromTimelineResult,
	isTimelineStreamingDeltaEvent,
	MAX_TIMELINE_WINDOW_BLOCKS,
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

function createUserBlock(id: string): TimelineBlock {
	return {
		id,
		type: "user",
		requestId: id,
		content: id,
		sentAtUtc: "2026-01-01T00:00:00.000Z"
	};
}

function createAgentRunEvent(
	runId: string,
	stage: "executing" | "completed" | "failed" | "cancelled" | "interrupted",
	revision: number = 1,
	options: {
		message?: string;
		verificationStatus?: "verified" | "unverified" | "failed" | null;
		warnings?: string[];
		resultStatus?: "completed" | "completed_with_warnings" | "failed" | "cancelled";
	} = {}
): BackendEvent {
	const terminal = stage === "completed" || stage === "failed" || stage === "cancelled"
		? {
			resultStatus: options.resultStatus
				?? (stage === "completed" ? "completed" : stage),
			message: options.message,
			completedAt: "2026-07-29T00:00:00.000Z"
		}
		: null;

	return {
		protocolVersion: 3,
		type: "event",
		eventId: `event:${runId}:${revision}:${stage}`,
		event: "agent.run.state",
		sessionId: "session-a",
		requestId: runId,
		runId,
		sequence: revision,
		createdAt: "2026-07-29T00:00:00.000Z",
		data: {
			schemaVersion: 1,
			runId,
			sessionId: "session-a",
			requestId: runId,
			rootRequestId: runId,
			revision,
			intent: "mutate",
			scope: "bounded",
			lane: "lightweight",
			stage,
			title: "Test run",
			planId: null,
			todo: null,
			pause: null,
			verificationStatus: options.verificationStatus ?? null,
			warnings: options.warnings ?? [],
			terminal,
			checkpoint: {
				successfulWriteFingerprints: [],
				evidence: []
			},
			createdAt: "2026-07-29T00:00:00.000Z",
			updatedAt: "2026-07-29T00:00:00.000Z"
		}
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
		const started: RunControllerState = applyRunStateFromBackendEvent(
			idle,
			createAgentRunEvent("run-a", "executing", 3)
		);
		const staleWorkbench = createWorkbench(10, "");
		staleWorkbench.activeRun = {
			status: "idle",
			sequence: 2
		};
		const afterStaleWorkbench: RunControllerState = applyRunStateFromWorkbench(started, staleWorkbench);
		const done: RunControllerState = applyRunStateFromBackendEvent(
			afterStaleWorkbench,
			createAgentRunEvent("run-a", "completed", 4)
		);

		expect(isRunControllerActive(started)).toBe(true);
		expect(afterStaleWorkbench.status).toBe("streaming");
		expect(done.status).toBe("idle");
		expect(done.sequence).toBe(4);
	});

	it("ignores an out-of-order state event from a different run", () => {
		const current: RunControllerState = applyRunStateFromBackendEvent(
			createIdleRunState(),
			createAgentRunEvent("run-new", "executing", 5)
		);
		const applied: RunControllerState = applyRunStateFromBackendEvent(
			current,
			createAgentRunEvent("run-old", "interrupted", 2)
		);

		expect(applied).toBe(current);
		expect(applied.agentRun?.runId).toBe("run-new");
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
		const done: BackendEvent = createAgentRunEvent("request-a", "completed", 2);

		const withDelta: TimelineBlock[] = applyBackendEventToTimeline([], delta);
		const withDone: TimelineBlock[] = applyBackendEventToTimeline(withDelta, done);

		expect(withDelta).toHaveLength(1);
		expect(withDelta[0]?.type).toBe("assistant");
		expect(withDelta[0]?.content).toBe("hello");
		expect(withDone[0]?.type === "assistant" ? withDone[0].status : "missing").toBeUndefined();
	});

	it("batches adjacent streaming deltas without changing timeline semantics", () => {
		const blocks: TimelineBlock[] = applyBackendEventsToTimeline([], [
			{
				type: "event",
				id: "request-batched",
				event: "agent.message.delta",
				data: { requestId: "request-batched", text: "long " }
			},
			{
				type: "event",
				id: "request-batched",
				event: "agent.message.delta",
				data: { requestId: "request-batched", text: "answer" }
			},
			{
				type: "event",
				id: "request-batched",
				event: "agent.thinking.delta",
				data: { requestId: "request-batched", text: "checking" }
			}
		]);

		expect(isTimelineStreamingDeltaEvent({
			type: "event",
			id: "request-batched",
			event: "agent.message.delta"
		})).toBe(true);
		expect(isTimelineStreamingDeltaEvent({
			type: "event",
			id: "request-batched",
			event: "agent.run.state"
		})).toBe(false);
		expect(blocks).toHaveLength(1);
		expect(blocks[0]?.content).toBe("long answer");
		expect(blocks[0]?.type === "assistant" ? blocks[0].bodyParts : []).toEqual([
			{ type: "markdown", text: "long answer" },
			{ type: "thinking", text: "checking", done: false }
		]);
	});

	it("keeps a prelude-adjacent thinking part out of the following backend tool group", () => {
		const blocks = applyBackendEventsToTimeline([], [
			{
				type: "event",
				id: "request-activity",
				event: "agent.thinking.delta",
				data: {
					text: "inspect",
					activityGroupId: "activity:request:1",
					activityPartId: "thinking:1",
					activityPartKind: "thinking",
					activityGroupStats: { editedFiles: 0, commands: 0, thoughts: 1 }
				}
			},
			{ type: "event", id: "request-activity", event: "agent.message.delta", data: { text: "I will read the files." } },
			{
				type: "event",
				id: "request-activity",
				event: "agent.thinking.done",
				data: {
					activityGroupId: "activity:request:2",
					activityPartId: "thinking:2",
					activityPartKind: "thinking",
					activityGroupStats: { editedFiles: 0, commands: 0, thoughts: 0 }
				}
			},
			...[
				["read-1", "tool:read-1"],
				["read-2", "tool:read-2"]
			].map(([toolCallId, activityPartId]) => ({
				type: "event" as const,
				id: "request-activity",
				event: "agent.tool.call",
				data: {
					toolCallId,
					toolName: "mcp_workspace_read_text_file",
					activityGroupId: "activity:request:2",
					activityPartId,
					activityPartKind: "tool" as const,
					activityGroupStats: { editedFiles: 0, commands: 0, thoughts: 0 }
				}
			}))
		]);

		const assistant = blocks[0];
		expect(assistant?.type).toBe("assistant");
		if (assistant?.type === "assistant") {
			const thinking = assistant.bodyParts.find((part) => part.type === "thinking");
			const tools = assistant.bodyParts.filter((part) => part.type === "tool");
			expect(thinking?.type === "thinking" ? thinking.activityGroupId : "").toBe("activity:request:1");
			expect(thinking?.type === "thinking" ? thinking.done : false).toBe(true);
			expect(tools.map((part) => part.type === "tool" ? part.activityGroupId : "")).toEqual(["activity:request:2", "activity:request:2"]);
		}
	});

	it("keeps a tool in its call activity group when streamed prose arrives before the result", () => {
		const blocks = applyBackendEventsToTimeline([], [
			{
				type: "event",
				id: "request-delayed-tool-result",
				event: "agent.thinking.delta",
				data: {
					text: "prepare",
					activityGroupId: "activity:request:1",
					activityPartId: "thinking:1",
					activityPartKind: "thinking",
					activityGroupStats: { editedFiles: 0, commands: 0, thoughts: 1 }
				}
			},
			{
				type: "event",
				id: "request-delayed-tool-result",
				event: "agent.tool.call",
				data: {
					toolCallId: "write-1",
					toolName: "mcp_workspace_overwrite_text_file",
					activityGroupId: "activity:request:1",
					activityPartId: "tool:write-1",
					activityPartKind: "tool",
					activityGroupStats: { editedFiles: 0, commands: 0, thoughts: 1 }
				}
			},
			{ type: "event", id: "request-delayed-tool-result", event: "agent.message.delta", data: { text: "Writing the file." } },
			{
				type: "event",
				id: "request-delayed-tool-result",
				event: "agent.tool.result",
				data: {
					toolCallId: "write-1",
					toolName: "mcp_workspace_overwrite_text_file",
					ok: true,
					activityGroupId: "activity:request:2",
					activityPartId: "tool:write-1-result",
					activityPartKind: "tool",
					activityGroupStats: { editedFiles: 1, commands: 0, thoughts: 0 }
				}
			}
		]);

		const assistant = blocks[0];
		expect(assistant?.type).toBe("assistant");
		if (assistant?.type === "assistant") {
			const tool = assistant.bodyParts.find((part) => part.type === "tool");
			expect(tool?.type === "tool" ? tool.activityGroupId : "").toBe("activity:request:1");
			expect(tool?.type === "tool" ? tool.activityGroupStats : undefined).toEqual({ editedFiles: 1, commands: 0, thoughts: 1 });
		}
	});

	it("rolls back a failed provider attempt once and updates its reconnect part in place", () => {
		let blocks: TimelineBlock[] = applyBackendEventsToTimeline([], [
			{ type: "event", id: "request-reconnect", event: "agent.message.delta", data: { text: "stable partial🙂" } },
			{ type: "event", id: "request-reconnect", event: "agent.thinking.delta", data: { text: "thinking" } }
		]);
		const waiting: BackendEvent = {
			type: "event",
			id: "request-reconnect",
			event: "agent.provider.reconnect",
			data: {
				reconnectId: "reconnect-a",
				revision: 1,
				provider: "deepseek",
				model: "deepseek-v4-flash",
				status: "waiting",
				reason: "transport",
				attempt: 1,
				maxAttempts: 5,
				timeoutMs: 60_000,
				autoExtended: false,
				discardedMessageCodePoints: 8,
				discardedThinkingCodePoints: 8
			}
		};
		blocks = applyBackendEventToTimeline(blocks, waiting);
		blocks = applyBackendEventToTimeline(blocks, waiting);
		blocks = applyBackendEventToTimeline(blocks, {
			type: "event",
			id: "request-reconnect",
			event: "agent.message.delta",
			data: { text: "complete" }
		});
		blocks = applyBackendEventToTimeline(blocks, {
			type: "event",
			id: "request-reconnect",
			event: "agent.provider.reconnect",
			data: {
				...(waiting.data as Record<string, unknown>),
				revision: 2,
				status: "recovered",
				discardedMessageCodePoints: 0,
				discardedThinkingCodePoints: 0
			}
		});

		const assistant = blocks[0];
		expect(assistant?.type).toBe("assistant");
		if (assistant?.type !== "assistant") throw new Error("Expected assistant block");
		expect(assistant.content).toBe("stable complete");
		expect(assistant.bodyParts.filter((part) => part.type === "thinking")).toHaveLength(0);
		const reconnectParts = assistant.bodyParts.filter((part) => part.type === "provider_reconnect");
		expect(reconnectParts).toHaveLength(1);
		expect(reconnectParts[0]).toMatchObject({ revision: 2, status: "recovered" });
	});

	it("updates one context compression part with the generated summary", () => {
		const running: BackendEvent = {
			type: "event",
			id: "request-compression",
			event: "agent.context.compression",
			data: {
				compressionId: "context-compression:request-compression",
				status: "running"
			}
		};
		let blocks: TimelineBlock[] = applyBackendEventToTimeline([], running);
		blocks = applyBackendEventToTimeline(blocks, {
			...running,
			data: {
				compressionId: "context-compression:request-compression",
				status: "completed",
				summary: "- Completed: inspected the workspace\n- Constraint: preserve tests"
			}
		});

		const assistant: TimelineBlock | undefined = blocks[0];
		expect(assistant?.type).toBe("assistant");
		if (assistant?.type !== "assistant") throw new Error("Expected assistant block");
		const compressionParts = assistant.bodyParts.filter((part) => part.type === "compression");
		expect(compressionParts).toHaveLength(1);
		expect(compressionParts[0]).toMatchObject({
			status: "completed",
			summary: "- Completed: inspected the workspace\n- Constraint: preserve tests"
		});
	});

	it("creates a running assistant block when an agent run starts", () => {
		const blocks: TimelineBlock[] = applyBackendEventToTimeline(
			[],
			createAgentRunEvent("request-started", "executing")
		);

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
		const started: TimelineBlock[] = applyBackendEventToTimeline(
			[],
			createAgentRunEvent("request-cancelled", "executing")
		);
		const withAgentCancel: TimelineBlock[] = applyBackendEventToTimeline(
			started,
			createAgentRunEvent("request-cancelled", "cancelled", 2)
		);
		const withRepeatedCancel: TimelineBlock[] = applyBackendEventToTimeline(
			withAgentCancel,
			createAgentRunEvent("request-cancelled", "cancelled", 2)
		);
		const assistant = withRepeatedCancel[0];

		expect(assistant?.type).toBe("assistant");
		if (assistant?.type !== "assistant") {
			throw new Error("Expected assistant block");
		}
		expect(assistant.status).toBe("stopped");
		expect(assistant.bodyParts.some((part) => part.type === "status" && part.code === "cancelled")).toBe(false);
	});

	it("finishes an active thinking part when the run is cancelled", () => {
		const thinking: TimelineBlock[] = applyBackendEventToTimeline([], {
			type: "event",
			id: "request-thinking-cancelled",
			event: "agent.thinking.delta",
			data: { text: "checking the workspace" }
		});
		const cancelled: TimelineBlock[] = applyBackendEventToTimeline(
			thinking,
			createAgentRunEvent("request-thinking-cancelled", "cancelled", 2)
		);
		const assistant = cancelled[0];

		expect(assistant?.type).toBe("assistant");
		if (assistant?.type !== "assistant") {
			throw new Error("Expected assistant block");
		}
		expect(assistant.bodyParts).toContainEqual({
			type: "thinking",
			text: "checking the workspace",
			done: true
		});
	});


	it("deduplicates repeated terminal errors in the assistant block", () => {
		const started: TimelineBlock[] = applyBackendEventToTimeline(
			[],
			createAgentRunEvent("request-error", "executing")
		);
		const withWorkflowError: TimelineBlock[] = applyBackendEventToTimeline(
			started,
			createAgentRunEvent("request-error", "failed", 2, {
				message: "oldText not found in file"
			})
		);
		const withProviderError: TimelineBlock[] = applyBackendEventToTimeline(
			withWorkflowError,
			createAgentRunEvent("request-error", "failed", 2, {
				message: "oldText not found in file"
			})
		);
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
		const withStartedAgain: TimelineBlock[] = applyBackendEventToTimeline(
			withDone,
			createAgentRunEvent("request-plan", "executing", 2)
		);
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

	it("marks an in-flight image generation part as cancelled with the run", () => {
		const withCall = applyBackendEventToTimeline([], {
			type: "event",
			id: "request-image-cancel",
			event: "agent.tool.call",
			data: {
				requestId: "request-image-cancel",
				toolCallId: "tool-image-cancel",
				toolName: "mcp_image_generate",
				args: { prompt: "cancel this image" }
			}
		});
		const cancelled = applyBackendEventToTimeline(
			withCall,
			createAgentRunEvent("request-image-cancel", "cancelled", 2)
		);
		const assistant = cancelled[0];
		const imagePart = assistant?.type === "assistant"
			? assistant.bodyParts.find((part) => part.type === "image_generation")
			: undefined;

		expect(imagePart).toMatchObject({
			type: "image_generation",
			status: "failed",
			error: "Image generation was cancelled."
		});
	});

	it("leaves completed-with-warnings details to the assistant summary", () => {
		const completedEvent: BackendEvent = createAgentRunEvent("request-warning", "completed", 2, {
			resultStatus: "completed_with_warnings",
			verificationStatus: "unverified",
			warnings: ["Godot executable is unavailable: not found"]
		});
		const completed = applyBackendEventToTimeline([], completedEvent);
		const repeated = applyBackendEventToTimeline(completed, completedEvent);
		const assistant = repeated[0];
		const warningParts = assistant?.type === "assistant"
			? assistant.bodyParts.filter((part) => part.type === "status" && part.code === "verification_unverified")
			: [];

		expect(warningParts).toHaveLength(0);
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

	it("trims invisible newer blocks when loading older timeline pages", () => {
		const currentBlocks: TimelineBlock[] = Array.from(
			{ length: MAX_TIMELINE_WINDOW_BLOCKS },
			(_, index: number): TimelineBlock => createUserBlock(`current-${index}`)
		);
		const previousBlocks: TimelineBlock[] = Array.from(
			{ length: 80 },
			(_, index: number): TimelineBlock => createUserBlock(`previous-${index}`)
		);
		const current = createTimelinePageFromTimelineResult({
			timeline: true,
			sessionId: "session-a",
			blockCount: 320,
			blockOffset: 80,
			eventCount: 0,
			limit: MAX_TIMELINE_WINDOW_BLOCKS,
			hasMoreBefore: true,
			hasMoreAfter: false,
			timelineBlocks: currentBlocks,
			latestWorkflowSnapshot: null,
			latestAgentSnapshot: null,
			latestPlanClarification: null,
			latestPlanApproval: null
		});
		const previous = createTimelinePageFromTimelineResult({
			timeline: true,
			sessionId: "session-a",
			blockCount: 320,
			blockOffset: 0,
			eventCount: 0,
			limit: 80,
			hasMoreBefore: false,
			hasMoreAfter: true,
			timelineBlocks: previousBlocks,
			latestWorkflowSnapshot: null,
			latestAgentSnapshot: null,
			latestPlanClarification: null,
			latestPlanApproval: null
		});

		const merged = mergeTimelineBefore(current, previous);

		expect(merged.blocks).toHaveLength(MAX_TIMELINE_WINDOW_BLOCKS);
		expect(merged.blockOffset).toBe(0);
		expect(merged.hasMoreBefore).toBe(false);
		expect(merged.hasMoreAfter).toBe(true);
		expect(merged.blocks[0]?.id).toBe("previous-0");
		expect(merged.blocks.at(-1)?.id).toBe(`current-${MAX_TIMELINE_WINDOW_BLOCKS - previousBlocks.length - 1}`);
	});

	it("trims invisible older blocks when loading newer timeline pages", () => {
		const currentBlocks: TimelineBlock[] = Array.from(
			{ length: MAX_TIMELINE_WINDOW_BLOCKS },
			(_, index: number): TimelineBlock => createUserBlock(`current-${index}`)
		);
		const nextBlocks: TimelineBlock[] = Array.from(
			{ length: 80 },
			(_, index: number): TimelineBlock => createUserBlock(`next-${index}`)
		);
		const current = createTimelinePageFromTimelineResult({
			timeline: true,
			sessionId: "session-a",
			blockCount: 320,
			blockOffset: 0,
			eventCount: 0,
			limit: MAX_TIMELINE_WINDOW_BLOCKS,
			hasMoreBefore: false,
			hasMoreAfter: true,
			timelineBlocks: currentBlocks,
			latestWorkflowSnapshot: null,
			latestAgentSnapshot: null,
			latestPlanClarification: null,
			latestPlanApproval: null
		});
		const next = createTimelinePageFromTimelineResult({
			timeline: true,
			sessionId: "session-a",
			blockCount: 320,
			blockOffset: MAX_TIMELINE_WINDOW_BLOCKS,
			eventCount: 0,
			limit: 80,
			hasMoreBefore: true,
			hasMoreAfter: false,
			timelineBlocks: nextBlocks,
			latestWorkflowSnapshot: null,
			latestAgentSnapshot: null,
			latestPlanClarification: null,
			latestPlanApproval: null
		});

		const merged = mergeTimelineAfter(current, next);

		expect(merged.blocks).toHaveLength(MAX_TIMELINE_WINDOW_BLOCKS);
		expect(merged.blockOffset).toBe(80);
		expect(merged.hasMoreBefore).toBe(true);
		expect(merged.hasMoreAfter).toBe(false);
		expect(merged.blocks[0]?.id).toBe("current-80");
		expect(merged.blocks.at(-1)?.id).toBe("next-79");
	});
});

describe("terminal tool timeline output", () => {
	it("coalesces transient output and replaces it with the persisted final snapshot", () => {
		let blocks: TimelineBlock[] = applyBackendEventToTimeline([], {
			type: "event",
			id: "terminal-request",
			event: "agent.tool.call",
			data: {
				toolCallId: "terminal-call",
				toolName: "mcp_terminal_run_command",
				args: { commandLine: "npm test" }
			}
		});

		for (let sequence: number = 1; sequence <= 80; sequence += 1) {
			blocks = applyBackendEventToTimeline(blocks, {
				type: "event",
				id: "terminal-request",
				event: "agent.tool.progress",
				data: {
					toolCallId: "terminal-call",
					toolName: "mcp_terminal_run_command",
					code: "terminal_output",
					terminalOutputDelta: {
						stream: "stdout",
						sequence,
						text: String(sequence).padStart(3, "0") + "x".repeat(97),
						omittedChars: 0
					}
				}
			});
		}

		const liveAssistant = blocks[0];
		const liveTool = liveAssistant?.type === "assistant"
			? liveAssistant.bodyParts.find((part) => part.type === "tool")
			: undefined;
		expect(liveTool?.type === "tool" ? liveTool.events : []).toHaveLength(2);
		const liveProgress = liveTool?.type === "tool" ? liveTool.events.find((event) => event.code === "terminal_output") : undefined;
		const runtime = liveProgress?.terminalRuntimeOutput as Record<string, unknown> | undefined;
		expect(String(runtime?.stdout ?? "")).toHaveLength(6000);
		expect(runtime?.stdoutOmittedChars).toBe(2000);

		blocks = applyBackendEventToTimeline(blocks, {
			type: "event",
			id: "terminal-request",
			event: "agent.tool.result",
			data: {
				toolCallId: "terminal-call",
				toolName: "mcp_terminal_run_command",
				ok: true,
				terminalDisplay: {
					commandLine: "npm test",
					cwd: ".",
					executionMode: "wait",
					status: "completed",
					exitCode: 0,
					stdout: "done",
					stderr: "",
					stdoutOmittedChars: 0,
					stderrOmittedChars: 0,
					truncated: false
				}
			}
		});

		const finalAssistant = blocks[0];
		const finalTool = finalAssistant?.type === "assistant"
			? finalAssistant.bodyParts.find((part) => part.type === "tool")
			: undefined;
		expect(finalTool?.type === "tool" ? finalTool.events.map((event) => event.type) : []).toEqual(["tool.call", "tool.result"]);
	});
});

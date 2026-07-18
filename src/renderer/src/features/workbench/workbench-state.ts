import type { BackendEvent } from "@/api/backend-rpc-client";
import type { SessionOpenResult, SessionTimelineResult, TimelineAssistantBlock, TimelineBlock, TimelineBodyPart, WorkbenchSnapshot } from "@/api/types";

export type TimelinePageState = {
	blocks: TimelineBlock[];
	blockCount: number;
	blockOffset: number;
	hasMoreBefore: boolean;
	hasMoreAfter: boolean;
};

export type WorkbenchSessionState = {
	activeSessionId: string | null;
	workbench: WorkbenchSnapshot | null;
	timeline: TimelinePageState;
};

export const emptyTimelinePage: TimelinePageState = {
	blocks: [],
	blockCount: 0,
	blockOffset: 0,
	hasMoreBefore: false,
	hasMoreAfter: false
};

export const initialWorkbenchSessionState: WorkbenchSessionState = {
	activeSessionId: null,
	workbench: null,
	timeline: emptyTimelinePage
};

export function applyWorkbenchSnapshot(current: WorkbenchSnapshot | null, next: WorkbenchSnapshot): WorkbenchSnapshot {
	if (current !== null && next.revision < current.revision) {
		return current;
	}

	return next;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function getEventData(event: BackendEvent): Record<string, unknown> {
	return isRecord(event.data) ? event.data : {};
}

function getStringValue(record: Record<string, unknown>, key: string): string {
	const value: unknown = record[key];

	return typeof value === "string" ? value : "";
}

function appendMarkdownPart(parts: TimelineBodyPart[], text: string): TimelineBodyPart[] {
	if (text.length === 0) {
		return parts;
	}

	const nextParts: TimelineBodyPart[] = [...parts];
	const lastPart: TimelineBodyPart | undefined = nextParts[nextParts.length - 1];

	if (lastPart?.type === "markdown") {
		nextParts[nextParts.length - 1] = {
			...lastPart,
			text: lastPart.text + text
		};
		return nextParts;
	}

	return [...nextParts, { type: "markdown", text }];
}

function appendThinkingPart(parts: TimelineBodyPart[], text: string, done: boolean): TimelineBodyPart[] {
	const nextParts: TimelineBodyPart[] = [...parts];

	for (let index: number = nextParts.length - 1; index >= 0; index -= 1) {
		const part: TimelineBodyPart = nextParts[index]!;

		if (part.type !== "thinking" || part.done) {
			continue;
		}

		nextParts[index] = {
			...part,
			text: text.length > 0 ? part.text + text : part.text,
			done: done ? true : part.done
		};
		return nextParts;
	}

	return [...nextParts, { type: "thinking", text, done }];
}

function appendToolPart(parts: TimelineBodyPart[], event: BackendEvent): TimelineBodyPart[] {
	const data: Record<string, unknown> = getEventData(event);
	const toolCallId: string = getStringValue(data, "toolCallId")
		|| getStringValue(data, "approvalId")
		|| `${getStringValue(data, "toolName") || "tool"}:${event.id}`;
	const normalizedEvent: Record<string, unknown> = {
		...data,
		type: event.event.startsWith("agent.tool.") ? event.event.replace("agent.tool.", "tool.") : event.event
	};

	for (const part of parts) {
		if (part.type === "tool" && toolPartMatchesEvent(part, toolCallId, data)) {
			return parts.map((item: TimelineBodyPart): TimelineBodyPart => {
				if (item.type !== "tool" || !toolPartMatchesEvent(item, toolCallId, data)) {
					return item;
				}

				return {
					...item,
					events: [...item.events, normalizedEvent]
				};
			});
		}
	}

	return [...parts, {
		type: "tool",
		tool_call_id: toolCallId,
		events: [normalizedEvent]
	}];
}

function toolPartMatchesEvent(part: Extract<TimelineBodyPart, { type: "tool" }>, toolCallId: string, data: Record<string, unknown>): boolean {
	if (part.tool_call_id === toolCallId) {
		return true;
	}

	const eventToolCallId: string = getStringValue(data, "toolCallId");
	const approvalId: string = getStringValue(data, "approvalId");
	return part.events.some((eventRecord: Record<string, unknown>): boolean => {
		if (eventToolCallId.length > 0 && getStringValue(eventRecord, "toolCallId") === eventToolCallId) {
			return true;
		}
		if (approvalId.length > 0 && getStringValue(eventRecord, "approvalId") === approvalId) {
			return true;
		}
		return false;
	});
}

function getToolCallKey(data: Record<string, unknown>, event: BackendEvent): string {
	return getStringValue(data, "toolCallId")
		|| getStringValue(data, "approvalId")
		|| `${getStringValue(data, "toolName") || "tool"}:${event.id}`;
}

function getImageGenerationPrompt(data: Record<string, unknown>): string {
	const args: unknown = data.args;
	if (isRecord(args)) {
		return getStringValue(args, "prompt");
	}
	const imageGeneration: unknown = data.imageGeneration;
	if (isRecord(imageGeneration)) {
		return getStringValue(imageGeneration, "prompt");
	}
	return "";
}

function appendImageGenerationPart(parts: TimelineBodyPart[], event: BackendEvent): TimelineBodyPart[] {
	const data: Record<string, unknown> = getEventData(event);
	if (getStringValue(data, "toolName") !== "mcp_image_generate") {
		return parts;
	}

	const toolCallId: string = getToolCallKey(data, event);
	let nextPart: Extract<TimelineBodyPart, { type: "image_generation" }> | null = null;

	if (event.event === "agent.tool.call" || event.event === "tool.call") {
		nextPart = {
			type: "image_generation",
			status: "running",
			toolCallId,
			prompt: getImageGenerationPrompt(data)
		};
	} else if (event.event === "agent.tool.result" || event.event === "tool.result") {
		const imageGeneration: unknown = data.imageGeneration;
		if (!isRecord(imageGeneration)) {
			return parts;
		}
		const artifactsValue: unknown = imageGeneration.artifacts;
		nextPart = {
			type: "image_generation",
			status: "completed",
			toolCallId,
			prompt: getStringValue(imageGeneration, "prompt") || getImageGenerationPrompt(data),
			provider: getStringValue(imageGeneration, "provider"),
			model: getStringValue(imageGeneration, "model"),
			artifacts: Array.isArray(artifactsValue)
				? artifactsValue.filter(isRecord) as Extract<TimelineBodyPart, { type: "image_generation" }>["artifacts"]
				: []
		};
	} else if (event.event === "agent.tool.error" || event.event === "tool.error") {
		nextPart = {
			type: "image_generation",
			status: "failed",
			toolCallId,
			prompt: getImageGenerationPrompt(data),
			error: getStringValue(data, "message")
		};
	}

	if (nextPart === null) {
		return parts;
	}

	let replaced: boolean = false;
	const nextParts: TimelineBodyPart[] = parts.map((part: TimelineBodyPart): TimelineBodyPart => {
		if (part.type !== "image_generation" || part.toolCallId !== toolCallId) {
			return part;
		}
		replaced = true;
		return {
			...nextPart,
			prompt: nextPart.prompt.length > 0 ? nextPart.prompt : part.prompt
		};
	});

	return replaced ? nextParts : [...parts, nextPart];
}

function appendSummaryStartPart(parts: TimelineBodyPart[], event: BackendEvent): TimelineBodyPart[] {
	const data: Record<string, unknown> = getEventData(event);
	const stepRunId: string = getStringValue(data, "stepRunId");

	if (stepRunId.length > 0 && parts.some((part: TimelineBodyPart): boolean => part.type === "summary_start" && part.stepRunId === stepRunId)) {
		return parts;
	}

	return [...parts, {
		type: "summary_start",
		runId: getStringValue(data, "runId"),
		stepId: getStringValue(data, "stepId"),
		stepRunId,
		title: getStringValue(data, "title") || "Summary",
		foldTitle: getStringValue(data, "foldTitle") || "Process"
	}];
}

function getAssistantContent(parts: TimelineBodyPart[], fallback: string): string {
	const content: string = parts
		.filter((part: TimelineBodyPart): part is Extract<TimelineBodyPart, { type: "markdown" }> => part.type === "markdown")
		.map((part: Extract<TimelineBodyPart, { type: "markdown" }>): string => part.text)
		.join("");

	return content.length > 0 ? content : fallback;
}

function bodyPartHasRunId(part: TimelineBodyPart, runId: string): boolean {
	if (runId.length === 0) {
		return false;
	}

	if (part.type === "summary_start") {
		return part.runId === runId;
	}

	if (part.type === "tool") {
		return part.events.some((toolEvent: Record<string, unknown>): boolean => getStringValue(toolEvent, "runId") === runId);
	}

	return false;
}

function assistantBlockMatchesEvent(block: TimelineAssistantBlock, event: BackendEvent): boolean {
	if (block.requestId === event.id) {
		return true;
	}

	const runId: string = getStringValue(getEventData(event), "runId");
	return block.bodyParts.some((part: TimelineBodyPart): boolean => bodyPartHasRunId(part, runId));
}

function updateAssistantBlockFromEvent(block: TimelineAssistantBlock, event: BackendEvent): TimelineAssistantBlock {
	const data: Record<string, unknown> = getEventData(event);
	const nowIso: string = new Date().toISOString();
	let nextParts: TimelineBodyPart[] = block.bodyParts;
	let nextStatus: TimelineAssistantBlock["status"] = block.status;
	let completedAtUtc: string = block.completedAtUtc;

	if (event.event === "ai.delta" || event.event === "agent.message.delta") {
		nextParts = appendMarkdownPart(nextParts, getStringValue(data, "text"));
	} else if (event.event === "ai.thinking.delta" || event.event === "agent.thinking.delta") {
		nextParts = appendThinkingPart(nextParts, getStringValue(data, "text"), false);
	} else if (event.event === "ai.thinking.done" || event.event === "agent.thinking.done") {
		nextParts = appendThinkingPart(nextParts, "", true);
	} else if (event.event === "agent.summary.started") {
		nextParts = appendSummaryStartPart(nextParts, event);
	} else if (event.event === "ai.status") {
		const title: string = getStringValue(data, "title") || getStringValue(data, "stage");
		const details: string = getStringValue(data, "details") || getStringValue(data, "detail") || getStringValue(data, "message");
		nextParts = [...nextParts, {
			type: "status",
			status: getStringValue(data, "status") || "message",
			title,
			details,
			code: getStringValue(data, "code")
		}];
	} else if (event.event.startsWith("agent.tool.") || event.event.startsWith("tool.")) {
		nextParts = appendImageGenerationPart(appendToolPart(nextParts, event), event);
	} else if (event.event === "plan.generated" || event.event === "plan.revised") {
		const planId: string = getStringValue(data, "planId");

		if (planId.length > 0) {
			nextParts = [...nextParts, {
				type: "plan",
				planId,
				title: getStringValue(data, "title") || "Plan",
				status: getStringValue(data, "status"),
				previewMarkdown: getStringValue(data, "previewMarkdown") || getStringValue(data, "markdown")
			}];
		}
	} else if (event.event === "agent.run.error" || event.event === "workflow.error") {
		nextStatus = "failed";
		completedAtUtc = nowIso;
		nextParts = [...nextParts, {
			type: "status",
			status: "error",
			title: "后端返回错误",
			details: getStringValue(data, "message") || "Unknown backend error",
			code: getStringValue(data, "code") || "agent_run_error"
		}];
	} else if (event.event === "agent.run.cancelled" || event.event === "ai.cancelled") {
		nextStatus = undefined;
		completedAtUtc = nowIso;
		nextParts = [...nextParts, {
			type: "status",
			status: "info",
			title: "已停止",
			details: getStringValue(data, "reason") || "用户停止了本次响应",
			code: "cancelled"
		}];
	} else if (event.event === "agent.message.done" || event.event === "agent.run.done" || event.event === "workflow.done" || event.event === "ai.done") {
		nextStatus = undefined;
		completedAtUtc = nowIso;
	} else {
		return block;
	}

	return {
		...block,
		content: getAssistantContent(nextParts, block.content),
		completedAtUtc,
		status: nextStatus,
		bodyParts: nextParts
	};
}

function shouldCreateAssistantBlock(event: BackendEvent): boolean {
	return event.event === "ai.delta"
		|| event.event === "agent.message.delta"
		|| event.event === "ai.thinking.delta"
		|| event.event === "agent.thinking.delta"
		|| event.event === "agent.summary.started"
		|| event.event.startsWith("agent.tool.")
		|| event.event.startsWith("tool.")
		|| event.event === "ai.status"
		|| event.event === "plan.generated"
		|| event.event === "plan.revised";
}

function createLiveAssistantBlock(event: BackendEvent): TimelineAssistantBlock {
	const nowIso: string = new Date().toISOString();

	return updateAssistantBlockFromEvent({
		id: `live:${event.id}:assistant`,
		type: "assistant",
		requestId: event.id,
		content: "",
		startedAtUtc: nowIso,
		completedAtUtc: nowIso,
		status: "running",
		bodyParts: []
	}, event);
}

export function applyBackendEventToTimeline(blocks: TimelineBlock[], event: BackendEvent): TimelineBlock[] {
	let changed: boolean = false;
	const nextBlocks: TimelineBlock[] = blocks.map((block: TimelineBlock): TimelineBlock => {
		if (block.type !== "assistant" || !assistantBlockMatchesEvent(block, event)) {
			return block;
		}

		changed = true;
		return updateAssistantBlockFromEvent(block, event);
	});

	if (changed) {
		return nextBlocks;
	}

	if (!shouldCreateAssistantBlock(event)) {
		return blocks;
	}

	return [...blocks, createLiveAssistantBlock(event)];
}

export function createTimelinePageFromOpenResult(result: SessionOpenResult): TimelinePageState {
	return {
		blocks: result.timelineBlocks,
		blockCount: result.blockCount,
		blockOffset: result.blockOffset,
		hasMoreBefore: result.hasMoreBefore,
		hasMoreAfter: result.hasMoreAfter
	};
}

export function createTimelinePageFromTimelineResult(result: SessionTimelineResult): TimelinePageState {
	return {
		blocks: result.timelineBlocks,
		blockCount: result.blockCount,
		blockOffset: result.blockOffset,
		hasMoreBefore: result.hasMoreBefore,
		hasMoreAfter: result.hasMoreAfter
	};
}

export function mergeTimelineBefore(current: TimelinePageState, page: TimelinePageState): TimelinePageState {
	const knownIds: Set<string> = new Set(page.blocks.map((block: TimelineBlock): string => block.id));

	return {
		...page,
		blocks: [
			...page.blocks,
			...current.blocks.filter((block: TimelineBlock): boolean => !knownIds.has(block.id))
		],
		hasMoreAfter: current.hasMoreAfter,
		blockCount: Math.max(current.blockCount, page.blockCount)
	};
}

export function mergeTimelineAfter(current: TimelinePageState, page: TimelinePageState): TimelinePageState {
	const knownIds: Set<string> = new Set(current.blocks.map((block: TimelineBlock): string => block.id));

	return {
		...page,
		blockOffset: current.blockOffset,
		blocks: [
			...current.blocks,
			...page.blocks.filter((block: TimelineBlock): boolean => !knownIds.has(block.id))
		],
		hasMoreBefore: current.hasMoreBefore,
		blockCount: Math.max(current.blockCount, page.blockCount)
	};
}

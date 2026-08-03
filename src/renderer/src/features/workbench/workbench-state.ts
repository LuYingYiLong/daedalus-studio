import type { BackendEvent } from "@/shared/api/transport/backend-rpc-client";
import type { SessionOpenResult, SessionTimelineResult, TimelineAssistantBlock, TimelineBlock, TimelineBodyPart, WorkbenchSnapshot } from "@/api/types";

export type TimelinePageState = {
	sessionId: string | null;
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
	sessionId: null,
	blocks: [],
	blockCount: 0,
	blockOffset: 0,
	hasMoreBefore: false,
	hasMoreAfter: false
};

export const MAX_TIMELINE_WINDOW_BLOCKS: number = 400;
const TIMELINE_STREAM_DELTA_EVENTS: ReadonlySet<string> = new Set([
	"agent.message.delta",
	"agent.thinking.delta"
]);

export const initialWorkbenchSessionState: WorkbenchSessionState = {
	activeSessionId: null,
	workbench: null,
	timeline: emptyTimelinePage
};

export function applyWorkbenchSnapshot(current: WorkbenchSnapshot | null, next: WorkbenchSnapshot): WorkbenchSnapshot {
	if (current !== null && next.revision < current.revision) {
		return current;
	}

	const currentRunSequence: number | undefined = current?.activeRun.sequence;
	const nextRunSequence: number | undefined = next.activeRun.sequence;
	if (
		current !== null
		&& typeof currentRunSequence === "number"
		&& typeof nextRunSequence === "number"
		&& nextRunSequence < currentRunSequence
	) {
		return {
			...next,
			activeRun: current.activeRun
		};
	}

	return next;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function getEventData(event: BackendEvent): Record<string, unknown> {
	return isRecord(event.data) ? event.data : {};
}

function getTransportRequestId(event: BackendEvent): string {
	return event.requestId ?? event.id ?? "";
}

function getTransportEventId(event: BackendEvent): string {
	return event.eventId ?? event.id ?? getTransportRequestId(event);
}

function getStringValue(record: Record<string, unknown>, key: string): string {
	const value: unknown = record[key];

	return typeof value === "string" ? value : "";
}

export function isTimelineStreamingDeltaEvent(event: BackendEvent): boolean {
	return TIMELINE_STREAM_DELTA_EVENTS.has(event.event);
}

function getTimelineStreamingEventKey(event: BackendEvent): string {
	const data: Record<string, unknown> = getEventData(event);
	const requestId: string = getTransportRequestId(event);
	const runId: string = getStringValue(data, "runId");
	const sessionId: string = getStringValue(data, "sessionId");

	return `${event.event}\u0000${sessionId}\u0000${requestId}\u0000${runId}`;
}

function coalesceTimelineStreamingEvents(events: readonly BackendEvent[]): BackendEvent[] {
	const coalescedEvents: BackendEvent[] = [];

	for (const event of events) {
		const previousEvent: BackendEvent | undefined = coalescedEvents[coalescedEvents.length - 1];
		if (
			previousEvent === undefined
			|| !isTimelineStreamingDeltaEvent(event)
			|| !isTimelineStreamingDeltaEvent(previousEvent)
			|| getTimelineStreamingEventKey(previousEvent) !== getTimelineStreamingEventKey(event)
		) {
			coalescedEvents.push(event);
			continue;
		}

		const previousData: Record<string, unknown> = getEventData(previousEvent);
		const currentData: Record<string, unknown> = getEventData(event);
		coalescedEvents[coalescedEvents.length - 1] = {
			...previousEvent,
			data: {
				...previousData,
				...currentData,
				text: getStringValue(previousData, "text") + getStringValue(currentData, "text")
			}
		};
	}

	return coalescedEvents;
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

function appendFinalMarkdownPart(parts: TimelineBodyPart[], text: string): TimelineBodyPart[] {
	if (text.length === 0) {
		return parts;
	}

	const existingContent: string = parts
		.filter((part: TimelineBodyPart): part is Extract<TimelineBodyPart, { type: "markdown" }> => part.type === "markdown")
		.map((part: Extract<TimelineBodyPart, { type: "markdown" }>): string => part.text)
		.join("");

	if (existingContent === text || existingContent.endsWith(text)) {
		return parts;
	}

	if (existingContent.length > 0 && text.startsWith(existingContent)) {
		return appendMarkdownPart(parts, text.slice(existingContent.length));
	}

	return appendMarkdownPart(parts, text);
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

const MAX_TERMINAL_RUNTIME_STREAM_CHARS: number = 6000;

function appendTerminalRuntimeTail(current: string, delta: string, omittedChars: number): { text: string; omittedChars: number } {
	const combined: string = current + delta;
	if (combined.length <= MAX_TERMINAL_RUNTIME_STREAM_CHARS) {
		return { text: combined, omittedChars };
	}
	return {
		text: combined.slice(-MAX_TERMINAL_RUNTIME_STREAM_CHARS),
		omittedChars: omittedChars + combined.length - MAX_TERMINAL_RUNTIME_STREAM_CHARS
	};
}

function truncateTextByCodePoints(text: string, count: number): { text: string; removed: number } {
	if (count <= 0 || text.length === 0) return { text, removed: 0 };
	const codePoints: string[] = Array.from(text);
	const removed: number = Math.min(Math.trunc(count), codePoints.length);
	return { text: codePoints.slice(0, codePoints.length - removed).join(""), removed };
}

function discardAttemptText(parts: TimelineBodyPart[], type: "markdown" | "thinking", count: number): TimelineBodyPart[] {
	let remaining: number = Number.isFinite(count) ? Math.max(0, Math.trunc(count)) : 0;
	if (remaining === 0) return parts;
	const nextParts: TimelineBodyPart[] = [...parts];
	for (let index: number = nextParts.length - 1; index >= 0 && remaining > 0; index -= 1) {
		const part: TimelineBodyPart = nextParts[index]!;
		if (part.type !== type) continue;
		const truncated = truncateTextByCodePoints(part.text, remaining);
		remaining -= truncated.removed;
		if (truncated.text.length === 0) {
			nextParts.splice(index, 1);
		} else {
			nextParts[index] = { ...part, text: truncated.text };
		}
	}
	return nextParts;
}

function getFiniteNumber(record: Record<string, unknown>, key: string): number {
	const value: unknown = record[key];
	return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function appendProviderReconnectPart(parts: TimelineBodyPart[], data: Record<string, unknown>): TimelineBodyPart[] {
	const reconnectId: string = getStringValue(data, "reconnectId");
	const revision: number = getFiniteNumber(data, "revision");
	if (reconnectId.length === 0 || revision <= 0) return parts;
	const existingIndex: number = parts.findIndex((part: TimelineBodyPart): boolean => (
		part.type === "provider_reconnect" && part.reconnectId === reconnectId
	));
	const existing: Extract<TimelineBodyPart, { type: "provider_reconnect" }> | undefined = existingIndex >= 0
		? parts[existingIndex] as Extract<TimelineBodyPart, { type: "provider_reconnect" }>
		: undefined;
	if (existing !== undefined && existing.revision >= revision) return parts;

	let nextParts: TimelineBodyPart[] = discardAttemptText(parts, "markdown", getFiniteNumber(data, "discardedMessageCodePoints"));
	nextParts = discardAttemptText(nextParts, "thinking", getFiniteNumber(data, "discardedThinkingCodePoints"));
	const status: string = getStringValue(data, "status");
	const reason: string = getStringValue(data, "reason");
	const part: Extract<TimelineBodyPart, { type: "provider_reconnect" }> = {
		type: "provider_reconnect",
		reconnectId,
		revision,
		provider: getStringValue(data, "provider"),
		model: getStringValue(data, "model"),
		status: status === "reconnecting" || status === "recovered" || status === "failed" ? status : "waiting",
		reason: reason === "idle_timeout" || reason === "gateway" || reason === "rate_limit" || reason === "server" ? reason : "transport",
		attempt: Math.max(0, Math.trunc(getFiniteNumber(data, "attempt"))),
		maxAttempts: getFiniteNumber(data, "maxAttempts") === 15 ? 15 : 5,
		timeoutMs: Math.max(0, Math.trunc(getFiniteNumber(data, "timeoutMs"))),
		autoExtended: data.autoExtended === true,
		...(getStringValue(data, "retryAt").length === 0 ? {} : { retryAt: getStringValue(data, "retryAt") })
	};
	const currentIndex: number = nextParts.findIndex((item: TimelineBodyPart): boolean => (
		item.type === "provider_reconnect" && item.reconnectId === reconnectId
	));
	if (currentIndex < 0) return [...nextParts, part];
	return nextParts.map((item: TimelineBodyPart, index: number): TimelineBodyPart => index === currentIndex ? part : item);
}

function mergeTerminalOutputProgress(
	events: Record<string, unknown>[],
	normalizedEvent: Record<string, unknown>
): Record<string, unknown>[] {
	const delta: unknown = normalizedEvent.terminalOutputDelta;
	if (!isRecord(delta) || (delta.stream !== "stdout" && delta.stream !== "stderr")) {
		return [...events, normalizedEvent];
	}
	const sequence: number = typeof delta.sequence === "number" && Number.isFinite(delta.sequence) ? delta.sequence : 0;
	const deltaText: string = getStringValue(delta, "text");
	const deltaOmittedChars: number = typeof delta.omittedChars === "number" && Number.isFinite(delta.omittedChars)
		? Math.max(0, Math.floor(delta.omittedChars))
		: 0;
	const existingIndex: number = events.findIndex((item: Record<string, unknown>): boolean => item.code === "terminal_output");
	const existingEvent: Record<string, unknown> = existingIndex < 0 ? {} : events[existingIndex]!;
	const runtimeOutput: Record<string, unknown> = isRecord(existingEvent.terminalRuntimeOutput)
		? existingEvent.terminalRuntimeOutput
		: {};
	const lastSequence: number = typeof runtimeOutput.lastSequence === "number" ? runtimeOutput.lastSequence : 0;
	if (sequence <= lastSequence) {
		return events;
	}
	const stream: "stdout" | "stderr" = delta.stream;
	const currentText: string = typeof runtimeOutput[stream] === "string" ? runtimeOutput[stream] : "";
	const omittedKey: "stdoutOmittedChars" | "stderrOmittedChars" = stream === "stdout" ? "stdoutOmittedChars" : "stderrOmittedChars";
	const currentOmittedChars: number = typeof runtimeOutput[omittedKey] === "number" ? runtimeOutput[omittedKey] : 0;
	const nextTail = appendTerminalRuntimeTail(currentText, deltaText, Math.max(currentOmittedChars, deltaOmittedChars));
	const mergedEvent: Record<string, unknown> = {
		...normalizedEvent,
		terminalRuntimeOutput: {
			...runtimeOutput,
			[stream]: nextTail.text,
			[omittedKey]: nextTail.omittedChars,
			lastSequence: sequence
		}
	};
	delete mergedEvent.terminalOutputDelta;

	if (existingIndex < 0) {
		return [...events, mergedEvent];
	}
	return events.map((item: Record<string, unknown>, index: number): Record<string, unknown> => (
		index === existingIndex ? mergedEvent : item
	));
}

function appendToolPart(parts: TimelineBodyPart[], event: BackendEvent): TimelineBodyPart[] {
	const data: Record<string, unknown> = getEventData(event);
	const toolCallId: string = getStringValue(data, "toolCallId")
		|| getStringValue(data, "approvalId")
		|| `${getStringValue(data, "toolName") || "tool"}:${getTransportEventId(event)}`;
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

				const nextEvents: Record<string, unknown>[] = normalizedEvent.code === "terminal_output"
					? mergeTerminalOutputProgress(item.events, normalizedEvent)
					: normalizedEvent.type === "tool.result" && isRecord(normalizedEvent.terminalDisplay)
						? [...item.events.filter((toolEvent: Record<string, unknown>): boolean => toolEvent.code !== "terminal_output"), normalizedEvent]
						: [...item.events, normalizedEvent];
				return {
					...item,
					events: nextEvents
				};
			});
		}
	}

	return [...parts, {
		type: "tool",
		tool_call_id: toolCallId,
		events: normalizedEvent.code === "terminal_output"
			? mergeTerminalOutputProgress([], normalizedEvent)
			: [normalizedEvent]
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
		|| `${getStringValue(data, "toolName") || "tool"}:${getTransportEventId(event)}`;
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

	if (event.event === "agent.tool.call") {
		nextPart = {
			type: "image_generation",
			status: "running",
			toolCallId,
			prompt: getImageGenerationPrompt(data)
		};
	} else if (event.event === "agent.tool.result") {
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
	} else if (event.event === "agent.tool.error") {
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

function bodyPartHasPlanId(part: TimelineBodyPart, planId: string): boolean {
	if (planId.length === 0) {
		return false;
	}

	if (part.type === "plan") {
		return part.planId === planId;
	}

	if (part.type === "status") {
		return part.planId === planId;
	}

	if (part.type === "tool") {
		return part.events.some((toolEvent: Record<string, unknown>): boolean => getStringValue(toolEvent, "planId") === planId);
	}

	return false;
}

function getCanonicalEventRequestId(event: BackendEvent): string {
	const data: Record<string, unknown> = getEventData(event);

	if (event.event === "plan.execution.started") {
		const executionRequestId: string = getStringValue(data, "executionRequestId");
		return executionRequestId.length > 0 ? executionRequestId : getTransportRequestId(event);
	}

	const requestId: string = getStringValue(data, "requestId");
	if (requestId.length > 0) {
		const mode: string = getStringValue(data, "mode");
		const planId: string = getStringValue(data, "planId");
		if (event.event.startsWith("plan.") || mode === "plan" || planId.length > 0 || event.event === "agent.message.done") {
			return requestId;
		}
	}

	return getTransportRequestId(event);
}

function assistantBlockHasPlanId(block: TimelineAssistantBlock, planId: string): boolean {
	if (planId.length === 0) {
		return false;
	}

	return block.bodyParts.some((part: TimelineBodyPart): boolean => bodyPartHasPlanId(part, planId));
}

function getEventPlanId(event: BackendEvent): string {
	const data: Record<string, unknown> = getEventData(event);
	const planId: string = getStringValue(data, "planId");
	if (planId.length > 0) {
		return planId;
	}

	const operationPlanId: string = getStringValue(data, "operationPlanId");
	if (operationPlanId.length > 0) {
		return operationPlanId;
	}

	return "";
}

function getExistingPlanRequestId(blocks: TimelineBlock[], planId: string): string | null {
	if (planId.length === 0) {
		return null;
	}

	for (const block of blocks) {
		if (block.type === "assistant" && assistantBlockHasPlanId(block, planId)) {
			return block.requestId;
		}
	}

	return null;
}

function getCanonicalEventRequestIdForTimeline(blocks: TimelineBlock[], event: BackendEvent): string {
	const requestId: string = getCanonicalEventRequestId(event);
	if (requestId !== getTransportRequestId(event)) {
		return requestId;
	}

	const existingPlanRequestId: string | null = getExistingPlanRequestId(blocks, getEventPlanId(event));
	if (existingPlanRequestId !== null) {
		return existingPlanRequestId;
	}

	return requestId;
}

function rewriteEventForTimeline(blocks: TimelineBlock[], event: BackendEvent): BackendEvent {
	const requestId: string = getCanonicalEventRequestIdForTimeline(blocks, event);
	if (requestId === getTransportRequestId(event)) {
		return event;
	}

	const data: Record<string, unknown> = getEventData(event);
	return {
		...event,
		requestId,
		data
	};
}

function replaceOrAppendPlanPart(parts: TimelineBodyPart[], planPart: Extract<TimelineBodyPart, { type: "plan" }>): TimelineBodyPart[] {
	const existingIndex: number = parts.findIndex((part: TimelineBodyPart): boolean => {
		return part.type === "plan" && part.planId === planPart.planId;
	});

	if (existingIndex < 0) {
		return [...parts, planPart];
	}

	return parts.map((part: TimelineBodyPart, index: number): TimelineBodyPart => {
		return index === existingIndex ? planPart : part;
	});
}

function hasStatusCode(parts: readonly TimelineBodyPart[], code: string): boolean {
	return parts.some((part: TimelineBodyPart): boolean => part.type === "status" && part.code === code);
}

function hasErrorStatusDetails(parts: readonly TimelineBodyPart[], details: string): boolean {
	return details.length > 0 && parts.some((part: TimelineBodyPart): boolean => {
		return part.type === "status" && part.status === "error" && part.details === details;
	});
}

function failRunningImageGenerationParts(
	parts: readonly TimelineBodyPart[],
	error: string
): TimelineBodyPart[] {
	return parts.map((part: TimelineBodyPart): TimelineBodyPart => {
		return part.type === "image_generation" && part.status === "running"
			? { ...part, status: "failed", error }
			: part;
	});
}

function assistantBlockMatchesEvent(block: TimelineAssistantBlock, event: BackendEvent): boolean {
	if (block.requestId === getTransportRequestId(event) || block.requestId === getCanonicalEventRequestId(event)) {
		return true;
	}

	const runId: string = getStringValue(getEventData(event), "runId");
	if (block.bodyParts.some((part: TimelineBodyPart): boolean => bodyPartHasRunId(part, runId))) {
		return true;
	}

	return assistantBlockHasPlanId(block, getEventPlanId(event));
}

function updateAssistantBlockFromEvent(block: TimelineAssistantBlock, event: BackendEvent): TimelineAssistantBlock {
	const data: Record<string, unknown> = getEventData(event);
	const nowIso: string = new Date().toISOString();
	let nextParts: TimelineBodyPart[] = block.bodyParts;
	let nextStatus: TimelineAssistantBlock["status"] = block.status;
	let completedAtUtc: string = block.completedAtUtc;

	if (event.event === "agent.run.state") {
		const stage: string = getStringValue(data, "stage");
		const terminal: Record<string, unknown> = isRecord(data.terminal) ? data.terminal : {};
		if (stage === "failed") {
			nextStatus = "failed";
			completedAtUtc = getStringValue(terminal, "completedAt") || nowIso;
			const details: string = getStringValue(terminal, "message") || "Unknown backend error";
			nextParts = failRunningImageGenerationParts(nextParts, details);
			if (!hasErrorStatusDetails(nextParts, details)) {
				nextParts = [...nextParts, {
					type: "status",
					status: "error",
					title: "Run failed",
					details,
					code: "agent_run_error"
				}];
			}
		} else if (stage === "cancelled") {
			nextStatus = undefined;
			completedAtUtc = getStringValue(terminal, "completedAt") || nowIso;
			nextParts = failRunningImageGenerationParts(nextParts, "Image generation was cancelled.");
			if (!hasStatusCode(nextParts, "cancelled")) {
				nextParts = [...nextParts, {
					type: "status",
					status: "info",
					title: "Stopped",
					details: getStringValue(terminal, "message") || "The response was stopped by the user.",
					code: "cancelled"
				}];
			}
		} else if (stage === "completed") {
			nextStatus = undefined;
			completedAtUtc = getStringValue(terminal, "completedAt") || nowIso;
		} else if (stage === "interrupted") {
			nextStatus = undefined;
			completedAtUtc = nowIso;
			nextParts = failRunningImageGenerationParts(nextParts, "Image generation was interrupted.");
			if (!hasStatusCode(nextParts, "agent_run_interrupted")) {
				nextParts = [...nextParts, {
					type: "status",
					status: "warning",
					title: "Run interrupted",
					details: "The backend stopped before this run reached a terminal state. Retry from its safe checkpoint.",
					code: "agent_run_interrupted",
					actionLabel: "Retry from checkpoint",
					actionId: `retry_agent_run:${getStringValue(data, "runId")}`
				}];
			}
		} else {
			nextStatus = "running";
			completedAtUtc = nowIso;
		}
	} else if (event.event === "agent.message.delta") {
		nextParts = appendMarkdownPart(nextParts, getStringValue(data, "text"));
	} else if (event.event === "agent.thinking.delta") {
		nextParts = appendThinkingPart(nextParts, getStringValue(data, "text"), false);
	} else if (event.event === "agent.thinking.done") {
		nextParts = appendThinkingPart(nextParts, "", true);
	} else if (event.event === "agent.provider.reconnect") {
		nextParts = appendProviderReconnectPart(nextParts, data);
	} else if (event.event === "agent.summary.started") {
		nextParts = appendSummaryStartPart(nextParts, event);
	} else if (event.event === "agent.status") {
		const title: string = getStringValue(data, "title") || getStringValue(data, "stage");
		const details: string = getStringValue(data, "details") || getStringValue(data, "detail") || getStringValue(data, "message");
		nextParts = [...nextParts, {
			type: "status",
			status: getStringValue(data, "status") || "message",
			title,
			details,
			code: getStringValue(data, "code")
		}];
	} else if (event.event.startsWith("agent.tool.")) {
		nextParts = appendImageGenerationPart(appendToolPart(nextParts, event), event);
	} else if (event.event === "plan.generated" || event.event === "plan.revised") {
		const planId: string = getStringValue(data, "planId");

		if (planId.length > 0) {
			nextParts = replaceOrAppendPlanPart(nextParts, {
				type: "plan",
				planId,
				title: getStringValue(data, "title") || "Plan",
				status: getStringValue(data, "status"),
				previewMarkdown: getStringValue(data, "previewMarkdown") || getStringValue(data, "markdown")
			});
		}
	} else if (event.event === "plan.error") {
		nextStatus = "failed";
		completedAtUtc = nowIso;
		const details: string = getStringValue(data, "message") || "Unknown backend error";
		if (!hasErrorStatusDetails(nextParts, details)) {
			nextParts = [...nextParts, {
				type: "status",
				status: "error",
				title: "鍚庣杩斿洖閿欒",
				details,
				code: getStringValue(data, "code") || "agent_run_error"
			}];
		}
	} else if (event.event === "agent.message.done") {
		nextStatus = undefined;
		completedAtUtc = nowIso;
		nextParts = appendFinalMarkdownPart(nextParts, getStringValue(data, "text"));
	} else {
		return block;
	}

	return {
		...block,
		content: getAssistantContent(nextParts, event.event === "agent.provider.reconnect" ? "" : block.content),
		completedAtUtc,
		status: nextStatus,
		bodyParts: nextParts
	};
}

function shouldCreateAssistantBlock(event: BackendEvent): boolean {
	return event.event === "agent.run.state"
		|| event.event === "agent.message.delta"
		|| event.event === "agent.thinking.delta"
		|| event.event === "agent.provider.reconnect"
		|| event.event === "agent.summary.started"
		|| event.event.startsWith("agent.tool.")
		|| event.event === "agent.status"
		|| event.event === "plan.generated"
		|| event.event === "plan.revised"
		|| event.event === "plan.error";
}

function createLiveAssistantBlock(event: BackendEvent): TimelineAssistantBlock {
	const nowIso: string = new Date().toISOString();
	const requestId: string = getCanonicalEventRequestId(event);

	return updateAssistantBlockFromEvent({
		id: `live:${requestId}:assistant`,
		type: "assistant",
		requestId,
		content: "",
		startedAtUtc: nowIso,
		completedAtUtc: nowIso,
		status: "running",
		bodyParts: []
	}, event);
}

export function applyBackendEventToTimeline(blocks: TimelineBlock[], event: BackendEvent): TimelineBlock[] {
	const canonicalEvent: BackendEvent = rewriteEventForTimeline(blocks, event);
	let changed: boolean = false;
	const nextBlocks: TimelineBlock[] = blocks.map((block: TimelineBlock): TimelineBlock => {
		if (block.type !== "assistant" || !assistantBlockMatchesEvent(block, canonicalEvent)) {
			return block;
		}

		changed = true;
		return updateAssistantBlockFromEvent(block, canonicalEvent);
	});

	if (changed) {
		return nextBlocks;
	}

	if (!shouldCreateAssistantBlock(canonicalEvent)) {
		return blocks;
	}

	return [...blocks, createLiveAssistantBlock(canonicalEvent)];
}

export function applyBackendEventsToTimeline(blocks: TimelineBlock[], events: readonly BackendEvent[]): TimelineBlock[] {
	return coalesceTimelineStreamingEvents(events).reduce(
		(currentBlocks: TimelineBlock[], event: BackendEvent): TimelineBlock[] => applyBackendEventToTimeline(currentBlocks, event),
		blocks
	);
}

export function createTimelinePageFromOpenResult(result: SessionOpenResult): TimelinePageState {
	return {
		sessionId: result.metadata.id,
		blocks: result.timelineBlocks,
		blockCount: result.blockCount,
		blockOffset: result.blockOffset,
		hasMoreBefore: result.hasMoreBefore,
		hasMoreAfter: result.hasMoreAfter
	};
}

export function createTimelinePageFromTimelineResult(result: SessionTimelineResult): TimelinePageState {
	return {
		sessionId: result.sessionId,
		blocks: result.timelineBlocks,
		blockCount: result.blockCount,
		blockOffset: result.blockOffset,
		hasMoreBefore: result.hasMoreBefore,
		hasMoreAfter: result.hasMoreAfter
	};
}

export function mergeTimelineBefore(current: TimelinePageState, page: TimelinePageState): TimelinePageState {
	if (current.sessionId !== null && page.sessionId !== null && current.sessionId !== page.sessionId) {
		console.warn("[Timeline] ignored previous page for different session", {
			currentSessionId: current.sessionId,
			pageSessionId: page.sessionId
		});
		return current;
	}

	const knownIds: Set<string> = new Set(page.blocks.map((block: TimelineBlock): string => block.id));
	const mergedBlocks: TimelineBlock[] = [
		...page.blocks,
		...current.blocks.filter((block: TimelineBlock): boolean => !knownIds.has(block.id))
	];
	const trimmedBlocks: TimelineBlock[] = mergedBlocks.slice(0, MAX_TIMELINE_WINDOW_BLOCKS);
	const trimmedAfterCount: number = Math.max(0, mergedBlocks.length - trimmedBlocks.length);

	return {
		...page,
		sessionId: current.sessionId ?? page.sessionId,
		blocks: trimmedBlocks,
		hasMoreAfter: current.hasMoreAfter || trimmedAfterCount > 0,
		blockCount: Math.max(current.blockCount, page.blockCount)
	};
}

export function mergeTimelineAfter(current: TimelinePageState, page: TimelinePageState): TimelinePageState {
	if (current.sessionId !== null && page.sessionId !== null && current.sessionId !== page.sessionId) {
		console.warn("[Timeline] ignored next page for different session", {
			currentSessionId: current.sessionId,
			pageSessionId: page.sessionId
		});
		return current;
	}

	const knownIds: Set<string> = new Set(current.blocks.map((block: TimelineBlock): string => block.id));
	const mergedBlocks: TimelineBlock[] = [
		...current.blocks,
		...page.blocks.filter((block: TimelineBlock): boolean => !knownIds.has(block.id))
	];
	const trimmedBeforeCount: number = Math.max(0, mergedBlocks.length - MAX_TIMELINE_WINDOW_BLOCKS);
	const trimmedBlocks: TimelineBlock[] = trimmedBeforeCount > 0
		? mergedBlocks.slice(trimmedBeforeCount)
		: mergedBlocks;

	return {
		...page,
		sessionId: current.sessionId ?? page.sessionId,
		blockOffset: current.blockOffset + trimmedBeforeCount,
		blocks: trimmedBlocks,
		hasMoreBefore: current.hasMoreBefore || trimmedBeforeCount > 0,
		blockCount: Math.max(current.blockCount, page.blockCount)
	};
}

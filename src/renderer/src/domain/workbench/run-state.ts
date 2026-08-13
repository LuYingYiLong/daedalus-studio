import type { AgentRunState, WorkbenchActiveRun, WorkbenchSnapshot } from "@/platform/rpc/types";
import type { BackendEvent } from "@/platform/rpc/transport/backend-rpc-client";

export type RunControllerStatus = WorkbenchActiveRun["status"];

export type RunControllerState = {
	status: RunControllerStatus;
	requestId: string | null;
	startedAt: string | null;
	queueItemId: number | null;
	statusCode: string | null;
	sequence: number;
	workbenchSequence: number;
	agentRun: AgentRunState | null;
};

const ACTIVE_RUN_STATUSES: readonly RunControllerStatus[] = ["streaming", "approval", "paused", "cancelling"];
const TERMINAL_RUN_STAGES: ReadonlySet<AgentRunState["stage"]> = new Set(["completed", "failed", "cancelled"]);

export function createIdleRunState(
	sequence: number = 0,
	agentRun: AgentRunState | null = null,
	workbenchSequence: number = 0
): RunControllerState {
	return {
		status: "idle",
		requestId: null,
		startedAt: null,
		queueItemId: null,
		statusCode: null,
		sequence,
		workbenchSequence,
		agentRun
	};
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isAgentRunState(value: unknown): value is AgentRunState {
	if (!isRecord(value)) {
		return false;
	}
	return value.schemaVersion === 1
		&& typeof value.runId === "string"
		&& typeof value.requestId === "string"
		&& typeof value.revision === "number"
		&& typeof value.stage === "string"
		&& typeof value.lane === "string";
}

function getWorkbenchActiveRunSequence(activeRun: WorkbenchActiveRun, fallbackSequence: number): number {
	return typeof activeRun.sequence === "number" && Number.isFinite(activeRun.sequence)
		? activeRun.sequence
		: fallbackSequence;
}

function normalizeWorkbenchActiveRun(
	activeRun: WorkbenchActiveRun,
	workbenchSequence: number,
	eventSequence: number,
	agentRun: AgentRunState | null
): RunControllerState {
	if (activeRun.status === "idle") {
		return createIdleRunState(eventSequence, agentRun, workbenchSequence);
	}
	return {
		status: activeRun.status,
		requestId: activeRun.requestId ?? null,
		startedAt: activeRun.startedAt ?? null,
		queueItemId: activeRun.queueItemId ?? null,
		statusCode: activeRun.statusCode ?? null,
		sequence: eventSequence,
		workbenchSequence,
		agentRun
	};
}

export function applyRunStateFromWorkbench(
	current: RunControllerState,
	workbench: WorkbenchSnapshot | null,
	cancelledRequestIds?: ReadonlySet<string>
): RunControllerState {
	if (workbench === null) {
		return createIdleRunState(current.sequence, current.agentRun, current.workbenchSequence);
	}
	const workbenchSequence: number = getWorkbenchActiveRunSequence(workbench.activeRun, workbench.revision);
	if (workbenchSequence <= current.workbenchSequence) {
		return current;
	}
	const next: RunControllerState = normalizeWorkbenchActiveRun(
		workbench.activeRun,
		workbenchSequence,
		current.sequence,
		current.agentRun
	);
	if (next.requestId !== null && cancelledRequestIds?.has(next.requestId) === true) {
		return current;
	}
	return next;
}

export function applyAgentRunState(
	current: RunControllerState,
	run: AgentRunState,
	sequence: number = current.sequence + 1
): RunControllerState {
	if (sequence < current.sequence) {
		return current;
	}
	if (current.agentRun?.runId === run.runId && run.revision <= current.agentRun.revision) {
		return current;
	}
	const workbenchSequence: number = current.requestId === run.requestId
		? current.workbenchSequence
		: current.workbenchSequence + 1;
	if (run.stage === "interrupted" || TERMINAL_RUN_STAGES.has(run.stage)) {
		return createIdleRunState(sequence, run, workbenchSequence);
	}
	if (run.stage === "awaiting_approval" || run.stage === "awaiting_tool_budget") {
		return {
			status: "paused",
			requestId: run.requestId,
			startedAt: run.createdAt,
			queueItemId: null,
			statusCode: run.stage === "awaiting_tool_budget" ? "tool_budget" : "approval_required",
			sequence,
			workbenchSequence,
			agentRun: run
		};
	}
	return {
		status: "streaming",
		requestId: run.requestId,
		startedAt: run.createdAt,
		queueItemId: null,
		statusCode: run.stage,
		sequence,
		workbenchSequence,
		agentRun: run
	};
}

export function createOptimisticRunState(current: RunControllerState, requestId: string, startedAt: string = new Date().toISOString()): RunControllerState {
	return {
		status: "streaming",
		requestId,
		startedAt,
		queueItemId: null,
		statusCode: null,
		sequence: current.sequence + 1,
		workbenchSequence: current.workbenchSequence + 1,
		agentRun: null
	};
}

export function finishOptimisticRunState(current: RunControllerState, requestId: string): RunControllerState {
	if (current.requestId !== null && current.requestId !== requestId) {
		return current;
	}
	return createIdleRunState(current.sequence + 1, current.agentRun, current.workbenchSequence + 1);
}

export function applyRunStateFromBackendEvent(
	current: RunControllerState,
	event: BackendEvent,
	cancelledRequestIds?: ReadonlySet<string>
): RunControllerState {
	if (event.event === "agent.run.state" && isAgentRunState(event.data)) {
		if (
			!TERMINAL_RUN_STAGES.has(event.data.stage)
			&& (
				cancelledRequestIds?.has(event.data.requestId) === true
				|| cancelledRequestIds?.has(event.data.runId) === true
			)
		) {
			return current;
		}
		return applyAgentRunState(current, event.data, event.sequence);
	}
	if (event.event !== "agent.run.cancelled" || current.status === "idle") {
		return current;
	}

	const eventData: Record<string, unknown> | null = isRecord(event.data) ? event.data : null;
	const eventRequestIds: ReadonlySet<string> = new Set([
		event.requestId,
		event.id,
		eventData?.requestId,
		eventData?.runId
	].filter((value: unknown): value is string => typeof value === "string" && value.length > 0));
	const currentRequestIds: ReadonlySet<string> = new Set([
		current.requestId,
		current.agentRun?.runId,
		current.agentRun?.rootRequestId
	].filter((value: string | null | undefined): value is string => typeof value === "string" && value.length > 0));
	if (![...eventRequestIds].some((requestId: string): boolean => currentRequestIds.has(requestId))) {
		return current;
	}
	return createIdleRunState(current.sequence + 1, current.agentRun, current.workbenchSequence + 1);
}

export function isRunControllerActive(state: RunControllerState): boolean {
	return ACTIVE_RUN_STATUSES.includes(state.status);
}

export function getRunControllerRequestId(state: RunControllerState): string | null {
	return state.status === "idle" ? null : state.requestId;
}

import type { BackendEvent } from "@/api/backend-rpc-client";
import type { WorkbenchActiveRun, WorkbenchSnapshot } from "@/api/types";

export type RunControllerStatus = WorkbenchActiveRun["status"];

export type RunControllerState = {
	status: RunControllerStatus;
	requestId: string | null;
	startedAt: string | null;
	queueItemId: number | null;
	statusCode: string | null;
	sequence: number;
};

const ACTIVE_RUN_STATUSES: readonly RunControllerStatus[] = ["streaming", "approval", "paused", "cancelling"];

export function createIdleRunState(sequence: number = 0): RunControllerState {
	return {
		status: "idle",
		requestId: null,
		startedAt: null,
		queueItemId: null,
		statusCode: null,
		sequence
	};
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function getStringValue(record: Record<string, unknown>, key: string): string {
	const value: unknown = record[key];
	return typeof value === "string" ? value : "";
}

function getNumberValue(record: Record<string, unknown>, key: string): number | null {
	const value: unknown = record[key];
	return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function getEventData(event: BackendEvent): Record<string, unknown> {
	return isRecord(event.data) ? event.data : {};
}

function shouldApplySequencedState(current: RunControllerState, nextSequence: number | null, requestId: string | null): boolean {
	if (nextSequence !== null) {
		return nextSequence >= current.sequence;
	}
	if (requestId !== null && current.requestId !== null) {
		return requestId === current.requestId;
	}
	return current.status === "idle";
}

function normalizeWorkbenchActiveRun(activeRun: WorkbenchActiveRun, fallbackSequence: number): RunControllerState {
	const sequence: number = typeof activeRun.sequence === "number" && Number.isFinite(activeRun.sequence)
		? activeRun.sequence
		: fallbackSequence;
	if (activeRun.status === "idle") {
		return createIdleRunState(sequence);
	}

	return {
		status: activeRun.status,
		requestId: activeRun.requestId ?? null,
		startedAt: activeRun.startedAt ?? null,
		queueItemId: activeRun.queueItemId ?? null,
		statusCode: activeRun.statusCode ?? null,
		sequence
	};
}

export function applyRunStateFromWorkbench(current: RunControllerState, workbench: WorkbenchSnapshot | null): RunControllerState {
	if (workbench === null) {
		return createIdleRunState(current.sequence);
	}

	const next: RunControllerState = normalizeWorkbenchActiveRun(workbench.activeRun, workbench.revision);
	if (next.sequence < current.sequence) {
		return current;
	}

	return next;
}

export function createOptimisticRunState(current: RunControllerState, requestId: string, startedAt: string = new Date().toISOString()): RunControllerState {
	return {
		status: "streaming",
		requestId,
		startedAt,
		queueItemId: null,
		statusCode: null,
		sequence: current.sequence + 1
	};
}

export function finishOptimisticRunState(current: RunControllerState, requestId: string): RunControllerState {
	if (current.requestId !== null && current.requestId !== requestId) {
		return current;
	}

	return createIdleRunState(current.sequence + 1);
}

export function applyRunStateFromBackendEvent(current: RunControllerState, event: BackendEvent): RunControllerState {
	const data: Record<string, unknown> = getEventData(event);
	const requestId: string = getStringValue(data, "requestId") || event.id;
	const normalizedRequestId: string | null = requestId.length > 0 ? requestId : null;
	const sequence: number | null = getNumberValue(data, "sequence");
	if (!shouldApplySequencedState(current, sequence, normalizedRequestId)) {
		return current;
	}

	if (event.event === "agent.run.started") {
		return {
			status: "streaming",
			requestId: normalizedRequestId,
			startedAt: getStringValue(data, "startedAt") || null,
			queueItemId: getNumberValue(data, "queueItemId"),
			statusCode: getStringValue(data, "statusCode") || null,
			sequence: sequence ?? current.sequence + 1
		};
	}

	if (event.event === "agent.run.paused" || event.event === "agent.run.tool_budget_required") {
		return {
			status: "paused",
			requestId: normalizedRequestId,
			startedAt: current.requestId === normalizedRequestId ? current.startedAt : null,
			queueItemId: current.requestId === normalizedRequestId ? current.queueItemId : null,
			statusCode: getStringValue(data, "statusCode") || (event.event === "agent.run.tool_budget_required" ? "tool_budget" : getStringValue(data, "reason") || null),
			sequence: sequence ?? current.sequence + 1
		};
	}

	if (event.event === "agent.run.done" || event.event === "agent.run.error" || event.event === "agent.run.cancelled" || event.event === "workflow.done" || event.event === "ai.done") {
		return createIdleRunState(sequence ?? current.sequence + 1);
	}

	return current;
}

export function isRunControllerActive(state: RunControllerState): boolean {
	return ACTIVE_RUN_STATUSES.includes(state.status);
}

export function getRunControllerRequestId(state: RunControllerState): string | null {
	return state.status === "idle" ? null : state.requestId;
}

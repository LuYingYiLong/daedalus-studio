import type { AgentRunState } from "@/platform/rpc/types";
import type { BackendEvent } from "@/platform/rpc/transport/backend-rpc-client";

type SessionRunIdentity = {
	requestId: string;
	runId: string | null;
	revision: number;
};

export type RunningSessionState = ReadonlyMap<string, SessionRunIdentity>;

const INACTIVE_RUN_STAGES: ReadonlySet<string> = new Set([
	"completed",
	"failed",
	"cancelled",
	"interrupted"
]);

const TERMINAL_EVENT_NAMES: ReadonlySet<string> = new Set([
	"agent.message.done",
	"agent.run.done",
	"agent.run.error",
	"agent.run.cancelled"
]);

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readString(record: Record<string, unknown>, key: string): string {
	const value: unknown = record[key];
	return typeof value === "string" ? value.trim() : "";
}

function setSessionRun(
	current: RunningSessionState,
	sessionId: string,
	nextEntry: SessionRunIdentity | null
): RunningSessionState {
	const currentEntry: SessionRunIdentity | undefined = current.get(sessionId);
	if (nextEntry === null) {
		if (currentEntry === undefined) {
			return current;
		}
		const next: Map<string, SessionRunIdentity> = new Map(current);
		next.delete(sessionId);
		return next;
	}
	if (
		currentEntry?.requestId === nextEntry.requestId
		&& currentEntry.runId === nextEntry.runId
		&& currentEntry.revision === nextEntry.revision
	) {
		return current;
	}
	const next: Map<string, SessionRunIdentity> = new Map(current);
	next.set(sessionId, nextEntry);
	return next;
}

function getEventRequestId(event: BackendEvent): string {
	const dataRequestId: string = isRecord(event.data) ? readString(event.data, "requestId") : "";
	return dataRequestId.length > 0
		? dataRequestId
		: typeof event.requestId === "string"
			? event.requestId.trim()
			: "";
}

function getEventSessionId(event: BackendEvent): string {
	return typeof event.sessionId === "string" ? event.sessionId.trim() : "";
}

export function markSessionRunStarted(
	current: RunningSessionState,
	sessionId: string | null,
	requestId: string
): RunningSessionState {
	if (sessionId === null || sessionId.length === 0 || requestId.length === 0) {
		return current;
	}
	return setSessionRun(current, sessionId, {
		requestId,
		runId: null,
		revision: -1
	});
}

export function markSessionRunStopped(
	current: RunningSessionState,
	sessionId: string | null,
	requestId?: string
): RunningSessionState {
	if (sessionId === null || sessionId.length === 0) {
		return current;
	}
	const currentEntry: SessionRunIdentity | undefined = current.get(sessionId);
	if (currentEntry === undefined || (requestId !== undefined && currentEntry.requestId !== requestId)) {
		return current;
	}
	return setSessionRun(current, sessionId, null);
}

export function markRunStopped(
	current: RunningSessionState,
	requestId: string
): RunningSessionState {
	if (requestId.length === 0) {
		return current;
	}
	for (const [sessionId, entry] of current) {
		if (entry.requestId === requestId) {
			return setSessionRun(current, sessionId, null);
		}
	}
	return current;
}

export function removeRunningSessions(
	current: RunningSessionState,
	sessionIds: readonly string[]
): RunningSessionState {
	const removedIds: ReadonlySet<string> = new Set(sessionIds);
	if (![...removedIds].some((sessionId: string): boolean => current.has(sessionId))) {
		return current;
	}
	return new Map(
		[...current].filter(([sessionId]): boolean => !removedIds.has(sessionId))
	);
}

export function syncSessionRunFromOpen(
	current: RunningSessionState,
	sessionId: string,
	run: AgentRunState | null
): RunningSessionState {
	if (run === null || INACTIVE_RUN_STAGES.has(run.stage)) {
		return setSessionRun(current, sessionId, null);
	}
	return setSessionRun(current, sessionId, {
		requestId: run.requestId,
		runId: run.runId,
		revision: run.revision
	});
}

export function applyRunningSessionEvent(
	current: RunningSessionState,
	event: BackendEvent
): RunningSessionState {
	if (event.event === "session.workbench.updated" && typeof event.sessionId === "string" && isRecord(event.data)) {
		const sessionId: string = getEventSessionId(event);
		const workbench: unknown = event.data.workbench;
		if (sessionId.length === 0 || !isRecord(workbench) || !isRecord(workbench.activeRun)) {
			return current;
		}
		const status: string = readString(workbench.activeRun, "status");
		if (status === "idle") {
			const requestId: string = readString(workbench.activeRun, "requestId");
			return markSessionRunStopped(current, sessionId, requestId.length > 0 ? requestId : undefined);
		}
		const requestId: string = readString(workbench.activeRun, "requestId")
			|| (typeof event.requestId === "string" ? event.requestId.trim() : "");
		if (requestId.length === 0) {
			return current;
		}
		return setSessionRun(current, sessionId, {
			requestId,
			runId: null,
			revision: typeof event.sequence === "number" && Number.isFinite(event.sequence) ? event.sequence : 0
		});
	}

	if (TERMINAL_EVENT_NAMES.has(event.event)) {
		const sessionId: string = getEventSessionId(event);
		const requestId: string = getEventRequestId(event);
		return markSessionRunStopped(current, sessionId, requestId.length > 0 ? requestId : undefined);
	}

	if (event.event !== "agent.run.state" || typeof event.sessionId !== "string" || !isRecord(event.data)) {
		return current;
	}
	const sessionId: string = getEventSessionId(event);
	const stage: string = readString(event.data, "stage");
	const runId: string = readString(event.data, "runId");
	const requestId: string = getEventRequestId(event);
	if (sessionId.length === 0 || stage.length === 0 || requestId.length === 0) {
		return current;
	}

	const currentEntry: SessionRunIdentity | undefined = current.get(sessionId);
	if (INACTIVE_RUN_STAGES.has(stage)) {
		if (currentEntry === undefined) {
			return current;
		}
		const belongsToCurrentRun: boolean = currentEntry.requestId === requestId
			|| (runId.length > 0 && currentEntry.runId === runId);
		return belongsToCurrentRun ? setSessionRun(current, sessionId, null) : current;
	}

	const revisionValue: unknown = event.data.revision;
	const revision: number = typeof revisionValue === "number" && Number.isFinite(revisionValue)
		? revisionValue
		: 0;
	if (
		currentEntry !== undefined
		&& currentEntry.runId === runId
		&& currentEntry.revision > revision
	) {
		return current;
	}
	return setSessionRun(current, sessionId, {
		requestId,
		runId: runId.length > 0 ? runId : null,
		revision
	});
}

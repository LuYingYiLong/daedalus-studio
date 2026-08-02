import type { AgentRunState } from "@/api/types";
import type { BackendEvent } from "@/shared/api/transport/backend-rpc-client";

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
	if (event.event !== "agent.run.state" || typeof event.sessionId !== "string" || !isRecord(event.data)) {
		return current;
	}
	const sessionId: string = event.sessionId.trim();
	const stage: string = readString(event.data, "stage");
	const runId: string = readString(event.data, "runId");
	const requestId: string = readString(event.data, "requestId")
		|| (typeof event.requestId === "string" ? event.requestId.trim() : "");
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

import type { BackendEvent } from "@/platform/rpc/transport/backend-rpc-client";

export type SessionUnreadContext = {
	activeSessionId: string | null;
	sessionId: string;
	windowFocused: boolean;
};

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function addSessionId(currentSessionIds: ReadonlySet<string>, sessionId: string): ReadonlySet<string> {
	if (currentSessionIds.has(sessionId)) {
		return currentSessionIds;
	}

	const nextSessionIds: Set<string> = new Set(currentSessionIds);
	nextSessionIds.add(sessionId);
	return nextSessionIds;
}

function removeSessionId(currentSessionIds: ReadonlySet<string>, sessionId: string): ReadonlySet<string> {
	if (!currentSessionIds.has(sessionId)) {
		return currentSessionIds;
	}

	const nextSessionIds: Set<string> = new Set(currentSessionIds);
	nextSessionIds.delete(sessionId);
	return nextSessionIds;
}

/**
 * A completed or failed run has an outcome worth reviewing. A user-initiated
 * cancellation does not create an unread marker.
 */
export function getUnreadResponseSessionId(event: BackendEvent): string | null {
	if (
		event.event === "agent.goal.state"
		&& typeof event.sessionId === "string"
		&& event.sessionId.length > 0
		&& isRecord(event.data)
		&& (event.data.stage === "achieved" || event.data.stage === "failed")
	) {
		return event.sessionId;
	}
	if (
		event.event !== "agent.run.state"
		|| typeof event.sessionId !== "string"
		|| event.sessionId.length === 0
		|| !isRecord(event.data)
		|| typeof event.data.goalId === "string"
		|| (event.data.stage !== "completed" && event.data.stage !== "failed")
	) {
		return null;
	}

	return event.sessionId;
}

export function applyResponseFinished(
	currentSessionIds: ReadonlySet<string>,
	context: SessionUnreadContext
): ReadonlySet<string> {
	const isImmediatelyRead: boolean = context.windowFocused
		&& context.activeSessionId === context.sessionId;

	return isImmediatelyRead
		? removeSessionId(currentSessionIds, context.sessionId)
		: addSessionId(currentSessionIds, context.sessionId);
}

export function markActiveSessionRead(
	currentSessionIds: ReadonlySet<string>,
	activeSessionId: string | null,
	windowFocused: boolean
): ReadonlySet<string> {
	if (!windowFocused || activeSessionId === null) {
		return currentSessionIds;
	}

	return removeSessionId(currentSessionIds, activeSessionId);
}

export function removeUnreadSessions(
	currentSessionIds: ReadonlySet<string>,
	sessionIds: Iterable<string>
): ReadonlySet<string> {
	const removedSessionIds: Set<string> = new Set(sessionIds);
	if (removedSessionIds.size === 0) {
		return currentSessionIds;
	}

	const nextSessionIds: Set<string> = new Set(
		[...currentSessionIds].filter((sessionId: string): boolean => !removedSessionIds.has(sessionId))
	);
	return nextSessionIds.size === currentSessionIds.size ? currentSessionIds : nextSessionIds;
}

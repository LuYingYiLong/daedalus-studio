import { describe, expect, it } from "vitest";
import type { BackendEvent } from "@/platform/rpc/transport/backend-rpc-client";
import {
	applyRunningSessionEvent,
	markRunStopped,
	markSessionRunStarted,
	removeRunningSessions,
	type RunningSessionState
} from "@/domain/workspace/session-running";

function createRunEvent(options: {
	sessionId: string;
	requestId: string;
	runId: string;
	stage: string;
	revision?: number;
}): BackendEvent {
	return {
		protocolVersion: 3,
		type: "event",
		eventId: `${options.runId}:${options.revision ?? 1}`,
		event: "agent.run.state",
		sessionId: options.sessionId,
		requestId: options.requestId,
		runId: options.runId,
		sequence: options.revision ?? 1,
		createdAt: new Date(0).toISOString(),
		data: {
			requestId: options.requestId,
			runId: options.runId,
			stage: options.stage,
			revision: options.revision ?? 1
		}
	};
}

function createEvent(options: {
	event: string;
	sessionId: string;
	requestId: string;
	data?: unknown;
	sequence?: number;
}): BackendEvent {
	return {
		protocolVersion: 3,
		type: "event",
		eventId: `${options.event}:${options.requestId}:${options.sequence ?? 1}`,
		event: options.event,
		sessionId: options.sessionId,
		requestId: options.requestId,
		runId: options.requestId,
		sequence: options.sequence ?? 1,
		createdAt: new Date(0).toISOString(),
		data: options.data
	};
}

function ids(state: RunningSessionState): string[] {
	return [...state.keys()];
}

describe("session running indicators", () => {
	it("keeps a background session running when another session starts", () => {
		let state: RunningSessionState = new Map();
		state = applyRunningSessionEvent(state, createRunEvent({
			sessionId: "session-a",
			requestId: "request-a",
			runId: "run-a",
			stage: "executing"
		}));
		state = applyRunningSessionEvent(state, createRunEvent({
			sessionId: "session-b",
			requestId: "request-b",
			runId: "run-b",
			stage: "routing"
		}));

		expect(ids(state)).toEqual(["session-a", "session-b"]);
	});

	it("removes only the session whose run reaches a terminal stage", () => {
		let state: RunningSessionState = new Map();
		state = markSessionRunStarted(state, "session-a", "request-a");
		state = markSessionRunStarted(state, "session-b", "request-b");
		state = applyRunningSessionEvent(state, createRunEvent({
			sessionId: "session-a",
			requestId: "request-a",
			runId: "run-a",
			stage: "completed"
		}));

		expect(ids(state)).toEqual(["session-b"]);
	});

	it("ignores a late terminal event from an older run", () => {
		let state: RunningSessionState = new Map();
		state = applyRunningSessionEvent(state, createRunEvent({
			sessionId: "session-a",
			requestId: "request-new",
			runId: "run-new",
			stage: "executing",
			revision: 2
		}));
		const unchanged: RunningSessionState = applyRunningSessionEvent(state, createRunEvent({
			sessionId: "session-a",
			requestId: "request-old",
			runId: "run-old",
			stage: "completed",
			revision: 3
		}));

		expect(unchanged).toBe(state);
		expect(ids(unchanged)).toEqual(["session-a"]);
	});

	it("can stop an optimistic run after navigating away", () => {
		const running: RunningSessionState = markSessionRunStarted(new Map(), "session-a", "request-a");
		const stopped: RunningSessionState = markRunStopped(running, "request-a");

		expect(ids(stopped)).toEqual([]);
	});

	it("clears an optimistic indicator when only message.done arrives", () => {
		let state: RunningSessionState = markSessionRunStarted(new Map(), "session-a", "request-a");
		state = applyRunningSessionEvent(state, createEvent({
			event: "agent.message.done",
			sessionId: "session-a",
			requestId: "request-a",
			data: { requestId: "request-a" }
		}));

		expect(ids(state)).toEqual([]);
	});

	it("clears a stale indicator from an idle workbench snapshot", () => {
		let state: RunningSessionState = markSessionRunStarted(new Map(), "session-a", "request-a");
		state = applyRunningSessionEvent(state, createEvent({
			event: "session.workbench.updated",
			sessionId: "session-a",
			requestId: "sync",
			data: {
				workbench: {
					activeRun: {
						status: "idle"
					}
				}
			}
		}));

		expect(ids(state)).toEqual([]);
	});

	it("cleans removed sessions without disturbing other indicators", () => {
		let state: RunningSessionState = new Map();
		state = markSessionRunStarted(state, "session-a", "request-a");
		state = markSessionRunStarted(state, "session-b", "request-b");

		expect(ids(removeRunningSessions(state, ["session-a"]))).toEqual(["session-b"]);
	});
});

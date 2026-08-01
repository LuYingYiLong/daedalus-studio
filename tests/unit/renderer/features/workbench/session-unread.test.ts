import { describe, expect, it } from "vitest";
import type { BackendEvent } from "@/shared/api/transport/backend-rpc-client";
import {
	applyResponseFinished,
	getUnreadResponseSessionId,
	markActiveSessionRead,
	removeUnreadSessions
} from "@/features/workspace/session-unread";

function createRunEvent(sessionId: string, stage: string): BackendEvent {
	return {
		type: "event",
		event: "agent.run.state",
		sessionId,
		data: { stage }
	};
}

function createGoalEvent(sessionId: string, stage: string): BackendEvent {
	return {
		type: "event",
		event: "agent.goal.state",
		sessionId,
		data: { stage }
	};
}

describe("session unread responses", () => {
	it("marks a completed response unread while its window is not focused", () => {
		const next = applyResponseFinished(new Set<string>(), {
			activeSessionId: "session-a",
			sessionId: "session-a",
			windowFocused: false
		});

		expect([...next]).toEqual(["session-a"]);
	});

	it("marks another session unread even while the window is focused", () => {
		const next = applyResponseFinished(new Set<string>(), {
			activeSessionId: "session-a",
			sessionId: "session-b",
			windowFocused: true
		});

		expect([...next]).toEqual(["session-b"]);
	});

	it("does not mark the visible response unread", () => {
		const current = new Set<string>();
		const next = applyResponseFinished(current, {
			activeSessionId: "session-a",
			sessionId: "session-a",
			windowFocused: true
		});

		expect(next).toBe(current);
	});

	it("only clears the active session after the window is focused", () => {
		const current = new Set(["session-a", "session-b"]);
		expect(markActiveSessionRead(current, "session-a", false)).toBe(current);
		expect([...markActiveSessionRead(current, "session-a", true)]).toEqual(["session-b"]);
	});

	it("recognizes completed and failed runs but ignores cancellations", () => {
		expect(getUnreadResponseSessionId(createRunEvent("session-a", "completed"))).toBe("session-a");
		expect(getUnreadResponseSessionId(createRunEvent("session-a", "failed"))).toBe("session-a");
		expect(getUnreadResponseSessionId(createRunEvent("session-a", "cancelled"))).toBeNull();
	});

	it("notifies only when the whole Goal reaches a reviewable terminal state", () => {
		expect(getUnreadResponseSessionId({
			...createRunEvent("session-a", "completed"),
			data: { stage: "completed", goalId: "goal-a" }
		})).toBeNull();
		expect(getUnreadResponseSessionId(createGoalEvent("session-a", "running"))).toBeNull();
		expect(getUnreadResponseSessionId(createGoalEvent("session-a", "achieved"))).toBe("session-a");
		expect(getUnreadResponseSessionId(createGoalEvent("session-a", "failed"))).toBe("session-a");
		expect(getUnreadResponseSessionId(createGoalEvent("session-a", "cancelled"))).toBeNull();
	});

	it("removes archived or deleted sessions", () => {
		const current = new Set(["session-a", "session-b", "session-c"]);
		expect([...removeUnreadSessions(current, ["session-a", "session-c"])]).toEqual(["session-b"]);
	});
});

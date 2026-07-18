import { describe, expect, it } from "vitest";
import type { SessionMetadata } from "@/api/types";
import { getSessionTitle } from "./session-title";

function createSessionMetadata(title: string): SessionMetadata {
	return {
		id: "session-a",
		title,
		createdAt: "2026-01-01T00:00:00.000Z",
		updatedAt: "2026-01-01T00:00:00.000Z"
	};
}

describe("getSessionTitle", () => {
	it("prefers session metadata title over id", () => {
		expect(getSessionTitle(createSessionMetadata("真实会话名称"), "session-a")).toBe("真实会话名称");
	});

	it("falls back to id and default title", () => {
		expect(getSessionTitle(createSessionMetadata("  "), "session-a")).toBe("session-a");
		expect(getSessionTitle(null, null)).toBe("Session");
	});
});

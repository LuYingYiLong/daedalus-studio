import { createBackendClient } from "./backend-client";
import type { SessionListResult, SessionOpenResult, SessionTimelineResult } from "./types";

export async function fetchSessions(): Promise<SessionListResult> {
	const client = await createBackendClient();

	return client.request<SessionListResult>("session.list");
}

export async function openSession(sessionId: string, limit: number = 100): Promise<SessionOpenResult> {
	const client = await createBackendClient();

	return client.request<SessionOpenResult>("session.open", {
		sessionId,
		limit
	});
}

export async function fetchSessionTimeline(sessionId: string, limit: number = 100): Promise<SessionTimelineResult> {
	const client = await createBackendClient();

	return client.request<SessionTimelineResult>("session.timeline", {
		sessionId,
		limit
	});
}

import { createBackendClient } from "./backend-client";
import type { SessionListResult, SessionOpenResult } from "./types";

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

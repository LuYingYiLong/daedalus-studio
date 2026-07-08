import { createBackendClient } from "./backend-client";
import type { SessionListResult } from "./types";

export async function fetchSessions(): Promise<SessionListResult> {
	const client = await createBackendClient();

	return client.request<SessionListResult>("session.list");
}

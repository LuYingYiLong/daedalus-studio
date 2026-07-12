import { createBackendClient } from "./backend-client";
import type { SessionListResult, SessionOpenResult, SessionTimelineResult } from "./types";
import type { ChatMode } from "./chat-api";

export type SaveSessionUiMetadataParams = {
	provider?: string;
	model?: string;
	chatMode?: ChatMode;
	approvalMode?: "manual" | "auto-safe";
};

export type SaveSessionResult = {
	saved: true;
	sessionId: string;
	messageCount: number;
};

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

export async function saveSessionUiMetadata(params: SaveSessionUiMetadataParams): Promise<SaveSessionResult> {
	const client = await createBackendClient();

	return client.request<SaveSessionResult>("session.save", params);
}

import { createBackendClient } from "./backend-client";
import type { SessionListResult, SessionMetadata, SessionOpenResult, SessionTimelineResult } from "./types";
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

export type ArchiveSessionResult = {
	archived: true;
	metadata: SessionMetadata;
};

export type ArchivedSessionListResult = {
	archivedSessions: SessionMetadata[];
};

export type RestoreArchivedSessionResult = {
	restored: true;
	metadata: SessionMetadata;
};

export type DeleteArchivedSessionResult = {
	deletedArchived: true;
	sessionId: string;
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

export async function fetchSessionTimelineBefore(sessionId: string, beforeOffset: number, limit: number = 80): Promise<SessionTimelineResult> {
	const client = await createBackendClient();

	return client.request<SessionTimelineResult>("session.timeline", {
		sessionId,
		beforeOffset,
		limit
	});
}

export async function fetchSessionTimelineAfter(sessionId: string, afterOffset: number, limit: number = 80): Promise<SessionTimelineResult> {
	const client = await createBackendClient();

	return client.request<SessionTimelineResult>("session.timeline", {
		sessionId,
		afterOffset,
		limit
	});
}

export async function saveSessionUiMetadata(params: SaveSessionUiMetadataParams): Promise<SaveSessionResult> {
	const client = await createBackendClient();

	return client.request<SaveSessionResult>("session.save", params);
}

export async function archiveSession(sessionId: string): Promise<ArchiveSessionResult> {
	const client = await createBackendClient();

	return client.request<ArchiveSessionResult>("session.archive", {
		sessionId
	});
}

export async function fetchArchivedSessions(): Promise<ArchivedSessionListResult> {
	const client = await createBackendClient();

	return client.request<ArchivedSessionListResult>("session.archived.list");
}

export async function restoreArchivedSession(sessionId: string): Promise<RestoreArchivedSessionResult> {
	const client = await createBackendClient();

	return client.request<RestoreArchivedSessionResult>("session.archived.restore", {
		sessionId
	});
}

export async function deleteArchivedSession(sessionId: string): Promise<DeleteArchivedSessionResult> {
	const client = await createBackendClient();

	return client.request<DeleteArchivedSessionResult>("session.archived.delete", {
		sessionId
	});
}

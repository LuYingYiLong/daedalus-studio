import { createBackendClient } from "./backend-client";
import type { SessionListResult, SessionMetadata, SessionOpenResult, SessionTimelineResult, WorkbenchSnapshot } from "./types";
import type { ChatMode } from "./chat-api";

export type CreateSessionParams = {
	title: string;
	workspaceId?: string | null;
	provider?: string;
	model?: string;
	chatMode?: ChatMode;
	approvalMode?: "manual" | "auto-safe" | "full-trust";
	workflowTodoCollapsed?: boolean;
	webSearchEnabled?: boolean;
};

export type SaveSessionUiMetadataParams = {
	provider?: string;
	model?: string;
	chatMode?: ChatMode;
	approvalMode?: "manual" | "auto-safe" | "full-trust";
	workflowTodoCollapsed?: boolean;
	webSearchEnabled?: boolean;
};

export type CreateSessionResult = SessionMetadata & {
	workbench: WorkbenchSnapshot;
};

export type SaveSessionResult = {
	saved: true;
	sessionId: string;
	messageCount: number;
};

export type SetSessionModelParams = {
	provider: string;
	model: string;
};

export type SetSessionModelResult = {
	metadata: SessionMetadata;
	workbench: WorkbenchSnapshot;
};

export type ArchiveSessionResult = {
	archived: true;
	metadata: SessionMetadata;
};

export type RenameSessionResult = SessionMetadata;

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

export type DismissWorkflowTodoParams = {
	workflowId?: string;
	runId?: string;
};

export type DismissWorkflowTodoResult = {
	dismissed: true;
	workflowId: string | null;
	runId: string | null;
};

export type SessionIntegrityIssue = {
	file: "messages" | "events" | "approval-events" | "workflow-events" | "agent-events";
	line: number;
	expectedSessionId: string;
	actualSessionId: string;
	requestId?: string;
	event?: string;
};

export type SessionIntegrityCheckResult = {
	sessionId: string;
	ok: boolean;
	issues: SessionIntegrityIssue[];
	checkedFiles: SessionIntegrityIssue["file"][];
};

export async function fetchSessions(): Promise<SessionListResult> {
	const client = await createBackendClient();

	return client.request<SessionListResult>("session.list");
}

export async function createSession(params: CreateSessionParams): Promise<CreateSessionResult> {
	const client = await createBackendClient();

	return client.request<CreateSessionResult>("session.create", params);
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

export async function checkSessionIntegrity(sessionId: string): Promise<SessionIntegrityCheckResult> {
	const client = await createBackendClient();

	return client.request<SessionIntegrityCheckResult>("session.integrity.check", {
		sessionId
	});
}

export async function saveSessionUiMetadata(params: SaveSessionUiMetadataParams): Promise<SaveSessionResult> {
	const client = await createBackendClient();

	return client.request<SaveSessionResult>("session.save", params);
}

export async function setSessionModel(params: SetSessionModelParams): Promise<SetSessionModelResult> {
	const client = await createBackendClient();

	return client.request<SetSessionModelResult>("session.model.set", params);
}

export async function dismissWorkflowTodo(params: DismissWorkflowTodoParams = {}): Promise<DismissWorkflowTodoResult> {
	const client = await createBackendClient();

	return client.request<DismissWorkflowTodoResult>("session.workflow.todo.dismiss", params);
}

export async function archiveSession(sessionId: string): Promise<ArchiveSessionResult> {
	const client = await createBackendClient();

	return client.request<ArchiveSessionResult>("session.archive", {
		sessionId
	});
}

export async function renameSession(sessionId: string, title: string): Promise<RenameSessionResult> {
	const client = await createBackendClient();

	return client.request<RenameSessionResult>("session.rename", {
		sessionId,
		title
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

import type { SessionMetadata, WorkspaceConfig } from "@/platform/rpc/types";

export type SessionOriginKind = "fork" | "worktree" | "permanent-worktree";

export function filterVisibleSessions(
	sessions: readonly SessionMetadata[],
): SessionMetadata[] {
	return sessions.filter(
		(session: SessionMetadata): boolean => session.temporary !== true,
	);
}

export function getSessionProjectWorkspaceId(
	session: SessionMetadata,
): string | undefined {
	return session.worktree?.sourceWorkspaceId ?? session.workspaceId;
}

export function getSessionOriginKind(
	session: SessionMetadata,
	workspace: WorkspaceConfig | undefined,
): SessionOriginKind | null {
	if (session.forkedFrom !== undefined) {
		return "fork";
	}
	if (
		session.worktree?.permanent === true ||
		(session.worktree === undefined && workspace?.permanentWorktree !== undefined)
	) {
		return "permanent-worktree";
	}
	if (session.worktree !== undefined) {
		return "worktree";
	}
	return null;
}

export function getSelectedMenuKeys(
	selectedSessionId: string | null,
	selectedWorkspaceId: string | null,
	fallbackKeys: readonly string[],
): string[] {
	if (selectedSessionId !== null) {
		return [`session:${selectedSessionId}`];
	}
	if (selectedWorkspaceId !== null) {
		return [`workspace:${selectedWorkspaceId}`];
	}
	return [...fallbackKeys];
}

export function areStringListsEqual(
	left: readonly string[],
	right: readonly string[],
): boolean {
	return left.length === right.length && left.every(
		(value: string, index: number): boolean => value === right[index],
	);
}

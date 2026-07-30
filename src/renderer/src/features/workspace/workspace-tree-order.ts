import type { SessionMetadata, WorkspaceConfig } from "@/api/types";
import type { WorkspaceTreeOrderPreferences } from "@/api/workspace-api";

export type WorkspaceTreeDropPlacement = "before" | "after";
export type WorkspaceTreeSortableNode = {
	kind: "workspace" | "session" | "empty";
	workspaceId?: string | undefined;
};

export function createEmptyWorkspaceTreeOrder(): WorkspaceTreeOrderPreferences {
	return {
		schemaVersion: 1,
		workspaceIds: [],
		sessionIdsByWorkspace: {},
		updatedAt: new Date(0).toISOString()
	};
}

function mergeSavedOrder(currentIds: readonly string[], savedIds: readonly string[]): string[] {
	const currentIdSet: ReadonlySet<string> = new Set(currentIds);
	const knownSavedIds: string[] = savedIds.filter((id: string): boolean => currentIdSet.has(id));
	const knownSavedIdSet: ReadonlySet<string> = new Set(knownSavedIds);
	return [
		...currentIds.filter((id: string): boolean => !knownSavedIdSet.has(id)),
		...knownSavedIds
	];
}

export function reconcileWorkspaceTreeOrder(
	preferences: WorkspaceTreeOrderPreferences,
	workspaces: readonly WorkspaceConfig[],
	sessions: readonly SessionMetadata[]
): WorkspaceTreeOrderPreferences {
	const workspaceIds: string[] = mergeSavedOrder(
		workspaces.map((workspace: WorkspaceConfig): string => workspace.id),
		preferences.workspaceIds
	);
	const workspaceIdSet: ReadonlySet<string> = new Set(workspaceIds);
	const currentSessionIdsByWorkspace: Record<string, string[]> = Object.fromEntries(
		workspaceIds.map((workspaceId: string): [string, string[]] => [workspaceId, []])
	);
	for (const session of sessions) {
		if (
			session.temporary === true
			|| session.pinned === true
			|| session.workspaceId === undefined
			|| !workspaceIdSet.has(session.workspaceId)
		) {
			continue;
		}
		currentSessionIdsByWorkspace[session.workspaceId]!.push(session.id);
	}

	const sessionIdsByWorkspace: Record<string, string[]> = {};
	for (const workspaceId of workspaceIds) {
		sessionIdsByWorkspace[workspaceId] = mergeSavedOrder(
			currentSessionIdsByWorkspace[workspaceId] ?? [],
			preferences.sessionIdsByWorkspace[workspaceId] ?? []
		);
	}

	return {
		schemaVersion: 1,
		workspaceIds,
		sessionIdsByWorkspace,
		updatedAt: preferences.updatedAt
	};
}

export function areWorkspaceTreeOrdersEqual(
	left: WorkspaceTreeOrderPreferences,
	right: WorkspaceTreeOrderPreferences
): boolean {
	return JSON.stringify({
		workspaceIds: left.workspaceIds,
		sessionIdsByWorkspace: left.sessionIdsByWorkspace
	}) === JSON.stringify({
		workspaceIds: right.workspaceIds,
		sessionIdsByWorkspace: right.sessionIdsByWorkspace
	});
}

export function canDropWorkspaceTreeNode(
	dragNode: WorkspaceTreeSortableNode,
	dropNode: WorkspaceTreeSortableNode,
	dropToGap: boolean,
	preferences: WorkspaceTreeOrderPreferences
): boolean {
	if (!dropToGap || dragNode.kind === "empty" || dropNode.kind === "empty") {
		return false;
	}
	if (dragNode.kind === "workspace" || dropNode.kind === "workspace") {
		return dragNode.kind === "workspace"
			&& dropNode.kind === "workspace"
			&& preferences.workspaceIds.length > 1;
	}
	return dragNode.kind === "session"
		&& dropNode.kind === "session"
		&& dragNode.workspaceId === dropNode.workspaceId
		&& dragNode.workspaceId !== undefined
		&& (preferences.sessionIdsByWorkspace[dragNode.workspaceId]?.length ?? 0) > 1;
}

function moveId(
	ids: readonly string[],
	draggedId: string,
	targetId: string,
	placement: WorkspaceTreeDropPlacement
): string[] {
	if (draggedId === targetId || !ids.includes(draggedId) || !ids.includes(targetId)) {
		return [...ids];
	}
	const nextIds: string[] = ids.filter((id: string): boolean => id !== draggedId);
	const targetIndex: number = nextIds.indexOf(targetId);
	nextIds.splice(placement === "before" ? targetIndex : targetIndex + 1, 0, draggedId);
	return nextIds;
}

export function moveWorkspaceInTreeOrder(
	preferences: WorkspaceTreeOrderPreferences,
	draggedWorkspaceId: string,
	targetWorkspaceId: string,
	placement: WorkspaceTreeDropPlacement
): WorkspaceTreeOrderPreferences {
	return {
		...preferences,
		workspaceIds: moveId(
			preferences.workspaceIds,
			draggedWorkspaceId,
			targetWorkspaceId,
			placement
		)
	};
}

export function moveSessionInTreeOrder(
	preferences: WorkspaceTreeOrderPreferences,
	workspaceId: string,
	draggedSessionId: string,
	targetSessionId: string,
	placement: WorkspaceTreeDropPlacement
): WorkspaceTreeOrderPreferences {
	return {
		...preferences,
		sessionIdsByWorkspace: {
			...preferences.sessionIdsByWorkspace,
			[workspaceId]: moveId(
				preferences.sessionIdsByWorkspace[workspaceId] ?? [],
				draggedSessionId,
				targetSessionId,
				placement
			)
		}
	};
}

export function sortWorkspacesByTreeOrder(
	workspaces: readonly WorkspaceConfig[],
	preferences: WorkspaceTreeOrderPreferences
): WorkspaceConfig[] {
	const byId: ReadonlyMap<string, WorkspaceConfig> = new Map(
		workspaces.map((workspace: WorkspaceConfig): [string, WorkspaceConfig] => [workspace.id, workspace])
	);
	return preferences.workspaceIds.flatMap((workspaceId: string): WorkspaceConfig[] => {
		const workspace: WorkspaceConfig | undefined = byId.get(workspaceId);
		return workspace === undefined ? [] : [workspace];
	});
}

export function sortWorkspaceSessionsByTreeOrder(
	sessions: readonly SessionMetadata[],
	workspaceId: string,
	preferences: WorkspaceTreeOrderPreferences
): SessionMetadata[] {
	const byId: ReadonlyMap<string, SessionMetadata> = new Map(
		sessions
			.filter((session: SessionMetadata): boolean => session.workspaceId === workspaceId)
			.map((session: SessionMetadata): [string, SessionMetadata] => [session.id, session])
	);
	return (preferences.sessionIdsByWorkspace[workspaceId] ?? []).flatMap(
		(sessionId: string): SessionMetadata[] => {
			const session: SessionMetadata | undefined = byId.get(sessionId);
			return session === undefined ? [] : [session];
		}
	);
}

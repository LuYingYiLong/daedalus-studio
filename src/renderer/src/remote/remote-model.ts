import type { SessionMetadata, WorkspaceConfig } from "@/platform/rpc/types";

export type RemotePrimaryScreen = "sessions" | "conversation" | "approvals" | "trajectory";

export type RemoteBackAction =
	| "close-navigation"
	| "close-create"
	| "close-full-trust"
	| "close-plan"
	| "close-trace-detail"
	| "block-tool-budget"
	| "show-sessions"
	| "exit";

export type RemoteBackNavigationState = {
	navigationOpen: boolean;
	createOpen: boolean;
	fullTrustOpen: boolean;
	planOpen: boolean;
	traceDetailOpen: boolean;
	toolBudgetOpen: boolean;
	activeScreen: RemotePrimaryScreen;
};

export type RemoteBackHandler = () => boolean;

declare global {
	interface Window {
		__daedalusRemoteHandleBack?: RemoteBackHandler;
	}
}

export type RemoteSessionGroup = {
	workspace: WorkspaceConfig;
	sessions: SessionMetadata[];
};

export function resolveRemoteBackAction(state: RemoteBackNavigationState): RemoteBackAction {
	if (state.navigationOpen) return "close-navigation";
	if (state.createOpen) return "close-create";
	if (state.fullTrustOpen) return "close-full-trust";
	if (state.planOpen) return "close-plan";
	if (state.traceDetailOpen) return "close-trace-detail";
	if (state.toolBudgetOpen) return "block-tool-budget";
	if (state.activeScreen !== "sessions") return "show-sessions";
	return "exit";
}

export function normalizeRemoteScreen(screen: RemotePrimaryScreen, hasActiveSession: boolean): RemotePrimaryScreen {
	if (hasActiveSession || screen === "sessions" || screen === "approvals") return screen;
	return "sessions";
}

export function buildRemoteSessionGroups(
	workspaces: WorkspaceConfig[],
	sessions: SessionMetadata[],
	query: string,
): RemoteSessionGroup[] {
	const normalizedQuery: string = query.trim().toLocaleLowerCase();
	return workspaces.map((workspace: WorkspaceConfig): RemoteSessionGroup => {
		const workspaceMatches: boolean = normalizedQuery.length > 0 && workspace.name.toLocaleLowerCase().includes(normalizedQuery);
		return {
			workspace,
			sessions: sessions.filter((session: SessionMetadata): boolean => {
				if (session.workspaceId !== workspace.id) return false;
				return normalizedQuery.length === 0 || workspaceMatches || session.title.toLocaleLowerCase().includes(normalizedQuery);
			}),
		};
	}).filter((group: RemoteSessionGroup): boolean => normalizedQuery.length === 0
		|| group.sessions.length > 0
		|| group.workspace.name.toLocaleLowerCase().includes(normalizedQuery));
}

export function getRecentRemoteSessions(sessions: SessionMetadata[], limit: number = 5): SessionMetadata[] {
	return [...sessions]
		.sort((left: SessionMetadata, right: SessionMetadata): number => Date.parse(right.updatedAt) - Date.parse(left.updatedAt))
		.slice(0, Math.max(0, limit));
}

export function getRemoteDraftStorageKey(sessionId: string): string {
	return `daedalus.remote.draft.${sessionId}`;
}

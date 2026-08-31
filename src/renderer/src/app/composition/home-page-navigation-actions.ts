import type { HomePageActionHandlers } from "./home-page-actions";

export type HomePageNavigationActionParams = {
	handleNewSession: HomePageActionHandlers["onNewSession"];
	handleNewWorkspaceSession: HomePageActionHandlers["onNewWorkspaceSession"];
	handleHomeWorkspaceSelect: HomePageActionHandlers["onHomeWorkspaceSelect"];
	handleHomeWorkspaceAdd: HomePageActionHandlers["onHomeWorkspaceAdd"];
	handleHomeWorkspaceClear: HomePageActionHandlers["onHomeWorkspaceClear"];
	handleSessionSelect: HomePageActionHandlers["onSessionSelect"];
	handleSessionFork: HomePageActionHandlers["onSessionFork"];
	onForkSourceOpen: HomePageActionHandlers["onForkSourceOpen"];
	handleSessionArchive: HomePageActionHandlers["onSessionArchive"];
	handleSessionRename: HomePageActionHandlers["onSessionRename"];
	handleSessionWorkspaceMove: HomePageActionHandlers["onSessionWorkspaceMove"];
	handleSessionWorktreeDelete: HomePageActionHandlers["onSessionWorktreeDelete"];
	handleSessionWorktreeHandoff: HomePageActionHandlers["onSessionWorktreeHandoff"];
	handleSessionWorktreeSetup: HomePageActionHandlers["onSessionWorktreeSetup"];
	handleSessionsChange: HomePageActionHandlers["onSessionsChange"];
	handleWorkspaceDelete: HomePageActionHandlers["onWorkspaceDelete"];
	handleWorkspaceUpdate: HomePageActionHandlers["onWorkspaceUpdate"];
	handleWorkspaceProjectCreated: HomePageActionHandlers["onWorkspaceProjectCreated"];
};

export type HomePageNavigationActions = Pick<
	HomePageActionHandlers,
	| "onNewSession"
	| "onNewWorkspaceSession"
	| "onHomeWorkspaceSelect"
	| "onHomeWorkspaceAdd"
	| "onHomeWorkspaceClear"
	| "onSessionSelect"
	| "onSessionFork"
	| "onForkSourceOpen"
	| "onSessionArchive"
	| "onSessionRename"
	| "onSessionWorkspaceMove"
	| "onSessionWorktreeDelete"
	| "onSessionWorktreeHandoff"
	| "onSessionWorktreeSetup"
	| "onSessionsChange"
	| "onWorkspaceDelete"
	| "onWorkspaceUpdate"
	| "onWorkspaceProjectCreated"
>;

export function createHomePageNavigationActions({
	handleNewSession,
	handleNewWorkspaceSession,
	handleHomeWorkspaceSelect,
	handleHomeWorkspaceAdd,
	handleHomeWorkspaceClear,
	handleSessionSelect,
	handleSessionFork,
	onForkSourceOpen,
	handleSessionArchive,
	handleSessionRename,
	handleSessionWorkspaceMove,
	handleSessionWorktreeDelete,
	handleSessionWorktreeHandoff,
	handleSessionWorktreeSetup,
	handleSessionsChange,
	handleWorkspaceDelete,
	handleWorkspaceUpdate,
	handleWorkspaceProjectCreated,
}: HomePageNavigationActionParams): HomePageNavigationActions {
	return {
		onNewSession: (options): void => {
			void handleNewSession(options);
		},
		onNewWorkspaceSession: (workspace, environment): void => {
			void handleNewWorkspaceSession(workspace, environment);
		},
		onHomeWorkspaceSelect: (workspaceId): void => {
			void handleHomeWorkspaceSelect(workspaceId);
		},
		onHomeWorkspaceAdd: handleHomeWorkspaceAdd,
		onHomeWorkspaceClear: handleHomeWorkspaceClear,
		onSessionSelect: (session): void => {
			void handleSessionSelect(session);
		},
		onSessionFork: (session): void => {
			void handleSessionFork(session);
		},
		onForkSourceOpen,
		onSessionArchive: handleSessionArchive,
		onSessionRename: handleSessionRename,
		onSessionWorkspaceMove: handleSessionWorkspaceMove,
		onSessionWorktreeDelete: handleSessionWorktreeDelete,
		onSessionWorktreeHandoff: handleSessionWorktreeHandoff,
		onSessionWorktreeSetup: handleSessionWorktreeSetup,
		onSessionsChange: handleSessionsChange,
		onWorkspaceDelete: handleWorkspaceDelete,
		onWorkspaceUpdate: handleWorkspaceUpdate,
		onWorkspaceProjectCreated: handleWorkspaceProjectCreated,
	};
}

import type {
	Dispatch,
	MutableRefObject,
	SetStateAction,
} from "react";
import {
	fetchWorkspaces,
	type DeleteWorkspaceResult,
} from "@/platform/rpc/workspace-api";
import type {
	SessionMetadata,
	WorkspaceConfig,
} from "@/platform/rpc/types";
import {
	removeUnreadSessions,
} from "@/domain/workspace/session-unread";
import type { HomeDraft } from "@/domain/session/home-draft";

export type WorkspaceMutationControllerParams = {
	activeSessionId: string | null;
	activeSessionMetadata: SessionMetadata | null;
	composerDraftsRef: MutableRefObject<Map<string, string>>;
	removeStoredSessionLayouts: (sessionIds: string[]) => void;
	resetToNewSessionHome: () => void;
	handleHomeWorkspaceSelect: (workspaceId: string) => Promise<void>;
	handleNewWorkspaceSession: (
		workspace: WorkspaceConfig,
		executionEnvironment?: "local" | "worktree",
	) => Promise<void>;
	isNewSessionHome: boolean;
	setUnreadSessionIds: Dispatch<SetStateAction<ReadonlySet<string>>>;
	setHomeWorkspaceOptions: Dispatch<SetStateAction<WorkspaceConfig[]>>;
	setHomeDraft: Dispatch<SetStateAction<HomeDraft>>;
	setActiveWorkspace: Dispatch<SetStateAction<WorkspaceConfig | null>>;
	setActiveSessionMetadata: Dispatch<SetStateAction<SessionMetadata | null>>;
	setWorkspaceRefreshToken: Dispatch<SetStateAction<number>>;
	setIsWorkspaceProjectDialogOpen: Dispatch<SetStateAction<boolean>>;
	showTransientError: (message: string) => void;
};

export type WorkspaceMutationController = {
	handleWorkspaceDelete: (result: DeleteWorkspaceResult) => void;
	handleWorkspaceUpdate: (workspace: WorkspaceConfig) => void;
	handleWorkspaceProjectCreated: (workspace: WorkspaceConfig) => void;
	handleWorkspaceTreeProjectCreated: (workspace: WorkspaceConfig) => void;
};

export default function useWorkspaceMutationController({
	activeSessionId,
	activeSessionMetadata,
	composerDraftsRef,
	removeStoredSessionLayouts,
	resetToNewSessionHome,
	handleHomeWorkspaceSelect,
	handleNewWorkspaceSession,
	isNewSessionHome,
	setUnreadSessionIds,
	setHomeWorkspaceOptions,
	setHomeDraft,
	setActiveWorkspace,
	setActiveSessionMetadata,
	setWorkspaceRefreshToken,
	setIsWorkspaceProjectDialogOpen,
	showTransientError,
}: WorkspaceMutationControllerParams): WorkspaceMutationController {
	function handleWorkspaceDelete(result: DeleteWorkspaceResult): void {
		const removedSessionIds: string[] = [
			...result.deletedSessionIds,
			...result.deletedArchivedSessionIds,
		];
		for (const sessionId of removedSessionIds) {
			composerDraftsRef.current.delete(sessionId);
		}
		setUnreadSessionIds(
			(currentSessionIds: ReadonlySet<string>): ReadonlySet<string> => {
				return removeUnreadSessions(currentSessionIds, removedSessionIds);
			},
		);
		removeStoredSessionLayouts(removedSessionIds);

		const activeMove =
			activeSessionId === null
				? undefined
				: result.movedSessions.find(
						(move): boolean => move.sessionId === activeSessionId,
					);
		setHomeWorkspaceOptions(
			(currentWorkspaces: WorkspaceConfig[]): WorkspaceConfig[] => {
				return currentWorkspaces.filter(
					(workspace: WorkspaceConfig): boolean =>
						workspace.id !== result.workspaceId,
				);
			},
		);
		setHomeDraft((currentDraft: HomeDraft): HomeDraft => {
			if (currentDraft.workspaceId !== result.workspaceId) {
				return currentDraft;
			}

			return {
				...currentDraft,
				workspaceId: null,
				workspace: null,
			};
		});
		setActiveWorkspace(
			(
				currentWorkspace: WorkspaceConfig | null,
			): WorkspaceConfig | null => {
				return currentWorkspace?.id === result.workspaceId
					? null
					: currentWorkspace;
			},
		);

		const activeSessionDeleted: boolean =
			activeSessionId !== null &&
			result.deletedSessionIds.includes(activeSessionId);
		const activeWorkspaceDeleted: boolean =
			activeSessionMetadata?.workspaceId === result.workspaceId;
		if (activeMove !== undefined) {
			void fetchWorkspaces()
				.then((workspaceList): void => {
					const destination: WorkspaceConfig | undefined =
						workspaceList.workspaces.find(
							(workspace): boolean =>
								workspace.id === activeMove.workspaceId,
						);
					if (destination === undefined) {
						resetToNewSessionHome();
						return;
					}
					setHomeWorkspaceOptions(workspaceList.workspaces);
					setActiveWorkspace(destination);
					setActiveSessionMetadata(
						(metadata): SessionMetadata | null =>
							metadata === null
								? null
								: {
										...metadata,
										workspaceId: destination.id,
										workspaceName: destination.name,
										workspaceKind: destination.kind,
										workspaceRoot: destination.rootPath,
										godotExecutablePath:
											destination.godotExecutablePath,
									},
					);
				})
				.catch((): void => resetToNewSessionHome());
		} else if (activeSessionDeleted || activeWorkspaceDeleted) {
			resetToNewSessionHome();
		}
	}

	function handleWorkspaceUpdate(workspace: WorkspaceConfig): void {
		setHomeWorkspaceOptions((currentWorkspaces): WorkspaceConfig[] => {
			const existingIndex: number = currentWorkspaces.findIndex(
				(currentWorkspace: WorkspaceConfig): boolean =>
					currentWorkspace.id === workspace.id,
			);
			if (existingIndex < 0) {
				return [...currentWorkspaces, workspace];
			}
			return currentWorkspaces.map(
				(currentWorkspace: WorkspaceConfig): WorkspaceConfig =>
					currentWorkspace.id === workspace.id
						? workspace
						: currentWorkspace,
			);
		});
		setHomeDraft(
			(currentDraft): HomeDraft =>
				currentDraft.workspaceId === workspace.id
					? { ...currentDraft, workspace }
					: currentDraft,
		);
		setActiveWorkspace((currentWorkspace): WorkspaceConfig | null =>
			currentWorkspace?.id === workspace.id
				? workspace
				: currentWorkspace,
		);
		setActiveSessionMetadata((metadata): SessionMetadata | null =>
			metadata?.workspaceId === workspace.id
				? {
						...metadata,
						workspaceName: workspace.name,
						workspaceRoot: workspace.rootPath,
						godotExecutablePath: workspace.godotExecutablePath,
					}
				: metadata,
		);
	}

	function handleWorkspaceProjectCreated(workspace: WorkspaceConfig): void {
		handleWorkspaceUpdate(workspace);
		setWorkspaceRefreshToken(
			(currentToken: number): number => currentToken + 1,
		);
		setIsWorkspaceProjectDialogOpen(false);
		if (isNewSessionHome) {
			void handleHomeWorkspaceSelect(workspace.id);
		}
	}

	function handleWorkspaceTreeProjectCreated(
		workspace: WorkspaceConfig,
	): void {
		setWorkspaceRefreshToken(
			(currentToken: number): number => currentToken + 1,
		);
		void handleNewWorkspaceSession(workspace).catch(
			(error: unknown): void => {
				showTransientError(
					error instanceof Error
						? error.message
						: "Failed to open the new project",
				);
				console.error(
					"[App] open workspace tree project failed",
					error,
				);
			},
		);
	}

	return {
		handleWorkspaceDelete,
		handleWorkspaceUpdate,
		handleWorkspaceProjectCreated,
		handleWorkspaceTreeProjectCreated,
	};
}

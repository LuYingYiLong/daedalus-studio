import type {
	Dispatch,
	MutableRefObject,
	SetStateAction,
} from "react";
import { selectWorkspace } from "@/platform/rpc/workspace-api";
import { workspaceSupportsWorktrees } from "@/domain/workspace/worktree-capability";
import type {
	SessionMetadata,
	WorkspaceConfig,
} from "@/platform/rpc/types";
import type { HomeDraft } from "../app-helpers";

export type HomeWorkspaceNavigationControllerParams = {
	activeSessionId: string | null;
	activeSessionMetadata: SessionMetadata | null;
	activeSessionIdRef: MutableRefObject<string | null>;
	temporaryDraftSessionIdRef: MutableRefObject<string | null>;
	navigationVersionRef: MutableRefObject<number>;
	homeWorkspaceOptions: readonly WorkspaceConfig[];
	setHomeWorkspaceOptions: Dispatch<SetStateAction<WorkspaceConfig[]>>;
	setHomeDraft: Dispatch<SetStateAction<HomeDraft>>;
	setActiveWorkspace: Dispatch<SetStateAction<WorkspaceConfig | null>>;
	setActiveSessionMetadata: Dispatch<SetStateAction<SessionMetadata | null>>;
	setSessionError: Dispatch<SetStateAction<string | null>>;
	setIsWorkspaceProjectDialogOpen: Dispatch<SetStateAction<boolean>>;
	setIsWorkspaceSessionCreating: Dispatch<SetStateAction<boolean>>;
	beginLocalNewSessionDraft: (
		workspace: WorkspaceConfig | null,
		initialDraft?: string,
		executionEnvironment?: "local" | "worktree",
	) => void;
	deleteSessionWithLayout: (sessionId: string) => Promise<void>;
	takePendingWorkbenchPatch: () => Record<string, unknown>;
	onError: (message: string) => void;
};

export type HomeWorkspaceNavigationController = {
	handleNewWorkspaceSession: (
		workspace: WorkspaceConfig,
		executionEnvironment?: "local" | "worktree",
	) => Promise<void>;
	handleHomeWorkspaceSelect: (workspaceId: string) => Promise<void>;
	handleHomeWorkspaceClear: () => void;
	handleHomeWorkspaceAdd: () => void;
	resetToNewSessionHome: () => void;
};

export default function useHomeWorkspaceNavigationController({
	activeSessionId,
	activeSessionMetadata,
	activeSessionIdRef,
	temporaryDraftSessionIdRef,
	navigationVersionRef,
	homeWorkspaceOptions,
	setHomeWorkspaceOptions,
	setHomeDraft,
	setActiveWorkspace,
	setActiveSessionMetadata,
	setSessionError,
	setIsWorkspaceProjectDialogOpen,
	setIsWorkspaceSessionCreating,
	beginLocalNewSessionDraft,
	deleteSessionWithLayout,
	takePendingWorkbenchPatch,
	onError,
}: HomeWorkspaceNavigationControllerParams): HomeWorkspaceNavigationController {
	async function handleNewWorkspaceSession(
		workspace: WorkspaceConfig,
		executionEnvironment: "local" | "worktree" = "local",
	): Promise<void> {
		if (
			executionEnvironment === "worktree" &&
			!workspaceSupportsWorktrees(workspace)
		) {
			return;
		}
		setIsWorkspaceSessionCreating(true);
		try {
			const temporaryId: string | null =
				activeSessionMetadata?.temporary === true
					? activeSessionId
					: temporaryDraftSessionIdRef.current;
			beginLocalNewSessionDraft(workspace, "", executionEnvironment);
			setHomeWorkspaceOptions(
				(currentWorkspaces: WorkspaceConfig[]): WorkspaceConfig[] => {
					if (
						currentWorkspaces.some(
							(currentWorkspace: WorkspaceConfig): boolean =>
								currentWorkspace.id === workspace.id,
						)
					) {
						return currentWorkspaces;
					}
					return [...currentWorkspaces, workspace];
				},
			);

			if (temporaryId !== null) {
				await deleteSessionWithLayout(temporaryId).catch(
					(error: unknown): void => {
						console.warn(
							"[App] discard temporary session failed",
							error,
						);
					},
				);
			}
		} finally {
			setIsWorkspaceSessionCreating(false);
		}
	}

	async function handleHomeWorkspaceSelect(
		workspaceId: string,
	): Promise<void> {
		const navigationVersion: number = navigationVersionRef.current + 1;
		navigationVersionRef.current = navigationVersion;
		const optimisticWorkspace: WorkspaceConfig | undefined =
			homeWorkspaceOptions.find(
				(workspace: WorkspaceConfig): boolean =>
					workspace.id === workspaceId,
			);
		if (optimisticWorkspace !== undefined) {
			setHomeDraft(
				(currentDraft: HomeDraft): HomeDraft => ({
					...currentDraft,
					workspaceId: optimisticWorkspace.id,
					workspace: optimisticWorkspace,
					executionEnvironment: workspaceSupportsWorktrees(
						optimisticWorkspace,
					)
						? currentDraft.executionEnvironment
						: "local",
				}),
			);
			setActiveWorkspace(optimisticWorkspace);
			setSessionError(null);
		}

		try {
			const workspace = await selectWorkspace(workspaceId, {
				sessionId: activeSessionIdRef.current,
			});
			if (navigationVersionRef.current !== navigationVersion) {
				return;
			}

			setHomeDraft(
				(currentDraft: HomeDraft): HomeDraft => ({
					...currentDraft,
					workspaceId: workspace.id,
					workspace,
					executionEnvironment: workspaceSupportsWorktrees(workspace)
						? currentDraft.executionEnvironment
						: "local",
				}),
			);
			setActiveWorkspace(workspace);
			setActiveSessionMetadata(
				(
					metadata: SessionMetadata | null,
				): SessionMetadata | null => {
					return metadata === null
						? metadata
						: {
								...metadata,
								workspaceId: workspace.id,
								workspaceName: workspace.name,
								workspaceKind: workspace.kind,
								workspaceRoot: workspace.rootPath,
								godotExecutablePath:
									workspace.godotExecutablePath,
							};
				},
			);
			setSessionError(null);
		} catch (error: unknown) {
			onError(
				error instanceof Error
					? error.message
					: "Failed to select workspace",
			);
			console.error("[App] select home workspace failed", error);
		}
	}

	function handleHomeWorkspaceClear(): void {
		navigationVersionRef.current += 1;
		setHomeDraft(
			(currentDraft: HomeDraft): HomeDraft => ({
				...currentDraft,
				workspaceId: null,
				workspace: null,
				executionEnvironment: "local",
			}),
		);
		setActiveWorkspace(null);
	}

	function handleHomeWorkspaceAdd(): void {
		setIsWorkspaceProjectDialogOpen(true);
	}

	function resetToNewSessionHome(): void {
		takePendingWorkbenchPatch();
		beginLocalNewSessionDraft(null);
	}

	return {
		handleNewWorkspaceSession,
		handleHomeWorkspaceSelect,
		handleHomeWorkspaceClear,
		handleHomeWorkspaceAdd,
		resetToNewSessionHome,
	};
}

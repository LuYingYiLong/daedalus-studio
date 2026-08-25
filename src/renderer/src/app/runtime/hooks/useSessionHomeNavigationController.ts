import type { MutableRefObject } from "react";
import { fetchSessions } from "@/platform/rpc/session-api";
import type {
	SessionMetadata,
	WorkspaceConfig,
} from "@/platform/rpc/types";

export type NewSessionLifecycleOptions = {
	restoreTemporaryDraft?: boolean;
	workspace?: WorkspaceConfig | null;
	initialDraft?: string;
};

export type SessionHomeNavigationControllerParams = {
	activeSessionId: string | null;
	activeSessionMetadata: SessionMetadata | null;
	temporaryDraftSessionIdRef: MutableRefObject<string | null>;
	composerDraftsRef: MutableRefObject<Map<string, string>>;
	setHomeComposerMessage: (message: string) => void;
	setIsNewSessionHome: (value: boolean) => void;
	onSessionSelect: (
		session: SessionMetadata,
		options?: { recordNavigation?: boolean },
	) => Promise<void>;
	onHomeWorkspaceSelect: (workspaceId: string) => Promise<void>;
	beginLocalNewSessionDraft: (
		workspace: WorkspaceConfig | null,
		initialDraft?: string,
		executionEnvironment?: "local" | "worktree",
	) => void;
	deleteSessionWithLayout: (sessionId: string) => Promise<void>;
	persistPendingWorkbenchPatchBeforeNavigation: () => Promise<void>;
	loadHomeWorkspaces: () => Promise<void> | void;
};

export type SessionHomeNavigationController = {
	restoreTemporaryDraftOnNewSessionHome: (
		workspace: WorkspaceConfig | null,
	) => Promise<boolean>;
	handleNewSession: (
		options?: NewSessionLifecycleOptions,
	) => Promise<void>;
};

export default function useSessionHomeNavigationController({
	activeSessionId,
	activeSessionMetadata,
	temporaryDraftSessionIdRef,
	composerDraftsRef,
	setHomeComposerMessage,
	setIsNewSessionHome,
	onSessionSelect,
	onHomeWorkspaceSelect,
	beginLocalNewSessionDraft,
	deleteSessionWithLayout,
	persistPendingWorkbenchPatchBeforeNavigation,
	loadHomeWorkspaces,
}: SessionHomeNavigationControllerParams): SessionHomeNavigationController {
	async function restoreTemporaryDraftOnNewSessionHome(
		workspace: WorkspaceConfig | null,
	): Promise<boolean> {
		const temporaryDraftId: string | null =
			temporaryDraftSessionIdRef.current;
		if (temporaryDraftId === null) {
			return false;
		}

		let temporaryDraft: SessionMetadata | undefined;
		let sessionListLoaded: boolean = false;
		try {
			const sessionList = await fetchSessions();
			sessionListLoaded = true;
			temporaryDraft = sessionList.sessions.find(
				(session: SessionMetadata): boolean =>
					session.id === temporaryDraftId,
			);
		} catch (error: unknown) {
			console.warn(
				"[App] load temporary draft before returning home failed",
				error,
			);
		}

		if (sessionListLoaded && temporaryDraft === undefined) {
			temporaryDraftSessionIdRef.current = null;
			return false;
		}

		await onSessionSelect(
			temporaryDraft ?? ({ id: temporaryDraftId } as SessionMetadata),
			{ recordNavigation: false },
		);
		setHomeComposerMessage(
			composerDraftsRef.current.get(temporaryDraftId) ?? "",
		);
		setIsNewSessionHome(true);
		if (
			sessionListLoaded &&
			temporaryDraft?.workspaceId === undefined &&
			workspace !== null
		) {
			await onHomeWorkspaceSelect(workspace.id);
		}
		return true;
	}

	async function handleNewSession(
		options: NewSessionLifecycleOptions = {},
	): Promise<void> {
		const preferredWorkspace: WorkspaceConfig | null =
			options.workspace ?? null;
		const initialDraft: string = options.initialDraft ?? "";
		if (activeSessionMetadata?.temporary === true) {
			const temporaryId: string | null = activeSessionId;
			beginLocalNewSessionDraft(preferredWorkspace, initialDraft);
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
			void loadHomeWorkspaces();
			return;
		}
		if (
			temporaryDraftSessionIdRef.current !== null &&
			options.restoreTemporaryDraft !== false &&
			options.initialDraft === undefined
		) {
			if (
				await restoreTemporaryDraftOnNewSessionHome(preferredWorkspace)
			) {
				return;
			}
		}
		const staleTemporaryId: string | null =
			temporaryDraftSessionIdRef.current;
		const pendingWorkbenchPersistence: Promise<void> =
			persistPendingWorkbenchPatchBeforeNavigation();
		beginLocalNewSessionDraft(preferredWorkspace, initialDraft);
		await pendingWorkbenchPersistence;
		if (staleTemporaryId !== null) {
			await deleteSessionWithLayout(staleTemporaryId).catch(
				(error: unknown): void => {
					console.warn(
						"[App] discard temporary session failed",
						error,
					);
				},
			);
		}
		void loadHomeWorkspaces();
	}

	return {
		restoreTemporaryDraftOnNewSessionHome,
		handleNewSession,
	};
}

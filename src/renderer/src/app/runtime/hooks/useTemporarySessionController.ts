import type {
	Dispatch,
	MutableRefObject,
	SetStateAction,
} from "react";
import type { ApprovalMode } from "@/platform/rpc/approval-api";
import { createSession, openSession } from "@/platform/rpc/session-api";
import type { ClientPreferences } from "@/platform/rpc/client-preferences-api";
import type { ProviderModelSelection } from "@/platform/rpc/provider-api";
import type {
	SelectionAskThread,
	SessionMetadata,
	WorkbenchSnapshot,
	WorkspaceConfig,
} from "@/platform/rpc/types";
import type { TimelinePageStore } from "@/domain/workbench/timeline-page-store";
import {
	createPreferredHomeDraft,
	createWorkspaceFromSessionMetadata,
	createWorkspaceFromSessionOpenResult,
	type HomeDraft,
} from "../app-helpers";

type RefValue<T> = { current: T };

export type TemporarySessionControllerParams = {
	activeSessionId: string | null;
	activeSessionMetadata: SessionMetadata | null;
	activeSessionIdRef: MutableRefObject<string | null>;
	homeComposerMessageRef: RefValue<string>;
	homeDraftRef: RefValue<HomeDraft>;
	clientPreferencesRef: RefValue<ClientPreferences>;
	providerModelSelection: ProviderModelSelection | null;
	workbench: WorkbenchSnapshot | null;
	composerDraftsRef: MutableRefObject<Map<string, string>>;
	temporaryDraftSessionIdRef: MutableRefObject<string | null>;
	temporarySessionCreationRef: MutableRefObject<Promise<void> | null>;
	navigationVersionRef: MutableRefObject<number>;
	timelineStore: TimelinePageStore;
	deleteSessionWithLayout: (sessionId: string) => Promise<void>;
	setActiveSessionId: Dispatch<SetStateAction<string | null>>;
	setActiveSessionMetadata: Dispatch<SetStateAction<SessionMetadata | null>>;
	setSelectionAskThreads: Dispatch<SetStateAction<SelectionAskThread[]>>;
	setHomeDraft: Dispatch<SetStateAction<HomeDraft>>;
	setActiveWorkspace: Dispatch<SetStateAction<WorkspaceConfig | null>>;
	setWorkbench: Dispatch<SetStateAction<WorkbenchSnapshot | null>>;
	setApprovalModeState: Dispatch<SetStateAction<ApprovalMode>>;
	setIsNewSessionHome: Dispatch<SetStateAction<boolean>>;
	setIsSessionLoading: Dispatch<SetStateAction<boolean>>;
	setSessionError: Dispatch<SetStateAction<string | null>>;
	setFirstTurnModelTransition: Dispatch<
		SetStateAction<{
			sessionId: string;
			providerId: string;
			modelId: string;
		} | null>
	>;
	resetSessionPresentationState: () => void;
	replaceComposerInput: (text: string, scopeId?: string) => void;
};

export type TemporarySessionController = {
	createTemporarySession: (workspace?: WorkspaceConfig | null) => Promise<void>;
	restoreMaterializedHomeDraftSession: (sessionId: string) => Promise<void>;
	discardTemporarySessionIfEmpty: () => Promise<void>;
	beginLocalNewSessionDraft: (
		workspace: WorkspaceConfig | null,
		initialDraft?: string,
		executionEnvironment?: "local" | "worktree",
	) => void;
};

export default function useTemporarySessionController({
	activeSessionId,
	activeSessionMetadata,
	activeSessionIdRef,
	homeComposerMessageRef,
	homeDraftRef,
	clientPreferencesRef,
	providerModelSelection,
	workbench,
	composerDraftsRef,
	temporaryDraftSessionIdRef,
	temporarySessionCreationRef,
	navigationVersionRef,
	timelineStore,
	deleteSessionWithLayout,
	setActiveSessionId,
	setActiveSessionMetadata,
	setSelectionAskThreads,
	setHomeDraft,
	setActiveWorkspace,
	setWorkbench,
	setApprovalModeState,
	setIsNewSessionHome,
	setIsSessionLoading,
	setSessionError,
	setFirstTurnModelTransition,
	resetSessionPresentationState,
	replaceComposerInput,
}: TemporarySessionControllerParams): TemporarySessionController {
	function beginLocalNewSessionDraft(
		workspace: WorkspaceConfig | null,
		initialDraft: string = "",
		executionEnvironment: "local" | "worktree" = "local",
	): void {
		navigationVersionRef.current += 1;
		temporaryDraftSessionIdRef.current = null;
		activeSessionIdRef.current = null;
		setActiveSessionId(null);
		setActiveSessionMetadata(null);
		setSelectionAskThreads([]);
		setIsNewSessionHome(true);
		setHomeDraft(
			createPreferredHomeDraft(
				clientPreferencesRef.current,
				providerModelSelection,
				workspace,
				executionEnvironment,
			),
		);
		setActiveWorkspace(workspace);
		resetSessionPresentationState();
		setFirstTurnModelTransition(null);
		setSessionError(null);
		setApprovalModeState(
			clientPreferencesRef.current.newSessionComposer.approvalMode,
		);
		replaceComposerInput(initialDraft, "home");
	}

	async function createTemporarySession(
		workspace: WorkspaceConfig | null = null,
	): Promise<void> {
		if (temporarySessionCreationRef.current !== null) {
			return temporarySessionCreationRef.current;
		}

		const currentPreferences: ClientPreferences =
			clientPreferencesRef.current;
		const currentDraft: HomeDraft = homeDraftRef.current;
		const draft: HomeDraft =
			workspace === null
				? currentDraft
				: {
						...currentDraft,
						workspaceId: workspace.id,
						workspace,
					};
		const preferredApprovalMode: ApprovalMode =
			currentPreferences.newSessionComposer.approvalMode;
		const createOperation: Promise<void> = (async (): Promise<void> => {
			const created = await createSession({
				title: "New session",
				temporary: true,
				workspaceId: draft.workspaceId,
				provider: draft.providerId ?? undefined,
				model: draft.modelId ?? undefined,
				reasoningEffort: draft.reasoningEffort,
				chatMode: draft.chatMode,
				approvalMode: preferredApprovalMode,
				workspaceLaunch: draft.workspaceLaunch,
			});
			const currentDraftText: string = homeComposerMessageRef.current;
			if (currentDraftText.length > 0) {
				composerDraftsRef.current.set(created.id, currentDraftText);
			}
			temporaryDraftSessionIdRef.current = created.id;
			activeSessionIdRef.current = created.id;
			setActiveSessionId(created.id);
			setActiveSessionMetadata(created);
			setActiveWorkspace(
				createWorkspaceFromSessionMetadata(created, created.workbench),
			);
			setWorkbench(created.workbench);
			setApprovalModeState(preferredApprovalMode);
			timelineStore.reset();
			setIsNewSessionHome(true);
			setSessionError(null);
		})();
		temporarySessionCreationRef.current = createOperation;
		try {
			await createOperation;
		} finally {
			temporarySessionCreationRef.current = null;
		}
	}

	async function restoreMaterializedHomeDraftSession(
		sessionId: string,
	): Promise<void> {
		setIsSessionLoading(true);
		try {
			const result = await openSession(sessionId);
			if (activeSessionIdRef.current !== sessionId) {
				return;
			}
			temporaryDraftSessionIdRef.current = sessionId;
			setActiveSessionMetadata(result.metadata);
			setWorkbench({
				...result.workbench,
				composer: {
					...result.workbench.composer,
					text: "",
				},
			});
			setActiveWorkspace(createWorkspaceFromSessionOpenResult(result));
			setIsNewSessionHome(true);
			setSessionError(null);
		} catch (error: unknown) {
			const currentDraft: HomeDraft = homeDraftRef.current;
			const currentText: string =
				composerDraftsRef.current.get(sessionId) ??
				homeComposerMessageRef.current;
			beginLocalNewSessionDraft(
				currentDraft.workspace,
				currentText,
				currentDraft.executionEnvironment,
			);
			void deleteSessionWithLayout(sessionId).catch((): void => {});
			setSessionError(
				error instanceof Error
					? error.message
					: "Failed to restore New session",
			);
		} finally {
			setIsSessionLoading(false);
		}
	}

	async function discardTemporarySessionIfEmpty(): Promise<void> {
		if (
			activeSessionMetadata?.temporary !== true ||
			activeSessionId === null
		) {
			return;
		}
		const draftText: string =
			composerDraftsRef.current.get(activeSessionId) ?? "";
		const hasDraft: boolean =
			draftText.trim().length > 0 ||
			(workbench?.composer.additionalContext.length ?? 0) > 0;
		if (hasDraft) {
			temporaryDraftSessionIdRef.current = activeSessionId;
			return;
		}
		const temporaryId: string = activeSessionId;
		temporaryDraftSessionIdRef.current = null;
		await deleteSessionWithLayout(temporaryId).catch((error: unknown): void => {
			console.warn(
				"[App] delete empty temporary session failed",
				error,
			);
		});
	}

	return {
		createTemporarySession,
		restoreMaterializedHomeDraftSession,
		discardTemporarySessionIfEmpty,
		beginLocalNewSessionDraft,
	};
}

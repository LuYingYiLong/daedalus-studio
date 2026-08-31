import type {
	Dispatch,
	MutableRefObject,
	SetStateAction,
} from "react";
import type { ChatMode } from "@/platform/rpc/chat-api";
import type {
	AdditionalContextItem,
	SessionMetadata,
	WorkbenchSnapshot,
	WorkspaceConfig,
} from "@/platform/rpc/types";
import type { ClientPreferences } from "@/platform/rpc/client-preferences-api";
import type { SaveSessionUiMetadataParams } from "@/platform/rpc/session-api";
import type {
	ComposerSendRequest,
	ComposerSendController,
} from "./useComposerSendController";
import type {
	FirstTurnWorktreeRequest,
	FirstTurnWorktreeResult,
} from "./useFirstTurnWorktreeController";
import type { FirstTurnModelTransition } from "./useComposerTimelineRuntimeController";
import type { HomeDraft } from "@/domain/session/home-draft";
import { getChatMode } from "@/domain/application/app-helpers";

export type ComposerSubmitControllerParams = {
	isNewSessionHome: boolean;
	activeSessionId: string | null;
	homeDraft: HomeDraft;
	workbench: WorkbenchSnapshot | null;
	activeWorkspace: WorkspaceConfig | null;
	temporaryDraftSessionIdRef: MutableRefObject<string | null>;
	handleHomeComposerSubmit: (
		nextMessage: string,
		modeOverride?: ChatMode,
	) => Promise<void>;
	prepareFirstTurnWorktree: (
		request: FirstTurnWorktreeRequest,
	) => Promise<FirstTurnWorktreeResult>;
	submitComposerMessage: ComposerSendController["submitComposerMessage"];
	persistSessionUiMetadata: (
		params: SaveSessionUiMetadataParams,
	) => Promise<void>;
	persistNewSessionComposerDefaults: (
		patch: Partial<ClientPreferences["newSessionComposer"]>,
	) => void;
	replaceComposerInput: (text: string, scopeId?: string) => void;
	setIsNewSessionHome: Dispatch<SetStateAction<boolean>>;
	setActiveSessionMetadata: Dispatch<SetStateAction<SessionMetadata | null>>;
	setFirstTurnModelTransition: Dispatch<
		SetStateAction<FirstTurnModelTransition | null>
	>;
	setWorkbench: Dispatch<SetStateAction<WorkbenchSnapshot | null>>;
	setSessionError: (message: string | null) => void;
};

export type ComposerSubmitController = {
	handleComposerSubmit: (
		nextMessage: string,
		modeOverride?: ChatMode,
	) => Promise<void>;
};

export default function useComposerSubmitController({
	isNewSessionHome,
	activeSessionId,
	homeDraft,
	workbench,
	activeWorkspace,
	temporaryDraftSessionIdRef,
	handleHomeComposerSubmit,
	prepareFirstTurnWorktree,
	submitComposerMessage,
	persistSessionUiMetadata,
	persistNewSessionComposerDefaults,
	replaceComposerInput,
	setIsNewSessionHome,
	setActiveSessionMetadata,
	setFirstTurnModelTransition,
	setWorkbench,
	setSessionError,
}: ComposerSubmitControllerParams): ComposerSubmitController {
	async function handleComposerSubmit(
		nextMessage: string,
		modeOverride?: ChatMode,
	): Promise<void> {
		const isFirstTurnSubmission: boolean = isNewSessionHome;
		if (isNewSessionHome && activeSessionId === null) {
			await handleHomeComposerSubmit(nextMessage, modeOverride);
			return;
		}

		const worktreeResult = await prepareFirstTurnWorktree({
			shouldPrepare:
				isFirstTurnSubmission &&
				homeDraft.executionEnvironment === "worktree",
			sessionId: activeSessionId,
			workspaceId: homeDraft.workspaceId,
			worktreeSources: homeDraft.worktreeSources,
			nextMessage,
			workbench,
			workspace: activeWorkspace,
		});
		if (worktreeResult.blocked) {
			return;
		}

		const effectiveWorkbench: WorkbenchSnapshot | null =
			worktreeResult.workbench;
		const effectiveWorkspace: WorkspaceConfig | null =
			worktreeResult.workspace;
		if (isNewSessionHome) {
			setIsNewSessionHome(false);
			temporaryDraftSessionIdRef.current = null;
			setActiveSessionMetadata(
				(metadata: SessionMetadata | null): SessionMetadata | null =>
					metadata?.temporary === true
						? { ...metadata, temporary: false }
						: metadata,
			);
		}

		if (activeSessionId === null || effectiveWorkbench === null) {
			setSessionError(
				"Please open session first before sending a message",
			);
			return;
		}

		const message: string = nextMessage.trim();
		const additionalContext: AdditionalContextItem[] =
			effectiveWorkbench.composer.additionalContext;
		if (message.length === 0 && additionalContext.length === 0) {
			return;
		}
		replaceComposerInput("", activeSessionId);

		const selectedProvider: string | undefined = isFirstTurnSubmission
			? (homeDraft.providerId ?? effectiveWorkbench.composer.provider)
			: effectiveWorkbench.composer.provider;
		const selectedModel: string | undefined = isFirstTurnSubmission
			? (homeDraft.modelId ?? effectiveWorkbench.composer.model)
			: effectiveWorkbench.composer.model;
		const selectedReasoningEffort: string | undefined =
			isFirstTurnSubmission
				? homeDraft.reasoningEffort
				: (effectiveWorkbench.composer.reasoningEffort ?? undefined);
		const currentChatMode: ChatMode = isFirstTurnSubmission
			? homeDraft.chatMode
			: getChatMode(effectiveWorkbench);
		const chatMode: ChatMode = modeOverride ?? currentChatMode;
		if (isFirstTurnSubmission) {
			if (selectedProvider !== undefined && selectedModel !== undefined) {
				setFirstTurnModelTransition({
					sessionId: activeSessionId,
					providerId: selectedProvider,
					modelId: selectedModel,
				});
			}
			setWorkbench(
				(
					currentWorkbench: WorkbenchSnapshot | null,
				): WorkbenchSnapshot | null =>
					currentWorkbench === null
						? currentWorkbench
						: {
								...currentWorkbench,
								composer: {
									...currentWorkbench.composer,
									chatMode,
									...(selectedProvider === undefined
										? {}
										: { provider: selectedProvider }),
									...(selectedModel === undefined
										? {}
										: { model: selectedModel }),
									...(selectedReasoningEffort === undefined
										? {}
										: {
												reasoningEffort:
													selectedReasoningEffort,
										}),
								},
							},
			);
		}
		if (modeOverride !== undefined && modeOverride !== currentChatMode) {
			persistNewSessionComposerDefaults({ mode: chatMode });
			setWorkbench(
				(
					currentWorkbench: WorkbenchSnapshot | null,
				): WorkbenchSnapshot | null =>
					currentWorkbench === null
						? currentWorkbench
						: {
								...currentWorkbench,
								composer: {
									...currentWorkbench.composer,
									chatMode,
								},
							},
			);
			void persistSessionUiMetadata({ chatMode });
		}

		const firstTurnRequestAccepted: boolean | null =
			await submitComposerMessage({
				message,
				additionalContext,
				chatMode,
				modeOverride,
				provider: selectedProvider,
				model: selectedModel,
				reasoningEffort: selectedReasoningEffort,
				workspace: effectiveWorkspace,
				workbench: effectiveWorkbench,
			} satisfies ComposerSendRequest);
		if (isFirstTurnSubmission && firstTurnRequestAccepted === false) {
			setFirstTurnModelTransition(
				(currentTransition): FirstTurnModelTransition | null =>
					currentTransition?.sessionId === activeSessionId
						? null
						: currentTransition,
			);
		}
	}

	return { handleComposerSubmit };
}

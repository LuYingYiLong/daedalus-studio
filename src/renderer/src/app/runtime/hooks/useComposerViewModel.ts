import type { MutableRefObject } from "react";
import type { ChatMode } from "@/platform/rpc/chat-api";
import type {
	AdditionalContextItem,
	MessageQueueItem,
	PendingGuide,
	PendingToolBudget,
	SessionMetadata,
	WorkbenchSnapshot,
	WorkspaceConfig,
} from "@/platform/rpc/types";
import type { ProviderModelSelection } from "@/platform/rpc/provider-api";
import type { GeneralSettings } from "@/platform/rpc/general-settings-api";
import type { RunControllerState } from "@/domain/workbench/run-state";
import type { RunningSessionState } from "@/domain/workspace/session-running";
import type { FirstTurnModelTransition } from "./useComposerTimelineRuntimeController";
import type { HomeDraft } from "../app-helpers";
import {
	getChatMode,
	getDisplayedComposerModel,
} from "../app-helpers";
import { getSessionTitle } from "../session-title";
import { isComposerWorkspaceSelectionLocked } from "@/domain/composer/composer-workspace-lock";
import { isRunControllerActive } from "@/domain/workbench/run-state";

export type ComposerViewModelParams = {
	isNewSessionHome: boolean;
	activeSessionId: string | null;
	homeDraft: HomeDraft;
	workbench: WorkbenchSnapshot | null;
	activeWorkspace: WorkspaceConfig | null;
	activeSessionMetadata: SessionMetadata | null;
	providerModelSelection: ProviderModelSelection | null;
	firstTurnModelTransition: FirstTurnModelTransition | null;
	composerInputReset: { scopeId: string; revision: number };
	composerDraftsRef: MutableRefObject<Map<string, string>>;
	homeComposerMessage: string;
	isWorkspaceSessionCreating: boolean;
	generalSettings: GeneralSettings;
	runState: RunControllerState;
	isHomeSubmitting: boolean;
	runningSessionState: RunningSessionState;
};

export type ComposerViewModel = {
	selectedProviderId: string | null;
	selectedModelId: string | null;
	pendingToolBudget: PendingToolBudget | null;
	chatTitle: string;
	composerMessage: string;
	composerInstanceKey: string;
	composerMode: ChatMode;
	composerReasoningEffort: string | null;
	composerContextItems: AdditionalContextItem[];
	composerMessageQueue: MessageQueueItem[];
	composerPendingGuides: PendingGuide[];
	currentSessionWorkspaceId: string | null;
	composerWorkspaceLocked: boolean;
	displayedWorkspace: WorkspaceConfig | null;
	godotLaunchExecutablePath: string | null;
	composerIsSending: boolean;
	composerIsCancelling: boolean;
	appUpdateRuntimeBusy: boolean;
	nextStepSuggestion: string | null;
	runningSessionIds: string[];
};

export default function useComposerViewModel({
	isNewSessionHome,
	activeSessionId,
	homeDraft,
	workbench,
	activeWorkspace,
	activeSessionMetadata,
	providerModelSelection,
	firstTurnModelTransition,
	composerInputReset,
	composerDraftsRef,
	homeComposerMessage,
	isWorkspaceSessionCreating,
	generalSettings,
	runState,
	isHomeSubmitting,
	runningSessionState,
}: ComposerViewModelParams): ComposerViewModel {
	const displayedComposerModel = getDisplayedComposerModel({
		isNewSessionHome,
		homeDraft,
		workbench,
		activeSessionMetadata,
		providerModelSelection,
		firstTurnModelTransition:
			firstTurnModelTransition?.sessionId === activeSessionId
				? firstTurnModelTransition
				: null,
	});
	const selectedProviderId: string | null = displayedComposerModel.providerId;
	const selectedModelId: string | null = displayedComposerModel.modelId;
	const pendingToolBudget: PendingToolBudget | null =
		workbench?.pendingToolBudget ?? null;
	const chatTitle: string = isNewSessionHome
		? "New session"
		: getSessionTitle(activeSessionMetadata, activeSessionId);
	const composerScopeId: string = activeSessionId ?? "home";
	const storedComposerMessage: string =
		composerDraftsRef.current.get(composerScopeId) ?? "";
	const composerMessage: string = isNewSessionHome
		? homeComposerMessage
		: storedComposerMessage;
	const composerInstanceKey: string = `${composerScopeId}:${composerInputReset.scopeId === composerScopeId ? composerInputReset.revision : 0}`;
	const composerMode: ChatMode =
		activeSessionId === null ? homeDraft.chatMode : getChatMode(workbench);
	const composerReasoningEffort: string | null =
		activeSessionId === null
			? homeDraft.reasoningEffort
			: (workbench?.composer.reasoningEffort ??
				activeSessionMetadata?.reasoningEffort ??
				null);
	const composerContextItems: AdditionalContextItem[] =
		activeSessionId === null
			? []
			: (workbench?.composer.additionalContext ?? []);
	const composerMessageQueue: MessageQueueItem[] =
		activeSessionId === null ? [] : (workbench?.messageQueue ?? []);
	const composerPendingGuides: PendingGuide[] =
		activeSessionId === null ? [] : (workbench?.pendingGuides ?? []);
	const currentSessionWorkspaceId: string | null =
		activeSessionMetadata?.workspaceId ?? null;
	const composerWorkspaceLocked: boolean =
		isWorkspaceSessionCreating ||
		isComposerWorkspaceSelectionLocked(
			activeSessionId,
			activeSessionMetadata,
		);
	const displayedWorkspace: WorkspaceConfig | null =
		activeSessionId === null
			? homeDraft.workspace
			: currentSessionWorkspaceId === null
				? null
				: activeWorkspace;
	const godotLaunchExecutablePath: string | null =
		displayedWorkspace?.godotExecutablePath ??
		activeSessionMetadata?.godotExecutablePath ??
		(generalSettings.godotExecutableStatus === "ready"
			? generalSettings.godotExecutablePath
			: null);
	const composerIsSending: boolean =
		isRunControllerActive(runState) || isHomeSubmitting;
	const composerIsCancelling: boolean = runState.status === "cancelling";
	const appUpdateRuntimeBusy: boolean =
		composerIsSending || runningSessionState.size > 0;
	const nextStepSuggestionCandidate: unknown =
		workbench?.nextStepHints?.hints?.[0]?.message;
	const nextStepSuggestion: string | null =
		activeSessionId === null ||
		composerIsSending ||
		typeof nextStepSuggestionCandidate !== "string"
			? null
			: nextStepSuggestionCandidate.trim() || null;
	const runningSessionIds: string[] = [...runningSessionState.keys()];

	return {
		selectedProviderId,
		selectedModelId,
		pendingToolBudget,
		chatTitle,
		composerMessage,
		composerInstanceKey,
		composerMode,
		composerReasoningEffort,
		composerContextItems,
		composerMessageQueue,
		composerPendingGuides,
		currentSessionWorkspaceId,
		composerWorkspaceLocked,
		displayedWorkspace,
		godotLaunchExecutablePath,
		composerIsSending,
		composerIsCancelling,
		appUpdateRuntimeBusy,
		nextStepSuggestion,
		runningSessionIds,
	};
}

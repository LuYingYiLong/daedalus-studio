import type {
	Dispatch,
	MutableRefObject,
	SetStateAction,
} from "react";
import type { ApprovalMode } from "@/platform/rpc/approval-api";
import type { ChatMode } from "@/platform/rpc/chat-api";
import type { ClientPreferences } from "@/platform/rpc/client-preferences-api";
import type { ProviderModelSelection } from "@/platform/rpc/provider-api";
import type { SaveSessionUiMetadataParams } from "@/platform/rpc/session-api";
import type { SkillSummary } from "@/platform/rpc/skill-api";
import type {
	AdditionalContextItem,
	MessageQueueItem,
	SessionMetadata,
	WorkbenchPatch,
	WorkbenchPatchResult,
	WorkbenchSnapshot,
	WorkflowTodoSnapshot,
	WorkspaceConfig,
} from "@/platform/rpc/types";
import type { RunControllerState } from "@/domain/workbench/run-state";
import type { RunningSessionState } from "@/domain/workspace/session-running";
import type { TimelinePageStore } from "@/domain/workbench/timeline-page-store";
import useComposerQueueController, {
	type ComposerQueueController,
} from "./useComposerQueueController";
import useComposerSendController, {
	type ComposerSendController,
} from "./useComposerSendController";
import useHomeComposerController, {
	type HomeComposerController,
} from "./useHomeComposerController";
import useComposerRunController, {
	type ComposerRunController,
} from "./useComposerRunController";
import useFirstTurnWorktreeController, {
	type FirstTurnWorktreeController,
} from "./useFirstTurnWorktreeController";
import useComposerSubmitController, {
	type ComposerSubmitController,
} from "./useComposerSubmitController";
import type { FirstTurnModelTransition } from "./useComposerTimelineRuntimeController";
import type { HomeDraft } from "../app-helpers";

export type ComposerInteractionControllerParams = {
	state: {
		activeSessionId: string | null;
		isNewSessionHome: boolean;
		homeDraft: HomeDraft;
		clientPreferences: ClientPreferences;
		providerModelSelection: ProviderModelSelection | null;
		approvalMode: ApprovalMode;
		skills: readonly SkillSummary[];
		activeWorkspace: WorkspaceConfig | null;
		workbench: WorkbenchSnapshot | null;
		runState: RunControllerState;
		isSessionLoading: boolean;
	};
	refs: {
		activeSessionIdRef: MutableRefObject<string | null>;
		activeChatRequestIdRef: MutableRefObject<string | null>;
		cancelledChatRequestIdsRef: MutableRefObject<Set<string>>;
		homeSubmissionPendingRef: MutableRefObject<boolean>;
		temporaryDraftSessionIdRef: MutableRefObject<string | null>;
	};
	setters: {
		setHomeDraft: Dispatch<SetStateAction<HomeDraft>>;
		setIsHomeSubmitting: Dispatch<SetStateAction<boolean>>;
		setIsWorktreePreparing: Dispatch<SetStateAction<boolean>>;
		setIsNewSessionHome: Dispatch<SetStateAction<boolean>>;
		setActiveSessionId: Dispatch<SetStateAction<string | null>>;
		setActiveSessionMetadata: Dispatch<SetStateAction<SessionMetadata | null>>;
		setActiveWorkspace: Dispatch<SetStateAction<WorkspaceConfig | null>>;
		setWorkbench: Dispatch<SetStateAction<WorkbenchSnapshot | null>>;
		setWorkflowTodoSnapshot: Dispatch<
			SetStateAction<WorkflowTodoSnapshot | null>
		>;
		setSessionError: (message: string | null) => void;
		setActiveRetryRequestId: Dispatch<SetStateAction<string | null>>;
		setRunState: Dispatch<SetStateAction<RunControllerState>>;
		setRunningSessionState: Dispatch<SetStateAction<RunningSessionState>>;
		setFirstTurnModelTransition: Dispatch<
			SetStateAction<FirstTurnModelTransition | null>
		>;
	};
	runtime: {
		getWorktreeUnavailableMessage: () => string;
		persistNewSessionComposerDefaults: (
			patch: Partial<ClientPreferences["newSessionComposer"]>,
		) => void;
		persistSessionUiMetadata: (
			params: SaveSessionUiMetadataParams,
		) => Promise<void>;
		applyWorkbench: (nextWorkbench: WorkbenchSnapshot) => void;
		takePendingWorkbenchPatch: () => WorkbenchPatch;
		sendWorkbenchPatch: (
			patch: WorkbenchPatch,
			applyResult?: boolean,
		) => Promise<WorkbenchPatchResult | null>;
		replaceComposerInput: (text: string, scopeId?: string) => void;
		applyOptimisticSend: (
			requestId: string,
			message: string,
			additionalContext: AdditionalContextItem[],
		) => void;
		finishOptimisticActiveRun: (requestId: string) => void;
		refreshLatestTimeline: (sessionIdOverride?: string) => Promise<void>;
		applyOptimisticRetry: (
			retryFromRequestId: string,
			requestId: string,
			message: string,
			additionalContext: AdditionalContextItem[],
		) => void;
		resetPlanClarificationUiState: () => void;
		resetPlanApprovalUiState: () => void;
		rememberLoadedWorkflowTodo: (
			snapshot: WorkflowTodoSnapshot | null,
		) => void;
		showTransientError: (message: string) => void;
		onInfo: (message: string) => void;
		timelineStore: TimelinePageStore;
	};
};

export type ComposerInteractionController = ComposerQueueController &
	ComposerSendController &
	HomeComposerController &
	ComposerRunController &
	FirstTurnWorktreeController &
	ComposerSubmitController;

export default function useComposerInteractionController({
	state,
	refs,
	setters,
	runtime,
}: ComposerInteractionControllerParams): ComposerInteractionController {
	const queueController = useComposerQueueController({
		activeSessionId: state.activeSessionId,
		activeSessionIdRef: refs.activeSessionIdRef,
		isNewSessionHome: state.isNewSessionHome,
		workbench: state.workbench,
		activeWorkspace: state.activeWorkspace,
		skills: state.skills,
		runState: state.runState,
		setWorkbench: setters.setWorkbench,
		applyWorkbench: runtime.applyWorkbench,
		takePendingWorkbenchPatch: runtime.takePendingWorkbenchPatch,
		sendWorkbenchPatch: runtime.sendWorkbenchPatch,
		replaceComposerInput: runtime.replaceComposerInput,
		setSessionError: setters.setSessionError,
		onInfo: runtime.onInfo,
	});

	const sendController = useComposerSendController({
		activeSessionId: state.activeSessionId,
		activeSessionIdRef: refs.activeSessionIdRef,
		runState: state.runState,
		skills: state.skills,
		setRunState: setters.setRunState,
		setRunningSessionState: setters.setRunningSessionState,
		setWorkbench: setters.setWorkbench,
		setSessionError: setters.setSessionError,
		setActiveRetryRequestId: setters.setActiveRetryRequestId,
		activeChatRequestIdRef: refs.activeChatRequestIdRef,
		cancelledChatRequestIdsRef: refs.cancelledChatRequestIdsRef,
		takePendingWorkbenchPatch: runtime.takePendingWorkbenchPatch,
		sendWorkbenchPatch: runtime.sendWorkbenchPatch,
		handleQueueMessageSubmit: queueController.handleQueueMessageSubmit,
		applyOptimisticSend: runtime.applyOptimisticSend,
		finishOptimisticActiveRun: runtime.finishOptimisticActiveRun,
		replaceComposerInput: runtime.replaceComposerInput,
		refreshLatestTimeline: runtime.refreshLatestTimeline,
		timelineStore: runtime.timelineStore,
	});

	const homeController = useHomeComposerController({
		homeDraft: state.homeDraft,
		clientPreferences: state.clientPreferences,
		providerModelSelection: state.providerModelSelection,
		approvalMode: state.approvalMode,
		skills: state.skills,
		getWorktreeUnavailableMessage: runtime.getWorktreeUnavailableMessage,
		persistNewSessionComposerDefaults:
			runtime.persistNewSessionComposerDefaults,
		setHomeDraft: setters.setHomeDraft,
		setIsHomeSubmitting: setters.setIsHomeSubmitting,
		setIsWorktreePreparing: setters.setIsWorktreePreparing,
		setIsNewSessionHome: setters.setIsNewSessionHome,
		setActiveSessionId: setters.setActiveSessionId,
		activeSessionIdRef: refs.activeSessionIdRef,
		setActiveSessionMetadata: setters.setActiveSessionMetadata,
		setActiveWorkspace: setters.setActiveWorkspace,
		setWorkbench: setters.setWorkbench,
		setWorkflowTodoSnapshot: setters.setWorkflowTodoSnapshot,
		rememberLoadedWorkflowTodo: runtime.rememberLoadedWorkflowTodo,
		setSessionError: setters.setSessionError,
		setActiveRetryRequestId: setters.setActiveRetryRequestId,
		setRunState: setters.setRunState,
		setRunningSessionState: setters.setRunningSessionState,
		activeChatRequestIdRef: refs.activeChatRequestIdRef,
		cancelledChatRequestIdsRef: refs.cancelledChatRequestIdsRef,
		homeSubmissionPendingRef: refs.homeSubmissionPendingRef,
		replaceComposerInput: runtime.replaceComposerInput,
		applyOptimisticSend: runtime.applyOptimisticSend,
		refreshLatestTimeline: runtime.refreshLatestTimeline,
		finishOptimisticActiveRun: runtime.finishOptimisticActiveRun,
		timelineStore: runtime.timelineStore,
	});

	const runController = useComposerRunController({
		activeSessionId: state.activeSessionId,
		activeSessionIdRef: refs.activeSessionIdRef,
		activeWorkspace: state.activeWorkspace,
		workbench: state.workbench,
		runState: state.runState,
		isSessionLoading: state.isSessionLoading,
		skills: state.skills,
		setSessionError: setters.setSessionError,
		setActiveRetryRequestId: setters.setActiveRetryRequestId,
		setRunState: setters.setRunState,
		setWorkbench: setters.setWorkbench,
		setIsHomeSubmitting: setters.setIsHomeSubmitting,
		activeChatRequestIdRef: refs.activeChatRequestIdRef,
		cancelledChatRequestIdsRef: refs.cancelledChatRequestIdsRef,
		homeSubmissionPendingRef: refs.homeSubmissionPendingRef,
		takePendingWorkbenchPatch: runtime.takePendingWorkbenchPatch,
		sendWorkbenchPatch: runtime.sendWorkbenchPatch,
		applyOptimisticRetry: runtime.applyOptimisticRetry,
		finishOptimisticActiveRun: runtime.finishOptimisticActiveRun,
		refreshLatestTimeline: runtime.refreshLatestTimeline,
		resetPlanClarificationUiState: runtime.resetPlanClarificationUiState,
		resetPlanApprovalUiState: runtime.resetPlanApprovalUiState,
		showTransientError: runtime.showTransientError,
	});

	const firstTurnWorktreeController = useFirstTurnWorktreeController({
		getUnavailableMessage: runtime.getWorktreeUnavailableMessage,
		setIsWorktreePreparing: setters.setIsWorktreePreparing,
		setSessionError: setters.setSessionError,
		setActiveSessionMetadata: setters.setActiveSessionMetadata,
		setActiveWorkspace: setters.setActiveWorkspace,
		setWorkbench: setters.setWorkbench,
		replaceComposerInput: runtime.replaceComposerInput,
	});

	const submitController = useComposerSubmitController({
		isNewSessionHome: state.isNewSessionHome,
		activeSessionId: state.activeSessionId,
		homeDraft: state.homeDraft,
		workbench: state.workbench,
		activeWorkspace: state.activeWorkspace,
		temporaryDraftSessionIdRef: refs.temporaryDraftSessionIdRef,
		handleHomeComposerSubmit: homeController.handleHomeComposerSubmit,
		prepareFirstTurnWorktree:
			firstTurnWorktreeController.prepareFirstTurnWorktree,
		submitComposerMessage: sendController.submitComposerMessage,
		persistSessionUiMetadata: runtime.persistSessionUiMetadata,
		persistNewSessionComposerDefaults:
			runtime.persistNewSessionComposerDefaults,
		replaceComposerInput: runtime.replaceComposerInput,
		setIsNewSessionHome: setters.setIsNewSessionHome,
		setActiveSessionMetadata: setters.setActiveSessionMetadata,
		setFirstTurnModelTransition: setters.setFirstTurnModelTransition,
		setWorkbench: setters.setWorkbench,
		setSessionError: setters.setSessionError,
	});

	return {
		...queueController,
		submitComposerMessage: sendController.submitComposerMessage,
		handleHomeComposerSubmit: homeController.handleHomeComposerSubmit,
		...runController,
		prepareFirstTurnWorktree:
			firstTurnWorktreeController.prepareFirstTurnWorktree,
		handleComposerSubmit: submitController.handleComposerSubmit,
	};
}

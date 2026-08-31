import type { Dispatch, MutableRefObject, SetStateAction } from "react";
import useAppEventBridge, { type AppEventBridgeParams } from "./useAppEventBridge";
import useAppRuntimeNotificationEffects, {
	type AppRuntimeNotificationCopy,
	type AppRuntimeNotificationEffectsParams,
} from "./useAppRuntimeNotificationEffects";
import useAppRuntimeStateEffects from "./useAppRuntimeStateEffects";
import useAppWindowEventController, {
	type AppWindowEventControllerParams,
} from "./useAppWindowEventController";
import { useDiskSpaceCheck } from "./useDiskSpaceCheck";
import useNativeTaskNotifications from "./useNativeTaskNotifications";
import useSessionRuntimeEvents from "@/features/session/controllers/useSessionRuntimeEvents";
import useTimelineStreamBuffer from "@/features/workbench/controllers/useTimelineStreamBuffer";
import type { ClientPreferences } from "@/platform/rpc/client-preferences-api";
import type { ProviderModelSelection } from "@/platform/rpc/provider-api";
import type { TimelinePageStore } from "@/domain/workbench/timeline-page-store";
import type { RunControllerState } from "@/domain/workbench/run-state";
import type { WorkbenchSnapshot } from "@/platform/rpc/types";
import type { RunningSessionState } from "@/domain/workspace/session-running";
import type { HomeDraft } from "@/domain/session/home-draft";

export type AppRuntimeEventControllerParams = {
	state: {
		activeSessionId: string | null;
		isNewSessionHome: boolean;
		providerModelSelection: ProviderModelSelection | null;
		clientPreferences: ClientPreferences;
		workbench: WorkbenchSnapshot | null;
		runState: RunControllerState;
		chatTitle: string;
		appUpdateRuntimeBusy: boolean;
	};
	refs: {
		activeSessionIdRef: MutableRefObject<string | null>;
		activeChatRequestIdRef: MutableRefObject<string | null>;
		cancelledChatRequestIdsRef: MutableRefObject<Set<string>>;
		pendingUserActionRequestIdsRef: MutableRefObject<Set<string>>;
		activeSessionTitleRef: MutableRefObject<string>;
		activeWorkbenchRef: MutableRefObject<WorkbenchSnapshot | null>;
		windowFocusedRef: MutableRefObject<boolean>;
		clientPreferencesRef: MutableRefObject<ClientPreferences>;
	};
	setters: {
		setRunState: Dispatch<SetStateAction<RunControllerState>>;
		setIsHomeSubmitting: Dispatch<SetStateAction<boolean>>;
		setHomeDraft: Dispatch<SetStateAction<HomeDraft>>;
		setUnreadSessionIds: Dispatch<SetStateAction<ReadonlySet<string>>>;
		setRunningSessionState: Dispatch<SetStateAction<RunningSessionState>>;
		setClientPreferences: (preferences: ClientPreferences) => void;
		setActiveSessionMetadata: AppEventBridgeParams["setActiveSessionMetadata"];
		setWorkflowTodoSnapshot: AppEventBridgeParams["setWorkflowTodoSnapshot"];
		setCurrentGoalSnapshot: AppEventBridgeParams["applyCurrentGoalSnapshot"];
		setLatestPlanClarification: AppEventBridgeParams["setLatestPlanClarification"];
		setLatestPlanApproval: AppEventBridgeParams["setLatestPlanApproval"];
		setPlanClarificationError: AppEventBridgeParams["setPlanClarificationError"];
		setIsPlanClarificationSubmitting: AppEventBridgeParams["setIsPlanClarificationSubmitting"];
		setPlanApprovalError: AppEventBridgeParams["setPlanApprovalError"];
		setIsPlanApproving: AppEventBridgeParams["setIsPlanApproving"];
		setIsPlanRevising: AppEventBridgeParams["setIsPlanRevising"];
	};
	timeline: {
		timelineStore: TimelinePageStore;
		applyWorkbench: AppEventBridgeParams["applyWorkbench"];
		appendQueuedRunUserBlock: AppEventBridgeParams["appendQueuedRunUserBlock"];
		loadSkills: AppEventBridgeParams["loadSkills"];
		clearWorkflowTodoUiState: AppEventBridgeParams["clearWorkflowTodoUiState"];
		rememberLoadedWorkflowTodo: AppEventBridgeParams["rememberLoadedWorkflowTodo"];
		applyInitialWorkflowTodoPreference: AppEventBridgeParams["applyInitialWorkflowTodoPreference"];
		showWorkflowTodo: AppEventBridgeParams["showWorkflowTodo"];
		expandWorkflowTodoPanel: AppEventBridgeParams["expandWorkflowTodoPanel"];
		refreshLatestTimeline: AppEventBridgeParams["refreshLatestTimeline"];
	};
	interaction: {
		handleInterruptedRunRetry: AppWindowEventControllerParams["handleInterruptedRunRetry"];
		handleNewSession: AppWindowEventControllerParams["handleNewSession"];
		runCompletionNotificationsEnabled: boolean;
		pendingApproval: AppRuntimeNotificationEffectsParams["pendingApproval"];
		pendingToolBudget: AppRuntimeNotificationEffectsParams["pendingToolBudget"];
		pendingPlanApproval: AppRuntimeNotificationEffectsParams["pendingPlanApproval"];
		pendingPlanClarification: AppRuntimeNotificationEffectsParams["pendingPlanClarification"];
	};
	notificationCopy: AppRuntimeNotificationCopy;
};

export default function useAppRuntimeEventController({
	state,
	refs,
	setters,
	timeline,
	interaction,
	notificationCopy,
}: AppRuntimeEventControllerParams): void {
	useDiskSpaceCheck();
	const { showNativeTaskNotification, clearNativeTaskNotificationAttention } =
		useNativeTaskNotifications();
	const {
		discardPendingTimelineEvents,
		flushPendingTimelineEvents,
		enqueueTimelineStreamingEvent,
	} = useTimelineStreamBuffer({
		activeSessionIdRef: refs.activeSessionIdRef,
		timelineStore: timeline.timelineStore,
	});

	useAppRuntimeStateEffects({
		activeSessionId: state.activeSessionId,
		activeSessionIdRef: refs.activeSessionIdRef,
		isNewSessionHome: state.isNewSessionHome,
		providerModelSelection: state.providerModelSelection,
		clientPreferences: state.clientPreferences,
		workbench: state.workbench,
		runState: state.runState,
		cancelledChatRequestIdsRef: refs.cancelledChatRequestIdsRef,
		activeChatRequestIdRef: refs.activeChatRequestIdRef,
		windowFocusedRef: refs.windowFocusedRef,
		discardPendingTimelineEvents,
		setRunState: setters.setRunState,
		setIsHomeSubmitting: setters.setIsHomeSubmitting,
		setHomeDraft: setters.setHomeDraft,
		setUnreadSessionIds: setters.setUnreadSessionIds,
	});

	const handleBackendEventObserved = useSessionRuntimeEvents({
		activeSessionIdRef: refs.activeSessionIdRef,
		activeWorkbenchRef: refs.activeWorkbenchRef,
		windowFocusedRef: refs.windowFocusedRef,
		setRunningSessionState: setters.setRunningSessionState,
		setUnreadSessionIds: setters.setUnreadSessionIds,
	});

	useAppEventBridge({
		activeSessionIdRef: refs.activeSessionIdRef,
		activeChatRequestIdRef: refs.activeChatRequestIdRef,
		cancelledChatRequestIdsRef: refs.cancelledChatRequestIdsRef,
		pendingUserActionRequestIdsRef: refs.pendingUserActionRequestIdsRef,
		activeSessionTitleRef: refs.activeSessionTitleRef,
		activeWorkbenchRef: refs.activeWorkbenchRef,
		onEventObserved: handleBackendEventObserved,
		applyWorkbench: timeline.applyWorkbench,
		appendQueuedRunUserBlock: timeline.appendQueuedRunUserBlock,
		loadSkills: timeline.loadSkills,
		clearWorkflowTodoUiState: timeline.clearWorkflowTodoUiState,
		rememberLoadedWorkflowTodo: timeline.rememberLoadedWorkflowTodo,
		applyInitialWorkflowTodoPreference: timeline.applyInitialWorkflowTodoPreference,
		showWorkflowTodo: timeline.showWorkflowTodo,
		expandWorkflowTodoPanel: timeline.expandWorkflowTodoPanel,
		enqueueTimelineStreamingEvent,
		flushPendingTimelineEvents,
		refreshLatestTimeline: timeline.refreshLatestTimeline,
		showNativeTaskNotification,
		runCompletionNotificationsEnabled:
			interaction.runCompletionNotificationsEnabled,
		setActiveSessionMetadata: setters.setActiveSessionMetadata,
		setRunState: setters.setRunState,
		timelineStore: timeline.timelineStore,
		setWorkflowTodoSnapshot: setters.setWorkflowTodoSnapshot,
		applyCurrentGoalSnapshot: setters.setCurrentGoalSnapshot,
		setLatestPlanClarification: setters.setLatestPlanClarification,
		setLatestPlanApproval: setters.setLatestPlanApproval,
		setPlanClarificationError: setters.setPlanClarificationError,
		setIsPlanClarificationSubmitting: setters.setIsPlanClarificationSubmitting,
		setPlanApprovalError: setters.setPlanApprovalError,
		setIsPlanApproving: setters.setIsPlanApproving,
		setIsPlanRevising: setters.setIsPlanRevising,
	});

	useAppRuntimeNotificationEffects({
		activeSessionId: state.activeSessionId,
		activeSessionTitleRef: refs.activeSessionTitleRef,
		pendingUserActionRequestIdsRef: refs.pendingUserActionRequestIdsRef,
		chatTitle: state.chatTitle,
		appUpdateRuntimeBusy: state.appUpdateRuntimeBusy,
		pendingApproval: interaction.pendingApproval,
		pendingToolBudget: interaction.pendingToolBudget,
		pendingPlanApproval: interaction.pendingPlanApproval,
		pendingPlanClarification: interaction.pendingPlanClarification,
		showNativeTaskNotification,
		clearNativeTaskNotificationAttention,
		notificationCopy,
	});

	useAppWindowEventController({
		clientPreferencesRef: refs.clientPreferencesRef,
		setClientPreferences: setters.setClientPreferences,
		handleInterruptedRunRetry: interaction.handleInterruptedRunRetry,
		handleNewSession: interaction.handleNewSession,
	});
}

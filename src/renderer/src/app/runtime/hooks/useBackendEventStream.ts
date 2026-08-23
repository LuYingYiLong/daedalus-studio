import { useEffect, type Dispatch, type SetStateAction } from "react";
import { useMemoizedFn } from "ahooks";
import { useTranslation } from "react-i18next";
import type { AgentGoalState, PlanApprovalState, PlanClarificationState, SessionMetadata, WorkbenchSnapshot, WorkflowTodoSnapshot } from "@/platform/rpc/types";
import { createBackendClient } from "@/platform/rpc/transport/backend-client";
import type { BackendEvent } from "@/platform/rpc/transport/backend-rpc-client";
import { isTimelineStreamingDeltaEvent } from "@/domain/workbench/workbench-state";
import type { TimelinePageStore } from "@/domain/workbench/timeline-page-store";
import { applyRunStateFromBackendEvent, type RunControllerState } from "@/domain/workbench/run-state";
import {
	getBackendEventRequestId,
	getBackendEventSessionId,
	getBackendEventSessionMetadata,
	getPlanApprovalFromEvent,
	getPlanClarificationFromEvent,
	getPlanIdFromEvent,
	getWorkbenchFromEvent,
	isRunCancellationEvent,
	isRunCompletionEvent,
	isSessionScopedBackendEvent,
	shouldClearPlanClarificationForEvent
} from "@/domain/run/backend-event-state";
import {
	createWorkflowTodoSnapshotFromPlanData,
	isWorkflowTodoClearEvent,
	markWorkflowTodoCompleted,
	markWorkflowTodoExecuting,
	markWorkflowTodoFailed,
	normalizeWorkflowTodoSnapshot,
	reconcileWorkflowTodoWithRunStage
} from "@/domain/composer/workflow-todo";
import { hasQueuedFollowUpResponse } from "../run-completion-notification";

type RefValue<T> = {
	current: T;
};

export type BackendEventStreamParams = {
	activeSessionIdRef: RefValue<string | null>;
	activeChatRequestIdRef: RefValue<string | null>;
	cancelledChatRequestIdsRef: RefValue<Set<string>>;
	pendingUserActionRequestIdsRef: RefValue<Set<string>>;
	activeSessionTitleRef: RefValue<string>;
	activeWorkbenchRef: RefValue<WorkbenchSnapshot | null>;
	onEventObserved?: (event: BackendEvent) => void;
	applyWorkbench: (nextWorkbench: WorkbenchSnapshot) => void;
	appendQueuedRunUserBlock: (workbenchSnapshot: WorkbenchSnapshot) => void;
	loadSkills: () => Promise<void>;
	clearWorkflowTodoUiState: (options?: { preservePlanSnapshot?: boolean }) => void;
	rememberLoadedWorkflowTodo: (snapshot: WorkflowTodoSnapshot | null) => void;
	applyInitialWorkflowTodoPreference: (snapshot: WorkflowTodoSnapshot | null) => void;
	showWorkflowTodo: (snapshot: WorkflowTodoSnapshot | null, forceExpand?: boolean) => void;
	expandWorkflowTodoPanel: () => void;
	enqueueTimelineStreamingEvent: (event: BackendEvent, sessionId: string | null) => void;
	flushPendingTimelineEvents: () => void;
	refreshLatestTimeline: () => Promise<void>;
	showNativeTaskNotification: (payload: NativeNotificationPayload) => void;
	runCompletionNotificationsEnabled: boolean;
	setActiveSessionMetadata: Dispatch<SetStateAction<SessionMetadata | null>>;
	setRunState: Dispatch<SetStateAction<RunControllerState>>;
	timelineStore: TimelinePageStore;
	setWorkflowTodoSnapshot: Dispatch<SetStateAction<WorkflowTodoSnapshot | null>>;
	applyCurrentGoalSnapshot: (goal: AgentGoalState) => void;
	setLatestPlanClarification: Dispatch<SetStateAction<PlanClarificationState | null>>;
	setLatestPlanApproval: Dispatch<SetStateAction<PlanApprovalState | null>>;
	setPlanClarificationError: Dispatch<SetStateAction<string | null>>;
	setIsPlanClarificationSubmitting: Dispatch<SetStateAction<boolean>>;
	setPlanApprovalError: Dispatch<SetStateAction<string | null>>;
	setIsPlanApproving: Dispatch<SetStateAction<boolean>>;
	setIsPlanRevising: Dispatch<SetStateAction<boolean>>;
};

function useBackendEventStream(params: BackendEventStreamParams): void {
	const { t } = useTranslation();

	const handleBackendEvent = useMemoizedFn((event: BackendEvent): void => {
		params.onEventObserved?.(event);
		if (event.event === "plugin.review.request" && typeof event.data === "object" && event.data !== null && !Array.isArray(event.data)) {
			void window.electronAPI.windowControl.openPluginReview(event.data as PluginReviewRequest);
			return;
		}
		const eventSessionId: string | null = getBackendEventSessionId(event);
		const activeSessionId: string | null = params.activeSessionIdRef.current;
		if (isSessionScopedBackendEvent(event) && (eventSessionId === null || eventSessionId !== activeSessionId)) {
			return;
		}
		if (event.event.startsWith("session.selectionAsk.")) {
			return;
		}

		if (event.event === "session.renamed") {
			const metadata: SessionMetadata | null = getBackendEventSessionMetadata(event);
			if (metadata !== null) {
				params.setActiveSessionMetadata(metadata);
			}
			return;
		}

		params.setRunState((currentState: RunControllerState): RunControllerState => applyRunStateFromBackendEvent(
			currentState,
			event,
			params.cancelledChatRequestIdsRef.current
		));

		const eventWorkbench: WorkbenchSnapshot | null = getWorkbenchFromEvent(event);
		if (eventWorkbench !== null) {
			params.applyWorkbench(eventWorkbench);
			params.appendQueuedRunUserBlock(eventWorkbench);
			return;
		}

		if (event.event === "skill.catalog.changed") {
			void params.loadSkills();
		}

		if (event.event === "agent.run.state") {
			const runData: Record<string, unknown> | null =
				typeof event.data === "object" && event.data !== null && !Array.isArray(event.data)
					? event.data as Record<string, unknown>
					: null;
			const normalizedSnapshot: WorkflowTodoSnapshot | null = normalizeWorkflowTodoSnapshot(runData?.todo);
			const snapshot: WorkflowTodoSnapshot | null = normalizedSnapshot === null
				? null
				: reconcileWorkflowTodoWithRunStage(normalizedSnapshot, runData?.stage);
			params.setWorkflowTodoSnapshot(snapshot);
			if (snapshot === null) {
				params.rememberLoadedWorkflowTodo(null);
			} else if (snapshot.source === "slash") {
				params.rememberLoadedWorkflowTodo(snapshot);
				params.setActiveSessionMetadata((currentMetadata: SessionMetadata | null): SessionMetadata | null => {
					return currentMetadata === null
						? currentMetadata
						: {
							...currentMetadata,
							workflowTodoCollapsed: false
						};
				});
			} else {
				params.applyInitialWorkflowTodoPreference(snapshot);
			}
		} else if (event.event === "agent.goal.state") {
			const goal: AgentGoalState = event.data as AgentGoalState;
			params.applyCurrentGoalSnapshot(goal);
			if (
				(goal.stage === "achieved" || goal.stage === "failed")
				&& params.runCompletionNotificationsEnabled
				&& !hasQueuedFollowUpResponse(params.activeWorkbenchRef.current, goal.rootRequestId)
			) {
				params.showNativeTaskNotification({
					kind: "run_completed",
					sessionId: goal.sessionId,
					requestId: goal.rootRequestId,
					title: t(goal.stage === "achieved" ? "nativeNotifications.goalAchievedTitle" : "nativeNotifications.goalStoppedTitle"),
					body: goal.evaluation?.summary ?? goal.title,
					dedupeKey: `goal_completed:${goal.goalId}:${goal.revision}`
				});
			}
		} else if (event.event === "plan.generated" || event.event === "plan.revised") {
			const planTodo: WorkflowTodoSnapshot | null = createWorkflowTodoSnapshotFromPlanData(event.data);
			if (planTodo !== null) {
				params.showWorkflowTodo(planTodo);
			}
		} else if (event.event === "plan.execution.started") {
			const planTodo: WorkflowTodoSnapshot | null = createWorkflowTodoSnapshotFromPlanData(event.data, true);
			params.setWorkflowTodoSnapshot((currentSnapshot: WorkflowTodoSnapshot | null): WorkflowTodoSnapshot | null => {
				const nextSnapshot: WorkflowTodoSnapshot | null = planTodo ?? (currentSnapshot === null ? null : markWorkflowTodoExecuting(currentSnapshot));
				params.rememberLoadedWorkflowTodo(nextSnapshot);
				return nextSnapshot;
			});
			params.expandWorkflowTodoPanel();
		} else if (event.event === "plan.error") {
			params.setWorkflowTodoSnapshot((currentSnapshot: WorkflowTodoSnapshot | null): WorkflowTodoSnapshot | null => {
				return currentSnapshot?.source === "plan" ? markWorkflowTodoFailed(currentSnapshot) : currentSnapshot;
			});
		} else if (isWorkflowTodoClearEvent(event)) {
			params.setWorkflowTodoSnapshot(null);
		}

		const eventPlanClarification: PlanClarificationState | null = getPlanClarificationFromEvent(event);
		if (eventPlanClarification !== null) {
			params.setLatestPlanClarification(eventPlanClarification);
			params.setLatestPlanApproval(null);
			params.setPlanClarificationError(null);
			params.setIsPlanClarificationSubmitting(false);
		} else {
			const eventPlanApproval: PlanApprovalState | null = getPlanApprovalFromEvent(event);
			if (eventPlanApproval !== null) {
				params.setLatestPlanApproval(eventPlanApproval);
				params.setPlanApprovalError(null);
				params.setIsPlanApproving(false);
				params.setIsPlanRevising(false);
				if (activeSessionId !== null) {
					params.pendingUserActionRequestIdsRef.current.add(eventPlanApproval.requestId);
					params.showNativeTaskNotification({
						kind: "approval_required",
						sessionId: activeSessionId,
						requestId: eventPlanApproval.requestId,
						title: t("nativeNotifications.approvalTitle"),
						body: t("nativeNotifications.planApprovalBody"),
						dedupeKey: `approval_required:${activeSessionId}:plan:${eventPlanApproval.planId}:${eventPlanApproval.updatedAt}`
					});
				}
			}
		}

		if (event.event === "plan.generated" || event.event === "plan.revised" || event.event === "plan.approved" || event.event === "plan.execution.started" || event.event === "plan.error" || event.event === "agent.run.state") {
			params.setLatestPlanClarification((currentClarification: PlanClarificationState | null): PlanClarificationState | null => {
				if (currentClarification === null) {
					return null;
				}
				return shouldClearPlanClarificationForEvent(event, currentClarification) ? null : currentClarification;
			});
		}

		if (event.event === "plan.approved" || event.event === "plan.execution.started") {
			const eventPlanId: string = getPlanIdFromEvent(event);
			params.setLatestPlanApproval((currentPlanApproval: PlanApprovalState | null): PlanApprovalState | null => {
				if (currentPlanApproval === null) {
					return null;
				}
				return eventPlanId.length === 0 || eventPlanId === currentPlanApproval.planId ? null : currentPlanApproval;
			});
		}

		if (isRunCancellationEvent(event)) {
			const cancelledRequestId: string = getBackendEventRequestId(event);
			if (params.activeChatRequestIdRef.current === cancelledRequestId) {
				params.activeChatRequestIdRef.current = null;
			}
		}

		if (isTimelineStreamingDeltaEvent(event)) {
			params.enqueueTimelineStreamingEvent(event, activeSessionId);
		} else {
			params.flushPendingTimelineEvents();
			params.timelineStore.applyEvents([event]);
		}

		if (isRunCompletionEvent(event)) {
			params.setWorkflowTodoSnapshot((currentSnapshot: WorkflowTodoSnapshot | null): WorkflowTodoSnapshot | null => {
				return currentSnapshot?.source === "plan" ? markWorkflowTodoCompleted(currentSnapshot) : currentSnapshot;
			});
			const requestId: string = getBackendEventRequestId(event);
			const sessionId: string | null = params.activeSessionIdRef.current;
			const hasQueuedFollowUp: boolean = hasQueuedFollowUpResponse(
				params.activeWorkbenchRef.current,
				requestId
			);
			const runData: Record<string, unknown> | null = typeof event.data === "object" && event.data !== null
				? event.data as Record<string, unknown>
				: null;
			const belongsToGoal: boolean = typeof runData?.goalId === "string";
			if (
				sessionId !== null
				&& params.runCompletionNotificationsEnabled
				&& !hasQueuedFollowUp
				&& !belongsToGoal
				&& !params.pendingUserActionRequestIdsRef.current.has(requestId)
			) {
				params.showNativeTaskNotification({
					kind: "run_completed",
					sessionId,
					requestId,
					title: t("nativeNotifications.runCompletedTitle"),
					body: t("nativeNotifications.runCompletedBody", { sessionTitle: params.activeSessionTitleRef.current }),
					dedupeKey: `run_completed:${sessionId}:${requestId}`
				});
			}
			void params.refreshLatestTimeline();
		}
	});

	useEffect((): (() => void) => {
		let cancelled: boolean = false;
		let unsubscribe: (() => void) | null = null;

		async function subscribeBackendEvents(): Promise<void> {
			try {
				const client = await createBackendClient();

				if (cancelled) {
					return;
				}

				unsubscribe = client.addEventListener(handleBackendEvent);
			} catch (error: unknown) {
				console.error("[App] subscribe backend events failed", error);
			}
		}

		void subscribeBackendEvents();

		return (): void => {
			cancelled = true;
			unsubscribe?.();
		};
	}, [handleBackendEvent]);
}

export default useBackendEventStream;

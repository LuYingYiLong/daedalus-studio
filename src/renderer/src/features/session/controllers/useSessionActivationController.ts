import type {
	Dispatch,
	MutableRefObject,
	SetStateAction,
} from "react";
import { openSession } from "@/platform/rpc/session-api";
import type { ApprovalMode } from "@/platform/rpc/approval-api";
import type {
	AgentGoalState,
	PlanApprovalState,
	PlanClarificationState,
	SelectionAskThread,
	SessionMetadata,
	SessionOpenResult,
	WorkbenchSnapshot,
	WorkflowTodoSnapshot,
	WorkspaceConfig,
} from "@/platform/rpc/types";
import {
	applyAgentRunState,
	createIdleRunState,
	type RunControllerState,
} from "@/domain/workbench/run-state";
import type { TimelinePageStore } from "@/domain/workbench/timeline-page-store";
import { syncSessionRunFromOpen, type RunningSessionState } from "@/domain/workspace/session-running";
import {
	createTimelinePageFromOpenResult,
} from "@/domain/workbench/workbench-state";
import {
	createWorkflowTodoSnapshotFromTimelineResult,
	createWorkspaceFromSessionOpenResult,
} from "@/domain/application/app-helpers";
import {
	getWorkflowTodoSnapshotKey,
	isWorkflowTodoActive,
} from "@/domain/composer/workflow-todo";
import { isAgentGoalDismissed } from "@/domain/composer/goal-display";
import { recordOpenedSession } from "@/domain/session/session-navigation-history";

export type SessionActivationControllerParams = {
	activeSessionIdRef: MutableRefObject<string | null>;
	navigationVersionRef: MutableRefObject<number>;
	dismissedTerminalGoalIdsRef: MutableRefObject<Set<string>>;
	homeWorkspaceOptions: readonly WorkspaceConfig[];
	timelineStore: TimelinePageStore;
	discardTemporarySessionIfEmpty: () => Promise<void>;
	persistPendingWorkbenchPatchBeforeNavigation: () => Promise<void>;
	resetSessionPresentationState: () => void;
	rememberLoadedWorkflowTodo: (snapshot: WorkflowTodoSnapshot | null) => void;
	expandWorkflowTodoPanel: () => void;
	checkActiveSessionIntegrity: (sessionId: string) => Promise<void>;
	setIsSessionLoading: Dispatch<SetStateAction<boolean>>;
	setSessionError: Dispatch<SetStateAction<string | null>>;
	setIsNewSessionHome: Dispatch<SetStateAction<boolean>>;
	setActiveSessionId: Dispatch<SetStateAction<string | null>>;
	setActiveSessionMetadata: Dispatch<SetStateAction<SessionMetadata | null>>;
	setSelectionAskThreads: Dispatch<SetStateAction<SelectionAskThread[]>>;
	setActiveWorkspace: Dispatch<SetStateAction<WorkspaceConfig | null>>;
	setLatestPlanClarification: Dispatch<
		SetStateAction<PlanClarificationState | null>
	>;
	setLatestPlanApproval: Dispatch<SetStateAction<PlanApprovalState | null>>;
	setWorkbench: Dispatch<SetStateAction<WorkbenchSnapshot | null>>;
	setRunState: Dispatch<SetStateAction<RunControllerState>>;
	setRunningSessionState: Dispatch<SetStateAction<RunningSessionState>>;
	setCurrentGoal: Dispatch<SetStateAction<AgentGoalState | null>>;
	setApprovalModeState: Dispatch<SetStateAction<ApprovalMode>>;
	setWorkflowTodoSnapshot: Dispatch<
		SetStateAction<WorkflowTodoSnapshot | null>
	>;
};

export type SessionActivationController = {
	handleSessionSelect: (
		session: SessionMetadata,
		options?: { recordNavigation?: boolean },
	) => Promise<void>;
};

export default function useSessionActivationController({
	activeSessionIdRef,
	navigationVersionRef,
	dismissedTerminalGoalIdsRef,
	homeWorkspaceOptions,
	timelineStore,
	discardTemporarySessionIfEmpty,
	persistPendingWorkbenchPatchBeforeNavigation,
	resetSessionPresentationState,
	rememberLoadedWorkflowTodo,
	expandWorkflowTodoPanel,
	checkActiveSessionIntegrity,
	setIsSessionLoading,
	setSessionError,
	setIsNewSessionHome,
	setActiveSessionId,
	setActiveSessionMetadata,
	setSelectionAskThreads,
	setActiveWorkspace,
	setLatestPlanClarification,
	setLatestPlanApproval,
	setWorkbench,
	setRunState,
	setRunningSessionState,
	setCurrentGoal,
	setApprovalModeState,
	setWorkflowTodoSnapshot,
}: SessionActivationControllerParams): SessionActivationController {
	async function handleSessionSelect(
		session: SessionMetadata,
		options: { recordNavigation?: boolean } = {},
	): Promise<void> {
		const navigationVersion: number = navigationVersionRef.current + 1;
		navigationVersionRef.current = navigationVersion;
		await discardTemporarySessionIfEmpty();
		await persistPendingWorkbenchPatchBeforeNavigation();
		const sessionId: string = session.id;
		console.info("[App] session selected", { sessionId });

		try {
			setIsSessionLoading(true);
			setSessionError(null);
			setIsNewSessionHome(false);
			activeSessionIdRef.current = sessionId;
			setActiveSessionId(sessionId);
			setActiveSessionMetadata(session);
			setSelectionAskThreads([]);
			setActiveWorkspace(null);
			resetSessionPresentationState();

			const result: SessionOpenResult = await openSession(sessionId);
			if (
				navigationVersionRef.current !== navigationVersion ||
				activeSessionIdRef.current !== sessionId
			) {
				return;
			}

			timelineStore.replace(createTimelinePageFromOpenResult(result));
			setLatestPlanClarification(result.latestPlanClarification);
			setLatestPlanApproval(result.latestPlanApproval);
			setActiveSessionMetadata(result.metadata);
			setSelectionAskThreads(result.selectionAskThreads);
			const openedWorkbench: WorkbenchSnapshot = {
				...result.workbench,
				composer: {
					...result.workbench.composer,
					text: "",
				},
			};
			setWorkbench(openedWorkbench);
			setRunState(
				(currentState: RunControllerState): RunControllerState =>
					result.activeAgentRun === null
						? createIdleRunState(currentState.sequence)
						: applyAgentRunState(
								currentState,
								result.activeAgentRun,
							),
			);
			setRunningSessionState(
				(current: RunningSessionState): RunningSessionState => {
					return syncSessionRunFromOpen(
						current,
						sessionId,
						result.activeAgentRun,
					);
				},
			);
			const openedGoalDismissed: boolean =
				result.currentGoal !== null &&
				isAgentGoalDismissed(
					result.currentGoal,
					dismissedTerminalGoalIdsRef.current,
				);
			setCurrentGoal(
				result.currentGoal === null || openedGoalDismissed
					? null
					: result.currentGoal,
			);
			setApprovalModeState(result.metadata.approvalMode ?? "manual");
			setActiveWorkspace(
				createWorkspaceFromSessionOpenResult(
					result,
					result.metadata.worktree === undefined
						? undefined
						: homeWorkspaceOptions.find(
								(workspace): boolean =>
									workspace.id ===
									result.metadata.worktree!.sourceWorkspaceId,
							),
				),
			);
			if (
				options.recordNavigation !== false &&
				result.metadata.temporary !== true
			) {
				recordOpenedSession(sessionId);
			}
			const workflowTodo: WorkflowTodoSnapshot | null =
				openedGoalDismissed
					? null
					: createWorkflowTodoSnapshotFromTimelineResult(result);
			setWorkflowTodoSnapshot(workflowTodo);
			rememberLoadedWorkflowTodo(workflowTodo);
			if (
				workflowTodo !== null &&
				isWorkflowTodoActive(workflowTodo) &&
				result.metadata.workflowTodoDismissedKey !==
					getWorkflowTodoSnapshotKey(workflowTodo)
			) {
				expandWorkflowTodoPanel();
			}

			if (result.workspaceWarning) {
				console.warn(
					"[App] session workspace warning",
					result.workspaceWarning,
				);
			}
			void checkActiveSessionIntegrity(sessionId);
		} catch (error: unknown) {
			const message: string =
				error instanceof Error
					? error.message
					: "Failed to open session";

			setSessionError(message);
			console.error("[App] open session failed", error);
		} finally {
			setIsSessionLoading(false);
		}
	}

	return { handleSessionSelect };
}

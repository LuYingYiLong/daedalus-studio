import type {
	Dispatch,
	MutableRefObject,
	SetStateAction,
} from "react";
import {
	dismissWorkflowTodo,
	fetchSessions,
	fetchSessionTimeline,
	saveSessionUiMetadata,
} from "@/platform/rpc/session-api";
import type {
	PlanApprovalState,
	PlanClarificationState,
	SessionMetadata,
	SessionTimelineResult,
	WorkflowTodoSnapshot,
	WorkspaceConfig,
} from "@/platform/rpc/types";
import type { RunControllerState } from "@/domain/workbench/run-state";
import { getRunControllerRequestId } from "@/domain/workbench/run-state";
import type {
	TimelinePageState,
} from "@/domain/workbench/workbench-state";
import {
	createTimelinePageFromTimelineResult,
} from "@/domain/workbench/workbench-state";
import type { TimelinePageStore } from "@/domain/workbench/timeline-page-store";
import {
	getWorkflowTodoSnapshotKey,
	isWorkflowTodoActive,
} from "@/domain/composer/workflow-todo";
import {
	createSingleSourceWorkspaceSnapshot,
	createWorkflowTodoSnapshotFromTimelineResult,
	mergeOptimisticUserBlocks,
	isSameWorkflowTodoSnapshot,
} from "../app-helpers";

export type TimelineRefreshControllerParams = {
	activeSessionId: string | null;
	activeSessionIdRef: MutableRefObject<string | null>;
	activeChatRequestIdRef: MutableRefObject<string | null>;
	activeSessionMetadata: SessionMetadata | null;
	runState: RunControllerState;
	timelineStore: TimelinePageStore;
	refreshTimelineNavigationEntries: (sessionId: string) => Promise<void>;
	rememberLoadedWorkflowTodo: (snapshot: WorkflowTodoSnapshot | null) => void;
	expandWorkflowTodoPanel: () => void;
	setLatestPlanClarification: Dispatch<
		SetStateAction<PlanClarificationState | null>
	>;
	setLatestPlanApproval: Dispatch<SetStateAction<PlanApprovalState | null>>;
	setWorkflowTodoSnapshot: Dispatch<
		SetStateAction<WorkflowTodoSnapshot | null>
	>;
	setActiveSessionMetadata: Dispatch<SetStateAction<SessionMetadata | null>>;
	setActiveWorkspace: Dispatch<SetStateAction<WorkspaceConfig | null>>;
	setSessionError: Dispatch<SetStateAction<string | null>>;
};

export type TimelineRefreshController = {
	refreshLatestTimeline: (sessionIdOverride?: string) => Promise<void>;
	handleWorkflowTodoDismiss: (snapshot: WorkflowTodoSnapshot) => Promise<void>;
};

export default function useTimelineRefreshController({
	activeSessionId,
	activeSessionIdRef,
	activeChatRequestIdRef,
	activeSessionMetadata,
	runState,
	timelineStore,
	refreshTimelineNavigationEntries,
	rememberLoadedWorkflowTodo,
	expandWorkflowTodoPanel,
	setLatestPlanClarification,
	setLatestPlanApproval,
	setWorkflowTodoSnapshot,
	setActiveSessionMetadata,
	setActiveWorkspace,
	setSessionError,
}: TimelineRefreshControllerParams): TimelineRefreshController {
	async function refreshLatestTimeline(
		sessionIdOverride?: string,
	): Promise<void> {
		const sessionId: string | null = sessionIdOverride ?? activeSessionId;
		if (sessionId === null) {
			return;
		}

		const timeline: SessionTimelineResult =
			await fetchSessionTimeline(sessionId);
		if (
			activeSessionIdRef.current !== sessionId ||
			timeline.sessionId !== sessionId
		) {
			console.warn("[App] ignored latest timeline for inactive session", {
				requestedSessionId: sessionId,
				activeSessionId: activeSessionIdRef.current,
				resultSessionId: timeline.sessionId,
			});
			return;
		}

		const activeOptimisticRequestId: string | null =
			activeChatRequestIdRef.current ?? getRunControllerRequestId(runState);
		timelineStore.update(
			(currentPage: TimelinePageState): TimelinePageState =>
				mergeOptimisticUserBlocks(
					currentPage,
					createTimelinePageFromTimelineResult(timeline),
					activeOptimisticRequestId,
				),
		);
		await refreshTimelineNavigationEntries(sessionId);
		setLatestPlanClarification(timeline.latestPlanClarification);
		setLatestPlanApproval(timeline.latestPlanApproval);
		const workflowTodo: WorkflowTodoSnapshot | null =
			createWorkflowTodoSnapshotFromTimelineResult(timeline);
		setWorkflowTodoSnapshot(workflowTodo);
		rememberLoadedWorkflowTodo(workflowTodo);
		if (
			workflowTodo !== null &&
			isWorkflowTodoActive(workflowTodo) &&
			activeSessionMetadata?.workflowTodoDismissedKey !==
				getWorkflowTodoSnapshotKey(workflowTodo)
		) {
			expandWorkflowTodoPanel();
		}

		const sessionList = await fetchSessions();
		const metadata: SessionMetadata | undefined = sessionList.sessions.find(
			(session: SessionMetadata): boolean => session.id === sessionId,
		);
		if (metadata !== undefined) {
			setActiveSessionMetadata(metadata);
			setActiveWorkspace(
				(
					currentWorkspace: WorkspaceConfig | null,
				): WorkspaceConfig | null => {
					if (
						metadata.workspaceId === undefined ||
						metadata.workspaceRoot === undefined
					) {
						return null;
					}
					if (currentWorkspace?.id === metadata.workspaceId) {
						return currentWorkspace;
					}

					return createSingleSourceWorkspaceSnapshot({
						id: metadata.workspaceId,
						name: metadata.workspaceName ?? metadata.title,
						kind: metadata.workspaceKind ?? "workspace",
						rootPath: metadata.workspaceRoot,
						godotExecutablePath: metadata.godotExecutablePath,
					});
				},
			);
		}
	}

	async function handleWorkflowTodoDismiss(
		snapshot: WorkflowTodoSnapshot,
	): Promise<void> {
		const dismissedKey: string = getWorkflowTodoSnapshotKey(snapshot);
		const params: { workflowId?: string; runId?: string } = {};
		if (snapshot.workflowId !== undefined) {
			params.workflowId = snapshot.workflowId;
		}
		if (snapshot.runId !== undefined) {
			params.runId = snapshot.runId;
		}

		try {
			await dismissWorkflowTodo(params);
			setActiveSessionMetadata(
				(
					currentMetadata: SessionMetadata | null,
				): SessionMetadata | null =>
					currentMetadata === null
						? currentMetadata
						: {
								...currentMetadata,
								workflowTodoCollapsed: true,
								workflowTodoDismissedKey: dismissedKey,
							},
			);
			void saveSessionUiMetadata({
				workflowTodoCollapsed: true,
				workflowTodoDismissedKey: dismissedKey,
			}).catch((error: unknown): void => {
				console.error(
					"[App] save dismissed workflow todo state failed",
					error,
				);
			});
			setWorkflowTodoSnapshot(
				(
					currentSnapshot: WorkflowTodoSnapshot | null,
				): WorkflowTodoSnapshot | null => {
					if (
						currentSnapshot === null ||
						isSameWorkflowTodoSnapshot(currentSnapshot, snapshot)
					) {
						return null;
					}

					return currentSnapshot;
				},
			);
		} catch (error: unknown) {
			const message: string =
				error instanceof Error
					? error.message
					: "Failed to dismiss workflow todo";
			setSessionError(message);
			console.error("[App] dismiss workflow todo failed", error);
		}
	}

	return { refreshLatestTimeline, handleWorkflowTodoDismiss };
}

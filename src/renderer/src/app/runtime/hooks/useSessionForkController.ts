import { useTranslation } from "react-i18next";
import type {
	Dispatch,
	MutableRefObject,
	SetStateAction,
} from "react";
import { forkSession } from "@/platform/rpc/session-api";
import type {
	AgentGoalState,
	PlanApprovalState,
	PlanClarificationState,
	SelectionAskThread,
	SessionForkResult,
	SessionMetadata,
	WorkbenchSnapshot,
	WorkflowTodoSnapshot,
	WorkspaceConfig,
} from "@/platform/rpc/types";
import type { ApprovalMode } from "@/platform/rpc/approval-api";
import {
	createIdleRunState,
	type RunControllerState,
} from "@/domain/workbench/run-state";
import {
	createTimelinePageFromOpenResult,
} from "@/domain/workbench/workbench-state";
import type { TimelinePageStore } from "@/domain/workbench/timeline-page-store";
import {
	syncSessionRunFromOpen,
	type RunningSessionState,
} from "@/domain/workspace/session-running";
import { recordOpenedSession } from "@/domain/session/session-navigation-history";
import { createWorkspaceFromSessionOpenResult } from "../app-helpers";

export type SessionForkControllerParams = {
	forkOperationRef: MutableRefObject<boolean>;
	navigationVersionRef: MutableRefObject<number>;
	activeSessionIdRef: MutableRefObject<string | null>;
	timelineStore: TimelinePageStore;
	discardTemporarySessionIfEmpty: () => Promise<void>;
	persistPendingWorkbenchPatchBeforeNavigation: () => Promise<void>;
	resetSessionPresentationState: () => void;
	rememberLoadedWorkflowTodo: (snapshot: WorkflowTodoSnapshot | null) => void;
	checkActiveSessionIntegrity: (sessionId: string) => Promise<void>;
	setForkingSourceSessionId: Dispatch<SetStateAction<string | null>>;
	setForkingRequestId: Dispatch<SetStateAction<string | null>>;
	setIsNewSessionHome: Dispatch<SetStateAction<boolean>>;
	setActiveSessionId: Dispatch<SetStateAction<string | null>>;
	setActiveSessionMetadata: Dispatch<SetStateAction<SessionMetadata | null>>;
	setSelectionAskThreads: Dispatch<SetStateAction<SelectionAskThread[]>>;
	setWorkbench: Dispatch<SetStateAction<WorkbenchSnapshot | null>>;
	setLatestPlanClarification: Dispatch<
		SetStateAction<PlanClarificationState | null>
	>;
	setLatestPlanApproval: Dispatch<SetStateAction<PlanApprovalState | null>>;
	setRunState: Dispatch<SetStateAction<RunControllerState>>;
	setRunningSessionState: Dispatch<SetStateAction<RunningSessionState>>;
	setCurrentGoal: Dispatch<SetStateAction<AgentGoalState | null>>;
	setWorkflowTodoSnapshot: Dispatch<
		SetStateAction<WorkflowTodoSnapshot | null>
	>;
	setApprovalModeState: Dispatch<SetStateAction<ApprovalMode>>;
	setActiveWorkspace: Dispatch<SetStateAction<WorkspaceConfig | null>>;
	setSessionError: Dispatch<SetStateAction<string | null>>;
	setWorkspaceRefreshToken: Dispatch<SetStateAction<number>>;
	onError: (message: string) => void;
};

export type SessionForkController = {
	handleSessionFork: (
		source: SessionMetadata,
		sourceRequestId?: string,
	) => Promise<void>;
};

export default function useSessionForkController({
	forkOperationRef,
	navigationVersionRef,
	activeSessionIdRef,
	timelineStore,
	discardTemporarySessionIfEmpty,
	persistPendingWorkbenchPatchBeforeNavigation,
	resetSessionPresentationState,
	rememberLoadedWorkflowTodo,
	checkActiveSessionIntegrity,
	setForkingSourceSessionId,
	setForkingRequestId,
	setIsNewSessionHome,
	setActiveSessionId,
	setActiveSessionMetadata,
	setSelectionAskThreads,
	setWorkbench,
	setLatestPlanClarification,
	setLatestPlanApproval,
	setRunState,
	setRunningSessionState,
	setCurrentGoal,
	setWorkflowTodoSnapshot,
	setApprovalModeState,
	setActiveWorkspace,
	setSessionError,
	setWorkspaceRefreshToken,
	onError,
}: SessionForkControllerParams): SessionForkController {
	const { t } = useTranslation();

	async function handleSessionFork(
		source: SessionMetadata,
		sourceRequestId?: string,
	): Promise<void> {
		if (forkOperationRef.current) {
			return;
		}
		forkOperationRef.current = true;
		setForkingSourceSessionId(source.id);
		setForkingRequestId(sourceRequestId ?? null);
		try {
			await discardTemporarySessionIfEmpty();
			await persistPendingWorkbenchPatchBeforeNavigation();
			const sourceTitle: string =
				source.title.trim() || t("chat.fork.untitledSource");
			const forkTitle: string = sourceTitle.slice(0, 200);
			const result: SessionForkResult = await forkSession({
				sourceSessionId: source.id,
				...(sourceRequestId === undefined ? {} : { sourceRequestId }),
				title: forkTitle,
			});
			const sessionId: string = result.metadata.id;
			navigationVersionRef.current += 1;
			activeSessionIdRef.current = sessionId;
			setIsNewSessionHome(false);
			setActiveSessionId(sessionId);
			resetSessionPresentationState();
			timelineStore.replace(createTimelinePageFromOpenResult(result));
			setActiveSessionMetadata(result.metadata);
			setSelectionAskThreads([]);
			setWorkbench(result.workbench);
			setLatestPlanClarification(null);
			setLatestPlanApproval(null);
			setRunState(
				(currentState: RunControllerState): RunControllerState =>
					createIdleRunState(currentState.sequence),
			);
			setRunningSessionState(
				(current: RunningSessionState): RunningSessionState => {
					return syncSessionRunFromOpen(current, sessionId, null);
				},
			);
			setCurrentGoal(null);
			setWorkflowTodoSnapshot(null);
			rememberLoadedWorkflowTodo(null);
			setApprovalModeState(result.metadata.approvalMode ?? "manual");
			setActiveWorkspace(createWorkspaceFromSessionOpenResult(result));
			setSessionError(null);
			recordOpenedSession(sessionId);
			setWorkspaceRefreshToken(
				(currentToken: number): number => currentToken + 1,
			);
			window.electronAPI.sessionCatalog.notifyChanged();
			void checkActiveSessionIntegrity(sessionId);
		} catch (error: unknown) {
			const errorMessage: string =
				error instanceof Error
					? error.message
					: t("chat.fork.errors.create");
			console.error("[App] fork session failed", error);
			onError(errorMessage);
		} finally {
			forkOperationRef.current = false;
			setForkingSourceSessionId(null);
			setForkingRequestId(null);
		}
	}

	return { handleSessionFork };
}

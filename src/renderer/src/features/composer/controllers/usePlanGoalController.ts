import { useCallback, useEffect, useState, type Dispatch, type SetStateAction } from "react";
import type { AdditionalContextItem, AgentGoalState, PlanApprovalState, PlanClarificationState, SessionMetadata, WorkbenchSnapshot, WorkflowTodoSnapshot } from "@/platform/rpc/types";
import { approvePlan, revisePlan, submitPlanClarification, type PlanClarificationSubmission, type PlanResult } from "@/platform/rpc/plan-api";
import { dismissGoal } from "@/platform/rpc/goal-api";
import { getPlanApprovalFromResult, normalizePlanClarification } from "@/domain/run/backend-event-state";
import { createPlanApprovalKey, createPlanClarificationKey } from "@/domain/composer/plan-helpers";
import { createWorkflowTodoSnapshotFromPlanData } from "@/domain/composer/workflow-todo";
import { isAgentGoalDismissed, isAgentGoalTerminal } from "@/domain/composer/goal-display";
import { selectLatestGoalState } from "@/domain/composer/goal-state";

type RefValue<T> = { current: T };

export type PlanGoalControllerParams = {
	activeSessionId: string | null;
	activeChatRequestIdRef: RefValue<string | null>;
	dismissedTerminalGoalIdsRef: RefValue<Set<string>>;
	setSessionError: (message: string | null) => void;
	setWorkbench: Dispatch<SetStateAction<WorkbenchSnapshot | null>>;
	setActiveSessionMetadata: Dispatch<SetStateAction<SessionMetadata | null>>;
	applyOptimisticActiveRun: (requestId: string, clearComposerText: boolean, clearComposerContext?: boolean, preserveWorkflowTodo?: boolean) => void;
	applyOptimisticSend: (requestId: string, message: string, additionalContext: AdditionalContextItem[], clearComposerText?: boolean, preserveWorkflowTodo?: boolean) => void;
	finishOptimisticActiveRun: (requestId: string) => void;
	showWorkflowTodo: (snapshot: WorkflowTodoSnapshot | null, forceExpand?: boolean) => void;
	dismissWorkflowTodoForGoal: () => Promise<void>;
};

export type PlanGoalController = {
	currentGoal: AgentGoalState | null;
	setCurrentGoal: Dispatch<SetStateAction<AgentGoalState | null>>;
	applyCurrentGoalSnapshot: (nextGoal: AgentGoalState) => void;
	latestPlanClarification: PlanClarificationState | null;
	setLatestPlanClarification: Dispatch<SetStateAction<PlanClarificationState | null>>;
	suppressedPlanClarificationKey: string | null;
	setSuppressedPlanClarificationKey: Dispatch<SetStateAction<string | null>>;
	isPlanClarificationSubmitting: boolean;
	setIsPlanClarificationSubmitting: Dispatch<SetStateAction<boolean>>;
	planClarificationError: string | null;
	setPlanClarificationError: Dispatch<SetStateAction<string | null>>;
	latestPlanApproval: PlanApprovalState | null;
	setLatestPlanApproval: Dispatch<SetStateAction<PlanApprovalState | null>>;
	isPlanApproving: boolean;
	setIsPlanApproving: Dispatch<SetStateAction<boolean>>;
	isPlanRevising: boolean;
	setIsPlanRevising: Dispatch<SetStateAction<boolean>>;
	planApprovalError: string | null;
	setPlanApprovalError: Dispatch<SetStateAction<string | null>>;
	pendingPlanClarification: PlanClarificationState | null;
	pendingPlanApproval: PlanApprovalState | null;
	latestPlanClarificationKey: string | null;
	latestPlanApprovalKey: string | null;
	resetPlanClarificationUiState: () => void;
	resetPlanApprovalUiState: () => void;
	resetPlanGoalUiState: () => void;
	handlePlanClarificationSubmit: (reply: string | undefined, skip?: boolean) => Promise<void>;
	handlePlanApprove: (planId: string) => Promise<void>;
	handlePlanRevise: (planId: string, feedback: string) => Promise<void>;
	handleTerminalGoalDismiss: (goal: AgentGoalState) => Promise<void>;
};

export default function usePlanGoalController(params: PlanGoalControllerParams): PlanGoalController {
	const [latestPlanClarification, setLatestPlanClarification] = useState<PlanClarificationState | null>(null);
	const [suppressedPlanClarificationKey, setSuppressedPlanClarificationKey] = useState<string | null>(null);
	const [isPlanClarificationSubmitting, setIsPlanClarificationSubmitting] = useState<boolean>(false);
	const [planClarificationError, setPlanClarificationError] = useState<string | null>(null);
	const [latestPlanApproval, setLatestPlanApproval] = useState<PlanApprovalState | null>(null);
	const [isPlanApproving, setIsPlanApproving] = useState<boolean>(false);
	const [isPlanRevising, setIsPlanRevising] = useState<boolean>(false);
	const [planApprovalError, setPlanApprovalError] = useState<string | null>(null);
	const [currentGoal, setCurrentGoal] = useState<AgentGoalState | null>(null);

	const applyCurrentGoalSnapshot = useCallback((nextGoal: AgentGoalState): void => {
		setCurrentGoal((current: AgentGoalState | null): AgentGoalState | null => {
			if (isAgentGoalDismissed(nextGoal, params.dismissedTerminalGoalIdsRef.current)) {
				return current?.goalId === nextGoal.goalId ? null : current;
			}
			return selectLatestGoalState(current, nextGoal);
		});
	}, [params.dismissedTerminalGoalIdsRef]);

	const latestPlanClarificationKey: string | null = latestPlanClarification === null ? null : createPlanClarificationKey(latestPlanClarification);
	const pendingPlanClarification: PlanClarificationState | null = latestPlanClarificationKey !== null && latestPlanClarificationKey === suppressedPlanClarificationKey
		? null
		: latestPlanClarification;
	const latestPlanApprovalKey: string | null = latestPlanApproval === null ? null : createPlanApprovalKey(latestPlanApproval);

	useEffect((): void => {
		if (latestPlanClarificationKey === null && suppressedPlanClarificationKey !== null) {
			setSuppressedPlanClarificationKey(null);
		}
		if (latestPlanClarificationKey !== suppressedPlanClarificationKey) {
			setPlanClarificationError(null);
			setIsPlanClarificationSubmitting(false);
		}
	}, [latestPlanClarificationKey, suppressedPlanClarificationKey]);

	useEffect((): void => {
		setPlanApprovalError(null);
		setIsPlanApproving(false);
		setIsPlanRevising(false);
	}, [latestPlanApprovalKey]);

	const resetPlanClarificationUiState = useCallback((): void => {
		setLatestPlanClarification(null);
		setSuppressedPlanClarificationKey(null);
		setIsPlanClarificationSubmitting(false);
		setPlanClarificationError(null);
	}, []);

	const resetPlanApprovalUiState = useCallback((): void => {
		setLatestPlanApproval(null);
		setIsPlanApproving(false);
		setIsPlanRevising(false);
		setPlanApprovalError(null);
	}, []);

	const resetPlanGoalUiState = useCallback((): void => {
		setCurrentGoal(null);
		resetPlanClarificationUiState();
		resetPlanApprovalUiState();
	}, [resetPlanApprovalUiState, resetPlanClarificationUiState]);

	const handlePlanClarificationSubmit = useCallback(async (reply: string | undefined, skip: boolean = false): Promise<void> => {
		const clarification: PlanClarificationState | null = pendingPlanClarification;
		const trimmedReply: string = reply?.trim() ?? "";
		if (clarification === null || (!skip && trimmedReply.length === 0) || isPlanClarificationSubmitting) return;

		const currentClarificationKey: string = createPlanClarificationKey(clarification);
		const runRequestId: string = clarification.requestId;
		try {
			setIsPlanClarificationSubmitting(true);
			setPlanClarificationError(null);
			setSuppressedPlanClarificationKey(currentClarificationKey);
			params.activeChatRequestIdRef.current = runRequestId;
			params.applyOptimisticActiveRun(runRequestId, false, false);
			const submission: PlanClarificationSubmission = skip ? { skip: true } : { reply: trimmedReply };
			const result: PlanResult = await submitPlanClarification(clarification.planId, submission);
			if ((result as unknown as { cancelled?: unknown }).cancelled === true) return;
			const nextClarification: PlanClarificationState | null = result.status === "clarification_required" ? normalizePlanClarification(result) : null;
			setLatestPlanClarification(nextClarification);
			setLatestPlanApproval(getPlanApprovalFromResult(result));
			setSuppressedPlanClarificationKey(nextClarification === null ? null : currentClarificationKey);
		} catch (error: unknown) {
			const errorMessage: string = error instanceof Error ? error.message : "Failed to submit clarification";
			setPlanClarificationError(errorMessage);
			params.setSessionError(errorMessage);
			console.error("[App] submit plan clarification failed", error);
		} finally {
			params.finishOptimisticActiveRun(runRequestId);
			if (params.activeChatRequestIdRef.current === runRequestId) params.activeChatRequestIdRef.current = null;
			setIsPlanClarificationSubmitting(false);
		}
	}, [isPlanClarificationSubmitting, params, pendingPlanClarification]);

	const handlePlanApprove = useCallback(async (planId: string): Promise<void> => {
		if (latestPlanApproval === null || planId !== latestPlanApproval.planId || isPlanApproving || isPlanRevising) return;
		try {
			setIsPlanApproving(true);
			setPlanApprovalError(null);
			const planTodo: WorkflowTodoSnapshot | null = createWorkflowTodoSnapshotFromPlanData(latestPlanApproval, true);
			if (planTodo !== null) params.showWorkflowTodo(planTodo, true);
			const result = await approvePlan(planId);
			params.setWorkbench(result.workbench);
			params.setActiveSessionMetadata((currentMetadata: SessionMetadata | null): SessionMetadata | null => currentMetadata === null ? currentMetadata : { ...currentMetadata, chatMode: result.chatMode });
			params.activeChatRequestIdRef.current = result.executionRequestId;
			params.applyOptimisticSend(result.executionRequestId, "Execute plan.", [], true, true);
			setLatestPlanApproval((currentPlanApproval: PlanApprovalState | null): PlanApprovalState | null => currentPlanApproval?.planId === planId ? null : currentPlanApproval);
		} catch (error: unknown) {
			setPlanApprovalError(error instanceof Error ? error.message : "Failed to approve plan");
			console.error("[App] approve plan failed", error);
		} finally {
			setIsPlanApproving(false);
		}
	}, [isPlanApproving, isPlanRevising, latestPlanApproval, params]);

	const handlePlanRevise = useCallback(async (planId: string, feedback: string): Promise<void> => {
		const trimmedFeedback: string = feedback.trim();
		if (latestPlanApproval === null || planId !== latestPlanApproval.planId || trimmedFeedback.length === 0 || isPlanApproving || isPlanRevising) return;
		const runRequestId: string = latestPlanApproval.requestId;
		try {
			setIsPlanRevising(true);
			setPlanApprovalError(null);
			params.activeChatRequestIdRef.current = runRequestId;
			params.applyOptimisticActiveRun(runRequestId, false, false);
			const result: PlanResult = await revisePlan(planId, trimmedFeedback);
			if ((result as unknown as { cancelled?: unknown }).cancelled === true) return;
			setLatestPlanApproval(getPlanApprovalFromResult(result));
			if (result.status === "clarification_required") setLatestPlanClarification(normalizePlanClarification(result));
		} catch (error: unknown) {
			setPlanApprovalError(error instanceof Error ? error.message : "Failed to revise plan");
			console.error("[App] revise plan failed", error);
		} finally {
			params.finishOptimisticActiveRun(runRequestId);
			if (params.activeChatRequestIdRef.current === runRequestId) params.activeChatRequestIdRef.current = null;
			setIsPlanRevising(false);
		}
	}, [isPlanApproving, isPlanRevising, latestPlanApproval, params]);

	const handleTerminalGoalDismiss = useCallback(async (goal: AgentGoalState): Promise<void> => {
		if (!isAgentGoalTerminal(goal)) return;
		params.dismissedTerminalGoalIdsRef.current.add(goal.goalId);
		setCurrentGoal((current: AgentGoalState | null): AgentGoalState | null => current?.goalId === goal.goalId ? null : current);
		try {
			await dismissGoal(goal.goalId);
			await params.dismissWorkflowTodoForGoal();
		} catch (error: unknown) {
			console.error("[App] dismiss goal failed", error);
		}
	}, [params]);

	return {
		currentGoal,
		setCurrentGoal,
		applyCurrentGoalSnapshot,
		latestPlanClarification,
		setLatestPlanClarification,
		suppressedPlanClarificationKey,
		setSuppressedPlanClarificationKey,
		isPlanClarificationSubmitting,
		setIsPlanClarificationSubmitting,
		planClarificationError,
		setPlanClarificationError,
		latestPlanApproval,
		setLatestPlanApproval,
		isPlanApproving,
		setIsPlanApproving,
		isPlanRevising,
		setIsPlanRevising,
		planApprovalError,
		setPlanApprovalError,
		pendingPlanClarification,
		pendingPlanApproval: latestPlanApproval,
		latestPlanClarificationKey,
		latestPlanApprovalKey,
		resetPlanClarificationUiState,
		resetPlanApprovalUiState,
		resetPlanGoalUiState,
		handlePlanClarificationSubmit,
		handlePlanApprove,
		handlePlanRevise,
		handleTerminalGoalDismiss
	};
}

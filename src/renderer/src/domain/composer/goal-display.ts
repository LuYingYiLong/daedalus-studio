import type { AgentGoalState } from "@/platform/rpc/types";

export function isAgentGoalTerminal(goal: AgentGoalState): boolean {
	return goal.stage === "achieved" || goal.stage === "failed" || goal.stage === "cancelled";
}

export function isAgentGoalDismissed(goal: AgentGoalState, dismissedGoalIds: ReadonlySet<string>): boolean {
	return isAgentGoalTerminal(goal) && dismissedGoalIds.has(goal.goalId);
}

export function shouldHideInlineDiffForGoal(goal: AgentGoalState | null): boolean {
	return goal !== null && (
		goal.stage === "readiness"
		|| goal.stage === "running"
		|| goal.stage === "evaluating"
		|| goal.stage === "pausing"
	);
}

import type { AgentGoalState } from "@/api/types";

export function isAgentGoalTerminal(goal: AgentGoalState): boolean {
	return goal.stage === "achieved" || goal.stage === "failed" || goal.stage === "cancelled";
}

export function isAgentGoalDismissed(goal: AgentGoalState, dismissedGoalIds: ReadonlySet<string>): boolean {
	return isAgentGoalTerminal(goal) && dismissedGoalIds.has(goal.goalId);
}

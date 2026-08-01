import type { AgentGoalState } from "@/api/types";

export function selectLatestGoalState(
	currentGoal: AgentGoalState | null,
	incomingGoal: AgentGoalState
): AgentGoalState {
	if (
		currentGoal?.goalId === incomingGoal.goalId
		&& currentGoal.revision >= incomingGoal.revision
	) {
		return currentGoal;
	}
	return incomingGoal;
}

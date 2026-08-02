import { describe, expect, it } from "vitest";
import type { AgentGoalState } from "@/api/types";
import { isAgentGoalDismissed, isAgentGoalTerminal } from "@/features/composer/goal-display";

function createGoal(stage: AgentGoalState["stage"]): AgentGoalState {
	return { goalId: "goal-test", stage } as AgentGoalState;
}

describe("Goal panel display state", () => {
	it.each(["achieved", "failed", "cancelled"] as const)("allows a %s Goal to be dismissed", (stage): void => {
		const goal = createGoal(stage);
		expect(isAgentGoalTerminal(goal)).toBe(true);
		expect(isAgentGoalDismissed(goal, new Set([goal.goalId]))).toBe(true);
	});

	it("does not dismiss an active Goal", (): void => {
		const goal = createGoal("running");
		expect(isAgentGoalTerminal(goal)).toBe(false);
		expect(isAgentGoalDismissed(goal, new Set([goal.goalId]))).toBe(false);
	});
});

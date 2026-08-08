import { describe, expect, it } from "vitest";
import type { AgentGoalState } from "@/platform/rpc/types";
import { isAgentGoalDismissed, isAgentGoalTerminal, shouldHideInlineDiffForGoal } from "@/domain/composer/goal-display";

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

	it.each(["readiness", "running", "evaluating", "pausing"] as const)("hides inline diffs while a Goal is %s", (stage): void => {
		expect(shouldHideInlineDiffForGoal(createGoal(stage))).toBe(true);
	});

	it.each(["awaiting_approval", "awaiting_tool_budget", "paused", "achieved", "failed", "cancelled"] as const)("shows inline diffs when a Goal is %s", (stage): void => {
		expect(shouldHideInlineDiffForGoal(createGoal(stage))).toBe(false);
	});

	it("shows inline diffs when there is no Goal", (): void => {
		expect(shouldHideInlineDiffForGoal(null)).toBe(false);
	});
});

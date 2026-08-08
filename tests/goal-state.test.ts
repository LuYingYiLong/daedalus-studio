import { describe, expect, it } from "vitest";
import type { AgentGoalState } from "@/platform/rpc/types";
import { selectLatestGoalState } from "@/domain/composer/goal-state";

function createGoal(goalId: string, revision: number, stage: AgentGoalState["stage"]): AgentGoalState {
	return {
		goalId,
		revision,
		stage
	} as AgentGoalState;
}

describe("selectLatestGoalState", (): void => {
	it("ignores an older snapshot for the same Goal", (): void => {
		const current = createGoal("goal-a", 8, "running");
		const stale = createGoal("goal-a", 7, "awaiting_approval");
		expect(selectLatestGoalState(current, stale)).toBe(current);
	});

	it("accepts a newer revision and a different Goal", (): void => {
		const current = createGoal("goal-a", 8, "awaiting_approval");
		const resumed = createGoal("goal-a", 9, "running");
		const replacement = createGoal("goal-b", 1, "readiness");
		expect(selectLatestGoalState(current, resumed)).toBe(resumed);
		expect(selectLatestGoalState(current, replacement)).toBe(replacement);
	});
});

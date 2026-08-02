import { describe, expect, it } from "vitest";
import type { AgentGoalState } from "@/api/types";
import {
	getGoalBudgetExtensionDefaults,
	hasGoalBudgetAfterExtension,
	hasGoalBudgetRemaining
} from "@/features/composer/goal-budget";

function createGoal(): AgentGoalState {
	return {
		schemaVersion: 1,
		goalId: "goal-test",
		sessionId: "session-test",
		rootRequestId: "request-test",
		revision: 1,
		title: "Test",
		condition: "Test",
		stage: "paused",
		pauseReason: "budget_exhausted",
		activeRunId: null,
		cycle: 1,
		modelSnapshot: { provider: "deepseek", model: "deepseek-v4-flash", reasoningEffort: "high", approvalMode: "auto-safe", workspaceId: "workspace-test" },
		budget: { maxCycles: 6, maxTokens: 200_000, maxActiveMinutes: 60 },
		usage: { cycles: 1, tokens: 366_926, activeMilliseconds: 486_563, estimatedTokens: true },
		readiness: null,
		evaluation: null,
		checkpoint: { status: "partial", fileCount: 0, totalBytes: 0, unavailableReasons: [] },
		createdAt: "2026-08-01T00:00:00.000Z",
		updatedAt: "2026-08-01T00:00:00.000Z",
		completedAt: null
	};
}

describe("Goal budget recovery", () => {
	it("adds the existing overage plus useful headroom", (): void => {
		const goal = createGoal();
		const extension = getGoalBudgetExtensionDefaults(goal);

		expect(extension).toEqual({ cycles: 2, tokens: 270_000, activeMinutes: 30 });
		expect(hasGoalBudgetRemaining(goal)).toBe(false);
		expect(hasGoalBudgetAfterExtension(goal, extension)).toBe(true);
	});

	it("rejects an extension that remains below current usage", (): void => {
		expect(hasGoalBudgetAfterExtension(createGoal(), { cycles: 0, tokens: 100_000, activeMinutes: 0 })).toBe(false);
	});
});

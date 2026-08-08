import type { AgentGoalState } from "@/platform/rpc/types";

export type GoalBudgetExtension = {
	cycles: number;
	tokens: number;
	activeMinutes: number;
};

const DEFAULT_ADDITIONAL_CYCLES = 2;
const DEFAULT_ADDITIONAL_TOKENS = 100_000;
const DEFAULT_ADDITIONAL_ACTIVE_MINUTES = 30;
const TOKEN_STEP = 10_000;

function roundUp(value: number, step: number): number {
	return Math.ceil(value / step) * step;
}

export function getGoalBudgetExtensionDefaults(goal: AgentGoalState): GoalBudgetExtension {
	const usedActiveMinutes: number = Math.ceil(goal.usage.activeMilliseconds / 60_000);
	return {
		cycles: Math.max(DEFAULT_ADDITIONAL_CYCLES, goal.usage.cycles - goal.budget.maxCycles + DEFAULT_ADDITIONAL_CYCLES),
		tokens: roundUp(Math.max(
			DEFAULT_ADDITIONAL_TOKENS,
			goal.usage.tokens - goal.budget.maxTokens + DEFAULT_ADDITIONAL_TOKENS
		), TOKEN_STEP),
		activeMinutes: Math.max(
			DEFAULT_ADDITIONAL_ACTIVE_MINUTES,
			usedActiveMinutes - goal.budget.maxActiveMinutes + DEFAULT_ADDITIONAL_ACTIVE_MINUTES
		)
	};
}

export function hasGoalBudgetAfterExtension(goal: AgentGoalState, extension: GoalBudgetExtension): boolean {
	return goal.usage.cycles < goal.budget.maxCycles + extension.cycles
		&& goal.usage.tokens < goal.budget.maxTokens + extension.tokens
		&& goal.usage.activeMilliseconds < (goal.budget.maxActiveMinutes + extension.activeMinutes) * 60_000;
}

export function hasGoalBudgetRemaining(goal: AgentGoalState): boolean {
	return hasGoalBudgetAfterExtension(goal, { cycles: 0, tokens: 0, activeMinutes: 0 });
}

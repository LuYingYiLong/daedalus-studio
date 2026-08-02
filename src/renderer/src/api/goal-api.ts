import { createBackendClient } from "@/shared/api/transport/backend-client";
import type { AgentGoalState } from "./types";

export type GoalRollbackPreview = {
	goalId: string;
	available: boolean;
	fingerprint: string | null;
	files: Array<{ path: string; existedBefore: boolean; existsAfter: boolean; sizeBytes: number }>;
	reasons: string[];
};

async function requestGoal(method: string, params: Record<string, unknown>): Promise<AgentGoalState> {
	const client = await createBackendClient();
	return client.request<AgentGoalState>(method, params);
}

export async function getCurrentGoal(sessionId: string): Promise<AgentGoalState | null> {
	const client = await createBackendClient();
	return client.request<AgentGoalState | null>("agent.goal.current", { sessionId });
}

export const pauseGoal = (goalId: string): Promise<AgentGoalState> => requestGoal("agent.goal.pause", { goalId });
export const resumeGoal = (goalId: string): Promise<AgentGoalState> => requestGoal("agent.goal.resume", { goalId });
export const cancelGoal = (goalId: string): Promise<AgentGoalState> => requestGoal("agent.goal.cancel", { goalId });

export async function dismissGoal(goalId: string): Promise<{ goalId: string; dismissed: true }> {
	const client = await createBackendClient();
	return client.request<{ goalId: string; dismissed: true }>("agent.goal.dismiss", { goalId });
}

export function extendGoalBudget(goalId: string, additionalCycles: number, additionalTokens: number, additionalActiveMinutes: number): Promise<AgentGoalState> {
	return requestGoal("agent.goal.extendBudget", { goalId, additionalCycles, additionalTokens, additionalActiveMinutes });
}

export async function previewGoalRollback(goalId: string): Promise<GoalRollbackPreview> {
	const client = await createBackendClient();
	return client.request<GoalRollbackPreview>("agent.goal.rollback.preview", { goalId });
}

export async function applyGoalRollback(goalId: string, fingerprint: string): Promise<GoalRollbackPreview> {
	const client = await createBackendClient();
	return client.request<GoalRollbackPreview>("agent.goal.rollback.apply", { goalId, fingerprint });
}

import { createBackendClient } from "./backend-client";
import type { PlanRecommendedReply, WorkbenchSnapshot } from "./types";

export type PlanStatus = "clarification_required" | "ready" | "approved" | "executing";

export type PlanResult = {
	planId: string;
	sessionId: string;
	requestId: string;
	status: PlanStatus;
	title: string;
	previewMarkdown: string;
	question: string;
	recommendedReplies: PlanRecommendedReply[];
	createdAt: string;
	updatedAt: string;
	markdown?: string;
	metadata?: Record<string, unknown>;
};

export type PlanApprovalResult = {
	planApproved: true;
	planId: string;
	executionRequestId: string;
	chatMode: "agent";
	workbench: WorkbenchSnapshot;
};

export async function getPlan(planId: string, sessionId?: string): Promise<PlanResult> {
	const client = await createBackendClient();

	return client.request<PlanResult>("plan.get", {
		planId,
		sessionId
	});
}

export async function submitPlanClarification(planId: string, reply: string): Promise<PlanResult> {
	const client = await createBackendClient();

	return client.request<PlanResult>("plan.clarify", {
		planId,
		reply
	});
}

export async function revisePlan(planId: string, feedback: string): Promise<PlanResult> {
	const client = await createBackendClient();

	return client.request<PlanResult>("plan.revise", {
		planId,
		feedback
	});
}

export async function approvePlan(planId: string): Promise<PlanApprovalResult> {
	const client = await createBackendClient();

	return client.request<PlanApprovalResult>("plan.approve", {
		planId
	});
}

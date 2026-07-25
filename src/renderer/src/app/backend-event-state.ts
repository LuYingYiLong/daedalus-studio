import type { PlanApprovalState, PlanClarificationState, PlanRecommendedReply, SessionMetadata, WorkbenchSnapshot } from "@/api/types";
import type { PlanResult } from "@/api/plan-api";
import type { BackendEvent } from "@/shared/api/transport/backend-rpc-client";

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function getStringField(record: Record<string, unknown>, key: string): string {
	const value: unknown = record[key];
	return typeof value === "string" ? value : "";
}

function parsePlanRecommendedReplies(value: unknown): PlanRecommendedReply[] {
	if (!Array.isArray(value)) {
		return [];
	}

	const replies: PlanRecommendedReply[] = [];
	for (const item of value.slice(0, 3)) {
		if (!isRecord(item)) {
			continue;
		}

		const label: string = getStringField(item, "label").trim();
		const text: string = getStringField(item, "text").trim();
		const description: string = getStringField(item, "description").trim();
		if (label.length === 0 || text.length === 0) {
			continue;
		}

		replies.push({
			label,
			text,
			description: description.length > 0 ? description : undefined
		});
	}
	return replies;
}

export function normalizePlanClarification(value: unknown): PlanClarificationState | null {
	if (!isRecord(value)) {
		return null;
	}

	const planId: string = getStringField(value, "planId").trim();
	const question: string = getStringField(value, "question").trim();
	if (planId.length === 0 || question.length === 0) {
		return null;
	}

	const title: string = getStringField(value, "title").trim();
	const requestId: string = getStringField(value, "requestId").trim();
	return {
		planId,
		requestId: requestId.length > 0 ? requestId : planId,
		title: title.length > 0 ? title : "Plan clarification",
		question,
		recommendedReplies: parsePlanRecommendedReplies(value.recommendedReplies)
	};
}

export function getPlanClarificationFromEvent(event: BackendEvent): PlanClarificationState | null {
	if (event.event !== "plan.clarification.required") {
		return null;
	}

	return normalizePlanClarification(event.data);
}

function normalizePlanApproval(value: unknown): PlanApprovalState | null {
	if (!isRecord(value)) {
		return null;
	}

	const planId: string = getStringField(value, "planId").trim();
	const status: string = getStringField(value, "status").trim();
	const previewMarkdown: string = getStringField(value, "previewMarkdown").trim();
	if (planId.length === 0 || status !== "ready") {
		return null;
	}

	const title: string = getStringField(value, "title").trim();
	const requestId: string = getStringField(value, "requestId").trim();
	return {
		planId,
		requestId: requestId.length > 0 ? requestId : planId,
		title: title.length > 0 ? title : "Plan",
		status,
		previewMarkdown,
		updatedAt: getStringField(value, "updatedAt").trim()
	};
}

export function getPlanApprovalFromEvent(event: BackendEvent): PlanApprovalState | null {
	if (event.event !== "plan.generated" && event.event !== "plan.revised") {
		return null;
	}

	return normalizePlanApproval(event.data);
}

export function getPlanApprovalFromResult(result: PlanResult): PlanApprovalState | null {
	return normalizePlanApproval(result);
}

export function getPlanIdFromEvent(event: BackendEvent): string {
	return isRecord(event.data) ? getStringField(event.data, "planId").trim() : "";
}

export function shouldClearPlanClarificationForEvent(event: BackendEvent, clarification: PlanClarificationState | null): boolean {
	if (clarification === null || !isRecord(event.data)) {
		return false;
	}

	if (event.event === "plan.generated" || event.event === "plan.revised" || event.event === "plan.approved" || event.event === "plan.execution.started" || event.event === "plan.error") {
		const planId: string = getStringField(event.data, "planId").trim();
		return planId.length === 0 || planId === clarification.planId;
	}

	if (event.event === "agent.run.error") {
		const planId: string = getStringField(event.data, "planId").trim();
		const requestId: string = getStringField(event.data, "requestId").trim();
		return planId === clarification.planId || requestId === clarification.requestId;
	}

	return false;
}

export function getBackendEventSessionId(event: BackendEvent): string | null {
	if (!isRecord(event.data)) {
		return null;
	}

	return typeof event.data.sessionId === "string" ? event.data.sessionId : null;
}

export function isSessionScopedBackendEvent(event: BackendEvent): boolean {
	return event.event.startsWith("agent.")
		|| event.event.startsWith("ai.")
		|| event.event.startsWith("tool.")
		|| event.event.startsWith("terminal.")
		|| event.event.startsWith("workflow.")
		|| event.event.startsWith("plan.")
		|| event.event.startsWith("guide.")
		|| event.event === "session.workbench.updated"
		|| event.event === "session.renamed"
		|| event.event === "message.queue.updated";
}

export function getBackendEventSessionMetadata(event: BackendEvent): SessionMetadata | null {
	if (!isRecord(event.data) || !isRecord(event.data.metadata)) {
		return null;
	}

	const metadata: Record<string, unknown> = event.data.metadata;
	return typeof metadata.id === "string" && typeof metadata.title === "string"
		? metadata as SessionMetadata
		: null;
}

export function getWorkbenchFromEvent(event: BackendEvent): WorkbenchSnapshot | null {
	if (event.event !== "session.workbench.updated" || !isRecord(event.data)) {
		return null;
	}

	const workbench: unknown = event.data.workbench;
	if (!isRecord(workbench) || typeof workbench.revision !== "number") {
		return null;
	}

	return workbench as WorkbenchSnapshot;
}

export function getBackendEventRequestId(event: BackendEvent): string {
	if (isRecord(event.data) && typeof event.data.requestId === "string" && event.data.requestId.length > 0) {
		return event.data.requestId;
	}

	return event.id;
}

export function isRunCancellationEvent(event: BackendEvent): boolean {
	return event.event === "agent.run.cancelled";
}

export function isRunCompletionEvent(event: BackendEvent): boolean {
	return event.event === "agent.run.done" || event.event === "workflow.done" || event.event === "ai.done";
}

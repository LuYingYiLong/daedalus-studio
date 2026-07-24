import type { BackendEvent } from "@/api/backend-rpc-client";
import type { WorkflowTodoSnapshot, WorkflowTodoStatus, WorkflowTodoStep } from "@/api/types";

const PLAN_TODO_MAX_STEPS: number = 12;

export type WorkflowStepUiStatus = "wait" | "process" | "finish" | "error";

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function getStringValue(record: Record<string, unknown>, key: string): string | undefined {
	const value: unknown = record[key];

	return typeof value === "string" && value.length > 0 ? value : undefined;
}

function getNumberValue(record: Record<string, unknown>, key: string): number | undefined {
	const value: unknown = record[key];

	return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function normalizeTodoStep(value: unknown, index: number): WorkflowTodoStep | null {
	if (!isRecord(value)) {
		return null;
	}

	const id: string = getStringValue(value, "id") ?? getStringValue(value, "phaseId") ?? `todo-${index}`;
	const title: string = getStringValue(value, "title") ?? getStringValue(value, "text") ?? id;
	const status: WorkflowTodoStatus = getStringValue(value, "status") ?? "pending";
	const step: WorkflowTodoStep = {
		id,
		title,
		status
	};
	const phaseId: string | undefined = getStringValue(value, "phaseId");
	const text: string | undefined = getStringValue(value, "text");

	if (phaseId !== undefined) {
		step.phaseId = phaseId;
	}
	if (text !== undefined) {
		step.text = text;
	}

	return step;
}

function normalizeTodoStepArray(value: unknown): WorkflowTodoStep[] {
	if (!Array.isArray(value)) {
		return [];
	}

	return value
		.map((item: unknown, index: number): WorkflowTodoStep | null => normalizeTodoStep(item, index))
		.filter((item: WorkflowTodoStep | null): item is WorkflowTodoStep => item !== null);
}

export function normalizeWorkflowTodoSnapshot(value: unknown): WorkflowTodoSnapshot | null {
	if (!isRecord(value)) {
		return null;
	}

	const steps: WorkflowTodoStep[] = normalizeTodoStepArray(value.steps).length > 0
		? normalizeTodoStepArray(value.steps)
		: normalizeTodoStepArray(value.phases);
	const todos: WorkflowTodoStep[] = normalizeTodoStepArray(value.todos);
	const normalizedSteps: WorkflowTodoStep[] = steps.length > 0 ? steps : todos;

	if (normalizedSteps.length === 0 && todos.length === 0) {
		return null;
	}

	const snapshot: WorkflowTodoSnapshot = {
		steps: normalizedSteps,
		todos
	};
	const runId: string | undefined = getStringValue(value, "runId");
	const workflowId: string | undefined = getStringValue(value, "workflowId");
	const title: string | undefined = getStringValue(value, "title");
	const source: string | undefined = getStringValue(value, "source");
	const revision: number | undefined = getNumberValue(value, "revision");
	const activeStepRunId: string | undefined = getStringValue(value, "activeStepRunId");
	const activePhaseRunId: string | undefined = getStringValue(value, "activePhaseRunId");

	if (runId !== undefined) {
		snapshot.runId = runId;
	}
	if (workflowId !== undefined) {
		snapshot.workflowId = workflowId;
	}
	if (title !== undefined) {
		snapshot.title = title;
	}
	if (source !== undefined) {
		snapshot.source = source;
	}
	if (revision !== undefined) {
		snapshot.revision = revision;
	}
	if (activeStepRunId !== undefined) {
		snapshot.activeStepRunId = activeStepRunId;
	}
	if (activePhaseRunId !== undefined) {
		snapshot.activePhaseRunId = activePhaseRunId;
	}

	return snapshot;
}

export function getWorkflowTodoSnapshotKey(snapshot: WorkflowTodoSnapshot): string {
	return snapshot.runId ?? snapshot.workflowId ?? snapshot.title ?? "workflow";
}

export function mapWorkflowTodoStatusToStepStatus(status: WorkflowTodoStatus): WorkflowStepUiStatus {
	if (status === "done") {
		return "finish";
	}
	if (status === "running" || status === "in_progress") {
		return "process";
	}
	if (status === "failed") {
		return "error";
	}

	return "wait";
}

export function isWorkflowTodoClearEvent(event: BackendEvent): boolean {
	return event.event === "workflow.todo.dismissed";
}

function getPlanMarkdownFromRecord(record: Record<string, unknown>): string {
	const previewMarkdown: string = getStringValue(record, "previewMarkdown")?.trim() ?? "";
	if (previewMarkdown.length > 0) {
		return previewMarkdown;
	}

	return getStringValue(record, "markdown")?.trim() ?? "";
}

function stripMarkdownInline(value: string): string {
	return value
		.replace(/`([^`]+)`/gu, "$1")
		.replace(/\*\*([^*]+)\*\*/gu, "$1")
		.replace(/__([^_]+)__/gu, "$1")
		.replace(/\[([^\]]+)\]\([^)]*\)/gu, "$1")
		.replace(/[\t ]+/gu, " ")
		.trim();
}

function extractPlanTodoSteps(markdown: string): WorkflowTodoStep[] {
	const steps: WorkflowTodoStep[] = [];
	const lines: string[] = markdown.split(/\r?\n/u);

	for (const line of lines) {
		const trimmedLine: string = line.trim();
		if (trimmedLine.length === 0 || trimmedLine.startsWith("#") || /^[-*_]{3,}$/u.test(trimmedLine)) {
			continue;
		}

		const checkboxMatch: RegExpMatchArray | null = trimmedLine.match(/^[-*+]\s+\[([ xX])\]\s+(.+)$/u);
		const numberedMatch: RegExpMatchArray | null = checkboxMatch === null
			? trimmedLine.match(/^\d+[.)]\s+(.+)$/u)
			: null;
		const bulletMatch: RegExpMatchArray | null = checkboxMatch === null && numberedMatch === null
			? trimmedLine.match(/^[-*+]\s+(.+)$/u)
			: null;

		const rawTitle: string = checkboxMatch?.[2] ?? numberedMatch?.[1] ?? bulletMatch?.[1] ?? "";
		const title: string = stripMarkdownInline(rawTitle);
		if (title.length === 0 || title.endsWith(":")) {
			continue;
		}

		steps.push({
			id: `plan-step-${steps.length + 1}`,
			title,
			status: checkboxMatch?.[1].toLowerCase() === "x" ? "done" : "pending"
		});
		if (steps.length >= PLAN_TODO_MAX_STEPS) {
			break;
		}
	}

	return steps;
}

export function createWorkflowTodoSnapshotFromPlanData(value: unknown, running: boolean = false): WorkflowTodoSnapshot | null {
	if (!isRecord(value)) {
		return null;
	}

	const planId: string = getStringValue(value, "planId")?.trim() ?? "";
	const markdown: string = getPlanMarkdownFromRecord(value);
	if (planId.length === 0 || markdown.length === 0) {
		return null;
	}

	const steps: WorkflowTodoStep[] = extractPlanTodoSteps(markdown);
	if (steps.length === 0) {
		return null;
	}

	const normalizedSteps: WorkflowTodoStep[] = running
		? steps.map((step: WorkflowTodoStep, index: number): WorkflowTodoStep => ({
			...step,
			status: index === 0 ? "running" : step.status
		}))
		: steps;
	const title: string = getStringValue(value, "title")?.trim() ?? "";
	const revisionSource: string = getStringValue(value, "updatedAt")?.trim() ?? "";
	const parsedRevision: number = Date.parse(revisionSource);

	return {
		workflowId: planId,
		title: title.length > 0 ? title : "Plan",
		source: "plan",
		revision: Number.isFinite(parsedRevision) ? parsedRevision : undefined,
		steps: normalizedSteps,
		todos: normalizedSteps
	};
}

export function isWorkflowTodoActive(snapshot: WorkflowTodoSnapshot): boolean {
	return snapshot.steps.some((step: WorkflowTodoStep): boolean => {
		return step.status === "running" || step.status === "in_progress" || step.status === "paused";
	});
}

export function markWorkflowTodoExecuting(snapshot: WorkflowTodoSnapshot): WorkflowTodoSnapshot {
	const firstPendingIndex: number = snapshot.steps.findIndex((step: WorkflowTodoStep): boolean => {
		return step.status !== "done" && step.status !== "completed" && step.status !== "success";
	});
	const runningIndex: number = firstPendingIndex >= 0 ? firstPendingIndex : Math.max(0, snapshot.steps.length - 1);

	return {
		...snapshot,
		source: snapshot.source ?? "plan",
		revision: (snapshot.revision ?? 0) + 1,
		steps: snapshot.steps.map((step: WorkflowTodoStep, index: number): WorkflowTodoStep => ({
			...step,
			status: index === runningIndex ? "running" : step.status
		})),
		todos: snapshot.todos.map((step: WorkflowTodoStep, index: number): WorkflowTodoStep => ({
			...step,
			status: index === runningIndex ? "running" : step.status
		}))
	};
}

export function markWorkflowTodoCompleted(snapshot: WorkflowTodoSnapshot): WorkflowTodoSnapshot {
	return {
		...snapshot,
		revision: (snapshot.revision ?? 0) + 1,
		steps: snapshot.steps.map((step: WorkflowTodoStep): WorkflowTodoStep => ({ ...step, status: "done" })),
		todos: snapshot.todos.map((step: WorkflowTodoStep): WorkflowTodoStep => ({ ...step, status: "done" }))
	};
}

export function markWorkflowTodoFailed(snapshot: WorkflowTodoSnapshot): WorkflowTodoSnapshot {
	const failingIndex: number = snapshot.steps.findIndex((step: WorkflowTodoStep): boolean => {
		return step.status === "running" || step.status === "in_progress";
	});
	const targetIndex: number = failingIndex >= 0 ? failingIndex : Math.max(0, snapshot.steps.length - 1);

	return {
		...snapshot,
		revision: (snapshot.revision ?? 0) + 1,
		steps: snapshot.steps.map((step: WorkflowTodoStep, index: number): WorkflowTodoStep => ({
			...step,
			status: index === targetIndex ? "failed" : step.status
		})),
		todos: snapshot.todos.map((step: WorkflowTodoStep, index: number): WorkflowTodoStep => ({
			...step,
			status: index === targetIndex ? "failed" : step.status
		}))
	};
}

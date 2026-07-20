import type { BackendEvent } from "@/api/backend-rpc-client";
import type { WorkflowTodoSnapshot, WorkflowTodoStatus, WorkflowTodoStep } from "@/api/types";

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

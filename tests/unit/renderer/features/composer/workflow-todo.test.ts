import { describe, expect, it } from "vitest";
import type { BackendEvent } from "@/api/backend-rpc-client";
import {
	getWorkflowTodoSnapshotKey,
	isWorkflowTodoClearEvent,
	mapWorkflowTodoStatusToStepStatus,
	normalizeWorkflowTodoSnapshot
} from "@/features/composer/workflow-todo";

describe("workflow-todo", () => {
	it("normalizes workflow todo snapshots with steps", () => {
		const snapshot = normalizeWorkflowTodoSnapshot({
			runId: "run-a",
			title: "Build feature",
			revision: 3,
			steps: [
				{ id: "read", title: "Read files", status: "done" },
				{ id: "write", title: "Implement", status: "running" }
			],
			todos: [
				{ id: "read-todo", phaseId: "read", text: "Read files", status: "done" }
			],
			activeStepRunId: "step-run-a"
		});

		expect(snapshot?.runId).toBe("run-a");
		expect(snapshot?.title).toBe("Build feature");
		expect(snapshot?.revision).toBe(3);
		expect(snapshot?.steps).toHaveLength(2);
		expect(snapshot?.todos).toHaveLength(1);
		expect(snapshot?.activeStepRunId).toBe("step-run-a");
		expect(snapshot === null ? "" : getWorkflowTodoSnapshotKey(snapshot)).toBe("run-a");
	});

	it("falls back from phases to todos", () => {
		const phaseSnapshot = normalizeWorkflowTodoSnapshot({
			workflowId: "workflow-a",
			phases: [
				{ id: "inspect", title: "Inspect", status: "pending" }
			]
		});
		const todoSnapshot = normalizeWorkflowTodoSnapshot({
			workflowId: "workflow-b",
			todos: [
				{ id: "todo-a", text: "Summarize", status: "paused" }
			]
		});

		expect(phaseSnapshot?.steps[0]?.title).toBe("Inspect");
		expect(todoSnapshot?.steps[0]?.title).toBe("Summarize");
		expect(todoSnapshot?.steps[0]?.status).toBe("paused");
	});

	it("maps workflow todo statuses to AntD step statuses", () => {
		expect(mapWorkflowTodoStatusToStepStatus("done")).toBe("finish");
		expect(mapWorkflowTodoStatusToStepStatus("running")).toBe("process");
		expect(mapWorkflowTodoStatusToStepStatus("in_progress")).toBe("process");
		expect(mapWorkflowTodoStatusToStepStatus("failed")).toBe("error");
		expect(mapWorkflowTodoStatusToStepStatus("paused")).toBe("wait");
		expect(mapWorkflowTodoStatusToStepStatus("pending")).toBe("wait");
	});

	it("detects todo clear events", () => {
		const doneEvent: BackendEvent = { type: "event", id: "run-a", event: "workflow.done", data: {} };
		const errorEvent: BackendEvent = { type: "event", id: "run-a", event: "agent.run.error", data: {} };
		const dismissEvent: BackendEvent = { type: "event", id: "run-a", event: "workflow.todo.dismissed", data: {} };
		const cancelEvent: BackendEvent = { type: "event", id: "run-a", event: "agent.run.cancelled", data: {} };
		const snapshotEvent: BackendEvent = { type: "event", id: "run-a", event: "agent.run.snapshot", data: {} };

		expect(isWorkflowTodoClearEvent(doneEvent)).toBe(false);
		expect(isWorkflowTodoClearEvent(errorEvent)).toBe(true);
		expect(isWorkflowTodoClearEvent(dismissEvent)).toBe(true);
		expect(isWorkflowTodoClearEvent(cancelEvent)).toBe(true);
		expect(isWorkflowTodoClearEvent(snapshotEvent)).toBe(false);
	});
});

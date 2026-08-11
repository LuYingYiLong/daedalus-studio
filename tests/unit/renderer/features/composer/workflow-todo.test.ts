import { describe, expect, it } from "vitest";
import type { BackendEvent } from "@/platform/rpc/transport/backend-rpc-client";
import {
	getWorkflowTodoSnapshotKey,
	isWorkflowTodoClearEvent,
	mapWorkflowTodoStatusToStepStatus,
	normalizeWorkflowTodoSnapshot,
	reconcileWorkflowTodoWithRunStage,
	selectLatestWorkflowTodoSnapshot
} from "@/domain/composer/workflow-todo";

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

	it("keeps Agent Loop Todo snapshots visible and source-scoped", () => {
		const snapshot = normalizeWorkflowTodoSnapshot({
			workflowId: "agent-loop:run-a",
			source: "agent_loop",
			revision: 2,
			phases: [
				{ id: "scan", title: "Scan references", status: "done" },
				{ id: "remove", title: "Remove obsolete setting", status: "running" }
			]
		});

		expect(snapshot?.source).toBe("agent_loop");
		expect(snapshot?.steps.map((step) => step.status)).toEqual(["done", "running"]);
		expect(snapshot === null ? "" : getWorkflowTodoSnapshotKey(snapshot)).toBe("agent-loop:run-a");
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

	it("clears todos only when the user dismisses the workflow todo", () => {
		const doneEvent: BackendEvent = { type: "event", id: "run-a", event: "workflow.done", data: {} };
		const errorEvent: BackendEvent = { type: "event", id: "run-a", event: "agent.run.error", data: {} };
		const workflowErrorEvent: BackendEvent = { type: "event", id: "run-a", event: "workflow.error", data: {} };
		const dismissEvent: BackendEvent = { type: "event", id: "run-a", event: "agent.todo.dismissed", data: {} };
		const cancelEvent: BackendEvent = { type: "event", id: "run-a", event: "agent.run.cancelled", data: {} };
		const snapshotEvent: BackendEvent = { type: "event", id: "run-a", event: "agent.run.snapshot", data: {} };

		expect(isWorkflowTodoClearEvent(doneEvent)).toBe(false);
		expect(isWorkflowTodoClearEvent(errorEvent)).toBe(false);
		expect(isWorkflowTodoClearEvent(workflowErrorEvent)).toBe(false);
		expect(isWorkflowTodoClearEvent(dismissEvent)).toBe(true);
		expect(isWorkflowTodoClearEvent(cancelEvent)).toBe(false);
		expect(isWorkflowTodoClearEvent(snapshotEvent)).toBe(false);
	});

	it("reconciles the latest workflow todo with its terminal AgentRun stage", () => {
		const snapshot = normalizeWorkflowTodoSnapshot({
			workflowId: "workflow-goal-cycle-6",
			phases: [
				{ id: "inspect", title: "Inspect", status: "pending" },
				{ id: "implement", title: "Implement", status: "done" },
				{ id: "verify", title: "Verify", status: "done" },
				{ id: "summarize", title: "Summarize", status: "pending" }
			]
		});
		expect(snapshot).not.toBeNull();

		const completed = reconcileWorkflowTodoWithRunStage(snapshot!, "completed");
		expect(completed.steps.every((step) => step.status === "done")).toBe(true);
		expect(completed.workflowId).toBe("workflow-goal-cycle-6");
	});

	it("prefers the authoritative v3 AgentRun todo over a legacy workflow snapshot", () => {
		const selected = selectLatestWorkflowTodoSnapshot(
			{
				workflowId: "workflow-goal-cycle-6",
				phases: [{ id: "verify", title: "Verify", status: "done" }]
			},
			{
				workflowId: "workflow-goal-cycle-1",
				phases: [{ id: "inspect", title: "Inspect", status: "running" }]
			}
		);

		expect(selected?.workflowId).toBe("workflow-goal-cycle-6");
		expect(selected?.steps[0]?.title).toBe("Verify");
	});
});

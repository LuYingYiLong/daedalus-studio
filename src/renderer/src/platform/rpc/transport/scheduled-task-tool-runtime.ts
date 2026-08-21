import type { ScheduledTaskToolRequest, ScheduledTaskToolResult } from "../../../../../contracts/scheduled-tasks";
import type { BackendEvent, BackendRpcClient } from "./backend-rpc-client";

const attachedClients: WeakSet<BackendRpcClient> = new WeakSet();

function isToolRequest(value: unknown): value is ScheduledTaskToolRequest {
	if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
	const record = value as Partial<ScheduledTaskToolRequest>;
	return typeof record.callId === "string" && typeof record.sessionId === "string" && typeof record.toolName === "string" && record.args !== null && typeof record.args === "object" && typeof record.timeoutMs === "number";
}

export function attachScheduledTaskToolRuntime(client: BackendRpcClient): void {
	if (attachedClients.has(client)) return;
	attachedClients.add(client);
	client.addEventListener((event: BackendEvent): void => {
		if (event.sessionId !== undefined && (event.event === "agent.message.done" || event.event === "agent.run.error" || event.event === "agent.tool.approval_required")) {
			const data = event.data !== null && typeof event.data === "object" && !Array.isArray(event.data) ? event.data as Record<string, unknown> : {};
			const status = event.event === "agent.message.done" ? "succeeded" : event.event === "agent.run.error" ? "failed" : "awaiting_approval";
			const summary = typeof data.text === "string" ? data.text : typeof data.message === "string" ? data.message : undefined;
			void window.electronAPI.scheduledTasks.reconcileSessionRun({ sessionId: event.sessionId, status, ...(summary === undefined ? {} : { summary }) }).catch((): void => {});
		}
		if (event.event !== "scheduled-task.tool.request" || !isToolRequest(event.data)) return;
		const request = event.data;
		void window.electronAPI.scheduledTasks.executeTool(request).then(async (result): Promise<void> => {
			const response: ScheduledTaskToolResult = { callId: request.callId, ok: true, result };
			await client.request("scheduled-task.tool.result", response);
		}).catch(async (error: unknown): Promise<void> => {
			const response: ScheduledTaskToolResult = {
				callId: request.callId,
				ok: false,
				error: { code: "scheduled_task_operation_failed", message: error instanceof Error ? error.message : String(error), retryable: false },
			};
			await client.request("scheduled-task.tool.result", response).catch((): void => {});
		});
	});
}

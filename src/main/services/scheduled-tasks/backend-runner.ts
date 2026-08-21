import { randomUUID } from "node:crypto";
import WebSocket from "ws";
import type { ScheduledTask } from "../../../contracts/scheduled-tasks";
import { backendManager } from "../backend-manager";

type RunOutcome = {
	sessionId: string;
	summary: string;
	awaitingApproval: boolean;
	report: { changed: boolean; summary: string } | null;
};

type RpcEnvelope = {
	type?: string;
	id?: string;
	ok?: boolean;
	result?: unknown;
	error?: { code?: string; message?: string };
	event?: string;
	data?: unknown;
};

export class ScheduledTaskBackendStartupError extends Error {
	constructor(message: string, options?: ErrorOptions) {
		super(message, options);
		this.name = "ScheduledTaskBackendStartupError";
	}
}

function readRecord(value: unknown): Record<string, unknown> {
	return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

export async function runScheduledTaskWithBackend(task: ScheduledTask, runId: string, scheduledAt: string): Promise<RunOutcome> {
	if (task.context === null) throw new Error("scheduled_task_context_missing");
	let connection: Awaited<ReturnType<typeof backendManager.getReadyConnectionInfo>>;
	try {
		connection = await backendManager.getReadyConnectionInfo();
	} catch (error: unknown) {
		throw new ScheduledTaskBackendStartupError(error instanceof Error ? error.message : String(error), { cause: error });
	}
	const socket = new WebSocket(`ws://127.0.0.1:${connection.port}`, connection.authProtocol ?? undefined);
	const pending: Map<string, { resolve(value: unknown): void; reject(error: Error): void }> = new Map();
	let sessionId: string = "";
	let finalText: string = "";
	let awaitingApproval: boolean = false;
	let agentError: string | null = null;
	const reportState: { value: { changed: boolean; summary: string } | null } = { value: null };
	let finishRun: (() => void) | null = null;

	const request = <T>(method: string, params: Record<string, unknown> = {}): Promise<T> => {
		const id: string = `scheduler-${randomUUID()}`;
		return new Promise<T>((resolve, reject): void => {
			pending.set(id, { resolve: (value): void => resolve(value as T), reject });
			socket.send(JSON.stringify({ type: "request", id, method, params }));
		});
	};

	socket.on("message", (raw): void => {
		let message: RpcEnvelope;
		try { message = JSON.parse(raw.toString()) as RpcEnvelope; } catch { return; }
		if (message.type === "response" && typeof message.id === "string") {
			const entry = pending.get(message.id);
			if (entry === undefined) return;
			pending.delete(message.id);
			if (message.ok) entry.resolve(message.result);
			else entry.reject(new Error(`${message.error?.code ?? "backend_error"}: ${message.error?.message ?? "Backend request failed."}`));
			return;
		}
		if (message.event === "scheduled-task.tool.request") {
			const data = readRecord(message.data);
			const callId = typeof data.callId === "string" ? data.callId : "";
			const args = readRecord(data.args);
			if (data.toolName === "mcp_scheduled_task_report" && typeof args.changed === "boolean" && typeof args.summary === "string") {
				reportState.value = { changed: args.changed, summary: args.summary.slice(0, 4000) };
				void request("scheduled-task.tool.result", { callId, ok: true, result: { accepted: true } });
			} else {
				void request("scheduled-task.tool.result", { callId, ok: false, error: { code: "scheduled_task_report_invalid", message: "Only a valid monitor report is allowed in scheduler mode.", retryable: false } });
			}
			return;
		}
		if (message.event === "agent.message.done") {
			const data = readRecord(message.data);
			if (typeof data.text === "string") finalText = data.text;
			finishRun?.();
		} else if (message.event === "agent.tool.approval_required") {
			awaitingApproval = true;
			finishRun?.();
		} else if (message.event === "agent.run.error") {
			const data = readRecord(message.data);
			agentError = typeof data.message === "string" ? data.message : "Scheduled Agent run failed.";
			finishRun?.();
		}
	});

	try {
		try {
			await new Promise<void>((resolve, reject): void => {
				const timer = setTimeout((): void => reject(new Error("scheduled_task_backend_connect_timeout")), 15_000);
				socket.once("open", (): void => { clearTimeout(timer); resolve(); });
				socket.once("error", (error): void => { clearTimeout(timer); reject(error); });
			});
		} catch (error: unknown) {
			throw new ScheduledTaskBackendStartupError(error instanceof Error ? error.message : String(error), { cause: error });
		}
		await request("client.hello", {
			protocolVersion: 3,
			clientType: "studio_scheduler",
			clientName: "Daedalus Studio Scheduler",
			capabilities: { scheduledTaskReport: task.kind === "monitor" },
		});
		const created = readRecord(await request("session.create", {
			title: task.title,
			workspaceId: task.context.workspaceId,
			provider: task.context.provider,
			model: task.context.model,
			reasoningEffort: task.context.reasoningEffort ?? undefined,
			chatMode: "agent",
			approvalMode: task.context.executionPolicy === "auto_safe" ? "auto-safe" : "manual",
			scheduledTaskOrigin: { taskId: task.id, runId, kind: task.kind, scheduledAt, executionPolicy: task.context.executionPolicy },
		}));
		sessionId = typeof created.id === "string" ? created.id : "";
		if (sessionId.length === 0) throw new Error("scheduled_task_session_create_invalid");

		let completionTimer: ReturnType<typeof setTimeout> | null = null;
		const completion = new Promise<void>((resolve, reject): void => {
			finishRun = resolve;
			completionTimer = setTimeout((): void => reject(new Error("scheduled_task_agent_timeout")), 30 * 60_000);
		});
		const chatRequest = request("ai.chat", {
			message: task.prompt,
			mode: "agent",
			provider: task.context.provider,
			model: task.context.model,
			options: {
				stream: true,
				reasoningEffort: task.context.reasoningEffort ?? undefined,
				executionPolicy: task.context.executionPolicy === "auto_safe" ? "auto" : "read_only",
				outputTarget: "chat",
			},
		});
		void chatRequest.catch((error: unknown): void => {
			finalText = error instanceof Error ? error.message : String(error);
			finishRun?.();
		});
		try {
			await completion;
		} finally {
			if (completionTimer !== null) clearTimeout(completionTimer);
		}
		if (agentError !== null) throw new Error(agentError);
		const monitorReport: { changed: boolean; summary: string } | null = reportState.value;
		return { sessionId, summary: (monitorReport === null ? finalText : monitorReport.summary).slice(0, 4000), awaitingApproval, report: monitorReport };
	} finally {
		for (const entry of pending.values()) entry.reject(new Error("scheduled_task_backend_disconnected"));
		pending.clear();
		socket.close();
	}
}

import { app, BrowserWindow, ipcMain } from "electron";
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import type {
	ScheduledTask,
	ScheduledTaskCreateInput,
	ScheduledTaskListResult,
	ScheduledTaskRun,
	ScheduledTaskRunTrigger,
	ScheduledTaskToolRequest,
	ScheduledTaskUpdateInput,
} from "../../../contracts/scheduled-tasks";
import { nativeNotificationService } from "../native-notifications";
import { runScheduledTaskWithBackend, ScheduledTaskBackendStartupError } from "./backend-runner";
import { ScheduledTaskStore } from "./store";
import { WindowsSchedulerAdapter } from "./windows-scheduler";

const MAX_TIMER_DELAY_MS: number = 2_147_000_000;
const BACKEND_START_RETRY_DELAY_MS: number = 5 * 60_000;

function delay(milliseconds: number): Promise<void> {
	return new Promise((resolve): void => { setTimeout(resolve, milliseconds); });
}

function asRecord(value: unknown): Record<string, unknown> {
	if (value === null || typeof value !== "object" || Array.isArray(value)) throw new Error("scheduled_task_invalid_request");
	return value as Record<string, unknown>;
}

function text(value: unknown, name: string, max: number): string {
	if (typeof value !== "string" || value.trim().length === 0 || value.length > max) throw new Error(`scheduled_task_${name}_invalid`);
	return value.trim();
}

function assertAllowedSender(sender: Electron.WebContents): void {
	const window = BrowserWindow.fromWebContents(sender);
	if (window === null || window.isDestroyed()) throw new Error("scheduled_task_ipc_not_allowed");
}

export class ScheduledTaskService {
	private readonly store: ScheduledTaskStore;
	private readonly windowsScheduler = new WindowsSchedulerAdapter();
	private timer: ReturnType<typeof setTimeout> | null = null;
	private runTail: Promise<void> = Promise.resolve();
	private registered: boolean = false;

	constructor(private readonly userDataRoot: string) {
		this.store = new ScheduledTaskStore(join(userDataRoot, "scheduled-tasks.json"), join(userDataRoot, "scheduled-task-runs.json"));
	}

	registerIpc(): void {
		if (this.registered) return;
		this.registered = true;
		ipcMain.handle("scheduled-tasks:list", async (event): Promise<ScheduledTaskListResult> => { assertAllowedSender(event.sender); return await this.list(); });
		ipcMain.handle("scheduled-tasks:get", async (event, taskId: string): Promise<ScheduledTask> => { assertAllowedSender(event.sender); return await this.store.getTask(taskId); });
		ipcMain.handle("scheduled-tasks:pause", async (event, taskId: string): Promise<ScheduledTask> => { assertAllowedSender(event.sender); return await this.setEnabled(taskId, false); });
		ipcMain.handle("scheduled-tasks:resume", async (event, taskId: string): Promise<ScheduledTask> => { assertAllowedSender(event.sender); return await this.setEnabled(taskId, true); });
		ipcMain.handle("scheduled-tasks:run-now", async (event, taskId: string): Promise<{ queued: true }> => {
			assertAllowedSender(event.sender);
			if (process.platform !== "win32") throw new Error("scheduled_tasks_windows_only");
			await this.store.getTask(taskId);
			this.queueRun(taskId, "manual");
			return { queued: true };
		});
		ipcMain.handle("scheduled-tasks:delete", async (event, taskId: string): Promise<{ deleted: true }> => { assertAllowedSender(event.sender); await this.store.delete(taskId); await this.changed(); return { deleted: true }; });
		ipcMain.handle("scheduled-tasks:runs-list", async (event, taskId?: string): Promise<ScheduledTaskRun[]> => { assertAllowedSender(event.sender); return await this.store.listRuns(taskId); });
		ipcMain.handle("scheduled-tasks:execute-tool", async (event, request: ScheduledTaskToolRequest): Promise<Record<string, unknown>> => { assertAllowedSender(event.sender); return await this.executeTool(request); });
		ipcMain.handle("scheduled-tasks:reconcile-session-run", async (event, input: { sessionId: string; status: "succeeded" | "failed" | "awaiting_approval"; summary?: string }): Promise<{ reconciled: boolean }> => {
			assertAllowedSender(event.sender);
			return await this.reconcileSessionRun(input);
		});
	}

	async start(): Promise<void> { await this.reconcile(); }
	async stop(): Promise<void> { if (this.timer !== null) clearTimeout(this.timer); this.timer = null; }

	async list(): Promise<ScheduledTaskListResult> {
		const [tasks, runs] = await Promise.all([this.store.listTasks(), this.store.listRuns()]);
		const attentionTaskIds = new Set(runs.filter((run): boolean => run.status === "failed" || run.status === "awaiting_approval").map((run): string => run.taskId));
		return { tasks, attentionCount: attentionTaskIds.size, platformSupported: process.platform === "win32" };
	}

	async runDueTasks(now: Date = new Date()): Promise<void> {
		const operation = this.runTail.then(async (): Promise<void> => this.runDueTasksSerial(now));
		this.runTail = operation.catch((): void => {});
		await operation;
	}

	private async runDueTasksSerial(now: Date): Promise<void> {
		const due = (await this.store.listTasks()).filter((task): boolean => task.enabled && task.nextRunAt !== null && Date.parse(task.nextRunAt) <= now.getTime()).sort((a, b): number => Date.parse(a.nextRunAt!) - Date.parse(b.nextRunAt!));
		for (const task of due) await this.runTask(task, Date.parse(task.nextRunAt!) < now.getTime() - 60_000 ? "catch_up" : "scheduled");
		await this.reconcile();
	}

	private async executeTool(request: ScheduledTaskToolRequest): Promise<Record<string, unknown>> {
		const args = asRecord(request.args);
		if (process.platform !== "win32" && ["mcp_scheduled_task_create", "mcp_scheduled_task_update", "mcp_scheduled_task_resume"].includes(request.toolName)) {
			throw new Error("scheduled_tasks_windows_only");
		}
		switch (request.toolName) {
			case "mcp_scheduled_tasks_list": return { tasks: (await this.store.listTasks()).map((task): ScheduledTask => ({ ...task, prompt: task.prompt.slice(0, 4000) })) };
			case "mcp_scheduled_task_create": {
				const input = this.readCreate(args, request.sessionId);
				const task = await this.store.create(input);
				await this.changed();
				return { created: true, task };
			}
			case "mcp_scheduled_task_update": {
				const taskId = text(args.taskId, "id", 160);
				const patch: ScheduledTaskUpdateInput = { taskId };
				if (typeof args.expectedRevision === "string") patch.expectedRevision = args.expectedRevision;
				for (const key of ["title", "kind", "prompt", "scheduleDescription", "schedule", "context"] as const) if (Object.hasOwn(args, key)) (patch as Record<string, unknown>)[key] = args[key];
				const task = await this.store.update(patch);
				await this.changed();
				return { updated: true, task };
			}
			case "mcp_scheduled_task_pause": return { paused: true, task: await this.setEnabled(text(args.taskId, "id", 160), false) };
			case "mcp_scheduled_task_resume": return { resumed: true, task: await this.setEnabled(text(args.taskId, "id", 160), true) };
			case "mcp_scheduled_task_delete": { await this.store.delete(text(args.taskId, "id", 160)); await this.changed(); return { deleted: true }; }
			case "mcp_scheduled_task_report": {
				if (typeof args.changed !== "boolean") throw new Error("scheduled_task_report_invalid");
				const summary = text(args.summary, "report_summary", 4000);
				const run = (await this.store.listRuns()).find((candidate): boolean => candidate.sessionId === request.sessionId && (candidate.status === "running" || candidate.status === "awaiting_approval"));
				if (run === undefined) throw new Error("scheduled_task_monitor_run_not_found");
				const task = await this.store.getTask(run.taskId);
				if (task.kind !== "monitor") throw new Error("scheduled_task_report_not_monitor");
				const next = await this.store.updateRun(run.id, { status: args.changed ? "changed" : "unchanged", summary, finishedAt: new Date().toISOString() });
				if (args.changed) this.notify(task, next, "scheduled_changed", task.title, summary);
				this.broadcastRun(next);
				await this.changed();
				return { accepted: true };
			}
			default: throw new Error("scheduled_task_tool_not_supported");
		}
	}

	private readCreate(args: Record<string, unknown>, sessionId: string): ScheduledTaskCreateInput {
		if (args.kind !== "reminder" && args.kind !== "agent" && args.kind !== "monitor") throw new Error("scheduled_task_kind_invalid");
		const schedule = asRecord(args.schedule);
		const parsedSchedule = schedule.kind === "once"
			? { kind: "once" as const, runAt: text(schedule.runAt, "run_at", 100), timezone: text(schedule.timezone, "timezone", 100) }
			: schedule.kind === "recurring"
				? { kind: "recurring" as const, cron: text(schedule.cron, "cron", 120), timezone: text(schedule.timezone, "timezone", 100) }
				: (() => { throw new Error("scheduled_task_schedule_invalid"); })();
		let context: ScheduledTaskCreateInput["context"] = null;
		if (args.context !== null) {
			const value = asRecord(args.context);
			if ((value.executionPolicy !== "read_only" && value.executionPolicy !== "auto_safe") || typeof value.provider !== "string" || typeof value.model !== "string") throw new Error("scheduled_task_context_invalid");
			context = { workspaceId: typeof value.workspaceId === "string" ? value.workspaceId : null, provider: text(value.provider, "provider", 80), model: text(value.model, "model", 200), reasoningEffort: typeof value.reasoningEffort === "string" ? value.reasoningEffort : null, executionPolicy: value.executionPolicy };
		}
		if (args.kind !== "reminder" && context === null) throw new Error("scheduled_task_context_required");
		return { title: text(args.title, "title", 120), kind: args.kind, prompt: text(args.prompt, "prompt", 20_000), scheduleDescription: text(args.scheduleDescription, "schedule_description", 500), schedule: parsedSchedule, context, createdBySessionId: sessionId };
	}

	private async setEnabled(taskId: string, enabled: boolean): Promise<ScheduledTask> {
		if (enabled && process.platform !== "win32") throw new Error("scheduled_tasks_windows_only");
		const task = await this.store.setEnabled(taskId, enabled);
		await this.changed();
		return task;
	}
	private async reconcileSessionRun(input: { sessionId: string; status: "succeeded" | "failed" | "awaiting_approval"; summary?: string }): Promise<{ reconciled: boolean }> {
		if (typeof input.sessionId !== "string" || input.sessionId.length < 1) return { reconciled: false };
		const run = (await this.store.listRuns()).find((candidate): boolean => candidate.sessionId === input.sessionId && ["running", "awaiting_approval", "changed", "unchanged"].includes(candidate.status));
		if (run === undefined) return { reconciled: false };
		const task = await this.store.getTask(run.taskId);
		if (task.kind === "monitor" && (run.status === "changed" || run.status === "unchanged") && input.status === "succeeded") return { reconciled: true };
		const summary = typeof input.summary === "string" ? input.summary.slice(0, 4000) : undefined;
		const next = await this.store.updateRun(run.id, { status: input.status, ...(input.status === "failed" ? { error: summary ?? "Scheduled run failed." } : { summary }), ...(input.status === "awaiting_approval" ? {} : { finishedAt: new Date().toISOString() }) });
		if (input.status === "succeeded") this.notify(task, next, "scheduled_completed", task.title, summary ?? "Scheduled task completed.");
		else if (input.status === "failed") this.notify(task, next, "scheduled_failed", task.title, summary ?? "Scheduled task failed.");
		else this.notify(task, next, "scheduled_approval_required", task.title, "This task needs your approval to continue.");
		this.broadcastRun(next); await this.changed(); return { reconciled: true };
	}
	private queueRun(taskId: string, trigger: ScheduledTaskRunTrigger): void { this.runTail = this.runTail.then(async (): Promise<void> => this.runTask(await this.store.getTask(taskId), trigger)).catch((): void => {}); }

	private async runTask(task: ScheduledTask, trigger: ScheduledTaskRunTrigger): Promise<void> {
		const scheduledAt = task.nextRunAt ?? new Date().toISOString();
		const run: ScheduledTaskRun = { id: `run-${randomUUID()}`, taskId: task.id, trigger, status: "running", scheduledAt, startedAt: new Date().toISOString() };
		await this.store.appendRun(run); this.broadcastRun(run);
		if (trigger !== "manual") await this.store.advance(task.id, new Date());
		try {
			if (task.kind === "reminder") {
				const done = await this.store.updateRun(run.id, { status: "succeeded", summary: task.prompt, finishedAt: new Date().toISOString() });
				this.notify(task, done, "scheduled_reminder", task.title, task.prompt);
				this.broadcastRun(done);
			} else {
				let result: Awaited<ReturnType<typeof runScheduledTaskWithBackend>>;
				try {
					result = await runScheduledTaskWithBackend(task, run.id, scheduledAt);
				} catch (error: unknown) {
					if (trigger === "manual" || !(error instanceof ScheduledTaskBackendStartupError)) throw error;
					const queued = await this.store.updateRun(run.id, { status: "queued", error: error.message.slice(0, 4000) });
					this.broadcastRun(queued);
					await delay(BACKEND_START_RETRY_DELAY_MS);
					await this.store.getTask(task.id);
					const retrying = await this.store.updateRun(run.id, { status: "running", startedAt: new Date().toISOString() });
					this.broadcastRun(retrying);
					result = await runScheduledTaskWithBackend(task, run.id, scheduledAt);
				}
				if (task.kind === "monitor" && result.report === null) throw new Error("scheduled_task_monitor_report_missing");
				const status = result.awaitingApproval ? "awaiting_approval" : task.kind === "monitor" ? (result.report?.changed ? "changed" : "unchanged") : "succeeded";
				const done = await this.store.updateRun(run.id, { status, sessionId: result.sessionId, summary: result.summary, finishedAt: new Date().toISOString() });
				if (status === "changed") this.notify(task, done, "scheduled_changed", task.title, result.summary);
				else if (status === "awaiting_approval") this.notify(task, done, "scheduled_approval_required", task.title, "This task needs your approval to continue.");
				else if (status === "succeeded") this.notify(task, done, "scheduled_completed", task.title, result.summary || "Scheduled task completed.");
				for (const window of BrowserWindow.getAllWindows()) if (!window.isDestroyed()) window.webContents.send("session-catalog:changed");
				this.broadcastRun(done);
			}
		} catch (error: unknown) {
			const message = error instanceof Error ? error.message : String(error);
			const failed = await this.store.updateRun(run.id, { status: "failed", error: message.slice(0, 4000), finishedAt: new Date().toISOString() });
			this.notify(task, failed, "scheduled_failed", task.title, message);
			this.broadcastRun(failed);
		}
		await this.changed();
	}

	private notify(task: ScheduledTask, run: ScheduledTaskRun, kind: "scheduled_reminder" | "scheduled_completed" | "scheduled_changed" | "scheduled_failed" | "scheduled_approval_required", title: string, body: string): void {
		nativeNotificationService.show({ kind, taskId: task.id, sessionId: run.sessionId ?? null, title, body: body.slice(0, 1000), dedupeKey: `${kind}:${run.id}` });
	}
	private broadcastRun(run: ScheduledTaskRun): void { for (const window of BrowserWindow.getAllWindows()) if (!window.isDestroyed()) window.webContents.send("scheduled-task-run:updated", run); }
	private async changed(): Promise<void> { for (const window of BrowserWindow.getAllWindows()) if (!window.isDestroyed()) window.webContents.send("scheduled-tasks:changed"); await this.reconcile(); }

	private async reconcile(): Promise<void> {
		if (this.timer !== null) clearTimeout(this.timer);
		this.timer = null;
		const tasks = await this.store.listTasks();
		const next = tasks.filter((task): boolean => task.enabled && task.nextRunAt !== null).map((task): string => task.nextRunAt!).sort()[0] ?? null;
		if (app.isPackaged) await this.windowsScheduler.synchronize(app.getPath("exe"), next).catch((): void => {});
		if (next !== null) {
			const delay = Math.max(0, Math.min(MAX_TIMER_DELAY_MS, Date.parse(next) - Date.now()));
			this.timer = setTimeout((): void => { void this.runDueTasks(); }, delay);
		}
	}
}

export const scheduledTaskService = new ScheduledTaskService(app.getPath("userData"));

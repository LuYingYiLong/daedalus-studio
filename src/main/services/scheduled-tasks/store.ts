import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import type {
	ScheduledTask,
	ScheduledTaskCreateInput,
	ScheduledTaskRepository,
	ScheduledTaskRun,
	ScheduledTaskRunRepository,
	ScheduledTaskUpdateInput,
} from "../../../contracts/scheduled-tasks";
import { calculateNextRunAt, validateSchedule } from "./schedule";

const MAX_TASKS: number = 100;
const MAX_RUNS_PER_TASK: number = 100;
const MAX_RUNS_TOTAL: number = 1000;

function isRecord(value: unknown): value is Record<string, unknown> {
	return value !== null && typeof value === "object" && !Array.isArray(value);
}

function cloneTask(task: ScheduledTask): ScheduledTask {
	return structuredClone(task);
}

function computeRevision(task: Omit<ScheduledTask, "revision">): string {
	return createHash("sha256").update(JSON.stringify(task)).digest("hex");
}

function normalizeTask(value: unknown): ScheduledTask | null {
	if (!isRecord(value)) return null;
	if (
		typeof value.id !== "string" ||
		typeof value.title !== "string" ||
		(value.kind !== "reminder" && value.kind !== "agent" && value.kind !== "monitor") ||
		typeof value.prompt !== "string" ||
		typeof value.scheduleDescription !== "string" ||
		!isRecord(value.schedule) ||
		typeof value.createdBySessionId !== "string" ||
		typeof value.enabled !== "boolean" ||
		typeof value.createdAt !== "string" ||
		typeof value.updatedAt !== "string" ||
		typeof value.revision !== "string"
	) return null;
	const schedule = value.schedule;
	if (
		(schedule.kind === "once" && typeof schedule.runAt === "string" && typeof schedule.timezone === "string") ||
		(schedule.kind === "recurring" && typeof schedule.cron === "string" && typeof schedule.timezone === "string")
	) {
		return value as ScheduledTask;
	}
	return null;
}

function normalizeRun(value: unknown): ScheduledTaskRun | null {
	if (!isRecord(value)) return null;
	return typeof value.id === "string" && typeof value.taskId === "string" &&
		typeof value.trigger === "string" && typeof value.status === "string" &&
		typeof value.scheduledAt === "string"
		? value as ScheduledTaskRun
		: null;
}

async function writeJsonAtomic(filePath: string, value: unknown): Promise<void> {
	await mkdir(dirname(filePath), { recursive: true });
	const temporaryPath: string = `${filePath}.${process.pid}.${randomUUID()}.tmp`;
	await writeFile(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
	await rename(temporaryPath, filePath);
}

export class ScheduledTaskStore {
	private tasks: ScheduledTask[] | null = null;
	private runs: ScheduledTaskRun[] | null = null;
	private updateTail: Promise<void> = Promise.resolve();

	constructor(
		private readonly tasksPath: string,
		private readonly runsPath: string,
	) {}

	async listTasks(): Promise<ScheduledTask[]> {
		await this.ensureLoaded();
		return this.tasks!.map(cloneTask);
	}

	async listRuns(taskId?: string): Promise<ScheduledTaskRun[]> {
		await this.ensureLoaded();
		return this.runs!
			.filter((run): boolean => taskId === undefined || run.taskId === taskId)
			.map((run): ScheduledTaskRun => structuredClone(run));
	}

	async getTask(taskId: string): Promise<ScheduledTask> {
		await this.ensureLoaded();
		const task: ScheduledTask | undefined = this.tasks!.find((candidate): boolean => candidate.id === taskId);
		if (task === undefined) throw new Error("scheduled_task_not_found");
		return cloneTask(task);
	}

	async create(input: ScheduledTaskCreateInput): Promise<ScheduledTask> {
		validateSchedule(input.schedule);
		return await this.enqueue(async (): Promise<ScheduledTask> => {
			if (this.tasks!.length >= MAX_TASKS) throw new Error("scheduled_task_limit_reached");
			const timestamp: string = new Date().toISOString();
			const base: Omit<ScheduledTask, "revision"> = {
				...structuredClone(input),
				id: `task-${randomUUID()}`,
				enabled: true,
				nextRunAt: calculateNextRunAt(input.schedule),
				createdAt: timestamp,
				updatedAt: timestamp,
			};
			const task: ScheduledTask = { ...base, revision: computeRevision(base) };
			this.tasks!.unshift(task);
			await this.saveTasks();
			return cloneTask(task);
		});
	}

	async update(input: ScheduledTaskUpdateInput): Promise<ScheduledTask> {
		if (input.schedule !== undefined) validateSchedule(input.schedule);
		return await this.enqueue(async (): Promise<ScheduledTask> => {
			const index: number = this.tasks!.findIndex((task): boolean => task.id === input.taskId);
			if (index < 0) throw new Error("scheduled_task_not_found");
			const current: ScheduledTask = this.tasks![index]!;
			if (input.expectedRevision !== undefined && input.expectedRevision !== current.revision) {
				throw new Error("scheduled_task_revision_conflict");
			}
			const { taskId: _taskId, expectedRevision: _revision, ...patch } = input;
			const nextSchedule = patch.schedule ?? current.schedule;
			const base: Omit<ScheduledTask, "revision"> = {
				...current,
				...structuredClone(patch),
				nextRunAt: calculateNextRunAt(nextSchedule),
				updatedAt: new Date().toISOString(),
			};
			const next: ScheduledTask = { ...base, revision: computeRevision(base) };
			this.tasks![index] = next;
			await this.saveTasks();
			return cloneTask(next);
		});
	}

	async setEnabled(taskId: string, enabled: boolean): Promise<ScheduledTask> {
		return await this.enqueue(async (): Promise<ScheduledTask> => {
			const index: number = this.tasks!.findIndex((task): boolean => task.id === taskId);
			if (index < 0) throw new Error("scheduled_task_not_found");
			const current: ScheduledTask = this.tasks![index]!;
			const base: Omit<ScheduledTask, "revision"> = {
				...current,
				enabled,
				nextRunAt: enabled ? calculateNextRunAt(current.schedule) : null,
				updatedAt: new Date().toISOString(),
			};
			const next: ScheduledTask = { ...base, revision: computeRevision(base) };
			this.tasks![index] = next;
			await this.saveTasks();
			return cloneTask(next);
		});
	}

	async advance(taskId: string, from: Date): Promise<ScheduledTask> {
		return await this.enqueue(async (): Promise<ScheduledTask> => {
			const index: number = this.tasks!.findIndex((task): boolean => task.id === taskId);
			if (index < 0) throw new Error("scheduled_task_not_found");
			const current: ScheduledTask = this.tasks![index]!;
			const nextRunAt: string | null = current.schedule.kind === "once"
				? null
				: calculateNextRunAt(current.schedule, from);
			const base: Omit<ScheduledTask, "revision"> = {
				...current,
				enabled: current.schedule.kind === "once" ? false : current.enabled,
				nextRunAt,
				updatedAt: new Date().toISOString(),
			};
			const next: ScheduledTask = { ...base, revision: computeRevision(base) };
			this.tasks![index] = next;
			await this.saveTasks();
			return cloneTask(next);
		});
	}

	async delete(taskId: string): Promise<void> {
		await this.enqueue(async (): Promise<void> => {
			const lengthBefore: number = this.tasks!.length;
			this.tasks = this.tasks!.filter((task): boolean => task.id !== taskId);
			if (lengthBefore === this.tasks.length) throw new Error("scheduled_task_not_found");
			this.runs = this.runs!.filter((run): boolean => run.taskId !== taskId);
			await Promise.all([this.saveTasks(), this.saveRuns()]);
		});
	}

	async appendRun(run: ScheduledTaskRun): Promise<ScheduledTaskRun> {
		return await this.enqueue(async (): Promise<ScheduledTaskRun> => {
			this.runs!.unshift(structuredClone(run));
			const counts: Map<string, number> = new Map();
			this.runs = this.runs!.filter((candidate): boolean => {
				const count: number = counts.get(candidate.taskId) ?? 0;
				counts.set(candidate.taskId, count + 1);
				return count < MAX_RUNS_PER_TASK;
			}).slice(0, MAX_RUNS_TOTAL);
			await this.saveRuns();
			return structuredClone(run);
		});
	}

	async updateRun(runId: string, patch: Partial<ScheduledTaskRun>): Promise<ScheduledTaskRun> {
		return await this.enqueue(async (): Promise<ScheduledTaskRun> => {
			const index: number = this.runs!.findIndex((run): boolean => run.id === runId);
			if (index < 0) throw new Error("scheduled_task_run_not_found");
			const next: ScheduledTaskRun = { ...this.runs![index]!, ...structuredClone(patch), id: runId };
			this.runs![index] = next;
			await this.saveRuns();
			return structuredClone(next);
		});
	}

	private async enqueue<T>(operation: () => Promise<T>): Promise<T> {
		await this.ensureLoaded();
		const result: Promise<T> = this.updateTail.then(operation);
		this.updateTail = result.then((): void => {}, (): void => {});
		return await result;
	}

	private async ensureLoaded(): Promise<void> {
		if (this.tasks !== null && this.runs !== null) return;
		const [tasks, runs] = await Promise.all([
			this.readRepository(this.tasksPath),
			this.readRepository(this.runsPath),
		]);
		this.tasks = isRecord(tasks) && Array.isArray(tasks.tasks)
			? tasks.tasks.map(normalizeTask).filter((task): task is ScheduledTask => task !== null).slice(0, MAX_TASKS)
			: [];
		this.runs = isRecord(runs) && Array.isArray(runs.runs)
			? runs.runs.map(normalizeRun).filter((run): run is ScheduledTaskRun => run !== null).slice(0, MAX_RUNS_TOTAL)
			: [];
	}

	private async readRepository(filePath: string): Promise<unknown> {
		try {
			const source = await readFile(filePath, "utf8");
			try { return JSON.parse(source) as unknown; }
			catch {
				await rename(filePath, `${filePath}.corrupt-${Date.now()}`).catch((): void => {});
				return null;
			}
		} catch {
			return null;
		}
	}

	private async saveTasks(): Promise<void> {
		const repository: ScheduledTaskRepository = {
			version: 1,
			tasks: this.tasks!,
			updatedAt: new Date().toISOString(),
		};
		await writeJsonAtomic(this.tasksPath, repository);
	}

	private async saveRuns(): Promise<void> {
		const repository: ScheduledTaskRunRepository = {
			version: 1,
			runs: this.runs!,
			updatedAt: new Date().toISOString(),
		};
		await writeJsonAtomic(this.runsPath, repository);
	}
}

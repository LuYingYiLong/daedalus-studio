import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { calculateNextRunAt } from "../../src/main/services/scheduled-tasks/schedule";
import { ScheduledTaskStore } from "../../src/main/services/scheduled-tasks/store";
import { createWindowsTaskXml } from "../../src/main/services/scheduled-tasks/windows-scheduler";

describe("scheduled task storage and scheduling", (): void => {
	it("calculates recurring schedules in their IANA timezone", (): void => {
		const next = calculateNextRunAt({ kind: "recurring", cron: "0 9 * * 1-5", timezone: "Asia/Shanghai" }, new Date("2026-08-21T02:00:00.000Z"));
		expect(next).toBe("2026-08-24T01:00:00.000Z");
	});

	it("writes tasks atomically and disables a completed once schedule", async (): Promise<void> => {
		const root = await mkdtemp(join(tmpdir(), "daedalus-scheduled-test-"));
		const tasksPath = join(root, "tasks.json");
		const store = new ScheduledTaskStore(tasksPath, join(root, "runs.json"));
		const task = await store.create({
			title: "Reminder",
			kind: "reminder",
			prompt: "Check the build",
			scheduleDescription: "Tomorrow",
			schedule: { kind: "once", runAt: "2030-01-01T00:00:00.000Z", timezone: "UTC" },
			target: null,
			notificationPolicy: "important_updates",
			context: null,
			createdBySessionId: "session-test",
		});
		const advanced = await store.advance(task.id, new Date("2030-01-01T00:00:01.000Z"));
		expect(advanced.enabled).toBe(false);
		expect(advanced.nextRunAt).toBeNull();
		expect(JSON.parse(await readFile(tasksPath, "utf8")).tasks).toHaveLength(1);
	});

	it("filters custom recurring schedules by their anchor interval", (): void => {
		const next = calculateNextRunAt({
			kind: "recurring",
			cron: "0 9 * * *",
			timezone: "UTC",
			recurrence: { unit: "day", interval: 3, anchorDate: "2026-08-20" },
		}, new Date("2026-08-21T10:00:00.000Z"));
		expect(next).toBe("2026-08-23T09:00:00.000Z");
	});

	it("skips months that do not contain the configured day", (): void => {
		const next = calculateNextRunAt({
			kind: "recurring",
			cron: "0 9 31 * *",
			timezone: "UTC",
			recurrence: { unit: "month", interval: 1, anchorDate: "2026-01-31", dayOfMonth: 31 },
		}, new Date("2026-03-31T10:00:00.000Z"));
		expect(next).toBe("2026-05-31T09:00:00.000Z");
	});

	it("keeps user content out of the Windows command line", (): void => {
		const xml = createWindowsTaskXml("C:\\Program Files\\Daedalus Studio\\Daedalus Studio.exe", new Date("2030-01-01T00:00:00"));
		expect(xml).toContain("--scheduled-task-runner");
		expect(xml).not.toContain("task prompt");
		expect(xml).toContain("LeastPrivilege");
		expect(xml).toContain("StartWhenAvailable");
	});
});

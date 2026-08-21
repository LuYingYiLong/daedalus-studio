import { CronExpressionParser } from "cron-parser";
import type { ScheduledTaskSchedule } from "../../../contracts/scheduled-tasks";

const FIVE_FIELD_CRON_PATTERN: RegExp = /^\S+\s+\S+\s+\S+\s+\S+\s+\S+$/u;

export function assertValidTimezone(timezone: string): void {
	if (timezone.length < 1 || timezone.length > 100) {
		throw new Error("scheduled_task_timezone_invalid");
	}
	try {
		new Intl.DateTimeFormat("en-US", { timeZone: timezone }).format(new Date());
	} catch {
		throw new Error("scheduled_task_timezone_invalid");
	}
}

export function calculateNextRunAt(
	schedule: ScheduledTaskSchedule,
	from: Date = new Date(),
): string | null {
	assertValidTimezone(schedule.timezone);
	if (schedule.kind === "once") {
		const runAtMs: number = Date.parse(schedule.runAt);
		if (!Number.isFinite(runAtMs)) {
			throw new Error("scheduled_task_run_at_invalid");
		}
		return runAtMs > from.getTime() ? new Date(runAtMs).toISOString() : null;
	}
	if (!FIVE_FIELD_CRON_PATTERN.test(schedule.cron.trim())) {
		throw new Error("scheduled_task_cron_must_have_five_fields");
	}
	const expression = CronExpressionParser.parse(schedule.cron.trim(), {
		currentDate: from,
		tz: schedule.timezone,
		strict: false,
	});
	return expression.next().toDate().toISOString();
}

export function validateSchedule(schedule: ScheduledTaskSchedule, now: Date = new Date()): void {
	const nextRunAt: string | null = calculateNextRunAt(schedule, now);
	if (schedule.kind === "once" && nextRunAt === null) {
		throw new Error("scheduled_task_run_at_must_be_future");
	}
}


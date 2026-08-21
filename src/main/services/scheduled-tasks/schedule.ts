import { CronExpressionParser } from "cron-parser";
import type { ScheduledTaskSchedule } from "../../../contracts/scheduled-tasks";

const FIVE_FIELD_CRON_PATTERN: RegExp = /^\S+\s+\S+\s+\S+\s+\S+\s+\S+$/u;
const MAX_RECURRENCE_CANDIDATES: number = 10_000;

type CalendarDate = { year: number; month: number; day: number; weekday: number };

function parseAnchorDate(value: string): CalendarDate {
	const match: RegExpMatchArray | null = /^(\d{4})-(\d{2})-(\d{2})$/u.exec(value);
	if (match === null) throw new Error("scheduled_task_recurrence_anchor_invalid");
	const year: number = Number(match[1]);
	const month: number = Number(match[2]);
	const day: number = Number(match[3]);
	const timestamp: number = Date.UTC(year, month - 1, day);
	const date = new Date(timestamp);
	if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
		throw new Error("scheduled_task_recurrence_anchor_invalid");
	}
	return { year, month, day, weekday: date.getUTCDay() };
}

function calendarDateInTimezone(value: Date, timezone: string): CalendarDate {
	const parts = new Intl.DateTimeFormat("en-US", {
		timeZone: timezone,
		year: "numeric",
		month: "numeric",
		day: "numeric",
		weekday: "short",
	}).formatToParts(value);
	const part = (type: Intl.DateTimeFormatPartTypes): string =>
		parts.find((candidate): boolean => candidate.type === type)?.value ?? "";
	const weekdayNames: string[] = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
	return {
		year: Number(part("year")),
		month: Number(part("month")),
		day: Number(part("day")),
		weekday: weekdayNames.indexOf(part("weekday")),
	};
}

function utcDayIndex(value: CalendarDate): number {
	return Math.floor(Date.UTC(value.year, value.month - 1, value.day) / 86_400_000);
}

function matchesRecurrence(schedule: Extract<ScheduledTaskSchedule, { kind: "recurring" }>, candidate: Date): boolean {
	const recurrence = schedule.recurrence;
	if (recurrence === undefined) return true;
	const anchor = parseAnchorDate(recurrence.anchorDate);
	const current = calendarDateInTimezone(candidate, schedule.timezone);
	if (recurrence.unit === "day") {
		return utcDayIndex(current) >= utcDayIndex(anchor)
			&& (utcDayIndex(current) - utcDayIndex(anchor)) % recurrence.interval === 0;
	}
	if (recurrence.unit === "week") {
		const anchorWeekStart = utcDayIndex(anchor) - ((anchor.weekday + 6) % 7);
		const currentWeekStart = utcDayIndex(current) - ((current.weekday + 6) % 7);
		const weekDifference = Math.floor((currentWeekStart - anchorWeekStart) / 7);
		return utcDayIndex(current) >= utcDayIndex(anchor)
			&& weekDifference >= 0
			&& weekDifference % recurrence.interval === 0
			&& recurrence.weekdays.includes(current.weekday);
	}
	const monthDifference = (current.year - anchor.year) * 12 + current.month - anchor.month;
	return monthDifference >= 0
		&& monthDifference % recurrence.interval === 0
		&& current.day === recurrence.dayOfMonth;
}

function validateRecurrence(schedule: Extract<ScheduledTaskSchedule, { kind: "recurring" }>): void {
	const recurrence = schedule.recurrence;
	if (recurrence === undefined) return;
	parseAnchorDate(recurrence.anchorDate);
	if (!Number.isInteger(recurrence.interval) || recurrence.interval < 1 || recurrence.interval > 30) {
		throw new Error("scheduled_task_recurrence_interval_invalid");
	}
	if (recurrence.unit === "week") {
		if (recurrence.weekdays.length < 1 || recurrence.weekdays.some((day): boolean => !Number.isInteger(day) || day < 0 || day > 6)) {
			throw new Error("scheduled_task_recurrence_weekdays_invalid");
		}
	}
	if (recurrence.unit === "month" && (!Number.isInteger(recurrence.dayOfMonth) || recurrence.dayOfMonth < 1 || recurrence.dayOfMonth > 31)) {
		throw new Error("scheduled_task_recurrence_month_day_invalid");
	}
}

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
	validateRecurrence(schedule);
	const expression = CronExpressionParser.parse(schedule.cron.trim(), {
		currentDate: from,
		tz: schedule.timezone,
		strict: false,
	});
	for (let index = 0; index < MAX_RECURRENCE_CANDIDATES; index += 1) {
		const candidate = expression.next().toDate();
		if (matchesRecurrence(schedule, candidate)) return candidate.toISOString();
	}
	throw new Error("scheduled_task_recurrence_no_candidate");
}

export function validateSchedule(schedule: ScheduledTaskSchedule, now: Date = new Date()): void {
	const nextRunAt: string | null = calculateNextRunAt(schedule, now);
	if (schedule.kind === "once" && nextRunAt === null) {
		throw new Error("scheduled_task_run_at_must_be_future");
	}
}

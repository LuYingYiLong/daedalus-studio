import type { TFunction } from "i18next";
import type { ScheduledTaskSchedule } from "../../../../contracts/scheduled-tasks";
import type { ManualScheduledTaskFormValues } from "./manual-scheduled-task-types";

export type BuiltManualSchedule = {
	schedule: ScheduledTaskSchedule;
	description: string;
};

function cronTime(anchor: ManualScheduledTaskFormValues["anchor"]): string {
	return `${anchor.minute()} ${anchor.hour()}`;
}

export function buildManualSchedule(
	values: ManualScheduledTaskFormValues,
	timezone: string,
	locale: string,
	t: TFunction,
): BuiltManualSchedule {
	const anchorDate = values.anchor.format("YYYY-MM-DD");
	const formatted = new Intl.DateTimeFormat(locale, {
		dateStyle: "medium",
		timeStyle: "short",
		timeZone: timezone,
	}).format(values.anchor.toDate());
	if (values.repeat === "once") {
		return {
			schedule: { kind: "once", runAt: values.anchor.toISOString(), timezone },
			description: t("scheduledTasks.manual.schedule.onceDescription", { time: formatted }),
		};
	}
	const time = cronTime(values.anchor);
	if (values.repeat === "daily") return {
		schedule: { kind: "recurring", cron: `${time} * * *`, timezone },
		description: t("scheduledTasks.manual.schedule.dailyDescription", { time: values.anchor.format("HH:mm") }),
	};
	if (values.repeat === "weekdays") return {
		schedule: { kind: "recurring", cron: `${time} * * 1-5`, timezone },
		description: t("scheduledTasks.manual.schedule.weekdaysDescription", { time: values.anchor.format("HH:mm") }),
	};
	if (values.repeat === "weekly") return {
		schedule: { kind: "recurring", cron: `${time} * * ${values.anchor.day()}`, timezone },
		description: t("scheduledTasks.manual.schedule.weeklyDescription", { time: formatted }),
	};
	if (values.repeat === "monthly") return {
		schedule: { kind: "recurring", cron: `${time} ${values.anchor.date()} * *`, timezone },
		description: t("scheduledTasks.manual.schedule.monthlyDescription", { day: values.anchor.date(), time: values.anchor.format("HH:mm") }),
	};
	const interval = values.interval;
	if (values.customUnit === "day") return {
		schedule: {
			kind: "recurring",
			cron: `${time} * * *`,
			timezone,
			recurrence: { unit: "day", interval, anchorDate },
		},
		description: t("scheduledTasks.manual.schedule.customDayDescription", { interval, time: values.anchor.format("HH:mm") }),
	};
	if (values.customUnit === "week") return {
		schedule: {
			kind: "recurring",
			cron: `${time} * * ${values.weekdays.join(",")}`,
			timezone,
			recurrence: { unit: "week", interval, anchorDate, weekdays: values.weekdays },
		},
		description: t("scheduledTasks.manual.schedule.customWeekDescription", { interval, time: values.anchor.format("HH:mm") }),
	};
	return {
		schedule: {
			kind: "recurring",
			cron: `${time} ${values.anchor.date()} * *`,
			timezone,
			recurrence: { unit: "month", interval, anchorDate, dayOfMonth: values.anchor.date() },
		},
		description: t("scheduledTasks.manual.schedule.customMonthDescription", { interval, day: values.anchor.date(), time: values.anchor.format("HH:mm") }),
	};
}

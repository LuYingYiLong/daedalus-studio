import type { Dayjs } from "dayjs";
import type { ScheduledTaskKind, ScheduledTaskNotificationPolicy } from "../../../../contracts/scheduled-tasks";

export type ManualScheduledTaskFormValues = {
	title: string;
	prompt: string;
	kind: Extract<ScheduledTaskKind, "agent" | "monitor">;
	targetKind: "new_session" | "existing_session";
	workspaceId: string | null;
	modelRef: string;
	reasoningEffort?: string;
	sessionId?: string;
	repeat: "once" | "daily" | "weekdays" | "weekly" | "monthly" | "custom";
	anchor: Dayjs;
	customUnit: "day" | "week" | "month";
	interval: number;
	weekdays: number[];
	notificationPolicy: ScheduledTaskNotificationPolicy;
};

export type ManualScheduledTaskModelOption = {
	value: string;
	providerId: string;
	providerName: string;
	modelId: string;
	modelName: string;
	reasoningEfforts: Array<{ id: string; default?: boolean }>;
};

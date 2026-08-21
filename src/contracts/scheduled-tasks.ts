export type ScheduledTaskKind = "reminder" | "agent" | "monitor";

export type ScheduledTaskExecutionPolicy = "read_only" | "auto_safe";

export type ScheduledTaskSchedule =
	| {
		kind: "once";
		runAt: string;
		timezone: string;
	}
	| {
		kind: "recurring";
		cron: string;
		timezone: string;
	};

export type ScheduledTaskContextSnapshot = {
	workspaceId: string | null;
	provider: string;
	model: string;
	reasoningEffort: string | null;
	executionPolicy: ScheduledTaskExecutionPolicy;
};

export type ScheduledTask = {
	id: string;
	title: string;
	kind: ScheduledTaskKind;
	prompt: string;
	scheduleDescription: string;
	schedule: ScheduledTaskSchedule;
	context: ScheduledTaskContextSnapshot | null;
	createdBySessionId: string;
	enabled: boolean;
	nextRunAt: string | null;
	createdAt: string;
	updatedAt: string;
	revision: string;
};

export type ScheduledTaskRunTrigger = "scheduled" | "catch_up" | "manual";

export type ScheduledTaskRunStatus =
	| "queued"
	| "running"
	| "succeeded"
	| "unchanged"
	| "changed"
	| "awaiting_approval"
	| "failed"
	| "cancelled";

export type ScheduledTaskRun = {
	id: string;
	taskId: string;
	trigger: ScheduledTaskRunTrigger;
	status: ScheduledTaskRunStatus;
	scheduledAt: string;
	startedAt?: string;
	finishedAt?: string;
	sessionId?: string;
	summary?: string;
	error?: string;
};

export type ScheduledTaskRepository = {
	version: 1;
	tasks: ScheduledTask[];
	updatedAt: string;
};

export type ScheduledTaskRunRepository = {
	version: 1;
	runs: ScheduledTaskRun[];
	updatedAt: string;
};

export type ScheduledTaskListResult = {
	tasks: ScheduledTask[];
	attentionCount: number;
	platformSupported: boolean;
};

export type ScheduledTaskCreateInput = {
	title: string;
	kind: ScheduledTaskKind;
	prompt: string;
	scheduleDescription: string;
	schedule: ScheduledTaskSchedule;
	context: ScheduledTaskContextSnapshot | null;
	createdBySessionId: string;
};

export type ScheduledTaskUpdateInput = Partial<
	Pick<
		ScheduledTask,
		"title" | "kind" | "prompt" | "scheduleDescription" | "schedule" | "context"
	>
> & {
	taskId: string;
	expectedRevision?: string;
};

export type ScheduledTaskToolRequest = {
	callId: string;
	sessionId: string;
	toolName: string;
	args: Record<string, unknown>;
	timeoutMs: number;
};

export type ScheduledTaskToolResult = {
	callId: string;
	ok: boolean;
	result?: Record<string, unknown>;
	error?: {
		code: string;
		message: string;
		retryable: boolean;
	};
};


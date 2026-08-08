import type { TimelineBodyPart } from "@/platform/rpc/types";

export type TimelineToolPart = Extract<TimelineBodyPart, { type: "tool" }>;

export type TimelineToolEventType = "tool.call" | "tool.result" | "tool.error" | "tool.approval_required" | "tool.approved" | "tool.rejected" | "tool.progress";

/** Accepts both current normalized event types and legacy persisted agent.* types. */
export function isTimelineToolEventType(event: Record<string, unknown>, type: TimelineToolEventType): boolean {
	return event.type === type || event.type === `agent.${type}`;
}

export type FileEditSummaryItem = {
	path: string;
	sourceFolderId?: string;
	additions: number;
	deletions: number;
};

export type FileEditBatchSummary = {
	batchId: string;
	sessionId?: string;
	editedFileCount: number;
	sourceFolderId?: string;
	additions: number;
	deletions: number;
	editedFiles: FileEditSummaryItem[];
};

export type ToolRecoveryDisplay = {
	recoveryKey: string;
	attempt: number;
	maxAttempts: number;
	status: "failed" | "recovered" | "exhausted";
};

export type TerminalDisplay = {
	stdout: string;
	stderr: string;
	stdoutOmittedChars: number;
	stderrOmittedChars: number;
	commandLine: string;
	cwd: string;
	executionMode: "wait" | "job";
	sandboxMode?: string;
	status: string;
	exitCode: number | null;
	durationMs?: number;
	jobId?: string;
	truncated: boolean;
};

function getToolName(part: TimelineToolPart): string {
	return part.events.map((event: Record<string, unknown>): string => typeof event.toolName === "string" ? event.toolName : "")
		.find((toolName: string): boolean => toolName.length > 0) ?? "";
}

export function isTerminalCommandPart(part: TimelineToolPart): boolean {
	return getToolName(part) === "mcp_terminal_run_command";
}

export type TimelineToolCategory = "terminal" | "file_edit" | "tool";

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function getFiniteNumber(value: unknown): number | undefined {
	return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function getStringValue(event: Record<string, unknown> | undefined, key: string): string | undefined {
	const value: unknown = event?.[key];
	return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function getLatestEvent(events: Record<string, unknown>[], type: TimelineToolEventType): Record<string, unknown> | undefined {
	return [...events].reverse().find((event: Record<string, unknown>): boolean => isTimelineToolEventType(event, type));
}

function parseRecovery(value: unknown): ToolRecoveryDisplay | undefined {
	if (!isRecord(value)) return undefined;
	const attempt: number | undefined = getFiniteNumber(value.attempt);
	const maxAttempts: number | undefined = getFiniteNumber(value.maxAttempts);
	if (
		typeof value.recoveryKey !== "string"
		|| attempt === undefined
		|| maxAttempts === undefined
		|| (value.status !== "failed" && value.status !== "recovered" && value.status !== "exhausted")
	) {
		return undefined;
	}
	return {
		recoveryKey: value.recoveryKey,
		attempt,
		maxAttempts,
		status: value.status
	};
}

export function getToolRecovery(events: Record<string, unknown>[]): ToolRecoveryDisplay | undefined {
	for (const event of [...events].reverse()) {
		const direct: ToolRecoveryDisplay | undefined = parseRecovery(event.recovery);
		if (direct !== undefined) return direct;
		if (isRecord(event.failure) && isRecord(event.failure.details)) {
			const nested: ToolRecoveryDisplay | undefined = parseRecovery(event.failure.details.recovery);
			if (nested !== undefined) return nested;
		}
	}
	return undefined;
}

export function getSourceFolderId(events: Record<string, unknown>[]): string | undefined {
	for (const event of [...events].reverse()) {
		const direct: string | undefined = getStringValue(event, "sourceFolderId");
		if (direct !== undefined) return direct;
		if (isRecord(event.args)) {
			const fromArgs: string | undefined = getStringValue(event.args, "sourceFolderId");
			if (fromArgs !== undefined) return fromArgs;
		}
	}
	return undefined;
}

export function getFileEditBatch(events: Record<string, unknown>[]): FileEditBatchSummary | undefined {
	const result: Record<string, unknown> | undefined = getLatestEvent(events, "tool.result");
	if (result === undefined || result.ok === false || !isRecord(result.fileEditBatch)) {
		return undefined;
	}

	const batch: Record<string, unknown> = result.fileEditBatch;
	const batchId: string | undefined = getStringValue(batch, "batchId");
	const sessionId: string | undefined = getStringValue(batch, "sessionId");
	const sourceFolderId: string | undefined = getStringValue(batch, "sourceFolderId");
	if (batchId === undefined) {
		return undefined;
	}

	const editedFiles: FileEditSummaryItem[] = Array.isArray(batch.editedFiles)
		? batch.editedFiles.flatMap((value: unknown): FileEditSummaryItem[] => {
			if (!isRecord(value) || typeof value.path !== "string") {
				return [];
			}
			return [{
				path: value.path,
				sourceFolderId: getStringValue(value, "sourceFolderId") ?? sourceFolderId,
				additions: getFiniteNumber(value.additions) ?? 0,
				deletions: getFiniteNumber(value.deletions) ?? 0
			}];
		})
		: [];
	const editedFileCount: number = getFiniteNumber(batch.editedFileCount) ?? editedFiles.length;
	if (editedFileCount <= 0) {
		return undefined;
	}

	return {
		batchId,
		sessionId,
		editedFileCount,
		sourceFolderId,
		additions: getFiniteNumber(batch.additions) ?? editedFiles.reduce((total: number, file: FileEditSummaryItem): number => total + file.additions, 0),
		deletions: getFiniteNumber(batch.deletions) ?? editedFiles.reduce((total: number, file: FileEditSummaryItem): number => total + file.deletions, 0),
		editedFiles
	};
}

/** Categorizes a tool using the same structured result parser as ToolPart. */
export function getTimelineToolCategory(part: TimelineToolPart): TimelineToolCategory {
	if (isTerminalCommandPart(part)) return "terminal";
	return getFileEditBatch(part.events) === undefined ? "tool" : "file_edit";
}

export function readTerminalDisplay(part: TimelineToolPart): TerminalDisplay {
	const callEvent: Record<string, unknown> | undefined = getLatestEvent(part.events, "tool.call")
		?? getLatestEvent(part.events, "tool.approval_required");
	const args: Record<string, unknown> = isRecord(callEvent?.args) ? callEvent.args : {};
	const resultEvent: Record<string, unknown> | undefined = getLatestEvent(part.events, "tool.result");
	const persisted: Record<string, unknown> = isRecord(resultEvent?.terminalDisplay) ? resultEvent.terminalDisplay : {};
	const progressEvent: Record<string, unknown> | undefined = [...part.events].reverse()
		.find((event: Record<string, unknown>): boolean => event.code === "terminal_output");
	const runtime: Record<string, unknown> = isRecord(progressEvent?.terminalRuntimeOutput) ? progressEvent.terminalRuntimeOutput : {};
	const exitCode: number | undefined = getFiniteNumber(persisted.exitCode) ?? getFiniteNumber(resultEvent?.exitCode);
	const executionMode: "wait" | "job" = getStringValue(persisted, "executionMode") === "job" || args.executionMode === "job" ? "job" : "wait";

	return {
		commandLine: redactCommandLine(getStringValue(persisted, "commandLine") || getStringValue(args, "commandLine") || ""),
		cwd: getStringValue(persisted, "cwd") || getStringValue(args, "cwd") || ".",
		executionMode,
		sandboxMode: getStringValue(persisted, "sandboxMode") || undefined,
		status: getStringValue(persisted, "status") || getStringValue(resultEvent, "terminalJobStatus") || "",
		exitCode: exitCode ?? null,
		durationMs: getFiniteNumber(persisted.durationMs),
		jobId: getStringValue(persisted, "jobId") || getStringValue(resultEvent, "terminalJobId") || undefined,
		stdout: getStringValue(persisted, "stdout") || getStringValue(runtime, "stdout") || "",
		stderr: getStringValue(persisted, "stderr") || getStringValue(runtime, "stderr") || "",
		stdoutOmittedChars: getFiniteNumber(persisted.stdoutOmittedChars) ?? getFiniteNumber(runtime.stdoutOmittedChars) ?? 0,
		stderrOmittedChars: getFiniteNumber(persisted.stderrOmittedChars) ?? getFiniteNumber(runtime.stderrOmittedChars) ?? 0,
		truncated: persisted.truncated === true
	};
}

function redactCommandLine(value: string): string {
	return value
		.replace(/(Authorization\s*:\s*Bearer\s+)[^\s,;]+/giu, "$1[REDACTED]")
		.replace(/(\bBearer\s+)[A-Za-z0-9._~+/=-]+/giu, "$1[REDACTED]")
		.replace(/\b([A-Z0-9_]*(?:API[_-]?KEY|TOKEN|SECRET|PASSWORD|PASSWD))\s*([=:])\s*(?:"[^"]*"|'[^']*'|[^\s,;]+)/giu, "$1$2[REDACTED]");
}

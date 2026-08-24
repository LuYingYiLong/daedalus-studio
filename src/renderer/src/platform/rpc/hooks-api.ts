import { createBackendClient } from "@/platform/rpc/transport/backend-client";

export type HookEventName =
	| "SessionStart"
	| "SessionEnd"
	| "UserPromptSubmit"
	| "PreToolUse"
	| "PermissionRequest"
	| "PostToolUse"
	| "PreCompact"
	| "PostCompact"
	| "Stop";

export type HookConfigTarget = {
	scope: "global" | "source";
	workspaceId?: string;
	sourceFolderId?: string;
};

export type HookConfigSource = HookConfigTarget & {
	id: string;
	path: string;
	displayName: string;
	rootPath: string;
};

export type HookHandlerSummary = {
	event: HookEventName;
	matcher: string;
	index: number;
	handlerIndex: number;
	command: string;
	commandWindows?: string;
	statusMessage?: string;
	async: boolean;
	failurePolicy: "continue" | "block";
	fingerprint: string;
	trust: "trusted" | "disabled" | "review_required";
};

export type HookConfigDocument = {
	source: HookConfigSource;
	exists: boolean;
	content: string;
	revision: string;
	valid: boolean;
	errors: string[];
	description?: string;
	handlers: HookHandlerSummary[];
};

export type HookRunRecord = {
	id: string;
	sessionId: string;
	turnId?: string;
	event: HookEventName;
	sourceId: string;
	fingerprint: string;
	status:
		| "completed"
		| "blocked"
		| "failed"
		| "timed_out"
		| "cancelled"
		| "queued";
	startedAt: string;
	durationMs: number;
	exitCode: number | null;
	async: boolean;
	message?: string;
	stderr?: string;
};

export async function listHookConfigSources(
	workspaceId?: string,
): Promise<HookConfigDocument[]> {
	const client = await createBackendClient();
	const result = await client.request<{ sources: HookConfigDocument[] }>(
		"hooks.config.sources.list",
		workspaceId === undefined ? {} : { workspaceId },
	);
	return result.sources;
}

export async function getHookConfig(
	target: HookConfigTarget,
): Promise<HookConfigDocument> {
	const client = await createBackendClient();
	return client.request<HookConfigDocument>("hooks.config.get", target);
}

export async function updateHookConfig(
	target: HookConfigTarget,
	content: string,
	expectedRevision: string,
): Promise<HookConfigDocument> {
	const client = await createBackendClient();
	return client.request<HookConfigDocument>("hooks.config.update", {
		...target,
		content,
		expectedRevision,
	});
}

export async function updateHookTrust(
	target: HookConfigTarget,
	fingerprint: string,
	status: "trusted" | "disabled",
): Promise<HookConfigDocument> {
	const client = await createBackendClient();
	return client.request<HookConfigDocument>("hooks.trust.update", {
		...target,
		fingerprint,
		status,
	});
}

export async function listHookRuns(
	limit: number = 100,
): Promise<HookRunRecord[]> {
	const client = await createBackendClient();
	const result = await client.request<{ runs: HookRunRecord[] }>(
		"hooks.runs.list",
		{ limit },
	);
	return result.runs;
}

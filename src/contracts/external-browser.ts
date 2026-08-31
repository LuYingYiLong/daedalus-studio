export type ExternalBrowserScope = {
	connectionId: string;
	sessionId: string;
	requestId: string;
	runId: string;
	generation: string;
};
export type ExternalBrowserRequest = {
	callId: string;
	toolCallId: string;
	scope: ExternalBrowserScope;
	toolName: string;
	args: Record<string, unknown>;
};
export type ExternalBrowserContext = {
	connectionId: string;
	sessionId: string | null;
	workspaceId: string | null;
};
export type ExternalBrowserState = {
	available: boolean;
	enabled: boolean;
	defaultConnectionId: string | null;
	connections: { id: string; name: string }[];
	active: ExternalBrowserScope | null;
	error: string | null;
};
export type ExternalBrowserApi = {
	getState(): Promise<ExternalBrowserState>;
	configure(patch: {
		enabled?: boolean;
		defaultConnectionId?: string | null;
	}): Promise<ExternalBrowserState>;
	install(): Promise<void>;
	setContext(context: ExternalBrowserContext | null): Promise<void>;
	execute(request: ExternalBrowserRequest): Promise<Record<string, unknown>>;
	finish(scope: ExternalBrowserScope, keepTarget: boolean): Promise<void>;
	heartbeat(scope: ExternalBrowserScope): Promise<void>;
	stop(): Promise<void>;
	onState(listener: (state: ExternalBrowserState) => void): () => void;
	onRevoked(listener: (scope: ExternalBrowserScope) => void): () => void;
};
export function browserObject(value: unknown): Record<string, unknown> {
	if (!value || typeof value !== "object" || Array.isArray(value))
		throw new Error("browser_invalid_message");
	return value as Record<string, unknown>;
}
export function browserId(value: unknown): string {
	if (typeof value !== "string" || !/^[a-zA-Z0-9:_-]{1,160}$/u.test(value))
		throw new Error("browser_invalid_id");
	return value;
}
export function parseBrowserScope(value: unknown): ExternalBrowserScope {
	const row = browserObject(value);
	if (
		Object.keys(row).sort().join() !==
		"connectionId,generation,requestId,runId,sessionId"
	)
		throw new Error("browser_invalid_scope");
	return {
		connectionId: browserId(row.connectionId),
		sessionId: browserId(row.sessionId),
		requestId: browserId(row.requestId),
		runId: browserId(row.runId),
		generation: browserId(row.generation),
	};
}
export function normalizeExternalBrowserUrl(value: unknown): string {
	if (typeof value !== "string" || value.length > 4096)
		throw new Error("browser_url_invalid");
	const url = new URL(value);
	if (
		!["https:", "http:"].includes(url.protocol) ||
		url.username ||
		url.password
	)
		throw new Error("browser_url_invalid");
	return url.href;
}
export const sameBrowserScope = (
	a: ExternalBrowserScope | null,
	b: ExternalBrowserScope,
): boolean =>
	!!a &&
	a.connectionId === b.connectionId &&
	a.sessionId === b.sessionId &&
	a.requestId === b.requestId &&
	a.runId === b.runId &&
	a.generation === b.generation;

export function parseBrowserSteps(value: unknown): Record<string, unknown>[] {
	if (!Array.isArray(value) || value.length < 1 || value.length > 20)
		throw new Error("browser_steps_invalid");
	const prior = new Set<string>();
	return value.map((raw) => {
		const step = browserObject(raw),
			id = browserId(step.id);
		if (
			Object.keys(step).some(
				(key) =>
					![
						"id",
						"elementId",
						"action",
						"value",
						"checked",
						"description",
						"dependsOn",
					].includes(key),
			) ||
			prior.has(id) ||
			!Number.isInteger(step.elementId) ||
			Number(step.elementId) < 0 ||
			Number(step.elementId) >= 200 ||
			!["click", "fill", "select", "check", "submit"].includes(
				String(step.action),
			) ||
			typeof step.description !== "string" ||
			!step.description.trim() ||
			step.description.length > 1000 ||
			!Array.isArray(step.dependsOn) ||
			step.dependsOn.length > 20 ||
			step.dependsOn.some((key) => !prior.has(key))
		)
			throw new Error("browser_steps_invalid");
		if (
			["fill", "select"].includes(String(step.action))
				? typeof step.value !== "string" || step.value.length > 16000
				: step.value !== undefined
		)
			throw new Error("browser_steps_invalid");
		if (
			step.action === "check"
				? typeof step.checked !== "boolean"
				: step.checked !== undefined
		)
			throw new Error("browser_steps_invalid");
		prior.add(id);
		return structuredClone(step);
	});
}

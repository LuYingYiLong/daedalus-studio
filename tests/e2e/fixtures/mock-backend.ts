import { WebSocketServer, type WebSocket } from "ws";

export type MockRpcRequest = {
	id: string;
	method: string;	
	params: unknown;
	connectionId: string;
	receivedAt: number;
};

export type MockRpcHandler = (
	request: MockRpcRequest,
) => unknown | Promise<unknown>;

type RpcRequestEnvelope = {
	protocolVersion?: unknown;
	type?: unknown;
	id?: unknown;
	method?: unknown;
	params?: unknown;
};

type Connection = {
	id: string;
	socket: WebSocket;
};

export type MockBackendOptions = {
	port?: number;
	handlers?: Record<string, MockRpcHandler>;
};

const DEFAULT_PORT: number = 38181;
const MOCK_NOW: string = "2026-08-24T00:00:00.000Z";

function createEmptyWorkbench(sessionId: string | null = null): Record<string, unknown> {
	return {
		revision: 0,
		sessionId,
		composer: {
			text: "",
			chatMode: "agent",
			provider: "openai",
			providerDisplayName: "OpenAI",
			model: "gpt-4o-mini",
			reasoningEffort: "medium",
			additionalContext: [],
		},
		messageQueue: [],
		pendingGuides: [],
		activeRun: { status: "idle" },
		pendingApproval: { count: 0, first: null },
		pendingToolBudget: null,
		nextStepHints: { hints: [] },
		activeSelection: {
			workspaceId: null,
			workspaceName: null,
			workspaceRoot: null,
		},
	};
}

function createDefaultHandlers(): Record<string, MockRpcHandler> {
	let nextStepHintsEnabled: boolean = false;
	let autoCompactActivityDetails: boolean = true;
	const provider = {
		provider: "openai",
		displayName: "OpenAI",
		configured: true,
		selected: true,
		selectedModel: "gpt-4o-mini",
		selectedModelDisplayName: "GPT-4o mini",
		defaultModel: "gpt-4o-mini",
		baseUrl: "https://api.openai.com/v1",
		custom: false,
		enabled: true,
		providerType: null,
		ready: true,
		apiKeyMasked: "sk-e2e",
		modelsSource: "fallback",
		models: [
			{
				id: "gpt-4o-mini",
				displayName: "GPT-4o mini",
				provider: "openai",
				endpointType: "openai-chat-completions",
				contextWindowTokens: 128000,
				maxOutputTokens: 4096,
				capabilities: { tools: true, reasoning: false },
			},
		],
	};

	return {
		"backend.health": () => ({
			name: "godot-daedalus-backend",
			version: "e2e",
			pid: process.pid,
			mode: "e2e",
			port: DEFAULT_PORT,
			distribution: "sea",
			runtime: {
				nodeVersion: process.version,
				platform: process.platform,
				arch: process.arch,
			},
			multiClient: { enabled: true, protocolVersion: 3 },
			logPath: null,
		}),
		"client.hello": () => ({
			connection: {
				connectionId: "e2e-connection",
				clientType: "studio",
				clientName: "Daedalus Studio",
				connectedAt: MOCK_NOW,
				capabilities: {},
			},
			multiClient: { enabled: true, protocolVersion: 3 },
		}),
		"client.capabilities.update": () => ({ updated: true }),
		"generalSettings.get": () => ({
			schemaVersion: 4,
			nextStepHintsEnabled,
			autoCompactActivityDetails,
			godotExecutablePath: null,
			godotExecutableVersion: null,
			godotExecutableStatus: "unconfigured",
			godotExecutableError: null,
			updatedAt: MOCK_NOW,
		}),
		"generalSettings.update": ({ params }) => {
			const patch = (params ?? {}) as { nextStepHintsEnabled?: boolean; autoCompactActivityDetails?: boolean };
			if (patch.nextStepHintsEnabled !== undefined) {
				nextStepHintsEnabled = patch.nextStepHintsEnabled;
			}
			if (patch.autoCompactActivityDetails !== undefined) {
				autoCompactActivityDetails = patch.autoCompactActivityDetails;
			}
			return {
				schemaVersion: 4,
				nextStepHintsEnabled,
				autoCompactActivityDetails,
				godotExecutablePath: null,
				godotExecutableVersion: null,
				godotExecutableStatus: "unconfigured",
				godotExecutableError: null,
				updatedAt: MOCK_NOW,
			};
		},
		"godotDocumentation.get": () => ({
			schemaVersion: 2,
			enabled: false,
			documents: [],
			activeJob: null,
		}),
		"godotDocumentation.branches.list": () => ({
			branches: [],
			recommendedBranch: null,
			stale: false,
		}),
		"provider.modelSelection.get": () => ({
			activeModel: { providerId: "openai", modelId: "gpt-4o-mini" },
			current: {
				provider: "openai",
				displayName: "OpenAI",
				configured: true,
				model: "gpt-4o-mini",
				modelDisplayName: "GPT-4o mini",
				baseUrl: "https://api.openai.com/v1",
				apiKeyMasked: "sk-e2e",
			},
			providers: [provider],
			modelRouting: {
				imageRecognition: null,
				sessionTitle: null,
				nextStepHints: null,
				imageGeneration: null,
				gitCommit: null,
				commandReview: null,
				goalEvaluator: null,
				contextCompression: null,
			},
		}),
		"provider.config.set": () => ({ updated: true, usages: [], selection: null }),
		"provider.models.list": () => ({ provider: "openai", models: provider.models, stale: false, source: "fallback" }),
		"workspace.list": () => ({ workspaces: [], active: null, connected: [] }),
		"workspace.tree.order.get": () => ({
			schemaVersion: 2,
			workspaceIds: [],
			sessionIdsByWorkspace: {},
			pinnedSessionIds: [],
			recentSessionIds: [],
			expandedSectionKeys: ["pinned", "projects", "recent"],
			expandedWorkspaceIds: [],
			updatedAt: MOCK_NOW,
		}),
		"workspace.tree.order.update": ({ params }) => ({
			...(params as Record<string, unknown>),
			schemaVersion: 2,
			updatedAt: MOCK_NOW,
		}),
		"workspace.git.diff.summary.get": ({ params }) => ({
			workspaceId: (params as { workspaceId?: string } | undefined)?.workspaceId ?? "e2e-workspace",
			hasGitRepository: false,
			branch: null,
			additions: 0,
			deletions: 0,
			changedFiles: 0,
			untrackedFiles: 0,
			files: [],
			nextCursor: null,
			generatedAt: MOCK_NOW,
		}),
		"session.list": () => ({ sessions: [] }),
		"session.timeline": ({ params }) => ({
			timeline: true,
			sessionId: (params as { sessionId?: string } | undefined)?.sessionId ?? "e2e-session",
			blockCount: 0,
			blockOffset: 0,
			eventCount: 0,
			limit: 100,
			hasMoreBefore: false,
			hasMoreAfter: false,
			timelineBlocks: [],
			latestWorkflowSnapshot: null,
			latestAgentSnapshot: null,
			latestPlanClarification: null,
			latestPlanApproval: null,
		}),
		"session.timeline.index": ({ params }) => ({
			timelineIndex: true,
			sessionId: (params as { sessionId?: string } | undefined)?.sessionId ?? MOCK_NOW,
			blockCount: 0,
			entries: [],
		}),
		"session.overview.get": ({ params }) => ({
			sessionId: (params as { sessionId?: string } | undefined)?.sessionId ?? "e2e-session-1",
			envInfo: null,
			envInfos: [],
			plans: { total: 0, items: [] },
			 sources: { total: 0, items: [] },
		}),
		"session.integrity.check": () => ({ ok: true, issues: [] }),
		"command.list": () => ({ commands: [] }),
		"skill.list": () => ({ skills: [], revision: "e2e-skills" }),
		"approval.list": () => ({ mode: "manual", pending: [] }),
		"mcp.config.list": () => ({ servers: [] }),
		"webSearchSettings.get": () => ({ enabled: false, provider: null }),
		"userPrompt.get": () => ({ enabled: false, prompt: "" }),
		"plugin.catalog.list": () => ({ plugins: [] }),
		"plugin.runtime.list": () => ({ runtimes: [] }),
		"usageMetrics.summary.get": () => ({ totalTokens: 0, totalRuns: 0, totalCost: 0 }),
		"usageMetrics.logs.list": () => ({ logs: [] }),
		"usageMetrics.trends.get": () => ({ points: [] }),
		"session.create": ({ params }) => {
			const input = (params ?? {}) as { title?: string; workspaceId?: string | null };
			const sessionId: string = "e2e-session-1";
			return {
				id: sessionId,
				title: input.title ?? "E2E Session",
				temporary: false,
				workspaceId: input.workspaceId ?? undefined,
				createdAt: MOCK_NOW,
				updatedAt: MOCK_NOW,
				workbench: createEmptyWorkbench(sessionId),
			};
		},
		"session.open": ({ params }) => ({
			opened: true,
			metadata: {
				id: (params as { sessionId?: string } | undefined)?.sessionId ?? "e2e-session-1",
				title: "E2E Session",
				createdAt: MOCK_NOW,
				updatedAt: MOCK_NOW,
			},
			blockCount: 0,
			blockOffset: 0,
			eventCount: 0,
			limit: 100,
			hasMoreBefore: false,
			hasMoreAfter: false,
			timelineBlocks: [],
			latestWorkflowSnapshot: null,
			latestAgentSnapshot: null,
			latestPlanClarification: null,
			latestPlanApproval: null,
			pendingGuides: [],
			messageQueue: [],
			selectionAskThreads: [],
			workbench: createEmptyWorkbench("e2e-session-1"),
			agentRuns: [],
			activeAgentRun: null,
			currentGoal: null,
			workspaceWarning: null,
		}),
		"workbench.get": ({ params }) => ({ workbench: createEmptyWorkbench((params as { sessionId?: string } | undefined)?.sessionId ?? null) }),
		"workbench.patch": ({ params }) => ({ changed: true, workbench: createEmptyWorkbench(null), ...(params ? {} : {}) }),
		"session.save": () => ({ saved: true, sessionId: "e2e-session-1", messageCount: 0 }),
		"session.model.set": () => ({ metadata: { id: "e2e-session-1", title: "E2E Session", createdAt: MOCK_NOW, updatedAt: MOCK_NOW }, workbench: createEmptyWorkbench("e2e-session-1") }),
		"ai.cancel": () => ({ cancelled: true }),
		"ai.chat": () => ({ accepted: true }),
		"approval.mode.set": () => ({ mode: "manual", updated: true }),
		"approval.approve": () => ({ approved: true }),
		"approval.reject": () => ({ rejected: true }),
	};
}

export class MockBackend {
	private port: number;
	private readonly handlers: Map<string, MockRpcHandler>;
	private readonly requests: MockRpcRequest[] = [];
	private readonly connections: Map<string, Connection> = new Map();
	private readonly pendingWaiters: Map<string, Array<(request: MockRpcRequest) => void>> = new Map();
	private readonly responseDelays: Map<string, number> = new Map();
	private readonly responseErrors: Map<string, { code: string; message: string }> = new Map();
	private readonly eventSequences: Map<string, number> = new Map();
	private server: WebSocketServer | null = null;
	private connectionIndex: number = 0;

	constructor(options: MockBackendOptions = {}) {
		this.port = options.port ?? DEFAULT_PORT;
		this.handlers = new Map(Object.entries({ ...createDefaultHandlers(), ...(options.handlers ?? {}) }));
	}

	async start(): Promise<void> {
		this.server = new WebSocketServer({ host: "127.0.0.1", port: this.port });
		this.server.on("connection", (socket: WebSocket): void => {
			const connectionId: string = `e2e-connection-${++this.connectionIndex}`;
			this.connections.set(connectionId, { id: connectionId, socket });
			socket.on("message", (raw: Buffer): void => {
				void this.handleMessage(connectionId, raw.toString());
			});
			socket.on("close", (): void => {
				this.connections.delete(connectionId);
			});
		});
		await new Promise<void>((resolve, reject): void => {
			this.server?.once("listening", () => resolve());
			this.server?.once("error", reject);
		});
		const address = this.server.address();
		if (address !== null && typeof address !== "string") {
			this.port = address.port;
		}
		const healthHandler: MockRpcHandler | undefined = this.handlers.get("backend.health");
		if (healthHandler !== undefined) {
			this.handlers.set("backend.health", async (request: MockRpcRequest): Promise<unknown> => {
				const result: unknown = await healthHandler(request);
				return typeof result === "object" && result !== null && !Array.isArray(result)
					? { ...(result as Record<string, unknown>), port: this.port }
					: result;
			});
		}
	}

	getPort(): number {
		return this.port;
	}

	async stop(): Promise<void> {
		for (const connection of this.connections.values()) {
			connection.socket.close();
		}
		this.connections.clear();
		const server: WebSocketServer | null = this.server;
		this.server = null;
		if (server !== null) {
			await new Promise<void>((resolve): void => server.close(() => resolve()));
		}
	}

	getRequests(method?: string): MockRpcRequest[] {
		return this.requests.filter((request: MockRpcRequest): boolean => method === undefined || request.method === method);
	}

	waitForRequest(method: string, timeoutMs: number = 10_000): Promise<MockRpcRequest> {
		const existing: MockRpcRequest | undefined = this.requests.find((request: MockRpcRequest): boolean => request.method === method);
		if (existing !== undefined) {
			return Promise.resolve(existing);
		}
		return new Promise<MockRpcRequest>((resolve, reject): void => {
			const waiter = (request: MockRpcRequest): void => {
				clearTimeout(timer);
				resolve(request);
			};
			const timer: ReturnType<typeof setTimeout> = setTimeout((): void => {
				const waiters: Array<(request: MockRpcRequest) => void> = this.pendingWaiters.get(method) ?? [];
				this.pendingWaiters.set(method, waiters.filter((candidate): boolean => candidate !== waiter));
				reject(new Error(`Timed out waiting for RPC ${method}`));
			}, timeoutMs);
			const waiters: Array<(request: MockRpcRequest) => void> = this.pendingWaiters.get(method) ?? [];
			waiters.push(waiter);
			this.pendingWaiters.set(method, waiters);
		});
	}

	setHandler(method: string, handler: MockRpcHandler): void {
		this.handlers.set(method, handler);
	}

	setResponseDelay(method: string, delayMs: number): void {
		this.responseDelays.set(method, delayMs);
	}

	setResponseError(method: string, code: string, message: string): void {
		this.responseErrors.set(method, { code, message });
	}

	sendEvent(event: string, data: unknown, options: { sessionId?: string; requestId?: string; runId?: string } = {}): void {
		const sessionId: string = options.sessionId ?? "e2e-session-1";
		const sequence: number = (this.eventSequences.get(sessionId) ?? 0) + 1;
		this.eventSequences.set(sessionId, sequence);
		const envelope = {
			protocolVersion: 3,
			type: "event",
			eventId: `e2e-event-${sessionId}-${sequence}`,
			event,
			sessionId,
			requestId: options.requestId ?? `e2e-request-${sessionId}`,
			runId: options.runId ?? `e2e-run-${sessionId}`,
			sequence,
			createdAt: MOCK_NOW,
			data,
		};
		const serialized: string = JSON.stringify(envelope);
		for (const connection of this.connections.values()) {
			if (connection.socket.readyState === 1) {
				connection.socket.send(serialized);
			}
		}
	}

	closeConnections(): void {
		for (const connection of this.connections.values()) {
			connection.socket.close();
		}
	}

	private async handleMessage(connectionId: string, raw: string): Promise<void> {
		let envelope: RpcRequestEnvelope;
		try {
			envelope = JSON.parse(raw) as RpcRequestEnvelope;
		} catch {
			return;
		}
		if (envelope.type !== "request" || typeof envelope.id !== "string" || typeof envelope.method !== "string") {
			return;
		}
		const request: MockRpcRequest = {
			id: envelope.id,
			method: envelope.method,
			params: envelope.params,
			connectionId,
			receivedAt: Date.now(),
		};
		this.requests.push(request);
		const waiters: Array<(request: MockRpcRequest) => void> = this.pendingWaiters.get(request.method) ?? [];
		this.pendingWaiters.delete(request.method);
		for (const waiter of waiters) {
			waiter(request);
		}

		const connection: Connection | undefined = this.connections.get(connectionId);
		if (connection === undefined || connection.socket.readyState !== 1) {
			return;
		}
		const configuredError = this.responseErrors.get(request.method);
		const delayMs: number = this.responseDelays.get(request.method) ?? 0;
		if (delayMs > 0) {
			await new Promise<void>((resolve): void => {
				setTimeout(resolve, delayMs);
			});
		}
		if (configuredError !== undefined) {
			this.sendResponse(connection, request.id, false, configuredError);
			return;
		}
		const handler: MockRpcHandler | undefined = this.handlers.get(request.method);
		if (handler === undefined) {
			this.sendResponse(connection, request.id, false, {
				code: "e2e_unregistered_rpc",
				message: `Unregistered E2E RPC: ${request.method}`,
			});
			return;
		}
		try {
			this.sendResponse(connection, request.id, true, await handler(request));
		} catch (error: unknown) {
			this.sendResponse(connection, request.id, false, {
				code: "e2e_handler_error",
				message: error instanceof Error ? error.message : "Mock handler failed",
			});
		}
	}

	private sendResponse(connection: Connection, id: string, ok: boolean, payload: unknown): void {
		if (connection.socket.readyState !== 1) {
			return;
		}
		const response = ok
			? { type: "response", id, ok: true, result: payload }
			: { type: "response", id, ok: false, error: payload };
		connection.socket.send(JSON.stringify(response));
	}
}

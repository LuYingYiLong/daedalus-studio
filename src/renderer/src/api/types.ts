// 工作区
export type WorkspaceIcon = 0 | 1 | 2 | 3 | 4 | 5 | 6;
export type WorkspaceColor = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7;

export type WorkspaceSourceFolder = {
	id: string;
	path: string;
	capabilities: {
		git: boolean;
		godot: boolean;
	};
};

export type WorkspaceConfig = {
	id: string;
	name: string;
	kind: "godot";
	rootPath: string;
	icon: WorkspaceIcon;
	color: WorkspaceColor;
	sourceFolders: WorkspaceSourceFolder[];
	primarySourceFolderId: string;
	godotExecutablePath?: string;
};

export type WorkspaceListResult = {
	workspaces: WorkspaceConfig[];
	active: string | null;
	connected: string[];
};

// 会话
export type SessionMetadata = {
	id: string;
	title: string;
	temporary?: boolean;
	pinned?: boolean;
	workspaceId?: string;
	workspaceName?: string;
	workspaceKind?: "godot";
	workspaceRoot?: string;
	godotExecutablePath?: string;
	activeSkillId?: string;
	provider?: string;
	model?: string;
	reasoningEffort?: string;
	chatMode?: "agent" | "ask" | "plan" | "goal";
	approvalMode?: "manual" | "auto-safe" | "full-trust";
	workflowTodoCollapsed?: boolean;
	archivedAt?: string;
	createdAt: string;
	updatedAt: string;
};

export type SessionListResult = {
	sessions: SessionMetadata[];
};

export type AdditionalContextItem = {
	id: string;
	kind: "editor_selection" | "scene" | "node" | "file" | "folder" | "script" | "script_selection" | "filesystem_selection" | "image" | "text_attachment" | "git_diff_comment" | "message_selection";
	title: string;
	subtitle?: string;
	pinned?: boolean;
	source: "editor" | "manual";
	resourcePath?: string;
	nodePath?: string;
	nodeType?: string;
	scriptPath?: string;
	summary?: string;
	data?: unknown;
};

export type MessageQueueStatus = "pending" | "sending" | "approval" | "failed" | "cancelled" | "rejected";

export type MessageQueueItem = {
	id: number;
	text: string;
	additionalContext: AdditionalContextItem[];
	mode: "agent" | "ask" | "plan" | "goal" | null;
	provider: string | null;
	model: string | null;
	reasoningEffort?: string | null;
	skillRefs: string[];
	status: MessageQueueStatus;
	createdAt: string;
	updatedAt: string;
};

export type PendingGuide = {
	guideId: string;
	clientGuideId: string;
	text: string;
	anchorRequestId: string | null;
	status: "pending";
	createdAt: string;
	updatedAt: string;
};

export type WorkbenchActiveRun = {
	status: "idle" | "streaming" | "paused" | "approval" | "cancelling";
	requestId?: string;
	startedAt?: string;
	queueItemId?: number;
	statusCode?: string;
	sequence?: number;
};

export type WorkbenchPendingApproval = {
	count: number;
	first: {
		approvalId?: string;
		toolName?: string;
		llmToolName?: string;
		reason?: string;
		requestId?: string;
		[key: string]: unknown;
	} | null;
	[key: string]: unknown;
};

export type PendingToolBudget = {
	budgetId: string;
	requestId: string;
	reason: string;
	limitKind: "steps" | "tool_result_chars";
	usedSteps: number;
	maxSteps: number;
	totalToolResultChars: number;
	toolResultCharLimit: number;
	additionalSteps: number;
	createdAt: string;
};

export type WorkbenchNextStepHint = {
	id?: string;
	title?: string;
	text?: string;
	message?: string;
	[key: string]: unknown;
};

export type WorkflowTodoStatus = "pending" | "running" | "in_progress" | "done" | "failed" | "paused" | string;

export type WorkflowTodoStep = {
	id: string;
	title: string;
	status: WorkflowTodoStatus;
	phaseId?: string;
	text?: string;
};

export type WorkflowTodoSnapshot = {
	runId?: string;
	workflowId?: string;
	title?: string;
	revision?: number;
	source?: string;
	steps: WorkflowTodoStep[];
	todos: WorkflowTodoStep[];
	activeStepRunId?: string;
	activePhaseRunId?: string;
};

export type MessageTextAnchor = {
	entryId: string;
	requestId: string;
	role: "user" | "assistant";
	segmentKey: string;
	startOffset: number;
	endOffset: number;
	quote: string;
	contextBefore: string;
	contextAfter: string;
};

export type SelectionAskThreadStatus = "idle" | "running" | "failed" | "interrupted";
export type SelectionAskMessageStatus = "completed" | "running" | "failed" | "interrupted";

export type SelectionAskThread = {
	threadId: string;
	sessionId: string;
	anchor: MessageTextAnchor;
	provider: string;
	model: string;
	reasoningEffort?: string;
	status: SelectionAskThreadStatus;
	createdAt: string;
	updatedAt: string;
};

export type SelectionAskMessage = {
	messageId: string;
	threadId: string;
	sequence: number;
	requestId: string;
	role: "user" | "assistant";
	content: string;
	status: SelectionAskMessageStatus;
	errorMessage?: string;
	createdAt: string;
	updatedAt: string;
};

export type SelectionAskThreadPage = {
	thread: SelectionAskThread;
	messages: SelectionAskMessage[];
	hasMoreBefore: boolean;
};

export type AgentRunStage =
	| "routing"
	| "probing"
	| "executing"
	| "verifying"
	| "awaiting_approval"
	| "awaiting_tool_budget"
	| "interrupted"
	| "finalizing"
	| "completed"
	| "failed"
	| "cancelled";

export type AgentRunState = {
	schemaVersion: 1;
	runId: string;
	sessionId: string;
	requestId: string;
	rootRequestId: string;
	retryOfRunId?: string;
	goalId?: string;
	goalCycle?: number;
	revision: number;
	intent: "answer" | "inspect" | "mutate";
	scope: "bounded" | "unknown" | "complex";
	lane: "direct" | "read" | "probe" | "lightweight" | "workflow";
	stage: AgentRunStage;
	title: string;
	planId: string | null;
	todo: WorkflowTodoSnapshot | null;
	pause: {
		kind: "approval" | "tool_budget";
		id: string;
		toolName?: string;
		reason: string;
	} | null;
	verificationStatus: "verified" | "unverified" | "failed" | null;
	warnings: string[];
	terminal: {
		resultStatus: "completed" | "completed_with_warnings" | "failed" | "cancelled";
		message?: string;
		completedAt: string;
	} | null;
	checkpoint: {
		successfulWriteFingerprints: string[];
		evidence: unknown[];
		lastWriteAt?: string;
	};
	interruptedReason?: string;
	createdAt: string;
	updatedAt: string;
};

export type AgentGoalStage = "readiness" | "running" | "evaluating" | "pausing" | "awaiting_approval" | "awaiting_tool_budget" | "paused" | "achieved" | "failed" | "cancelled";
export type AgentGoalState = {
	schemaVersion: 1;
	goalId: string;
	sessionId: string;
	rootRequestId: string;
	revision: number;
	title: string;
	condition: string;
	stage: AgentGoalStage;
	pauseReason: "user_interruption" | "backend_restart" | "client_disconnected" | "budget_exhausted" | "readiness_blocked" | "no_progress" | null;
	activeRunId: string | null;
	cycle: number;
	modelSnapshot: { provider: string; model: string; reasoningEffort: string | null; approvalMode: string; workspaceId: string | null };
	budget: { maxCycles: number; maxTokens: number; maxActiveMinutes: number };
	usage: { cycles: number; tokens: number; activeMilliseconds: number; estimatedTokens: boolean };
	readiness: { ready: boolean; checks: Array<{ id: string; status: "passed" | "warning" | "blocked"; message: string; action?: string }>; checkedAt: string } | null;
	evaluation: { disposition: "achieved" | "continue" | "blocked"; summary: string; evidenceToolCallIds: string[]; unmetCriteria: string[]; nextAction: string | null } | null;
	checkpoint: { status: "available" | "partial" | "unavailable" | "rolled_back"; fileCount: number; totalBytes: number; unavailableReasons: string[] };
	createdAt: string;
	updatedAt: string;
	completedAt: string | null;
};

export type WorkbenchSnapshot = {
	revision: number;
	sessionId: string | null;
	composer: {
		text: string;
		chatMode: "agent" | "ask" | "plan" | "goal" | null;
		provider?: string;
		providerDisplayName?: string;
		model?: string;
		reasoningEffort?: string | null;
		additionalContext: AdditionalContextItem[];
		updatedAt?: string;
	};
	messageQueue: MessageQueueItem[];
	pendingGuides: PendingGuide[];
	activeRun: WorkbenchActiveRun;
	pendingApproval: WorkbenchPendingApproval;
	pendingToolBudget: PendingToolBudget | null;
	nextStepHints: {
		hints: WorkbenchNextStepHint[];
		trigger?: string;
		anchorRequestId?: string;
		generatedAt?: string;
	};
	activeSelection: {
		workspaceId: string | null;
		workspaceName?: string | null;
		workspaceRoot?: string | null;
		[key: string]: unknown;
	};
};

export type WorkbenchPatch = {
	clientSequence?: number;
	composer?: {
		text?: string;
		chatMode?: "agent" | "ask" | "plan" | "goal";
		provider?: string;
		model?: string;
		reasoningEffort?: string;
		additionalContext?: AdditionalContextItem[];
	};
	additionalContextAction?:
		| { action: "set"; items: AdditionalContextItem[] }
		| { action: "addOrReplace"; item: AdditionalContextItem }
		| { action: "remove"; contextId: string }
		| { action: "pin"; contextId: string; pinned: boolean }
		| { action: "clearUnpinned" };
	nextStepHintsAction?: "clear";
};

export type WorkbenchPatchResult = {
	changed: boolean;
	stale?: boolean;
	workbench: WorkbenchSnapshot;
};

export type TimelineRenderHints = {
	estimatedHeight: number;
	contentChars: number;
	bodyPartCount: number;
	heavyPartCount: number;
};

// 客户端信息
export type ClientHelloResult = {
	connection: {
		connectionId: string;
		clientType: string;
		clientName: string;
		connectedAt: string;
		capabilities: Record<string, boolean>;
	};
	multiClient: {
		enabled: boolean;
		protocolVersion: number;
	};
};

export type TimelineUserBlock = {
	id: string;
	type: "user";
	requestId: string;
	content: string;
	sentAtUtc: string;
	additionalContext?: AdditionalContextItem[];
	renderHints?: TimelineRenderHints;
};

export type TimelineAssistantBlock = {
	id: string;
	type: "assistant";
	requestId: string;
	content: string;
	startedAtUtc: string;
	completedAtUtc: string;
	status?: "failed" | "running";
	bodyParts: TimelineBodyPart[];
	renderHints?: TimelineRenderHints;
};

export type TimelineEditedFile = {
	displayPath?: string;
	path?: string;
	absolutePath?: string;
	workspaceRoot?: string;
	additions?: number;
	deletions?: number;
	existsAfter?: boolean;
	afterSha256?: string;
	undoable?: boolean;
};

export type TimelineGeneratedImageArtifact = {
	imageId: string;
	sessionId: string;
	mimeType: string;
	width?: number;
	height?: number;
	byteSize: number;
	provider: string;
	model: string;
	prompt: string;
	revisedPrompt?: string;
	createdAt: string;
	fileName: string;
};

export type PlanRecommendedReply = {
	label: string;
	text: string;
	description?: string;
};

export type PlanClarificationState = {
	planId: string;
	requestId: string;
	title: string;
	question: string;
	recommendedReplies: PlanRecommendedReply[];
};

export type PlanApprovalState = {
	planId: string;
	requestId: string;
	title: string;
	status: string;
	previewMarkdown: string;
	updatedAt: string;
};

export type TimelineBodyPart =
	| { type: "markdown"; text: string }
	| { type: "thinking"; text: string; done: boolean }
	| {
		type: "provider_reconnect";
		reconnectId: string;
		revision: number;
		provider: string;
		model: string;
		status: "waiting" | "reconnecting" | "recovered" | "failed";
		reason: "transport" | "idle_timeout" | "gateway" | "rate_limit" | "server";
		attempt: number;
		maxAttempts: 5 | 15;
		timeoutMs: number;
		retryAt?: string;
		autoExtended: boolean;
	}
	| { type: "tool"; tool_call_id: string; events: Record<string, unknown>[] }
	| { type: "summary_start"; runId: string; stepId: string; stepRunId: string; title: string; foldTitle: string }
	| {
		type: "image_generation";
		status: "running" | "completed" | "failed";
		prompt: string;
		toolCallId?: string;
		artifacts?: TimelineGeneratedImageArtifact[];
		provider?: string;
		model?: string;
		error?: string;
	}
	| {
		type: "status";
		title: string;
		details: string;
		status: string;
		code: string;
		actionLabel?: string;
		actionId?: string;
		iconUid?: string;
		planId?: string;
		recommendedReplies?: PlanRecommendedReply[];
	}
	| { type: "plan"; planId: string; title: string; status: string; previewMarkdown: string }
	| {
		type: "inline_diff";
		sessionId: string;
		batchIds: string[];
		editedFileCount: number;
		additions: number;
		deletions: number;
		undoable: boolean;
		editedFiles: TimelineEditedFile[];
	};

export type TimelineBlock = TimelineUserBlock | TimelineAssistantBlock;

export type SessionTimelineNavigationEntry = {
	entryId: string;
	requestId: string;
	blockOffset: number;
	sentAtUtc: string;
	preview: string;
};

export type SessionTimelineNavigationIndexResult = {
	timelineIndex: true;
	sessionId: string;
	blockCount: number;
	entries: SessionTimelineNavigationEntry[];
};

export type SessionTimelineSearchDocument = {
	blockOffset: number;
	requestId: string;
	role: "user" | "assistant";
	markdownSegments: string[];
};

export type SessionTimelineSearchIndexPage = {
	timelineSearchIndex: true;
	searchId?: string;
	sessionId: string;
	generationId?: string;
	sourceRevision?: number;
	status?: "building" | "ready";
	blockCount: number;
	indexedThroughOffset?: number;
	nextOffset: number | null;
	documents: SessionTimelineSearchDocument[];
	pending?: boolean;
	retryAfterMs?: number;
};

export type SessionSearchPage = Required<Pick<SessionTimelineSearchIndexPage,
	"searchId" | "sessionId" | "generationId" | "sourceRevision" | "status" | "blockCount" | "indexedThroughOffset" | "documents" | "nextOffset" | "pending"
>> & { retryAfterMs?: number };

export type SessionOpenResult = {
	opened: true;
	metadata: SessionMetadata;
	blockCount: number;
	blockOffset: number;
	eventCount: number;
	limit: number;
	hasMoreBefore: boolean;
	hasMoreAfter: boolean;
	timelineBlocks: TimelineBlock[];
	latestWorkflowSnapshot: unknown | null;
	latestAgentSnapshot: unknown | null;
	latestPlanClarification: PlanClarificationState | null;
	latestPlanApproval: PlanApprovalState | null;
	pendingGuides: PendingGuide[];
	messageQueue: MessageQueueItem[];
	selectionAskThreads: SelectionAskThread[];
	workbench: WorkbenchSnapshot;
	agentRuns: AgentRunState[];
	activeAgentRun: AgentRunState | null;
	currentGoal: AgentGoalState | null;
	workspaceWarning: string | null;
};

export type SessionTimelineResult = {
	timeline: true;
	sessionId: string;
	blockCount: number;
	blockOffset: number;
	eventCount: number;
	limit: number;
	hasMoreBefore: boolean;
	hasMoreAfter: boolean;
	timelineBlocks: TimelineBlock[];
	latestWorkflowSnapshot: unknown | null;
	latestAgentSnapshot: unknown | null;
	latestPlanClarification: PlanClarificationState | null;
	latestPlanApproval: PlanApprovalState | null;
};

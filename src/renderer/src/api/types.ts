// 工作区
export type WorkspaceConfig = {
	id: string;
	name: string;
	kind: "godot";
	rootPath: string;
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
	workspaceId?: string;
	workspaceName?: string;
	workspaceKind?: "godot";
	workspaceRoot?: string;
	godotExecutablePath?: string;
	activeSkillId?: string;
	provider?: string;
	model?: string;
	chatMode?: "agent" | "ask" | "plan";
	approvalMode?: "manual" | "auto-safe";
	workflowTodoCollapsed?: boolean;
	webSearchEnabled?: boolean;
	archivedAt?: string;
	createdAt: string;
	updatedAt: string;
};

export type SessionListResult = {
	sessions: SessionMetadata[];
};

export type AdditionalContextItem = {
	id: string;
	kind: "editor_selection" | "scene" | "node" | "file" | "folder" | "script" | "script_selection" | "filesystem_selection" | "image";
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

export type MessageQueueItem = {
	id: string;
	text?: string;
	message?: string;
	mode?: "agent" | "ask" | "plan";
	status?: string;
	createdAt?: string;
	updatedAt?: string;
	[key: string]: unknown;
};

export type PendingGuide = {
	id?: string;
	clientId?: string;
	text?: string;
	title?: string;
	status?: string;
	[key: string]: unknown;
};

export type WorkbenchActiveRun = {
	status: "idle" | "streaming" | "paused" | "approval" | "cancelling";
	requestId?: string;
	startedAt?: string;
	queueItemId?: string;
	statusCode?: string;
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

export type WorkbenchSnapshot = {
	revision: number;
	sessionId: string | null;
	composer: {
		text: string;
		chatMode: "agent" | "ask" | "plan" | null;
		provider?: string;
		providerDisplayName?: string;
		model?: string;
		additionalContext: AdditionalContextItem[];
		updatedAt?: string;
	};
	messageQueue: MessageQueueItem[];
	pendingGuides: PendingGuide[];
	activeRun: WorkbenchActiveRun;
	pendingApproval: WorkbenchPendingApproval;
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
		chatMode?: "agent" | "ask" | "plan";
		provider?: string;
		model?: string;
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
	title: string;
	question: string;
	recommendedReplies: PlanRecommendedReply[];
};

export type PlanApprovalState = {
	planId: string;
	title: string;
	status: string;
	previewMarkdown: string;
	updatedAt: string;
};

export type TimelineBodyPart =
	| { type: "markdown"; text: string }
	| { type: "thinking"; text: string; done: boolean }
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
	pendingGuides: unknown[];
	messageQueue: MessageQueueItem[];
	workbench: WorkbenchSnapshot;
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

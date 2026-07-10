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
	activeSkillId?: string;
	provider?: string;
	model?: string;
	archivedAt?: string;
	createdAt: string;
	updatedAt: string;
};

export type SessionListResult = {
	sessions: SessionMetadata[];
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
	additionalContext?: unknown[];
};

export type TimelineAssistantBlock = {
	id: string;
	type: "assistant";
	requestId: string;
	content: string;
	startedAtUtc: string;
	completedAtUtc: string;
	status?: "failed";
	bodyParts: TimelineBodyPart[];
};


export type TimelineBodyPart =
	| { type: "markdown"; text: string }
	| { type: "thinking"; text: string; done: boolean }
	| { type: "tool"; tool_call_id: string; events: Record<string, unknown>[] }
	| { type: "status"; title: string; details: string; status: string; code: string }
	| { type: "plan"; planId: string; title: string; status: string; previewMarkdown: string }
	| { type: "inline_diff"; sessionId: string; batchIds: string[] };
	
export type TimelineToolPart = Extract<TimelineBodyPart, { type: "tool" }>;
export type TimelineStatusPart = Extract<TimelineBodyPart, {type: "status"}>;
export type TimelinePlanPart = Extract<TimelineBodyPart, { type: "plan" }>
export type TimelineInlineDiff = Extract<TimelineBodyPart, { type: "inline_diff" }>

export type TimelineBlock = TimelineUserBlock | TimelineAssistantBlock;

export type SessionOpenResult = {
	opened: true;
	metadata: SessionMetadata;
	blockCount: number;
	blockOffset: number;
	eventCount: number;
	limit: number;
	hasMoreBefore: boolean;
	timelineBlocks: TimelineBlock[];
	latestWorkflowSnapshot: unknown | null;
	latestAgentSnapshot: unknown | null;
	pendingGuides: unknown[];
	workspaceWarning: string | null;
};

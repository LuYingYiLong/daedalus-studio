import type { BackendEvent } from "@/platform/rpc/transport/backend-rpc-client";
import type {
	AdditionalContextItem,
	AgentGoalState,
	SessionMetadata,
	SessionOpenResult,
	TimelineBlock,
	WorkflowTodoSnapshot,
	WorkbenchPatch,
	WorkbenchSnapshot,
	WorkspaceConfig
} from "@/platform/rpc/types";
import type {
	ProviderModelInfo,
	ProviderModelSelection,
	ProviderModelSelectionProvider,
	ProviderReasoningEffortOption
} from "@/platform/rpc/provider-api";
import type { ClientPreferences } from "@/platform/rpc/client-preferences-api";
import type { ChatMode, ChatOutputTarget } from "@/platform/rpc/chat-api";
import type { TimelinePageState } from "@/domain/workbench/workbench-state";
import { createDefaultSessionLayout, type SessionLayoutPreferences } from "@/domain/session/session-layout";
import { selectLatestWorkflowTodoSnapshot } from "@/domain/composer/workflow-todo";
import type { HomeDraft } from "@/domain/session/home-draft";
import { createSingleSourceWorkspaceSnapshot } from "@/domain/workspace/workspace-snapshot";
import { DEFAULT_WORKSPACE_LAUNCH_TARGET_ID, type WorkspaceLaunchTargetId } from "@/domain/workspace/workspace-launch";
export { createPlanApprovalKey, createPlanClarificationKey } from "@/domain/composer/plan-helpers";
export type { HomeDraft } from "@/domain/session/home-draft";
export { createSingleSourceWorkspaceSnapshot } from "@/domain/workspace/workspace-snapshot";

export const FULL_TRUST_CONFIRMATION_TEXT: string = "ENABLE FULL TRUST";
export const DEFAULT_SESSION_LAYOUT: SessionLayoutPreferences = createDefaultSessionLayout();

export function createFrontendFailedRunEvent(requestId: string, sessionId: string, message: string): BackendEvent {
	const createdAt: string = new Date().toISOString();
	return {
		protocolVersion: 3,
		type: "event",
		eventId: `frontend-${requestId}`,
		event: "agent.run.state",
		sessionId,
		requestId,
		runId: requestId,
		sequence: Date.now() * 1000,
		createdAt,
		data: {
			runId: requestId,
			requestId,
			stage: "failed",
			terminal: {
				resultStatus: "failed",
				message,
				completedAt: createdAt
			}
		}
	};
}

export function createChatRequestId(): string {
	return `studio-chat-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function isBackendRpcErrorMessage(message: string): boolean {
	return /^[a-z][a-z0-9_]*: /u.test(message);
}

export function getChatMode(workbench: WorkbenchSnapshot | null): ChatMode {
	return workbench?.composer.chatMode ?? "ask";
}

export function getChatOutputTarget(mode: ChatMode, workspaceId: string | null | undefined): ChatOutputTarget {
	return workspaceId !== null && workspaceId !== undefined && (mode === "agent" || mode === "goal") ? "workspace" : "chat";
}

export function getCurrentWorkspaceId(activeWorkspace: WorkspaceConfig | null, workbench: WorkbenchSnapshot | null): string | null {
	if (activeWorkspace !== null) return activeWorkspace.id;
	const workspaceId: unknown = workbench?.activeSelection.workspaceId;
	return typeof workspaceId === "string" && workspaceId.length > 0 ? workspaceId : null;
}

export function getPendingApprovalCount(workbench: WorkbenchSnapshot | null): number {
	const count = workbench?.pendingApproval?.count;
	return typeof count === "number" && Number.isFinite(count) ? count : 0;
}

export function createHomeDraft(): HomeDraft {
	return {
		workspaceId: null,
		workspace: null,
		chatMode: "agent",
		providerId: null,
		modelId: null,
		reasoningEffort: "medium",
		workspaceLaunch: DEFAULT_WORKSPACE_LAUNCH_TARGET_ID,
		executionEnvironment: "local",
		worktreeSources: {}
	};
}

export function findProviderModel(selection: ProviderModelSelection | null, providerId: string | null, modelId: string | null): ProviderModelInfo | null {
	if (selection === null || providerId === null || modelId === null) return null;
	const provider: ProviderModelSelectionProvider | undefined = selection.providers.find((item): boolean => item.provider === providerId);
	return provider?.models.find((model): boolean => model.id === modelId) ?? null;
}

export function resolveReasoningEffortForComposerModelChange(params: {
	selection: ProviderModelSelection | null;
	previousProviderId: string | null;
	previousModelId: string | null;
	previousEffort: string;
	nextProviderId: string;
	nextModelId: string;
}): string {
	const previousModel: ProviderModelInfo | null = findProviderModel(params.selection, params.previousProviderId, params.previousModelId);
	const previousOption: ProviderReasoningEffortOption | undefined = previousModel?.capabilities.reasoningEfforts?.find((option): boolean => option.id === params.previousEffort);
	const targetFallback: ProviderReasoningEffortOption["fallback"] = previousOption?.fallback
		?? (params.previousEffort === "low" || params.previousEffort === "medium" || params.previousEffort === "high" || params.previousEffort === "max" ? params.previousEffort : "medium");
	const nextOptions: ProviderReasoningEffortOption[] = findProviderModel(params.selection, params.nextProviderId, params.nextModelId)?.capabilities.reasoningEfforts ?? [];
	return nextOptions.find((option): boolean => option.id === targetFallback)?.id
		?? nextOptions.find((option): boolean => option.fallback === targetFallback)?.id
		?? nextOptions.find((option): boolean => option.id === "medium")?.id
		?? nextOptions[0]?.id
		?? "medium";
}

export function findPreferredComposerModel(preferences: ClientPreferences, selection: ProviderModelSelection | null): { providerId: string; modelId: string } | null {
	const lastComposerModel = preferences.newSessionComposer.model ?? preferences.lastComposerModel;
	if (lastComposerModel !== null && selection !== null) {
		const provider = selection.providers.find((item): boolean => item.configured && item.enabled !== false && item.provider === lastComposerModel.providerId);
		if (provider?.models.some((model): boolean => model.id === lastComposerModel.modelId) === true) return lastComposerModel;
	}
	const firstProvider = selection?.providers.find((provider): boolean => provider.configured && provider.enabled !== false && provider.models.length > 0);
	const firstModelId: string | undefined = firstProvider?.models[0]?.id;
	return firstProvider !== undefined && firstModelId !== undefined ? { providerId: firstProvider.provider, modelId: firstModelId } : null;
}

export function createPreferredHomeDraft(
	preferences: ClientPreferences,
	selection: ProviderModelSelection | null,
	workspace: WorkspaceConfig | null = null,
	executionEnvironment: "local" | "worktree" = "local"
): HomeDraft {
	const draft: HomeDraft = {
		...createHomeDraft(),
		chatMode: preferences.newSessionComposer.mode,
		reasoningEffort: preferences.newSessionComposer.reasoningEffort,
		workspaceId: workspace?.id ?? null,
		workspace,
		executionEnvironment
	};
	const preferredModel = findPreferredComposerModel(preferences, selection);
	if (preferredModel === null) return draft;
	return {
		...draft,
		providerId: preferredModel.providerId,
		modelId: preferredModel.modelId,
		reasoningEffort: resolveReasoningEffortForComposerModelChange({
			selection,
			previousProviderId: preferences.newSessionComposer.model?.providerId ?? null,
			previousModelId: preferences.newSessionComposer.model?.modelId ?? null,
			previousEffort: preferences.newSessionComposer.reasoningEffort,
			nextProviderId: preferredModel.providerId,
			nextModelId: preferredModel.modelId
		})
	};
}

export function getDisplayedComposerModel(params: {
	isNewSessionHome: boolean;
	homeDraft: HomeDraft;
	workbench: WorkbenchSnapshot | null;
	activeSessionMetadata: SessionMetadata | null;
	providerModelSelection: ProviderModelSelection | null;
	firstTurnModelTransition?: {
		providerId: string;
		modelId: string;
	} | null;
}): { providerId: string | null; modelId: string | null } {
	const fallbackProviderId: string | null = params.providerModelSelection?.activeModel.providerId ?? null;
	const fallbackModelId: string | null = params.providerModelSelection?.activeModel.modelId ?? null;
	if (params.isNewSessionHome) {
		return {
			providerId: params.homeDraft.providerId ?? fallbackProviderId,
			modelId: params.homeDraft.modelId ?? fallbackModelId
		};
	}
	if (params.firstTurnModelTransition !== null && params.firstTurnModelTransition !== undefined) {
		return params.firstTurnModelTransition;
	}
	const workbenchProviderId: string | null = params.workbench?.composer.provider ?? null;
	const workbenchModelId: string | null = params.workbench?.composer.model ?? null;
	if (workbenchProviderId !== null && workbenchModelId !== null) {
		return { providerId: workbenchProviderId, modelId: workbenchModelId };
	}
	const metadataProviderId: string | null = params.activeSessionMetadata?.provider ?? null;
	const metadataModelId: string | null = params.activeSessionMetadata?.model ?? null;
	if (metadataProviderId !== null && metadataModelId !== null) {
		return { providerId: metadataProviderId, modelId: metadataModelId };
	}
	// Existing sessions never inherit the global default while their own
	// workbench snapshot is loading. Doing so makes the Composer appear to
	// switch models and can feed a stale global model into later patches.
	return { providerId: null, modelId: null };
}

export function createWorkspaceFromSessionMetadata(metadata: SessionMetadata, workbench: WorkbenchSnapshot, sourceWorkspace?: WorkspaceConfig | undefined): WorkspaceConfig | null {
	if (metadata.worktree !== undefined && sourceWorkspace?.id === metadata.worktree.sourceWorkspaceId) {
		const pathsBySourceId: ReadonlyMap<string, string> = new Map(metadata.worktree.sources.map((source): [string, string] => [source.sourceFolderId, source.worktreePath]));
		const sourceFolders = sourceWorkspace.sourceFolders.flatMap((source) => {
			const worktreePath: string | undefined = pathsBySourceId.get(source.id);
			return worktreePath === undefined ? [] : [{ ...source, path: worktreePath }];
		});
		const primary = sourceFolders.find((source): boolean => source.id === sourceWorkspace.primarySourceFolderId);
		if (primary !== undefined && sourceFolders.length === sourceWorkspace.sourceFolders.length) {
			return {
				...sourceWorkspace,
				id: metadata.worktree.runtimeWorkspaceId,
				rootPath: primary.path,
				sourceFolders
			};
		}
	}
	if (metadata.workspaceId !== undefined && metadata.workspaceRoot !== undefined) {
		return createSingleSourceWorkspaceSnapshot({
			id: metadata.workspaceId,
			name: metadata.workspaceName ?? metadata.title,
			kind: metadata.workspaceKind ?? "workspace",
			rootPath: metadata.workspaceRoot,
			godotExecutablePath: metadata.godotExecutablePath
		});
	}
	const selection = workbench.activeSelection;
	return typeof selection.workspaceId === "string" && typeof selection.workspaceRoot === "string"
		? createSingleSourceWorkspaceSnapshot({
				id: selection.workspaceId,
				name: typeof selection.workspaceName === "string" && selection.workspaceName.length > 0 ? selection.workspaceName : metadata.title,
				rootPath: selection.workspaceRoot
			})
		: null;
}

export function createWorkspaceFromSessionOpenResult(result: SessionOpenResult, sourceWorkspace?: WorkspaceConfig | undefined): WorkspaceConfig | null {
	return createWorkspaceFromSessionMetadata(result.metadata, result.workbench, sourceWorkspace);
}

export function createWorkflowTodoSnapshotFromTimelineResult(result: { latestAgentSnapshot: unknown | null; latestWorkflowSnapshot: unknown | null }): WorkflowTodoSnapshot | null {
	return selectLatestWorkflowTodoSnapshot(result.latestAgentSnapshot, result.latestWorkflowSnapshot);
}

export function getWorkflowTodoSnapshotIdentity(snapshot: WorkflowTodoSnapshot): string {
	return snapshot.workflowId ?? snapshot.runId ?? snapshot.title ?? "workflow";
}

export function isSameWorkflowTodoSnapshot(left: WorkflowTodoSnapshot, right: WorkflowTodoSnapshot): boolean {
	return getWorkflowTodoSnapshotIdentity(left) === getWorkflowTodoSnapshotIdentity(right);
}

export function createOptimisticUserBlock(requestId: string, message: string, additionalContext: AdditionalContextItem[]): TimelineBlock {
	const contentChars: number = message.length + additionalContext.reduce((total: number, item: AdditionalContextItem): number => total + item.title.length + (item.subtitle?.length ?? 0), 0);
	return {
		id: `optimistic:${requestId}:user`,
		type: "user",
		requestId,
		content: message,
		sentAtUtc: new Date().toISOString(),
		additionalContext,
		renderHints: {
			estimatedHeight: Math.max(96, Math.min(320, contentChars * 0.42) + (additionalContext.length > 0 ? 34 : 0)),
			contentChars,
			bodyPartCount: 1,
			heavyPartCount: 0
		}
	};
}

/** 实时 assistant 事件可先于排队消息到达，按 requestId 维持消息对顺序 */
export function insertUserBlockBeforeRequestAssistant(blocks: TimelineBlock[], userBlock: TimelineBlock): TimelineBlock[] {
	if (userBlock.type !== "user") return blocks;
	if (blocks.some((block: TimelineBlock): boolean => block.type === "user" && block.requestId === userBlock.requestId)) return blocks;

	const assistantIndex: number = blocks.findIndex((block: TimelineBlock): boolean => {
		return block.type === "assistant" && block.requestId === userBlock.requestId;
	});
	if (assistantIndex < 0) return [...blocks, userBlock];

	return [...blocks.slice(0, assistantIndex), userBlock, ...blocks.slice(assistantIndex)];
}

export function mergeOptimisticUserBlocks(currentPage: TimelinePageState, nextPage: TimelinePageState, activeOptimisticRequestId: string | null): TimelinePageState {
	if (currentPage.sessionId !== null && nextPage.sessionId !== null && currentPage.sessionId !== nextPage.sessionId) return currentPage;
	const optimisticUserBlocks: TimelineBlock[] = currentPage.blocks.filter((block): boolean => activeOptimisticRequestId !== null && block.type === "user" && block.id.startsWith("optimistic:") && block.requestId === activeOptimisticRequestId);
	const missingOptimisticUserBlocks: Map<string, TimelineBlock> = new Map(optimisticUserBlocks.filter((optimisticBlock): boolean => !nextPage.blocks.some((block): boolean => block.type === "user" && block.requestId === optimisticBlock.requestId)).map((block): [string, TimelineBlock] => [block.requestId, block]));
	if (missingOptimisticUserBlocks.size === 0) return nextPage;
	let blocks: TimelineBlock[] = nextPage.blocks;
	for (const optimisticBlock of missingOptimisticUserBlocks.values()) {
		blocks = insertUserBlockBeforeRequestAssistant(blocks, optimisticBlock);
	}
	return {
		...nextPage,
		sessionId: currentPage.sessionId ?? nextPage.sessionId,
		blocks,
		blockCount: nextPage.blockCount + missingOptimisticUserBlocks.size,
		hasMoreAfter: false
	};
}

export function trimTimelineFromRequest(page: TimelinePageState, requestId: string): TimelinePageState {
	const firstIndex: number = page.blocks.findIndex((block): boolean => block.requestId === requestId);
	return firstIndex < 0
		? page
		: {
				...page,
				blocks: page.blocks.slice(0, firstIndex),
				blockCount: Math.max(0, page.blockCount - (page.blocks.length - firstIndex)),
				hasMoreAfter: false
			};
}

export function getSessionSortTime(session: SessionMetadata): number {
	const updatedTime: number = Date.parse(session.updatedAt);
	if (Number.isFinite(updatedTime)) return updatedTime;
	const createdTime: number = Date.parse(session.createdAt);
	return Number.isFinite(createdTime) ? createdTime : 0;
}

export function getRecentSessions(sessions: SessionMetadata[]): SessionMetadata[] {
	return [...sessions].sort((left, right): number => getSessionSortTime(right) - getSessionSortTime(left)).slice(0, 3);
}

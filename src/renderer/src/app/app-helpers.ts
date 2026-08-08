import type { BackendEvent } from "@/shared/api/transport/backend-rpc-client";
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
} from "@/api/types";
import type {
	ProviderModelInfo,
	ProviderModelSelection,
	ProviderModelSelectionProvider,
	ProviderReasoningEffortOption
} from "@/api/provider-api";
import type { ClientPreferences } from "@/api/client-preferences-api";
import type { ChatMode, ChatOutputTarget } from "@/api/chat-api";
import type { SaveImageAttachmentParams } from "@/api/image-attachment-api";
import type { TimelinePageState } from "@/features/workbench/workbench-state";
import { createDefaultSessionLayout, type SessionLayoutPreferences } from "@/features/dock/session-layout";
import { selectLatestWorkflowTodoSnapshot } from "@/features/composer/workflow-todo";
import type { BootstrapData } from "./bootstrap";

export type SupportedImageMimeType = SaveImageAttachmentParams["mimeType"];
export type WorkspacePickedEntry = {
	name: string;
	relativePath: string;
	resourcePath: string;
	kind: "file" | "folder";
};
export type AppProps = {
	bootstrapData: BootstrapData;
};
export type HomeDraft = {
	workspaceId: string | null;
	workspace: WorkspaceConfig | null;
	chatMode: ChatMode;
	providerId: string | null;
	modelId: string | null;
	reasoningEffort: string;
};

export const SUPPORTED_IMAGE_MIME_TYPES: readonly SupportedImageMimeType[] = ["image/png", "image/jpeg", "image/webp", "image/gif"];
export const MAX_IMAGE_ATTACHMENT_BYTES: number = 5 * 1024 * 1024;
export const RECENT_CONTEXT_FILE_WINDOW_MS: number = 2000;
export const CONTEXT_SUBTITLE_MAX_CHARS: number = 400;
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

export function createPlanClarificationKey(clarification: { planId: string; question: string }): string {
	return `${clarification.planId}\u0000${clarification.question}`;
}

export function createPlanApprovalKey(plan: { planId: string; updatedAt: string; previewMarkdown: string }): string {
	return `${plan.planId}\u0000${plan.updatedAt}\u0000${plan.previewMarkdown}`;
}

export function isBackendRpcErrorMessage(message: string): boolean {
	return /^[a-z][a-z0-9_]*: /u.test(message);
}

export function createContextId(): string {
	return typeof crypto.randomUUID === "function"
		? `studio-context-${crypto.randomUUID()}`
		: `studio-context-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function getContextTitle(entry: WorkspacePickedEntry): string {
	return entry.name.trim().length > 0 ? entry.name : entry.resourcePath.split("/").filter(Boolean).at(-1) ?? entry.resourcePath;
}

export function createWorkspacePathContextItem(entry: WorkspacePickedEntry, workspace: WorkspaceConfig): AdditionalContextItem {
	return {
		id: createContextId(),
		kind: entry.kind,
		title: getContextTitle(entry),
		subtitle: entry.resourcePath,
		source: "manual",
		resourcePath: entry.resourcePath,
		data: { workspaceId: workspace.id, workspaceRoot: workspace.rootPath, relativePath: entry.relativePath }
	};
}

export function clipContextLabel(value: string, maxChars: number): string {
	return value.length <= maxChars ? value : `${value.slice(0, Math.max(0, maxChars - 3))}...`;
}

export function getFileNameFromLocalPath(filePath: string): string {
	return filePath.replaceAll("\\", "/").split("/").filter(Boolean).at(-1) ?? filePath;
}

export function createExternalFileContextItem(file: File, absolutePath: string): AdditionalContextItem {
	const data: Record<string, unknown> = { external: true, absolutePath };
	if (file.type.trim().length > 0) data.mimeType = file.type;
	if (file.size > 0) data.byteSize = file.size;
	if (file.lastModified > 0) data.lastModified = file.lastModified;
	return {
		id: createContextId(),
		kind: "file",
		title: clipContextLabel(file.name.trim() || getFileNameFromLocalPath(absolutePath), 200),
		subtitle: clipContextLabel(absolutePath, CONTEXT_SUBTITLE_MAX_CHARS),
		source: "manual",
		resourcePath: absolutePath,
		summary: "User explicitly dropped this local file from outside the workspace; use the absolute path as the reference for this turn.",
		data
	};
}

export function normalizeLocalPathForCompare(filePath: string): string {
	const normalized: string = filePath.trim().replaceAll("\\", "/");
	const rootAwarePath: string = /^[A-Za-z]:\/?$/u.test(normalized)
		? normalized.replace(/\/?$/u, "/")
		: normalized.length > 1 ? normalized.replace(/\/+$/u, "") : normalized;
	return /^[A-Za-z]:\//u.test(rootAwarePath) || rootAwarePath.startsWith("//") ? rootAwarePath.toLowerCase() : rootAwarePath;
}

export function isLocalPathInsideWorkspace(filePath: string, workspaceRoot: string): boolean {
	const normalizedFilePath: string = normalizeLocalPathForCompare(filePath);
	const normalizedWorkspaceRoot: string = normalizeLocalPathForCompare(workspaceRoot);
	return normalizedFilePath === normalizedWorkspaceRoot || normalizedFilePath.startsWith(`${normalizedWorkspaceRoot}/`);
}

export function isSupportedImageMimeType(value: string): value is SupportedImageMimeType {
	return SUPPORTED_IMAGE_MIME_TYPES.includes(value as SupportedImageMimeType);
}

export function getLocalPathForFile(file: File): string | null {
	try {
		const filePath: string = window.electronAPI.workspaceFs.getPathForFile(file);
		return filePath.trim().length > 0 ? filePath : null;
	} catch {
		const legacyPath: unknown = (file as File & { path?: unknown }).path;
		return typeof legacyPath === "string" && legacyPath.trim().length > 0 ? legacyPath : null;
	}
}

export function createContextFileSignature(file: File): string {
	return [getLocalPathForFile(file) ?? "", file.name, file.type, String(file.size), String(file.lastModified)].join("\u0000");
}

export function readFileAsDataUrl(file: File): Promise<string> {
	return new Promise((resolve, reject): void => {
		const reader = new FileReader();
		reader.addEventListener("load", (): void => typeof reader.result === "string" ? resolve(reader.result) : reject(new Error("Failed to read image file.")));
		reader.addEventListener("error", (): void => reject(reader.error ?? new Error("Failed to read image file.")));
		reader.readAsDataURL(file);
	});
}

export function readImageDimensions(dataUrl: string): Promise<{ width?: number; height?: number }> {
	return new Promise((resolve): void => {
		const image = new window.Image();
		image.onload = (): void => resolve({ width: image.naturalWidth > 0 ? image.naturalWidth : undefined, height: image.naturalHeight > 0 ? image.naturalHeight : undefined });
		image.onerror = (): void => resolve({});
		image.src = dataUrl;
	});
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
	return { workspaceId: null, workspace: null, chatMode: "agent", providerId: null, modelId: null, reasoningEffort: "medium" };
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
		const provider = selection.providers.find((item): boolean => item.configured && item.provider === lastComposerModel.providerId);
		if (provider?.models.some((model): boolean => model.id === lastComposerModel.modelId) === true) return lastComposerModel;
	}
	const firstProvider = selection?.providers.find((provider): boolean => provider.configured && provider.models.length > 0);
	const firstModelId: string | undefined = firstProvider?.models[0]?.id;
	return firstProvider !== undefined && firstModelId !== undefined ? { providerId: firstProvider.provider, modelId: firstModelId } : null;
}

export function createPreferredHomeDraft(preferences: ClientPreferences, selection: ProviderModelSelection | null, workspace: WorkspaceConfig | null = null): HomeDraft {
	const draft: HomeDraft = { ...createHomeDraft(), chatMode: preferences.newSessionComposer.mode, reasoningEffort: preferences.newSessionComposer.reasoningEffort, workspaceId: workspace?.id ?? null, workspace };
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
}): { providerId: string | null; modelId: string | null } {
	const fallbackProviderId: string | null = params.providerModelSelection?.activeModel.providerId ?? null;
	const fallbackModelId: string | null = params.providerModelSelection?.activeModel.modelId ?? null;
	return params.isNewSessionHome && params.workbench === null
		? { providerId: params.homeDraft.providerId ?? fallbackProviderId, modelId: params.homeDraft.modelId ?? fallbackModelId }
		: { providerId: params.workbench?.composer.provider ?? params.activeSessionMetadata?.provider ?? fallbackProviderId, modelId: params.workbench?.composer.model ?? params.activeSessionMetadata?.model ?? fallbackModelId };
}

export function createSingleSourceWorkspaceSnapshot(params: { id: string; name: string; rootPath: string; kind?: "godot"; godotExecutablePath?: string }): WorkspaceConfig {
	const primarySourceFolderId = "primary";
	return {
		id: params.id,
		name: params.name,
		kind: params.kind ?? "godot",
		rootPath: params.rootPath,
		icon: 0,
		color: 0,
		sourceFolders: [{ id: primarySourceFolderId, path: params.rootPath, capabilities: { git: false, godot: (params.kind ?? "godot") === "godot" } }],
		primarySourceFolderId,
		godotExecutablePath: params.godotExecutablePath
	};
}

export function createWorkspaceFromSessionMetadata(metadata: SessionMetadata, workbench: WorkbenchSnapshot): WorkspaceConfig | null {
	if (metadata.workspaceId !== undefined && metadata.workspaceRoot !== undefined) {
		return createSingleSourceWorkspaceSnapshot({ id: metadata.workspaceId, name: metadata.workspaceName ?? metadata.title, kind: metadata.workspaceKind ?? "godot", rootPath: metadata.workspaceRoot, godotExecutablePath: metadata.godotExecutablePath });
	}
	const selection = workbench.activeSelection;
	return typeof selection.workspaceId === "string" && typeof selection.workspaceRoot === "string"
		? createSingleSourceWorkspaceSnapshot({ id: selection.workspaceId, name: typeof selection.workspaceName === "string" && selection.workspaceName.length > 0 ? selection.workspaceName : metadata.title, rootPath: selection.workspaceRoot })
		: null;
}

export function createWorkspaceFromSessionOpenResult(result: SessionOpenResult): WorkspaceConfig | null {
	return createWorkspaceFromSessionMetadata(result.metadata, result.workbench);
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
		renderHints: { estimatedHeight: Math.max(96, Math.min(320, contentChars * 0.42) + (additionalContext.length > 0 ? 34 : 0)), contentChars, bodyPartCount: 1, heavyPartCount: 0 }
	};
}

export function mergeOptimisticUserBlocks(currentPage: TimelinePageState, nextPage: TimelinePageState, activeOptimisticRequestId: string | null): TimelinePageState {
	if (currentPage.sessionId !== null && nextPage.sessionId !== null && currentPage.sessionId !== nextPage.sessionId) return currentPage;
	const optimisticUserBlocks: TimelineBlock[] = currentPage.blocks.filter((block): boolean => activeOptimisticRequestId !== null && block.type === "user" && block.id.startsWith("optimistic:") && block.requestId === activeOptimisticRequestId);
	const missingOptimisticUserBlocks: Map<string, TimelineBlock> = new Map(optimisticUserBlocks.filter((optimisticBlock): boolean => !nextPage.blocks.some((block): boolean => block.type === "user" && block.requestId === optimisticBlock.requestId)).map((block): [string, TimelineBlock] => [block.requestId, block]));
	if (missingOptimisticUserBlocks.size === 0) return nextPage;
	const blocks: TimelineBlock[] = [];
	for (const block of nextPage.blocks) {
		const optimisticBlock = missingOptimisticUserBlocks.get(block.requestId);
		if (optimisticBlock !== undefined && block.type !== "user") {
			blocks.push(optimisticBlock);
			missingOptimisticUserBlocks.delete(block.requestId);
		}
		blocks.push(block);
	}
	return { ...nextPage, sessionId: currentPage.sessionId ?? nextPage.sessionId, blocks: [...blocks, ...missingOptimisticUserBlocks.values()], blockCount: nextPage.blockCount + missingOptimisticUserBlocks.size, hasMoreAfter: false };
}

export function trimTimelineFromRequest(page: TimelinePageState, requestId: string): TimelinePageState {
	const firstIndex: number = page.blocks.findIndex((block): boolean => block.requestId === requestId);
	return firstIndex < 0 ? page : { ...page, blocks: page.blocks.slice(0, firstIndex), blockCount: Math.max(0, page.blockCount - (page.blocks.length - firstIndex)), hasMoreAfter: false };
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

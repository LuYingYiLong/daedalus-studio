import { useCallback, useEffect, useRef, useState } from "react";
import { useEventListener, useLatest } from "ahooks";
import { Input, message as antdMessage, Modal, Typography, Spin } from "antd";
import { useTranslation } from "react-i18next";
import { useDiskSpaceCheck } from "@/shared/hooks/useDiskSpaceCheck";
import { onBackendReconnected } from "@/shared/api/transport/backend-client";
import type { BackendEvent } from "@/shared/api/transport/backend-rpc-client";
import useNativeTaskNotifications from "./hooks/useNativeTaskNotifications";
import useBackendEventStream from "./hooks/useBackendEventStream";
import useTimelineStreamBuffer from "./hooks/useTimelineStreamBuffer";
import useWorkbenchPatchQueue, { mergeWorkbenchPatch } from "./hooks/useWorkbenchPatchQueue";
import { fetchWorkspaces, selectWorkspace, type DeleteWorkspaceResult } from "@/api/workspace-api";
import styles from "./App.module.css";
import type { AdditionalContextItem, AgentGoalState, MessageQueueItem, PendingGuide, PendingToolBudget, PlanApprovalState, PlanClarificationState, SelectionAskThread, SessionMetadata, SessionOpenResult, SessionTimelineNavigationEntry, SessionTimelineResult, TimelineBlock, WorkbenchPatch, WorkbenchSnapshot, WorkflowTodoSnapshot, WorkspaceConfig } from "@/api/types";
import { isAgentGoalDismissed, isAgentGoalTerminal } from "@/features/composer/goal-display";
import { dismissGoal } from "@/api/goal-api";
import { checkSessionIntegrity, createSession, deleteSession, dismissWorkflowTodo, fetchSessions, fetchSessionTimeline, fetchSessionTimelineAfter, fetchSessionTimelineBefore, fetchSessionTimelineIndex, openSession, saveSessionUiMetadata, setSessionModel, type SaveSessionUiMetadataParams, type SessionIntegrityCheckResult } from "@/api/session-api";
import type { RetryUserMessagePayload } from "@/features/chat/UserBubble";
import { fetchProviderModelSelection, type ProviderModelSelection } from "@/api/provider-api";
import type { ProviderModelInfo, ProviderModelSelectionProvider, ProviderReasoningEffortOption } from "@/api/provider-api";
import { getPlanApprovalFromResult, normalizePlanClarification } from "./backend-event-state";
import { cancelChatMessage, continueToolBudget, retryAgentRun, sendChatMessage, stopToolBudget, type ChatMode, type ChatOutputTarget } from "@/api/chat-api";
import { fetchSlashCommands, type SlashCommandDefinition } from "@/api/command-api";
import { fetchSkills, type SkillSummary } from "@/api/skill-api";
import {
	approveApproval,
	fetchApprovalList,
	rejectApproval,
	setApprovalMode,
	type ApprovalMode,
	type PendingApproval,
} from "@/api/approval-api";
import {
	applyBackendEventToTimeline,
	applyWorkbenchSnapshot,
	createTimelinePageFromOpenResult,
	createTimelinePageFromTimelineResult,
	type TimelinePageState
} from "@/features/workbench/workbench-state";
import {
	createTimelinePageStore,
	useTimelineSelector,
	type TimelinePageStore
} from "@/features/workbench/timeline-page-store";
import {
	applyRunStateFromWorkbench,
	applyAgentRunState,
	createIdleRunState,
	createOptimisticRunState,
	finishOptimisticRunState,
	getRunControllerRequestId,
	isRunControllerActive,
	type RunControllerState
} from "@/features/workbench/run-state";
import { addGuide, deleteGuide, reorderGuides } from "@/api/guide-api";
import { addQueuedMessage, removeQueuedMessage, reorderQueuedMessages } from "@/api/message-queue-api";
import { getSessionTitle } from "./session-title";
import HomePage from "@/pages/home/HomePage";
import WorkspaceProjectDialog from "@/features/workspace/WorkspaceProjectDialog";
import { extractEnabledSkillRefs, type ComposerCompletionTrigger } from "@/features/composer/composer-completion";
import { createComposerReasoningEffortUpdate } from "@/features/composer/composer-reasoning-effort";
import { isComposerWorkspaceSelectionLocked } from "@/features/composer/composer-workspace-lock";
import { createWorkflowTodoSnapshotFromPlanData, getWorkflowTodoSnapshotKey, isWorkflowTodoActive, selectLatestWorkflowTodoSnapshot } from "@/features/composer/workflow-todo";
import { selectLatestGoalState } from "@/features/composer/goal-state";
import { saveImageAttachment, saveTextAttachment, type SaveImageAttachmentParams } from "@/api/image-attachment-api";
import {
	CLIENT_PREFERENCES_CHANGED_EVENT,
	DEFAULT_CLIENT_PREFERENCES,
	dispatchClientPreferencesChanged,
	fetchClientPreferences,
	updateClientPreferences,
	type ClientPreferences,
	type NewSessionComposerPreferences,
	type WorkspaceSidebarPreferences
} from "@/api/client-preferences-api";
import { DEFAULT_GENERAL_SETTINGS, fetchGeneralSettings, type GeneralSettings } from "@/api/general-settings-api";
import { approvePlan, revisePlan, submitPlanClarification, type PlanClarificationSubmission, type PlanResult } from "@/api/plan-api";
import type { BootstrapData } from "./bootstrap";
import {
	createDefaultSessionLayout,
	type SessionLayoutMap,
	type SessionLayoutPreferences
} from "@/features/dock/session-layout";
import {
	applyResponseFinished,
	getUnreadResponseSessionId,
	markActiveSessionRead,
	removeUnreadSessions
} from "@/features/workspace/session-unread";
import {
	applyRunningSessionEvent,
	markRunStopped,
	markSessionRunStarted,
	removeRunningSessions,
	syncSessionRunFromOpen,
	type RunningSessionState
} from "@/features/workspace/session-running";
import { Icon } from "@/assets/icons";
import type { SessionArchiveContext } from "@/features/workspace/WorkspaceTree";
import {
	recordOpenedSession,
	removeSessionFromNavigationHistory,
	SESSION_NAVIGATION_EVENT
} from "@/shared/lib/session-navigation-history";

type SupportedImageMimeType = SaveImageAttachmentParams["mimeType"];
type WorkspacePickedEntry = {
	name: string;
	relativePath: string;
	resourcePath: string;
	kind: "file" | "folder";
};

Spin.setDefaultIndicator(<Icon name="spin-indicator" className={styles.spinner} />)

function createFrontendFailedRunEvent(requestId: string, sessionId: string, message: string): BackendEvent {
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

type AppProps = {
	bootstrapData: BootstrapData;
};

const SUPPORTED_IMAGE_MIME_TYPES: readonly SupportedImageMimeType[] = ["image/png", "image/jpeg", "image/webp", "image/gif"];
const MAX_IMAGE_ATTACHMENT_BYTES: number = 5 * 1024 * 1024;
const RECENT_CONTEXT_FILE_WINDOW_MS: number = 2000;
const CONTEXT_SUBTITLE_MAX_CHARS: number = 400;
const FULL_TRUST_CONFIRMATION_TEXT: string = "ENABLE FULL TRUST";
const DEFAULT_SESSION_LAYOUT: SessionLayoutPreferences = createDefaultSessionLayout();

function createChatRequestId(): string {
	return `studio-chat-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function createPlanClarificationKey(clarification: PlanClarificationState): string {
	return `${clarification.planId}\u0000${clarification.question}`;
}

function createPlanApprovalKey(plan: PlanApprovalState): string {
	return `${plan.planId}\u0000${plan.updatedAt}\u0000${plan.previewMarkdown}`;
}

function isBackendRpcErrorMessage(message: string): boolean {
	return /^[a-z][a-z0-9_]*: /u.test(message);
}

function createContextId(): string {
	return typeof crypto.randomUUID === "function"
		? `studio-context-${crypto.randomUUID()}`
		: `studio-context-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function getContextTitle(entry: WorkspacePickedEntry): string {
	if (entry.name.trim().length > 0) {
		return entry.name;
	}

	const parts: string[] = entry.resourcePath.split("/").filter((part: string): boolean => part.length > 0);
	return parts.at(-1) ?? entry.resourcePath;
}

function createWorkspacePathContextItem(entry: WorkspacePickedEntry, workspace: WorkspaceConfig): AdditionalContextItem {
	return {
		id: createContextId(),
		kind: entry.kind,
		title: getContextTitle(entry),
		subtitle: entry.resourcePath,
		source: "manual",
		resourcePath: entry.resourcePath,
		data: {
			workspaceId: workspace.id,
			workspaceRoot: workspace.rootPath,
			relativePath: entry.relativePath
		}
	};
}

function clipContextLabel(value: string, maxChars: number): string {
	if (value.length <= maxChars) {
		return value;
	}

	return `${value.slice(0, Math.max(0, maxChars - 3))}...`;
}

function getFileNameFromLocalPath(filePath: string): string {
	const parts: string[] = filePath.replaceAll("\\", "/").split("/").filter((part: string): boolean => part.length > 0);
	return parts.at(-1) ?? filePath;
}

function createExternalFileContextItem(file: File, absolutePath: string): AdditionalContextItem {
	const data: Record<string, unknown> = {
		external: true,
		absolutePath
	};
	if (file.type.trim().length > 0) {
		data.mimeType = file.type;
	}
	if (file.size > 0) {
		data.byteSize = file.size;
	}
	if (file.lastModified > 0) {
		data.lastModified = file.lastModified;
	}

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

function normalizeLocalPathForCompare(filePath: string): string {
	const normalized: string = filePath.trim().replaceAll("\\", "/");
	const rootAwarePath: string = /^[A-Za-z]:\/?$/u.test(normalized)
		? normalized.replace(/\/?$/u, "/")
		: normalized.length > 1
			? normalized.replace(/\/+$/u, "")
			: normalized;
	return /^[A-Za-z]:\//u.test(rootAwarePath) || rootAwarePath.startsWith("//")
		? rootAwarePath.toLowerCase()
		: rootAwarePath;
}

function isLocalPathInsideWorkspace(filePath: string, workspaceRoot: string): boolean {
	const normalizedFilePath: string = normalizeLocalPathForCompare(filePath);
	const normalizedWorkspaceRoot: string = normalizeLocalPathForCompare(workspaceRoot);
	return normalizedFilePath === normalizedWorkspaceRoot || normalizedFilePath.startsWith(`${normalizedWorkspaceRoot}/`);
}

function isSupportedImageMimeType(value: string): value is SupportedImageMimeType {
	return SUPPORTED_IMAGE_MIME_TYPES.includes(value as SupportedImageMimeType);
}

function getLocalPathForFile(file: File): string | null {
	try {
		const filePath: string = window.electronAPI.workspaceFs.getPathForFile(file);
		return filePath.trim().length > 0 ? filePath : null;
	} catch {
		const legacyPath: unknown = (file as File & { path?: unknown }).path;
		return typeof legacyPath === "string" && legacyPath.trim().length > 0 ? legacyPath : null;
	}
}

function createContextFileSignature(file: File): string {
	return [
		getLocalPathForFile(file) ?? "",
		file.name,
		file.type,
		String(file.size),
		String(file.lastModified)
	].join("\u0000");
}

function readFileAsDataUrl(file: File): Promise<string> {
	return new Promise((resolve, reject): void => {
		const reader = new FileReader();
		reader.addEventListener("load", (): void => {
			if (typeof reader.result === "string") {
				resolve(reader.result);
				return;
			}
			reject(new Error("Failed to read image file."));
		});
		reader.addEventListener("error", (): void => {
			reject(reader.error ?? new Error("Failed to read image file."));
		});
		reader.readAsDataURL(file);
	});
}

function readImageDimensions(dataUrl: string): Promise<{ width?: number; height?: number }> {
	return new Promise((resolve): void => {
		const image = new window.Image();
		image.onload = (): void => {
			resolve({
				width: image.naturalWidth > 0 ? image.naturalWidth : undefined,
				height: image.naturalHeight > 0 ? image.naturalHeight : undefined
			});
		};
		image.onerror = (): void => {
			resolve({});
		};
		image.src = dataUrl;
	});
}

function getChatMode(workbench: WorkbenchSnapshot | null): ChatMode {
	return workbench?.composer.chatMode ?? "ask";
}

/** The execution target is an explicit UI policy, never inferred from prompt text. */
function getChatOutputTarget(mode: ChatMode, workspaceId: string | null | undefined): ChatOutputTarget {
	return workspaceId !== undefined && workspaceId !== null && (mode === "agent" || mode === "goal")
		? "workspace"
		: "chat";
}

/**
 * A session can retain its workspace selection while the rendered workspace
 * snapshot is being refreshed. Keep the execution contract tied to that
 * persisted selection so an Agent retry cannot silently fall back to chat.
 */
function getCurrentWorkspaceId(
	activeWorkspace: WorkspaceConfig | null,
	workbench: WorkbenchSnapshot | null
): string | null {
	if (activeWorkspace !== null) {
		return activeWorkspace.id;
	}

	const workspaceId: unknown = workbench?.activeSelection.workspaceId;
	return typeof workspaceId === "string" && workspaceId.length > 0
		? workspaceId
		: null;
}

function getPendingApprovalCount(workbench: WorkbenchSnapshot | null): number {
	const count = workbench?.pendingApproval?.count;
	return typeof count === "number" && Number.isFinite(count) ? count : 0;
}

type HomeDraft = {
	workspaceId: string | null;
	workspace: WorkspaceConfig | null;
	chatMode: ChatMode;
	providerId: string | null;
	modelId: string | null;
	reasoningEffort: string;
};

function createHomeDraft(): HomeDraft {
	return {
		workspaceId: null,
		workspace: null,
		chatMode: "agent",
		providerId: null,
		modelId: null,
		reasoningEffort: "medium"
	};
}

function findPreferredComposerModel(
	preferences: ClientPreferences,
	selection: ProviderModelSelection | null
): { providerId: string; modelId: string } | null {
	const lastComposerModel = preferences.newSessionComposer.model ?? preferences.lastComposerModel;
	if (lastComposerModel !== null && selection !== null) {
		const provider: ProviderModelSelectionProvider | undefined = selection.providers.find((item: ProviderModelSelectionProvider): boolean => {
			return item.configured && item.provider === lastComposerModel.providerId;
		});
		if (provider?.models.some((model): boolean => model.id === lastComposerModel.modelId) === true) {
			return lastComposerModel;
		}
	}

	const firstProviderWithModel: ProviderModelSelectionProvider | undefined = selection?.providers.find((provider: ProviderModelSelectionProvider): boolean => {
		return provider.configured && provider.models.length > 0;
	});
	const firstModelId: string | undefined = firstProviderWithModel?.models[0]?.id;
	if (firstProviderWithModel !== undefined && firstModelId !== undefined) {
		return {
			providerId: firstProviderWithModel.provider,
			modelId: firstModelId
		};
	}

	return null;
}

function createPreferredHomeDraft(
	preferences: ClientPreferences,
	selection: ProviderModelSelection | null,
	workspace: WorkspaceConfig | null = null
): HomeDraft {
	const draft: HomeDraft = {
		...createHomeDraft(),
		chatMode: preferences.newSessionComposer.mode,
		reasoningEffort: preferences.newSessionComposer.reasoningEffort,
		workspaceId: workspace?.id ?? null,
		workspace
	};
	const preferredModel = findPreferredComposerModel(preferences, selection);
	if (preferredModel === null) {
		return draft;
	}

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

function findProviderModel(
	selection: ProviderModelSelection | null,
	providerId: string | null,
	modelId: string | null
): ProviderModelInfo | null {
	if (selection === null || providerId === null || modelId === null) {
		return null;
	}

	const provider: ProviderModelSelectionProvider | undefined = selection.providers.find((item: ProviderModelSelectionProvider): boolean => {
		return item.provider === providerId;
	});
	return provider?.models.find((model: ProviderModelInfo): boolean => model.id === modelId) ?? null;
}

function resolveReasoningEffortForComposerModelChange(params: {
	selection: ProviderModelSelection | null;
	previousProviderId: string | null;
	previousModelId: string | null;
	previousEffort: string;
	nextProviderId: string;
	nextModelId: string;
}): string {
	const previousModel: ProviderModelInfo | null = findProviderModel(
		params.selection,
		params.previousProviderId,
		params.previousModelId
	);
	const previousOption: ProviderReasoningEffortOption | undefined = previousModel?.capabilities.reasoningEfforts?.find(
		(option: ProviderReasoningEffortOption): boolean => option.id === params.previousEffort
	);
	const targetFallback: ProviderReasoningEffortOption["fallback"] = previousOption?.fallback
		?? (params.previousEffort === "low" || params.previousEffort === "medium" || params.previousEffort === "high" || params.previousEffort === "max"
			? params.previousEffort
			: "medium");
	const nextOptions: ProviderReasoningEffortOption[] = findProviderModel(
		params.selection,
		params.nextProviderId,
		params.nextModelId
	)?.capabilities.reasoningEfforts ?? [];
	return nextOptions.find((option: ProviderReasoningEffortOption): boolean => option.id === targetFallback)?.id
		?? nextOptions.find((option: ProviderReasoningEffortOption): boolean => option.fallback === targetFallback)?.id
		?? nextOptions.find((option: ProviderReasoningEffortOption): boolean => option.id === "medium")?.id
		?? nextOptions[0]?.id
		?? "medium";
}

function getDisplayedComposerModel(params: {
	isNewSessionHome: boolean;
	homeDraft: HomeDraft;
	workbench: WorkbenchSnapshot | null;
	activeSessionMetadata: SessionMetadata | null;
	providerModelSelection: ProviderModelSelection | null;
}): { providerId: string | null; modelId: string | null } {
	const fallbackProviderId: string | null = params.providerModelSelection?.activeModel.providerId ?? null;
	const fallbackModelId: string | null = params.providerModelSelection?.activeModel.modelId ?? null;
	if (params.isNewSessionHome && params.workbench === null) {
		return {
			providerId: params.homeDraft.providerId ?? fallbackProviderId,
			modelId: params.homeDraft.modelId ?? fallbackModelId
		};
	}

	return {
		providerId: params.workbench?.composer.provider ?? params.activeSessionMetadata?.provider ?? fallbackProviderId,
		modelId: params.workbench?.composer.model ?? params.activeSessionMetadata?.model ?? fallbackModelId
	};
}

function createSingleSourceWorkspaceSnapshot(params: {
	id: string;
	name: string;
	rootPath: string;
	kind?: "godot";
	godotExecutablePath?: string;
}): WorkspaceConfig {
	const primarySourceFolderId = "primary";
	return {
		id: params.id,
		name: params.name,
		kind: params.kind ?? "godot",
		rootPath: params.rootPath,
		icon: 0,
		color: 0,
		sourceFolders: [{
			id: primarySourceFolderId,
			path: params.rootPath,
			capabilities: {
				git: false,
				godot: (params.kind ?? "godot") === "godot"
			}
		}],
		primarySourceFolderId,
		godotExecutablePath: params.godotExecutablePath
	};
}

function createWorkspaceFromSessionMetadata(metadata: SessionMetadata, workbench: WorkbenchSnapshot): WorkspaceConfig | null {
	const metadataWorkspaceId: string | undefined = metadata.workspaceId;
	const metadataWorkspaceRoot: string | undefined = metadata.workspaceRoot;
	if (metadataWorkspaceId !== undefined && metadataWorkspaceRoot !== undefined) {
		return createSingleSourceWorkspaceSnapshot({
			id: metadataWorkspaceId,
			name: metadata.workspaceName ?? metadata.title,
			kind: metadata.workspaceKind ?? "godot",
			rootPath: metadataWorkspaceRoot,
			godotExecutablePath: metadata.godotExecutablePath
		});
	}

	const selection = workbench.activeSelection;
	if (typeof selection.workspaceId === "string" && typeof selection.workspaceRoot === "string") {
		return createSingleSourceWorkspaceSnapshot({
			id: selection.workspaceId,
			name: typeof selection.workspaceName === "string" && selection.workspaceName.length > 0
				? selection.workspaceName
				: metadata.title,
			kind: "godot",
			rootPath: selection.workspaceRoot
		});
	}

	return null;
}

function createWorkspaceFromSessionOpenResult(result: SessionOpenResult): WorkspaceConfig | null {
	return createWorkspaceFromSessionMetadata(result.metadata, result.workbench);
}

function createWorkflowTodoSnapshotFromTimelineResult(result: {
	latestWorkflowSnapshot: unknown | null;
	latestAgentSnapshot: unknown | null;
}): WorkflowTodoSnapshot | null {
	return selectLatestWorkflowTodoSnapshot(result.latestAgentSnapshot, result.latestWorkflowSnapshot);
}

function getWorkflowTodoSnapshotIdentity(snapshot: WorkflowTodoSnapshot): string {
	return snapshot.workflowId ?? snapshot.runId ?? snapshot.title ?? "workflow";
}

function isSameWorkflowTodoSnapshot(left: WorkflowTodoSnapshot, right: WorkflowTodoSnapshot): boolean {
	return getWorkflowTodoSnapshotIdentity(left) === getWorkflowTodoSnapshotIdentity(right);
}

function createOptimisticUserBlock(requestId: string, message: string, additionalContext: AdditionalContextItem[]): TimelineBlock {
	const contentChars: number = message.length + additionalContext.reduce((total: number, item: AdditionalContextItem): number => {
		return total + item.title.length + (item.subtitle?.length ?? 0);
	}, 0);

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

function mergeOptimisticUserBlocks(currentPage: TimelinePageState, nextPage: TimelinePageState, activeOptimisticRequestId: string | null): TimelinePageState {
	if (currentPage.sessionId !== null && nextPage.sessionId !== null && currentPage.sessionId !== nextPage.sessionId) {
		console.warn("[App] ignored timeline refresh for different session", {
			currentSessionId: currentPage.sessionId,
			nextSessionId: nextPage.sessionId
		});
		return currentPage;
	}

	const optimisticUserBlocks: TimelineBlock[] = currentPage.blocks.filter((block: TimelineBlock): boolean => {
		return activeOptimisticRequestId !== null
			&& block.type === "user"
			&& block.id.startsWith("optimistic:")
			&& block.requestId === activeOptimisticRequestId;
	});
	const missingOptimisticUserBlocks: Map<string, TimelineBlock> = new Map(optimisticUserBlocks.filter((optimisticBlock: TimelineBlock): boolean => {
		return !nextPage.blocks.some((block: TimelineBlock): boolean => {
			return block.type === "user" && block.requestId === optimisticBlock.requestId;
		});
	}).map((optimisticBlock: TimelineBlock): [string, TimelineBlock] => [optimisticBlock.requestId, optimisticBlock]));

	if (missingOptimisticUserBlocks.size === 0) {
		return nextPage;
	}

	const missingOptimisticUserBlockCount: number = missingOptimisticUserBlocks.size;
	const blocks: TimelineBlock[] = [];
	for (const block of nextPage.blocks) {
		const optimisticBlock: TimelineBlock | undefined = missingOptimisticUserBlocks.get(block.requestId);
		if (optimisticBlock !== undefined && block.type !== "user") {
			blocks.push(optimisticBlock);
			missingOptimisticUserBlocks.delete(block.requestId);
		}
		blocks.push(block);
	}

	return {
		...nextPage,
		sessionId: currentPage.sessionId ?? nextPage.sessionId,
		blocks: [
			...blocks,
			...missingOptimisticUserBlocks.values()
		],
		blockCount: nextPage.blockCount + missingOptimisticUserBlockCount,
		hasMoreAfter: false
	};
}

function trimTimelineFromRequest(page: TimelinePageState, requestId: string): TimelinePageState {
	const firstIndex: number = page.blocks.findIndex((block: TimelineBlock): boolean => block.requestId === requestId);

	if (firstIndex < 0) {
		return page;
	}

	return {
		...page,
		blocks: page.blocks.slice(0, firstIndex),
		blockCount: Math.max(0, page.blockCount - (page.blocks.length - firstIndex)),
		hasMoreAfter: false
	};
}

function getSessionSortTime(session: SessionMetadata): number {
	const updatedTime: number = Date.parse(session.updatedAt);
	if (Number.isFinite(updatedTime)) {
		return updatedTime;
	}

	const createdTime: number = Date.parse(session.createdAt);
	return Number.isFinite(createdTime) ? createdTime : 0;
}

function getRecentSessions(sessions: SessionMetadata[]): SessionMetadata[] {
	return [...sessions]
		.sort((left: SessionMetadata, right: SessionMetadata): number => getSessionSortTime(right) - getSessionSortTime(left))
		.slice(0, 3);
}

function App({ bootstrapData }: AppProps): React.JSX.Element {
	const { t } = useTranslation();
	const [workspaceRefreshToken, setWorkspaceRefreshToken] = useState<number>(0);
	const [isNewSessionHome, setIsNewSessionHome] = useState<boolean>(true);
	const [homeDraft, setHomeDraft] = useState<HomeDraft>(() => createPreferredHomeDraft(bootstrapData.clientPreferences, bootstrapData.providerModelSelection));
	const [homeWorkspaceOptions, setHomeWorkspaceOptions] = useState<WorkspaceConfig[]>(() => bootstrapData.workspaceList.workspaces);
	const [isWorkspaceProjectDialogOpen, setIsWorkspaceProjectDialogOpen] = useState<boolean>(false);
	const [isWorkspaceSessionCreating, setIsWorkspaceSessionCreating] = useState<boolean>(false);
  const [pendingTextAttachmentCount, setPendingTextAttachmentCount] = useState<number>(0);
  const isAddingTextAttachment: boolean = pendingTextAttachmentCount > 0;
	const [isHomeSubmitting, setIsHomeSubmitting] = useState<boolean>(false);
	const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
	const [sessionLayouts, setSessionLayouts] = useState<SessionLayoutMap>(() => bootstrapData.sessionLayouts);
	const [temporarySessionLayout, setTemporarySessionLayout] = useState<SessionLayoutPreferences>(
		() => createDefaultSessionLayout()
	);
	const activeSessionIdRef = useRef<string | null>(null);
	const temporaryDraftSessionIdRef = useRef<string | null>(null);
	const temporarySessionCreationRef = useRef<Promise<void> | null>(null);
	const [activeSessionMetadata, setActiveSessionMetadata] = useState<SessionMetadata | null>(null);
	const [recentSessions, setRecentSessions] = useState<SessionMetadata[]>(() => getRecentSessions(bootstrapData.sessionList.sessions));
	const recentSessionsRef = useLatest(recentSessions);
	useEffect((): (() => void) => {
		return window.electronAPI.sessionCatalog.onChanged((): void => {
			setWorkspaceRefreshToken((currentToken: number): number => currentToken + 1);
		});
	}, []);
	const [activeWorkspace, setActiveWorkspace] = useState<WorkspaceConfig | null>(null);
	const timelineStoreRef = useRef<TimelinePageStore | null>(null);
	if (timelineStoreRef.current === null) {
		timelineStoreRef.current = createTimelinePageStore();
	}
	const timelineStore: TimelinePageStore = timelineStoreRef.current;
	const timelineBlockCount: number = useTimelineSelector(timelineStore, (page: TimelinePageState): number => page.blockCount);
	const [timelineNavigationEntries, setTimelineNavigationEntries] = useState<SessionTimelineNavigationEntry[]>([]);
	const [selectionAskThreads, setSelectionAskThreads] = useState<SelectionAskThread[]>([]);
	const [workbench, setWorkbench] = useState<WorkbenchSnapshot | null>(null);
	const activeWorkbenchRef = useLatest(workbench);
	const [sessionError, setSessionError] = useState<string | null>(null);
	const [isSessionLoading, setIsSessionLoading] = useState(false);
	const [isTimelineLoadingBefore, setIsTimelineLoadingBefore] = useState<boolean>(false);
	const [isTimelineLoadingAfter, setIsTimelineLoadingAfter] = useState<boolean>(false);
	const [providerModelSelection, setProviderModelSelection] = useState<ProviderModelSelection | null>(bootstrapData.providerModelSelection);
	const [slashCommands, setSlashCommands] = useState<SlashCommandDefinition[]>(() => bootstrapData.slashCommands);
	const [skills, setSkills] = useState<SkillSummary[]>(() => bootstrapData.skills);
	const [approvalMode, setApprovalModeState] = useState<ApprovalMode>(
		() => bootstrapData.clientPreferences.newSessionComposer.approvalMode
	);
	const [isApprovalModeSaving, setIsApprovalModeSaving] = useState<boolean>(false);
	const [pendingApproval, setPendingApproval] = useState<PendingApproval | null>(null);
	const [approvalError, setApprovalError] = useState<string | null>(null);
	const [isApproving, setIsApproving] = useState<boolean>(false);
	const [isRejecting, setIsRejecting] = useState<boolean>(false);
	const [isToolBudgetContinuing, setIsToolBudgetContinuing] = useState<boolean>(false);
	const [isToolBudgetStopping, setIsToolBudgetStopping] = useState<boolean>(false);
	const [toolBudgetError, setToolBudgetError] = useState<string | null>(null);
	const [latestPlanClarification, setLatestPlanClarification] = useState<PlanClarificationState | null>(null);
	const [suppressedPlanClarificationKey, setSuppressedPlanClarificationKey] = useState<string | null>(null);
	const [isPlanClarificationSubmitting, setIsPlanClarificationSubmitting] = useState<boolean>(false);
	const [planClarificationError, setPlanClarificationError] = useState<string | null>(null);
	const [latestPlanApproval, setLatestPlanApproval] = useState<PlanApprovalState | null>(null);
	const [isPlanApproving, setIsPlanApproving] = useState<boolean>(false);
	const [isPlanRevising, setIsPlanRevising] = useState<boolean>(false);
	const [planApprovalError, setPlanApprovalError] = useState<string | null>(null);
	const [messageApi, messageContextHolder] = antdMessage.useMessage();
	const [isFullTrustModalOpen, setIsFullTrustModalOpen] = useState<boolean>(false);
	const [fullTrustConfirmationText, setFullTrustConfirmationText] = useState<string>("");
	const [activeRetryRequestId, setActiveRetryRequestId] = useState<string | null>(null);
	const [workflowTodoSnapshot, setWorkflowTodoSnapshot] = useState<WorkflowTodoSnapshot | null>(null);
	const [currentGoal, setCurrentGoal] = useState<AgentGoalState | null>(null);
	const dismissedTerminalGoalIdsRef = useRef<Set<string>>(new Set());
	const applyCurrentGoalSnapshot = useCallback((nextGoal: AgentGoalState): void => {
		setCurrentGoal((current: AgentGoalState | null): AgentGoalState | null => {
			if (isAgentGoalDismissed(nextGoal, dismissedTerminalGoalIdsRef.current)) return current?.goalId === nextGoal.goalId ? null : current;
			return selectLatestGoalState(current, nextGoal);
		});
	}, []);
	const [runState, setRunState] = useState<RunControllerState>(() => createIdleRunState());
	const [runningSessionState, setRunningSessionState] = useState<RunningSessionState>(() => new Map());
	const [unreadSessionIds, setUnreadSessionIds] = useState<ReadonlySet<string>>(() => new Set<string>());
	const windowFocusedRef = useRef<boolean>(document.hasFocus());
	const [clientPreferences, setClientPreferences] = useState<ClientPreferences>(bootstrapData.clientPreferences ?? DEFAULT_CLIENT_PREFERENCES);
	const clientPreferencesRef = useLatest(clientPreferences);
	const [generalSettings, setGeneralSettings] = useState<GeneralSettings>(bootstrapData.generalSettings ?? DEFAULT_GENERAL_SETTINGS);
	const isTimelinePageLoadingRef = useRef<boolean>(false);
	const navigationVersionRef = useRef<number>(0);
	const activeChatRequestIdRef = useRef<string | null>(null);
	const cancelledChatRequestIdsRef = useRef<Set<string>>(new Set());
	const composerDraftsRef = useRef<Map<string, string>>(new Map());
	const [composerInputReset, setComposerInputReset] = useState<{ scopeId: string; revision: number }>({
		scopeId: "home",
		revision: 0
	});
	const slashCommandsLoadingRef = useRef<boolean>(false);
	const skillsLoadingRef = useRef<boolean>(false);
	const slashCommandsRetryAtRef = useRef<number>(0);
	const skillsRetryAtRef = useRef<number>(0);
	const recentContextFileSignaturesRef = useRef<Map<string, number>>(new Map());
	const initializedWorkflowTodoKeyRef = useRef<string>("");
	const expandedActiveWorkflowTodoKeyRef = useRef<string>("");
	const pendingUserActionRequestIdsRef = useRef<Set<string>>(new Set());
	const activeSessionTitleRef = useRef<string>("Daedalus session");
	const activeSessionLayout: SessionLayoutPreferences = activeSessionId === null
		? temporarySessionLayout
		: sessionLayouts[activeSessionId] ?? DEFAULT_SESSION_LAYOUT;

	useEventListener(CLIENT_PREFERENCES_CHANGED_EVENT, (event: Event): void => {
		const preferences: ClientPreferences | undefined = (event as CustomEvent<ClientPreferences>).detail;
		if (preferences !== undefined) {
			clientPreferencesRef.current = preferences;
			setClientPreferences(preferences);
		}
	});

	useEventListener("daedalus:retry-agent-run", (event: Event): void => {
		const detail: unknown = (event as CustomEvent<unknown>).detail;
		if (
			typeof detail !== "object"
			|| detail === null
			|| !("runId" in detail)
			|| typeof (detail as { runId?: unknown }).runId !== "string"
		) {
			return;
		}
		void handleInterruptedRunRetry((detail as { runId: string }).runId);
	});

	const handleWorkspaceSidebarChange = useCallback((
		workspaceSidebar: WorkspaceSidebarPreferences,
		options: { persist?: boolean } = {}
	): void => {
		const nextPreferences: ClientPreferences = {
			...clientPreferencesRef.current,
			workspaceSidebar
		};
		clientPreferencesRef.current = nextPreferences;
		setClientPreferences(nextPreferences);
		dispatchClientPreferencesChanged(nextPreferences);
		if (options.persist === false) {
			return;
		}
		void updateClientPreferences({ workspaceSidebar }).then((savedPreferences: ClientPreferences): void => {
			clientPreferencesRef.current = savedPreferences;
			setClientPreferences(savedPreferences);
		}).catch((error: unknown): void => {
			console.error("[App] save workspace sidebar preference failed", error);
		});
	}, [clientPreferencesRef]);

	const handleSessionLayoutChange = useCallback((
		layout: SessionLayoutPreferences,
		options: { persist?: boolean } = {}
	): void => {
		const sessionId: string | null = activeSessionId;
		if (sessionId === null) {
			setTemporarySessionLayout(layout);
			return;
		}

		setSessionLayouts((currentLayouts: SessionLayoutMap): SessionLayoutMap => ({
			...currentLayouts,
			[sessionId]: layout
		}));
		if (options.persist === false) {
			return;
		}
		void window.electronAPI.sessionLayout.save({ sessionId, layout }).catch((error: unknown): void => {
			console.error("[App] save session layout failed", error);
		});
	}, [activeSessionId]);

	const removeStoredSessionLayouts = useCallback((sessionIds: string[]): void => {
		if (sessionIds.length === 0) {
			return;
		}
		const removedIds: Set<string> = new Set(sessionIds);
		setSessionLayouts((currentLayouts: SessionLayoutMap): SessionLayoutMap => {
			return Object.fromEntries(
				Object.entries(currentLayouts).filter(([sessionId]): boolean => !removedIds.has(sessionId))
			);
		});
		void window.electronAPI.sessionLayout.remove({ sessionIds: [...removedIds] }).catch((error: unknown): void => {
			console.error("[App] remove session layouts failed", error);
		});
	}, []);

	const deleteSessionWithLayout = useCallback(async (sessionId: string): Promise<void> => {
		await deleteSession(sessionId);
		removeSessionFromNavigationHistory(sessionId);
		composerDraftsRef.current.delete(sessionId);
		removeStoredSessionLayouts([sessionId]);
		setRunningSessionState((current: RunningSessionState): RunningSessionState => {
			return removeRunningSessions(current, [sessionId]);
		});
		setUnreadSessionIds((currentSessionIds: ReadonlySet<string>): ReadonlySet<string> => {
			return removeUnreadSessions(currentSessionIds, [sessionId]);
		});
	}, [removeStoredSessionLayouts]);

	useDiskSpaceCheck();
	const { showNativeTaskNotification, clearNativeTaskNotificationAttention } = useNativeTaskNotifications();
	const {
		discardPendingTimelineEvents,
		flushPendingTimelineEvents,
		enqueueTimelineStreamingEvent
	} = useTimelineStreamBuffer({ activeSessionIdRef, timelineStore });

	useEffect((): void => {
		void window.electronAPI.tray.updateRecentSessions(
			recentSessions.map((session: SessionMetadata): TrayRecentSession => ({
				id: session.id,
				title: getSessionTitle(session, session.id)
			}))
		).catch((error: unknown): void => {
			console.error("[App] tray recent session update failed", error);
		});
	}, [recentSessions]);

	useEffect((): (() => void) => {
		const removeNewChatListener: () => void = window.electronAPI.tray.onNewChat((): void => {
			void handleNewSession();
		});
		const removeOpenSessionListener: () => void = window.electronAPI.tray.onOpenSession((sessionId: string): void => {
			void (async (): Promise<void> => {
				const cachedSession: SessionMetadata | undefined = recentSessionsRef.current.find((session: SessionMetadata): boolean => session.id === sessionId);
				if (cachedSession !== undefined) {
					await handleSessionSelect(cachedSession);
					return;
				}

				const sessionList = await fetchSessions();
				setRecentSessions(getRecentSessions(sessionList.sessions));
				const session: SessionMetadata | undefined = sessionList.sessions.find((item: SessionMetadata): boolean => item.id === sessionId);
				if (session === undefined) {
					showTransientError("Session not found");
					return;
				}

				await handleSessionSelect(session);
			})().catch((error: unknown): void => {
				showTransientError(error instanceof Error ? error.message : "Failed to open session");
				console.error("[App] tray open session failed", error);
			});
		});

		return (): void => {
			removeNewChatListener();
			removeOpenSessionListener();
		};
	}, []);

	const handleSessionsChange = useCallback((sessions: SessionMetadata[]): void => {
		setRecentSessions(getRecentSessions(sessions));
	}, []);

	useEffect((): void => {
		if (runState.status === "idle") {
			activeChatRequestIdRef.current = null;
		}
	}, [runState.status]);

	useEffect((): void => {
		setRunState((currentState: RunControllerState): RunControllerState => applyRunStateFromWorkbench(currentState, workbench));
	}, [workbench]);

	useEffect((): void => {
		setToolBudgetError(null);
	}, [workbench?.pendingToolBudget?.budgetId]);

	const loadSlashCommands = useCallback(async (): Promise<void> => {
		if (slashCommandsLoadingRef.current || Date.now() < slashCommandsRetryAtRef.current) {
			return;
		}

		slashCommandsLoadingRef.current = true;
		try {
			setSlashCommands(await fetchSlashCommands());
			slashCommandsRetryAtRef.current = 0;
		} catch (error: unknown) {
			slashCommandsRetryAtRef.current = Date.now() + 3000;
			console.error("[App] load slash commands failed", error);
		} finally {
			slashCommandsLoadingRef.current = false;
		}
	}, []);

	const loadSkills = useCallback(async (): Promise<void> => {
		if (skillsLoadingRef.current || Date.now() < skillsRetryAtRef.current) {
			return;
		}

		skillsLoadingRef.current = true;
		try {
			const result = await fetchSkills();

			setSkills(result.skills);
			skillsRetryAtRef.current = 0;
		} catch (error: unknown) {
			setSkills([]);
			skillsRetryAtRef.current = Date.now() + 3000;
			console.error("[App] load skills failed", error);
		} finally {
			skillsLoadingRef.current = false;
		}
	}, []);

	const loadHomeWorkspaces = useCallback(async (): Promise<void> => {
		try {
			const result = await fetchWorkspaces();

			setHomeWorkspaceOptions(result.workspaces);
		} catch (error: unknown) {
			console.error("[App] load home workspaces failed", error);
		}
	}, []);

	function rememberLoadedWorkflowTodo(snapshot: WorkflowTodoSnapshot | null): void {
		initializedWorkflowTodoKeyRef.current = snapshot === null ? "" : getWorkflowTodoSnapshotKey(snapshot);
		if (snapshot === null) {
			expandedActiveWorkflowTodoKeyRef.current = "";
		}
	}

	function clearWorkflowTodoUiState(options: { preservePlanSnapshot?: boolean } = {}): void {
		if (options.preservePlanSnapshot === true) {
			setWorkflowTodoSnapshot((currentSnapshot: WorkflowTodoSnapshot | null): WorkflowTodoSnapshot | null => {
				if (currentSnapshot?.source === "plan") {
					return currentSnapshot;
				}

				rememberLoadedWorkflowTodo(null);
				return null;
			});
			return;
		}

		setWorkflowTodoSnapshot(null);
		rememberLoadedWorkflowTodo(null);
	}

	function expandWorkflowTodoPanel(): void {
		setActiveSessionMetadata((currentMetadata: SessionMetadata | null): SessionMetadata | null => {
			return currentMetadata === null
				? currentMetadata
				: {
					...currentMetadata,
					workflowTodoCollapsed: false
				};
		});
	}

	function showWorkflowTodo(snapshot: WorkflowTodoSnapshot | null, forceExpand: boolean = false): void {
		setWorkflowTodoSnapshot(snapshot);
		rememberLoadedWorkflowTodo(snapshot);
		if (snapshot !== null && forceExpand) {
			expandWorkflowTodoPanel();
		}
	}

	function resetPlanClarificationUiState(): void {
		setLatestPlanClarification(null);
		setSuppressedPlanClarificationKey(null);
		setIsPlanClarificationSubmitting(false);
		setPlanClarificationError(null);
	}

	function resetPlanApprovalUiState(): void {
		setLatestPlanApproval(null);
		setIsPlanApproving(false);
		setIsPlanRevising(false);
		setPlanApprovalError(null);
	}

	function resetSessionPresentationState(): void {
		timelineStore.reset();
		setIsTimelineLoadingBefore(false);
		setIsTimelineLoadingAfter(false);
		setWorkbench(null);
		clearWorkflowTodoUiState();
		setCurrentGoal(null);
		resetPlanClarificationUiState();
		resetPlanApprovalUiState();
		setActiveRetryRequestId(null);
		setRunState((currentState: RunControllerState): RunControllerState => createIdleRunState(currentState.sequence));
	}

	function applyInitialWorkflowTodoPreference(snapshot: WorkflowTodoSnapshot | null): void {
		if (snapshot === null) {
			initializedWorkflowTodoKeyRef.current = "";
			return;
		}

		const workflowTodoKey: string = getWorkflowTodoSnapshotKey(snapshot);
		const workflowTodoIsActive: boolean = isWorkflowTodoActive(snapshot);
		if (initializedWorkflowTodoKeyRef.current === workflowTodoKey) {
			if (!workflowTodoIsActive || expandedActiveWorkflowTodoKeyRef.current === workflowTodoKey) {
				return;
			}
		}

		initializedWorkflowTodoKeyRef.current = workflowTodoKey;
		if (workflowTodoIsActive) {
			expandedActiveWorkflowTodoKeyRef.current = workflowTodoKey;
		}
		const workflowTodoCollapsed: boolean = workflowTodoIsActive ? false : !generalSettings.autoExpandTodoList;
		setActiveSessionMetadata((currentMetadata: SessionMetadata | null): SessionMetadata | null => {
			return currentMetadata === null
				? currentMetadata
				: {
					...currentMetadata,
					workflowTodoCollapsed
				};
		});
		void saveSessionUiMetadata({ workflowTodoCollapsed }).catch((error: unknown): void => {
			console.error("[App] save initial workflow todo collapsed state failed", error);
		});
	}

	useEffect((): (() => void) => {
		let cancelled: boolean = false;

		async function loadPreferences(): Promise<void> {
			try {
				const [preferences, settings] = await Promise.all([
					fetchClientPreferences(),
					fetchGeneralSettings()
				]);
				if (!cancelled) {
					setClientPreferences(preferences);
					setGeneralSettings(settings);
				}
			} catch (error: unknown) {
				console.error("[App] load preferences failed", error);
			}
		}

		void loadPreferences();

		return (): void => {
			cancelled = true;
		};
	}, []);

	const handleCompletionOpen = useCallback((trigger: ComposerCompletionTrigger): void => {
		if (trigger === "/" && slashCommands.length === 0) {
			void loadSlashCommands();
		}

		if (trigger === "@" && skills.length === 0) {
			void loadSkills();
		}
	}, [loadSkills, loadSlashCommands, skills.length, slashCommands.length]);

	const refreshPendingApproval = useCallback(async (): Promise<void> => {
		if (activeSessionIdRef.current === null) {
			setPendingApproval(null);
			return;
		}

		try {
			const result = await fetchApprovalList();
			setApprovalModeState(result.mode);
			setPendingApproval(result.pending[0] ?? null);
			setApprovalError(null);
		} catch (error: unknown) {
			const message: string = error instanceof Error ? error.message : "Failed to load approvals";
			setApprovalError(message);
			console.error("[App] load approvals failed", error);
		}
	}, []);

	const applyWorkbench = useCallback((nextWorkbench: WorkbenchSnapshot): void => {
		setWorkbench((currentWorkbench: WorkbenchSnapshot | null): WorkbenchSnapshot => {
			const normalizedWorkbench: WorkbenchSnapshot = {
				...nextWorkbench,
				composer: {
					...nextWorkbench.composer,
					text: ""
				}
			};
			return applyWorkbenchSnapshot(currentWorkbench, normalizedWorkbench);
		});
	}, []);

	const {
		takePendingWorkbenchPatch,
		sendWorkbenchPatch,
		queueWorkbenchPatch
	} = useWorkbenchPatchQueue(applyWorkbench);

	function replaceComposerInput(text: string, scopeId: string = activeSessionIdRef.current ?? "home"): void {
		if (text.length === 0) {
			composerDraftsRef.current.delete(scopeId);
		} else {
			composerDraftsRef.current.set(scopeId, text);
		}
		setComposerInputReset((current): { scopeId: string; revision: number } => ({
			scopeId,
			revision: current.revision + 1
		}));
	}

	function handleComposerDraftChange(text: string): void {
		const scopeId: string = activeSessionIdRef.current ?? "home";
		if (text.length === 0) {
			composerDraftsRef.current.delete(scopeId);
			return;
		}
		composerDraftsRef.current.set(scopeId, text);
	}

	function applyOptimisticActiveRun(requestId: string, clearComposerText: boolean, clearComposerContext: boolean = false, preserveWorkflowTodo: boolean = false): void {
		const startedAt: string = new Date().toISOString();
		const sequence: number = runState.sequence + 1;
		setRunningSessionState((current: RunningSessionState): RunningSessionState => {
			return markSessionRunStarted(current, activeSessionIdRef.current, requestId);
		});

		clearWorkflowTodoUiState({ preservePlanSnapshot: preserveWorkflowTodo });
		setRunState((currentState: RunControllerState): RunControllerState => createOptimisticRunState(currentState, requestId, startedAt));
		setWorkbench((currentWorkbench: WorkbenchSnapshot | null): WorkbenchSnapshot | null => {
			return currentWorkbench === null
				? currentWorkbench
				: {
					...currentWorkbench,
					composer: {
						...currentWorkbench.composer,
						text: clearComposerText ? "" : currentWorkbench.composer.text,
						additionalContext: clearComposerContext ? [] : currentWorkbench.composer.additionalContext
					},
					activeRun: {
						status: "streaming",
						requestId,
						startedAt,
						sequence
					}
				};
		});
	}

	function appendOptimisticUserBlock(requestId: string, message: string, additionalContext: AdditionalContextItem[]): void {
		timelineStore.update((currentPage: TimelinePageState): TimelinePageState => {
			const sessionId: string | null = activeSessionIdRef.current;
			const hasUserBlock: boolean = currentPage.blocks.some((block: TimelineBlock): boolean => {
				return block.type === "user" && block.requestId === requestId;
			});

			if (hasUserBlock) {
				return currentPage;
			}

			return {
				...currentPage,
				sessionId: currentPage.sessionId ?? sessionId,
				blocks: [
					...currentPage.blocks,
					createOptimisticUserBlock(requestId, message, additionalContext)
				],
				blockCount: currentPage.blockCount + 1,
				hasMoreAfter: false
			};
		});
	}

	function applyOptimisticSend(requestId: string, message: string, additionalContext: AdditionalContextItem[], clearComposerText: boolean = true, preserveWorkflowTodo: boolean = false): void {
		applyOptimisticActiveRun(requestId, clearComposerText, true, preserveWorkflowTodo);
		appendOptimisticUserBlock(requestId, message, additionalContext);
	}

	function appendQueuedRunUserBlock(workbenchSnapshot: WorkbenchSnapshot): void {
		const requestId: string | undefined = workbenchSnapshot.activeRun.requestId;
		const queueItemId: number | undefined = workbenchSnapshot.activeRun.queueItemId;
		if (requestId === undefined || queueItemId === undefined) {
			return;
		}

		const queueItem: MessageQueueItem | undefined = workbenchSnapshot.messageQueue.find((item: MessageQueueItem): boolean => {
			return item.id === queueItemId && (item.status === "sending" || item.status === "approval");
		});
		if (queueItem === undefined) {
			return;
		}

		appendOptimisticUserBlock(requestId, queueItem.text, queueItem.additionalContext);
	}

	function finishOptimisticActiveRun(requestId: string): void {
		setRunningSessionState((current: RunningSessionState): RunningSessionState => {
			return markRunStopped(current, requestId);
		});
		setRunState((currentState: RunControllerState): RunControllerState => finishOptimisticRunState(currentState, requestId));
		setWorkbench((currentWorkbench: WorkbenchSnapshot | null): WorkbenchSnapshot | null => {
			if (currentWorkbench === null || currentWorkbench.activeRun.requestId !== requestId) {
				return currentWorkbench;
			}
			if (currentWorkbench.activeRun.status === "approval") {
				return currentWorkbench;
			}
			return {
				...currentWorkbench,
				activeRun: { status: "idle" }
			};
		});
	}

	function applyOptimisticRetry(retryFromRequestId: string, requestId: string, message: string, additionalContext: AdditionalContextItem[]): void {
		applyOptimisticActiveRun(requestId, false, false);
		timelineStore.update((currentPage: TimelinePageState): TimelinePageState => {
			const sessionId: string | null = activeSessionIdRef.current;
			const trimmedPage: TimelinePageState = trimTimelineFromRequest(currentPage, retryFromRequestId);

			return {
				...trimmedPage,
				sessionId: trimmedPage.sessionId ?? sessionId,
				blocks: [
					...trimmedPage.blocks,
					createOptimisticUserBlock(requestId, message, additionalContext)
				],
				blockCount: trimmedPage.blockCount + 1,
				hasMoreAfter: false
			};
		});
	}

	useEffect((): void => {
		discardPendingTimelineEvents();
		activeSessionIdRef.current = activeSessionId;
	}, [activeSessionId, discardPendingTimelineEvents]);

	useEffect((): void => {
		if (!isNewSessionHome) {
			return;
		}

		setHomeDraft((currentDraft: HomeDraft): HomeDraft => {
			const currentProvider: ProviderModelSelectionProvider | undefined = providerModelSelection?.providers.find(
				(provider: ProviderModelSelectionProvider): boolean => {
					return provider.configured
						&& provider.provider === currentDraft.providerId
						&& provider.models.some((model: ProviderModelInfo): boolean => model.id === currentDraft.modelId);
				}
			);
			if (currentProvider !== undefined) {
				return currentDraft;
			}

			const preferredModel = findPreferredComposerModel(clientPreferences, providerModelSelection);
			if (preferredModel === null) {
				return {
					...currentDraft,
					providerId: null,
					modelId: null
				};
			}

			return {
				...currentDraft,
				providerId: preferredModel.providerId,
				modelId: preferredModel.modelId
			};
		});
	}, [clientPreferences, isNewSessionHome, providerModelSelection]);

	useEffect((): (() => void) => {
		return (): void => {
			discardPendingTimelineEvents();
		};
	}, [discardPendingTimelineEvents]);

	useEffect((): (() => void) => {
		let cancelled: boolean = false;
		async function loadProviderModelSelection(): Promise<void> {
			try {
				const result: ProviderModelSelection = await fetchProviderModelSelection();

				if (!cancelled) {
					setProviderModelSelection(result);
				}
			} catch (error: unknown) {
				console.error("[App] load provider model selection failed", error);
			}
		}

		function handleWindowFocus(): void {
			void loadProviderModelSelection();
		}

		void loadProviderModelSelection();
		window.addEventListener("focus", handleWindowFocus);
		return (): void => {
			cancelled = true;
			window.removeEventListener("focus", handleWindowFocus);
		};
	}, []);

	useEffect((): void => {
		void loadSlashCommands();
	}, [loadSlashCommands]);

	useEffect((): void => {
		if (isNewSessionHome && activeSessionId === null) {
			void loadHomeWorkspaces();
		}
	}, [isNewSessionHome, loadHomeWorkspaces, workspaceRefreshToken]);

	useEffect((): (() => void) => {
		const handleWindowFocus = (): void => {
			windowFocusedRef.current = true;
			setUnreadSessionIds((currentSessionIds: ReadonlySet<string>): ReadonlySet<string> => {
				return markActiveSessionRead(currentSessionIds, activeSessionIdRef.current, true);
			});
		};
		const handleWindowBlur = (): void => {
			windowFocusedRef.current = false;
		};

		window.addEventListener("focus", handleWindowFocus);
		window.addEventListener("blur", handleWindowBlur);
		if (document.hasFocus()) {
			handleWindowFocus();
		} else {
			handleWindowBlur();
		}

		return (): void => {
			window.removeEventListener("focus", handleWindowFocus);
			window.removeEventListener("blur", handleWindowBlur);
		};
	}, []);

	useEffect((): void => {
		setUnreadSessionIds((currentSessionIds: ReadonlySet<string>): ReadonlySet<string> => {
			return markActiveSessionRead(currentSessionIds, activeSessionId, windowFocusedRef.current);
		});
	}, [activeSessionId]);

	const handleBackendEventObserved = useCallback((event: BackendEvent): void => {
		setRunningSessionState((current: RunningSessionState): RunningSessionState => {
			return applyRunningSessionEvent(current, event);
		});
		const responseSessionId: string | null = getUnreadResponseSessionId(event);
		if (responseSessionId === null) {
			return;
		}
		if (
			event.event === "agent.goal.state"
			&& activeWorkbenchRef.current?.messageQueue.some((item: MessageQueueItem): boolean => item.status === "pending" || item.status === "sending") === true
		) {
			return;
		}

		setUnreadSessionIds((currentSessionIds: ReadonlySet<string>): ReadonlySet<string> => {
			return applyResponseFinished(currentSessionIds, {
				sessionId: responseSessionId,
				activeSessionId: activeSessionIdRef.current,
				windowFocused: windowFocusedRef.current
			});
		});
	}, []);

	useEffect((): void => {
		if (activeSessionId === null && activeWorkspace === null && homeDraft.workspace === null) {
			setSkills([]);
			return;
		}

		void loadSkills();
	}, [activeSessionId, activeWorkspace?.id, homeDraft.workspace?.id, loadSkills]);

	useBackendEventStream({
		activeSessionIdRef,
		activeChatRequestIdRef,
		pendingUserActionRequestIdsRef,
		activeSessionTitleRef,
		activeWorkbenchRef,
		onEventObserved: handleBackendEventObserved,
		applyWorkbench,
		appendQueuedRunUserBlock,
		loadSkills,
		clearWorkflowTodoUiState,
		rememberLoadedWorkflowTodo,
		applyInitialWorkflowTodoPreference,
		showWorkflowTodo,
		expandWorkflowTodoPanel,
		enqueueTimelineStreamingEvent,
		flushPendingTimelineEvents,
		refreshLatestTimeline,
		showNativeTaskNotification,
		setActiveSessionMetadata,
		setRunState,
		timelineStore,
		setWorkflowTodoSnapshot,
		applyCurrentGoalSnapshot,
		setLatestPlanClarification,
		setLatestPlanApproval,
		setPlanClarificationError,
		setIsPlanClarificationSubmitting,
		setPlanApprovalError,
		setIsPlanApproving,
		setIsPlanRevising
	});

	useEffect((): (() => void) => {
		return onBackendReconnected((): void => {
			takePendingWorkbenchPatch();
			const sessionId: string | null = activeSessionIdRef.current;
			if (activeSessionMetadata?.temporary === true) {
				temporaryDraftSessionIdRef.current = null;
				activeSessionIdRef.current = null;
				setActiveSessionId(null);
				setActiveSessionMetadata(null);
				resetSessionPresentationState();
				setIsNewSessionHome(true);
				void createTemporarySession().catch((error: unknown): void => {
					setSessionError(error instanceof Error ? error.message : "Failed to restore New session");
				});
				return;
			}
			if (sessionId !== null) {
				void handleSessionSelect({ id: sessionId } as SessionMetadata);
			}
		});
	}, [activeSessionId, activeSessionMetadata?.temporary]);

	useEffect((): void => {
		if (isNewSessionHome || activeSessionId === null || getPendingApprovalCount(workbench) === 0) {
			setPendingApproval(null);
			setApprovalError(null);
			return;
		}

		void refreshPendingApproval();
	}, [activeSessionId, isNewSessionHome, refreshPendingApproval, workbench?.pendingApproval?.count, workbench?.pendingApproval?.first?.approvalId]);

	async function handleWorkspaceSelect(workspaceId: string): Promise<void> {
		try {
			const workspace = await selectWorkspace(workspaceId, { sessionId: activeSessionIdRef.current });

			setActiveWorkspace(workspace);
			console.info("[App] workspace selected", workspace);
		} catch (error: unknown) {
			showTransientError(error instanceof Error ? error.message : "Failed to select workspace");
			console.error("[App] select workspace failed", error);
		}
	}

	async function createTemporarySession(workspace: WorkspaceConfig | null = null): Promise<void> {
		if (temporarySessionCreationRef.current !== null) {
			return temporarySessionCreationRef.current;
		}
		const currentPreferences: ClientPreferences = clientPreferencesRef.current;
		const draft: HomeDraft = createPreferredHomeDraft(currentPreferences, providerModelSelection, workspace);
		const preferredApprovalMode: ApprovalMode = currentPreferences.newSessionComposer.approvalMode;
		const createOperation: Promise<void> = (async (): Promise<void> => {
			const created = await createSession({
				title: "New session",
				temporary: true,
				workspaceId: draft.workspaceId,
				provider: draft.providerId ?? undefined,
				model: draft.modelId ?? undefined,
				reasoningEffort: draft.reasoningEffort,
				chatMode: draft.chatMode,
				approvalMode: preferredApprovalMode
			});
			temporaryDraftSessionIdRef.current = created.id;
			activeSessionIdRef.current = created.id;
			setActiveSessionId(created.id);
			setActiveSessionMetadata(created);
			setActiveWorkspace(createWorkspaceFromSessionMetadata(created, created.workbench));
			setWorkbench(created.workbench);
			setHomeDraft(draft);
			setApprovalModeState(preferredApprovalMode);
			timelineStore.reset();
			setIsNewSessionHome(true);
			setSessionError(null);
		})();
		temporarySessionCreationRef.current = createOperation;
		try {
			await createOperation;
		} finally {
			temporarySessionCreationRef.current = null;
		}
	}

	async function discardTemporarySessionIfEmpty(): Promise<void> {
		if (activeSessionMetadata?.temporary !== true || activeSessionId === null) {
			return;
		}
		const draftText: string = composerDraftsRef.current.get(activeSessionId) ?? "";
		const hasDraft: boolean = draftText.trim().length > 0
			|| (workbench?.composer.additionalContext.length ?? 0) > 0;
		if (hasDraft) {
			temporaryDraftSessionIdRef.current = activeSessionId;
			return;
		}
		const temporaryId: string = activeSessionId;
		temporaryDraftSessionIdRef.current = null;
		await deleteSessionWithLayout(temporaryId).catch((error: unknown): void => {
			console.warn("[App] delete empty temporary session failed", error);
		});
	}

	function findWorkspaceForSession(session: SessionMetadata): WorkspaceConfig | null {
		if (session.workspaceId === undefined) {
			return null;
		}
		if (activeWorkspace?.id === session.workspaceId) {
			return activeWorkspace;
		}

		const knownWorkspace: WorkspaceConfig | undefined = homeWorkspaceOptions.find(
			(workspace: WorkspaceConfig): boolean => workspace.id === session.workspaceId
		);
		if (knownWorkspace !== undefined) {
			return knownWorkspace;
		}
		if (session.workspaceRoot === undefined) {
			return null;
		}

		return createSingleSourceWorkspaceSnapshot({
			id: session.workspaceId,
			name: session.workspaceName ?? session.title,
			kind: session.workspaceKind ?? "godot",
			rootPath: session.workspaceRoot,
			godotExecutablePath: session.godotExecutablePath
		});
	}

	async function restoreTemporaryDraftOnNewSessionHome(workspace: WorkspaceConfig | null): Promise<boolean> {
		const temporaryDraftId: string | null = temporaryDraftSessionIdRef.current;
		if (temporaryDraftId === null) {
			return false;
		}

		let temporaryDraft: SessionMetadata | undefined;
		let sessionListLoaded: boolean = false;
		try {
			const sessionList = await fetchSessions();
			sessionListLoaded = true;
			temporaryDraft = sessionList.sessions.find(
				(session: SessionMetadata): boolean => session.id === temporaryDraftId
			);
		} catch (error: unknown) {
			console.warn("[App] load temporary draft before returning home failed", error);
		}

		if (sessionListLoaded && temporaryDraft === undefined) {
			temporaryDraftSessionIdRef.current = null;
			return false;
		}

		await handleSessionSelect(temporaryDraft ?? { id: temporaryDraftId } as SessionMetadata, { recordNavigation: false });
		setIsNewSessionHome(true);
		if (sessionListLoaded && temporaryDraft?.workspaceId === undefined && workspace !== null) {
			await handleHomeWorkspaceSelect(workspace.id);
		}
		return true;
	}

	async function handleNewSession(options: { restoreTemporaryDraft?: boolean; workspace?: WorkspaceConfig | null } = {}): Promise<void> {
		const preferredWorkspace: WorkspaceConfig | null = options.workspace ?? null;
		if (activeSessionMetadata?.temporary === true) {
			const temporaryId: string | null = activeSessionId;
			temporaryDraftSessionIdRef.current = null;
			if (temporaryId !== null) {
				await deleteSessionWithLayout(temporaryId).catch((error: unknown): void => {
					console.warn("[App] discard temporary session failed", error);
				});
			}
			activeSessionIdRef.current = null;
			setActiveSessionId(null);
			setActiveSessionMetadata(null);
			resetSessionPresentationState();
			await createTemporarySession();
			return;
		}
		if (temporaryDraftSessionIdRef.current !== null && options.restoreTemporaryDraft !== false) {
			if (await restoreTemporaryDraftOnNewSessionHome(preferredWorkspace)) {
				return;
			}
		}
		if (temporaryDraftSessionIdRef.current !== null) {
			const temporaryId: string = temporaryDraftSessionIdRef.current;
			temporaryDraftSessionIdRef.current = null;
			await deleteSessionWithLayout(temporaryId).catch((error: unknown): void => {
				console.warn("[App] discard temporary session failed", error);
			});
		}
		navigationVersionRef.current += 1;
		await persistPendingWorkbenchPatchBeforeNavigation();
		setIsNewSessionHome(true);
		setHomeDraft(createPreferredHomeDraft(clientPreferences, providerModelSelection, preferredWorkspace));
		setActiveWorkspace(preferredWorkspace);
		resetSessionPresentationState();
		setSessionError(null);
		await createTemporarySession(preferredWorkspace);
		void loadHomeWorkspaces();
	}

	useEffect((): void => {
		void createTemporarySession().catch((error: unknown): void => {
			setSessionError(error instanceof Error ? error.message : "Failed to create a temporary session");
		});
	}, []);

	async function handleNewWorkspaceSession(workspace: WorkspaceConfig): Promise<void> {
		setIsWorkspaceSessionCreating(true);
		try {
			if (activeSessionMetadata?.temporary === true && activeSessionId !== null) {
				await deleteSessionWithLayout(activeSessionId).catch((error: unknown): void => {
					console.warn("[App] discard temporary session failed", error);
				});
			}
			temporaryDraftSessionIdRef.current = null;
			activeSessionIdRef.current = null;
			setActiveSessionId(null);
			setActiveSessionMetadata(null);
			resetSessionPresentationState();
			setActiveWorkspace(workspace);
			setHomeDraft(createPreferredHomeDraft(clientPreferences, providerModelSelection, workspace));
			setHomeWorkspaceOptions((currentWorkspaces: WorkspaceConfig[]): WorkspaceConfig[] => {
				if (currentWorkspaces.some((currentWorkspace: WorkspaceConfig): boolean => currentWorkspace.id === workspace.id)) {
					return currentWorkspaces;
				}
				return [...currentWorkspaces, workspace];
			});

			await createTemporarySession(workspace);
		} finally {
			setIsWorkspaceSessionCreating(false);
		}
	}

	async function handleHomeWorkspaceSelect(workspaceId: string): Promise<void> {
		const navigationVersion: number = navigationVersionRef.current + 1;
		navigationVersionRef.current = navigationVersion;
		const optimisticWorkspace: WorkspaceConfig | undefined = homeWorkspaceOptions.find((workspace: WorkspaceConfig): boolean => workspace.id === workspaceId);
		if (optimisticWorkspace !== undefined) {
			setHomeDraft((currentDraft: HomeDraft): HomeDraft => ({
				...currentDraft,
				workspaceId: optimisticWorkspace.id,
				workspace: optimisticWorkspace
			}));
			setActiveWorkspace(optimisticWorkspace);
			setSessionError(null);
		}

		try {
			const workspace = await selectWorkspace(workspaceId, { sessionId: activeSessionIdRef.current });
			if (navigationVersionRef.current !== navigationVersion) {
				return;
			}

			setHomeDraft((currentDraft: HomeDraft): HomeDraft => ({
				...currentDraft,
				workspaceId: workspace.id,
				workspace
			}));
			setActiveWorkspace(workspace);
			setActiveSessionMetadata((metadata: SessionMetadata | null): SessionMetadata | null => {
				return metadata === null
					? metadata
					: {
						...metadata,
						workspaceId: workspace.id,
						workspaceName: workspace.name,
						workspaceKind: workspace.kind,
						workspaceRoot: workspace.rootPath,
						godotExecutablePath: workspace.godotExecutablePath
					};
			});
			setSessionError(null);
		} catch (error: unknown) {
			showTransientError(error instanceof Error ? error.message : "Failed to select workspace");
			console.error("[App] select home workspace failed", error);
		}
	}

	function handleHomeWorkspaceClear(): void {
		navigationVersionRef.current += 1;
		setHomeDraft((currentDraft: HomeDraft): HomeDraft => ({
			...currentDraft,
			workspaceId: null,
			workspace: null
		}));
		setActiveWorkspace(null);
	}

	function handleHomeWorkspaceAdd(): void {
		setIsWorkspaceProjectDialogOpen(true);
	}

	async function handleSessionSelect(
		session: SessionMetadata,
		options: { recordNavigation?: boolean } = {}
	): Promise<void> {
		const navigationVersion: number = navigationVersionRef.current + 1;
		navigationVersionRef.current = navigationVersion;
		await discardTemporarySessionIfEmpty();
		await persistPendingWorkbenchPatchBeforeNavigation();
		const sessionId: string = session.id;
		console.info("[App] session selected", { sessionId });

		try {
			setIsSessionLoading(true);
			setSessionError(null);
			setIsNewSessionHome(false);
			activeSessionIdRef.current = sessionId;
			setActiveSessionId(sessionId);
			setActiveSessionMetadata(session);
			setSelectionAskThreads([]);
			setActiveWorkspace(null);
			resetSessionPresentationState();

			const result: SessionOpenResult = await openSession(sessionId);
			if (navigationVersionRef.current !== navigationVersion || activeSessionIdRef.current !== sessionId) {
				return;
			}

			timelineStore.replace(createTimelinePageFromOpenResult(result));
			setLatestPlanClarification(result.latestPlanClarification);
			setLatestPlanApproval(result.latestPlanApproval);
			setActiveSessionMetadata(result.metadata);
			setSelectionAskThreads(result.selectionAskThreads);
			const openedWorkbench: WorkbenchSnapshot = {
				...result.workbench,
				composer: {
					...result.workbench.composer,
					text: ""
				}
			};
			setWorkbench(openedWorkbench);
			setRunState((currentState: RunControllerState): RunControllerState => (
				result.activeAgentRun === null
					? createIdleRunState(currentState.sequence)
					: applyAgentRunState(currentState, result.activeAgentRun)
			));
			setRunningSessionState((current: RunningSessionState): RunningSessionState => {
				return syncSessionRunFromOpen(current, sessionId, result.activeAgentRun);
			});
			const openedGoalDismissed: boolean = result.currentGoal !== null
				&& isAgentGoalDismissed(result.currentGoal, dismissedTerminalGoalIdsRef.current);
			setCurrentGoal((current: AgentGoalState | null): AgentGoalState | null => {
				return result.currentGoal === null || openedGoalDismissed
					? null
					: selectLatestGoalState(current, result.currentGoal);
			});
			setApprovalModeState(result.metadata.approvalMode ?? "manual");
			setActiveWorkspace(createWorkspaceFromSessionOpenResult(result));
			if (options.recordNavigation !== false && result.metadata.temporary !== true) {
				recordOpenedSession(sessionId);
			}
			const workflowTodo: WorkflowTodoSnapshot | null = openedGoalDismissed ? null : createWorkflowTodoSnapshotFromTimelineResult(result);
			setWorkflowTodoSnapshot(workflowTodo);
			rememberLoadedWorkflowTodo(workflowTodo);
			if (workflowTodo !== null && isWorkflowTodoActive(workflowTodo)) {
				expandWorkflowTodoPanel();
			}

			if (result.workspaceWarning) {
				console.warn("[App] session workspace warning", result.workspaceWarning);
			}
			void checkActiveSessionIntegrity(sessionId);
		} catch (error: unknown) {
			const message: string = error instanceof Error ? error.message : "Failed to open session";

			setSessionError(message);
			console.error("[App] open session failed", error);
		} finally {
			setIsSessionLoading(false);
		}
	}

	useEffect((): (() => void) => {
		function handleSessionNavigation(event: Event): void {
			const sessionId: unknown = (event as CustomEvent<unknown>).detail;
			if (typeof sessionId !== "string" || sessionId.length === 0 || sessionId === activeSessionIdRef.current) {
				return;
			}

			void (async (): Promise<void> => {
				try {
					const sessionList = await fetchSessions();
					const session: SessionMetadata | undefined = sessionList.sessions.find(
						(candidate: SessionMetadata): boolean => candidate.id === sessionId
					);
					if (session === undefined) {
						removeSessionFromNavigationHistory(sessionId);
						showTransientError("Session not found");
						return;
					}
					setRecentSessions(getRecentSessions(sessionList.sessions));
					await handleSessionSelect(session, { recordNavigation: false });
				} catch (error: unknown) {
					showTransientError(error instanceof Error ? error.message : "Failed to open session");
					console.error("[App] navigate session history failed", error);
				}
			})();
		}

		window.addEventListener(SESSION_NAVIGATION_EVENT, handleSessionNavigation);
		return (): void => {
			window.removeEventListener(SESSION_NAVIGATION_EVENT, handleSessionNavigation);
		};
	}, [handleSessionSelect]);

	function resetToNewSessionHome(): void {
		navigationVersionRef.current += 1;
		takePendingWorkbenchPatch();
		activeSessionIdRef.current = null;
		setActiveSessionId(null);
		setActiveSessionMetadata(null);
		setSelectionAskThreads([]);
		resetSessionPresentationState();
		setActiveWorkspace(null);
		setSessionError(null);
		setIsNewSessionHome(true);
		setHomeDraft(createPreferredHomeDraft(clientPreferencesRef.current, providerModelSelection));
		setApprovalModeState(clientPreferencesRef.current.newSessionComposer.approvalMode);
	}

	async function handleSessionArchive(session: SessionMetadata, context: SessionArchiveContext): Promise<void> {
		setRunningSessionState((current: RunningSessionState): RunningSessionState => {
			return removeRunningSessions(current, [session.id]);
		});
		setUnreadSessionIds((currentSessionIds: ReadonlySet<string>): ReadonlySet<string> => {
			return removeUnreadSessions(currentSessionIds, [session.id]);
		});
		if (!context.wasActive || session.id !== activeSessionIdRef.current) {
			return;
		}

		const workspace: WorkspaceConfig | null = findWorkspaceForSession(session);
		try {
			await handleNewSession({
				restoreTemporaryDraft: true,
				workspace
			});
		} catch (error: unknown) {
			const errorMessage: string = error instanceof Error ? error.message : "Failed to open New session";
			setSessionError(errorMessage);
			console.error("[App] return to New session after archive failed", error);
		}
	}

	function handleSessionRename(session: SessionMetadata): void {
		if (session.id !== activeSessionId) {
			return;
		}

		setActiveSessionMetadata(session);
	}

	async function checkActiveSessionIntegrity(sessionId: string): Promise<void> {
		try {
			const result: SessionIntegrityCheckResult = await checkSessionIntegrity(sessionId);
			if (activeSessionIdRef.current !== sessionId || result.ok) {
				return;
			}

			setSessionError(`Session integrity warning: found ${result.issues.length} cross-session record${result.issues.length === 1 ? "" : "s"}. Existing data was not modified.`);
		} catch (error: unknown) {
			console.warn("[App] session integrity check failed", error);
		}
	}

	function handleWorkspaceDelete(result: DeleteWorkspaceResult): void {
		for (const sessionId of [...result.deletedSessionIds, ...result.deletedArchivedSessionIds]) {
			composerDraftsRef.current.delete(sessionId);
		}
		setUnreadSessionIds((currentSessionIds: ReadonlySet<string>): ReadonlySet<string> => {
			return removeUnreadSessions(currentSessionIds, [
				...result.deletedSessionIds,
				...result.deletedArchivedSessionIds
			]);
		});
		removeStoredSessionLayouts([
			...result.deletedSessionIds,
			...result.deletedArchivedSessionIds
		]);
		const activeMove = activeSessionId === null
			? undefined
			: result.movedSessions.find((move): boolean => move.sessionId === activeSessionId);
		setHomeWorkspaceOptions((currentWorkspaces: WorkspaceConfig[]): WorkspaceConfig[] => {
			return currentWorkspaces.filter((workspace: WorkspaceConfig): boolean => workspace.id !== result.workspaceId);
		});
		setHomeDraft((currentDraft: HomeDraft): HomeDraft => {
			if (currentDraft.workspaceId !== result.workspaceId) {
				return currentDraft;
			}

			return {
				...currentDraft,
				workspaceId: null,
				workspace: null
			};
		});
		setActiveWorkspace((currentWorkspace: WorkspaceConfig | null): WorkspaceConfig | null => {
			return currentWorkspace?.id === result.workspaceId ? null : currentWorkspace;
		});

		const activeSessionDeleted: boolean = activeSessionId !== null && result.deletedSessionIds.includes(activeSessionId);
		const activeWorkspaceDeleted: boolean = activeSessionMetadata?.workspaceId === result.workspaceId;
		if (activeMove !== undefined) {
			void fetchWorkspaces().then((workspaceList): void => {
				const destination: WorkspaceConfig | undefined = workspaceList.workspaces.find(
					(workspace): boolean => workspace.id === activeMove.workspaceId
				);
				if (destination === undefined) {
					resetToNewSessionHome();
					return;
				}
				setHomeWorkspaceOptions(workspaceList.workspaces);
				setActiveWorkspace(destination);
				setActiveSessionMetadata((metadata): SessionMetadata | null => metadata === null
					? null
					: {
						...metadata,
						workspaceId: destination.id,
						workspaceName: destination.name,
						workspaceKind: destination.kind,
						workspaceRoot: destination.rootPath,
						godotExecutablePath: destination.godotExecutablePath
					});
			}).catch((): void => resetToNewSessionHome());
		} else if (activeSessionDeleted || activeWorkspaceDeleted) {
			resetToNewSessionHome();
		}
	}

	function handleWorkspaceUpdate(workspace: WorkspaceConfig): void {
		setHomeWorkspaceOptions((currentWorkspaces): WorkspaceConfig[] => {
			const existingIndex: number = currentWorkspaces.findIndex(
				(currentWorkspace: WorkspaceConfig): boolean => currentWorkspace.id === workspace.id
			);
			if (existingIndex < 0) {
				return [...currentWorkspaces, workspace];
			}
			return currentWorkspaces.map(
				(currentWorkspace: WorkspaceConfig): WorkspaceConfig => currentWorkspace.id === workspace.id ? workspace : currentWorkspace
			);
		});
		setHomeDraft((currentDraft): HomeDraft => currentDraft.workspaceId === workspace.id
			? { ...currentDraft, workspace }
			: currentDraft);
		setActiveWorkspace((currentWorkspace): WorkspaceConfig | null => currentWorkspace?.id === workspace.id
			? workspace
			: currentWorkspace);
		setActiveSessionMetadata((metadata): SessionMetadata | null => metadata?.workspaceId === workspace.id
			? {
				...metadata,
				workspaceName: workspace.name,
				workspaceRoot: workspace.rootPath,
				godotExecutablePath: workspace.godotExecutablePath
			}
			: metadata);
	}

	function handleWorkspaceProjectCreated(workspace: WorkspaceConfig): void {
		handleWorkspaceUpdate(workspace);
		setWorkspaceRefreshToken((currentToken: number): number => currentToken + 1);
		setIsWorkspaceProjectDialogOpen(false);
		if (isNewSessionHome) {
			void handleHomeWorkspaceSelect(workspace.id);
		}
	}

	function handleWorkspaceTreeProjectCreated(workspace: WorkspaceConfig): void {
		setWorkspaceRefreshToken((currentToken: number): number => currentToken + 1);
		void handleNewWorkspaceSession(workspace).catch((error: unknown): void => {
			showTransientError(error instanceof Error ? error.message : "Failed to open the new project");
			console.error("[App] open workspace tree project failed", error);
		});
	}

	async function persistSessionUiMetadata(params: SaveSessionUiMetadataParams): Promise<void> {
		const sessionId: string | null = activeSessionId;
		if (sessionId === null) {
			return;
		}

		try {
			await saveSessionUiMetadata(params);
			setActiveSessionMetadata((currentMetadata: SessionMetadata | null): SessionMetadata | null => {
				return currentMetadata === null || currentMetadata.id !== sessionId
					? currentMetadata
					: {
						...currentMetadata,
						...params
					};
			});
		} catch (error: unknown) {
			const message: string = error instanceof Error ? error.message : "Failed to save session UI state";

			setSessionError(message);
			console.error("[App] save session UI metadata failed", error);
		}
	}

	async function handleModeChange(nextMode: ChatMode): Promise<void> {
		persistNewSessionComposerDefaults({ mode: nextMode });
		if (isNewSessionHome && activeSessionId === null) {
			setHomeDraft((currentDraft: HomeDraft): HomeDraft => ({
				...currentDraft,
				chatMode: nextMode
			}));
			return;
		}

		setWorkbench((currentWorkbench: WorkbenchSnapshot | null): WorkbenchSnapshot | null => {
			return currentWorkbench === null
				? currentWorkbench
				: {
					...currentWorkbench,
					composer: {
						...currentWorkbench.composer,
						chatMode: nextMode
					}
				};
		});
		queueWorkbenchPatch({ composer: { chatMode: nextMode } }, true);
		await persistSessionUiMetadata({ chatMode: nextMode });
	}

	async function saveApprovalMode(nextMode: ApprovalMode, confirmationText?: string): Promise<boolean> {
		if (nextMode === approvalMode || isApprovalModeSaving) {
			return false;
		}

		const previousMode: ApprovalMode = approvalMode;

		setApprovalModeState(nextMode);
		setIsApprovalModeSaving(true);
		setSessionError(null);

		try {
			const result = await setApprovalMode(nextMode, confirmationText);

			setApprovalModeState(result.mode);
			await persistSessionUiMetadata({ approvalMode: result.mode });
			persistNewSessionComposerDefaults({ approvalMode: result.mode });
			return true;
		} catch (error: unknown) {
			const message: string = error instanceof Error ? error.message : "Failed to save approval mode";

			setApprovalModeState(previousMode);
			setSessionError(message);
			console.error("[App] save approval mode failed", error);
			return false;
		} finally {
			setIsApprovalModeSaving(false);
		}
	}

	async function handleApprovalModeChange(nextMode: ApprovalMode): Promise<void> {
		if (nextMode === approvalMode || isApprovalModeSaving) {
			return;
		}

		if (nextMode === "full-trust") {
			setFullTrustConfirmationText("");
			setIsFullTrustModalOpen(true);
			return;
		}

		await saveApprovalMode(nextMode);
	}

	async function handleFullTrustConfirm(): Promise<void> {
		if (fullTrustConfirmationText !== FULL_TRUST_CONFIRMATION_TEXT) {
			void messageApi.error(t("app.fullTrust.errors.confirmation", { confirmationText: FULL_TRUST_CONFIRMATION_TEXT }));
			return;
		}

		const didSave: boolean = await saveApprovalMode("full-trust", fullTrustConfirmationText);
		if (didSave) {
			setIsFullTrustModalOpen(false);
			setFullTrustConfirmationText("");
		}
	}

	async function handleProviderModelChange(providerId: string, modelId: string): Promise<void> {
		if (isNewSessionHome && activeSessionId === null) {
			if (isHomeSubmitting) {
				void messageApi.info("Model changes apply to your next message.");
			}
			const nextReasoningEffort: string = resolveReasoningEffortForComposerModelChange({
				selection: providerModelSelection,
				previousProviderId: homeDraft.providerId,
				previousModelId: homeDraft.modelId,
				previousEffort: homeDraft.reasoningEffort,
				nextProviderId: providerId,
				nextModelId: modelId
			});
			setHomeDraft((currentDraft: HomeDraft): HomeDraft => ({
				...currentDraft,
				providerId,
				modelId,
				reasoningEffort: nextReasoningEffort
			}));
			persistNewSessionComposerDefaults({
				model: { providerId, modelId },
				reasoningEffort: nextReasoningEffort
			});
			return;
		}

		const sessionId: string | null = activeSessionId;
		if (sessionId === null) {
			return;
		}

		if (isRunControllerActive(runState)) {
			void messageApi.info("Model changes apply to your next message.");
		}

		const previousWorkbench: WorkbenchSnapshot | null = workbench;
		setWorkbench((currentWorkbench: WorkbenchSnapshot | null): WorkbenchSnapshot | null => {
			return currentWorkbench === null
				? currentWorkbench
				: {
					...currentWorkbench,
					composer: {
						...currentWorkbench.composer,
						provider: providerId,
						model: modelId
					}
				};
		});

		try {
			const result = await setSessionModel({ provider: providerId, model: modelId });
			if (activeSessionIdRef.current !== sessionId) {
				return;
			}
			setActiveSessionMetadata(result.metadata);
			applyWorkbench(result.workbench);
			persistNewSessionComposerDefaults({
				model: { providerId, modelId },
				reasoningEffort: result.workbench.composer.reasoningEffort
					?? clientPreferencesRef.current.newSessionComposer.reasoningEffort
			});
		} catch (error: unknown) {
			if (activeSessionIdRef.current === sessionId && previousWorkbench !== null) {
				setWorkbench(previousWorkbench);
			}
			const message: string = error instanceof Error ? error.message : "Failed to save session model";
			setSessionError(message);
			console.error("[App] save session model failed", error);
		}
	}

	async function handleReasoningEffortChange(nextEffort: string): Promise<void> {
		persistNewSessionComposerDefaults({ reasoningEffort: nextEffort });
		if (isNewSessionHome && activeSessionId === null) {
			setHomeDraft((currentDraft: HomeDraft): HomeDraft => ({
				...currentDraft,
				reasoningEffort: nextEffort
			}));
			return;
		}

		setWorkbench((currentWorkbench: WorkbenchSnapshot | null): WorkbenchSnapshot | null => {
			return currentWorkbench === null
				? currentWorkbench
				: {
					...currentWorkbench,
					composer: {
						...currentWorkbench.composer,
						reasoningEffort: nextEffort
					}
				};
		});
		const currentModel = getDisplayedComposerModel({
			isNewSessionHome,
			homeDraft,
			workbench,
			activeSessionMetadata,
			providerModelSelection
		});
		const update = createComposerReasoningEffortUpdate(
			currentModel.providerId,
			currentModel.modelId,
			nextEffort
		);
		queueWorkbenchPatch(update.workbenchPatch, true);
		await persistSessionUiMetadata(update.sessionMetadata);
	}

	async function handleApprovalApprove(approvalId: string, consentText?: string): Promise<void> {
		if (isApproving || isRejecting) {
			return;
		}

		const previousApproval: PendingApproval | null = pendingApproval;
		setIsApproving(true);
		setApprovalError(null);
		setPendingApproval(null);
		try {
			await approveApproval(approvalId, consentText);
			await refreshPendingApproval();
			await refreshLatestTimeline();
		} catch (error: unknown) {
			const message: string = error instanceof Error ? error.message : "Failed to approve tool execution";
			setPendingApproval(previousApproval);
			setApprovalError(message);
			console.error("[App] approve approval failed", error);
		} finally {
			setIsApproving(false);
		}
	}

	async function handleApprovalReject(approvalId: string): Promise<void> {
		if (isApproving || isRejecting) {
			return;
		}

		const previousApproval: PendingApproval | null = pendingApproval;
		setIsRejecting(true);
		setApprovalError(null);
		setPendingApproval(null);
		try {
			await rejectApproval(approvalId);
			await refreshPendingApproval();
			await refreshLatestTimeline();
		} catch (error: unknown) {
			const message: string = error instanceof Error ? error.message : "Failed to reject tool execution";
			setPendingApproval(previousApproval);
			setApprovalError(message);
			console.error("[App] reject approval failed", error);
		} finally {
			setIsRejecting(false);
		}
	}

	async function handleToolBudgetContinue(budgetId: string): Promise<void> {
		if (isToolBudgetContinuing || isToolBudgetStopping) {
			return;
		}

		setIsToolBudgetContinuing(true);
		setToolBudgetError(null);
		try {
			await continueToolBudget(budgetId);
			await refreshLatestTimeline();
		} catch (error: unknown) {
			const message: string = error instanceof Error ? error.message : "Failed to continue tool budget";
			setToolBudgetError(message);
			console.error("[App] continue tool budget failed", error);
		} finally {
			setIsToolBudgetContinuing(false);
		}
	}

	async function handleToolBudgetStop(budgetId: string): Promise<void> {
		if (isToolBudgetContinuing || isToolBudgetStopping) {
			return;
		}

		setIsToolBudgetStopping(true);
		setToolBudgetError(null);
		try {
			await stopToolBudget(budgetId);
			await refreshLatestTimeline();
		} catch (error: unknown) {
			const message: string = error instanceof Error ? error.message : "Failed to stop at tool budget";
			setToolBudgetError(message);
			console.error("[App] stop tool budget failed", error);
		} finally {
			setIsToolBudgetStopping(false);
		}
	}

	function persistNewSessionComposerDefaults(patch: Partial<NewSessionComposerPreferences>): void {
		const currentPreferences: ClientPreferences = clientPreferencesRef.current;
		const newSessionComposer: NewSessionComposerPreferences = {
			...currentPreferences.newSessionComposer,
			...patch
		};
		const nextPreferences: ClientPreferences = {
			...currentPreferences,
			lastComposerModel: newSessionComposer.model,
			newSessionComposer
		};
		clientPreferencesRef.current = nextPreferences;
		setClientPreferences(nextPreferences);
		dispatchClientPreferencesChanged(nextPreferences);
		void updateClientPreferences({
			lastComposerModel: nextPreferences.lastComposerModel,
			newSessionComposer
		}).then((savedPreferences: ClientPreferences): void => {
			clientPreferencesRef.current = savedPreferences;
			setClientPreferences(savedPreferences);
		}).catch((error: unknown): void => {
			console.error("[App] save new-session composer defaults failed", error);
		});
	}

	function showTransientError(errorMessage: string): void {
		void messageApi.error(errorMessage);
	}

	async function persistPendingWorkbenchPatchBeforeNavigation(): Promise<void> {
		const pendingPatch: WorkbenchPatch = takePendingWorkbenchPatch();
		if (Object.keys(pendingPatch).length === 0) {
			return;
		}

		try {
			await sendWorkbenchPatch(pendingPatch, false);
		} catch (error: unknown) {
			console.warn("[App] persist pending workbench patch before navigation failed", error);
		}
	}

	async function handleHomeComposerSubmit(nextMessage: string, modeOverride?: ChatMode): Promise<void> {
		const message: string = nextMessage.trim();
		if (message.length === 0 || isHomeSubmitting) {
			return;
		}

		const chatMode: ChatMode = modeOverride ?? homeDraft.chatMode;
		if (modeOverride !== undefined && modeOverride !== homeDraft.chatMode) {
			persistNewSessionComposerDefaults({ mode: modeOverride });
			setHomeDraft((currentDraft: HomeDraft): HomeDraft => ({
				...currentDraft,
				chatMode: modeOverride
			}));
		}
		const requestId: string = createChatRequestId();
		const providerId: string | null = homeDraft.providerId ?? providerModelSelection?.activeModel.providerId ?? null;
		const modelId: string | null = homeDraft.modelId ?? providerModelSelection?.activeModel.modelId ?? null;
		const skillRefs: string[] = extractEnabledSkillRefs(message, skills);
		let sessionCreated: boolean = false;
		replaceComposerInput("", "home");

		try {
			setIsHomeSubmitting(true);
			setSessionError(null);
			setActiveRetryRequestId(null);
			activeChatRequestIdRef.current = requestId;

			const created = await createSession({
				title: "New session",
				workspaceId: homeDraft.workspaceId,
				provider: providerId ?? undefined,
				model: modelId ?? undefined,
				reasoningEffort: homeDraft.reasoningEffort,
				chatMode,
				approvalMode
			});
			sessionCreated = true;

			if (cancelledChatRequestIdsRef.current.delete(requestId)) {
				return;
			}

			setIsNewSessionHome(false);
			activeSessionIdRef.current = created.id;
			setActiveSessionId(created.id);
			setActiveSessionMetadata(created);
			recordOpenedSession(created.id);
			setActiveWorkspace(createWorkspaceFromSessionMetadata(created, created.workbench));
			timelineStore.reset();
				setWorkbench(created.workbench);
				setWorkflowTodoSnapshot(null);
				rememberLoadedWorkflowTodo(null);
				setHomeDraft(createPreferredHomeDraft(clientPreferences, providerModelSelection));
			applyOptimisticSend(requestId, message, created.workbench.composer.additionalContext);

			const createdChatMode: ChatMode = created.workbench.composer.chatMode ?? chatMode;
			await sendChatMessage({
				requestId,
				message,
				mode: createdChatMode,
				provider: providerId ?? undefined,
				model: modelId ?? undefined,
				reasoningEffort: created.workbench.composer.reasoningEffort ?? undefined,
				executionPolicy: "auto",
				outputTarget: getChatOutputTarget(createdChatMode, created.workspaceId ?? homeDraft.workspaceId),
				additionalContext: created.workbench.composer.additionalContext,
				skillRefs
			});
			if (createdChatMode !== "goal") {
				await refreshLatestTimeline(created.id);
			}
		} catch (error: unknown) {
			const errorMessage: string = error instanceof Error ? error.message : "Failed to start new session";

			if (!sessionCreated) {
				setIsNewSessionHome(true);
				replaceComposerInput(message, "home");
			} else if (activeSessionIdRef.current !== null) {
				replaceComposerInput(message, activeSessionIdRef.current);
			}
			setRunState((currentState: RunControllerState): RunControllerState => finishOptimisticRunState(currentState, requestId));
			setRunningSessionState((current: RunningSessionState): RunningSessionState => {
				return markRunStopped(current, requestId);
			});
			setWorkbench((currentWorkbench: WorkbenchSnapshot | null): WorkbenchSnapshot | null => {
				return currentWorkbench === null
					? currentWorkbench
					: {
						...currentWorkbench,
						activeRun: currentWorkbench.activeRun.requestId === requestId
							? { status: "idle" }
							: currentWorkbench.activeRun
					};
			});
			setSessionError(errorMessage);
			if (sessionCreated && !isBackendRpcErrorMessage(errorMessage)) {
				timelineStore.update((currentPage: TimelinePageState): TimelinePageState => {
					return {
						...currentPage,
						blocks: applyBackendEventToTimeline(
							currentPage.blocks,
							createFrontendFailedRunEvent(requestId, currentPage.sessionId ?? activeSessionIdRef.current ?? "", errorMessage)
						)
					};
				});
			}
			console.error("[App] start new session failed", error);
		} finally {
			if (activeChatRequestIdRef.current === requestId) {
				activeChatRequestIdRef.current = null;
			}
			setIsHomeSubmitting(false);
		}
	}

	async function handleComposerSubmit(nextMessage: string, modeOverride?: ChatMode): Promise<void> {
		if (isNewSessionHome && activeSessionId === null) {
			await handleHomeComposerSubmit(nextMessage, modeOverride);
			return;
		}
		if (isNewSessionHome) {
			setIsNewSessionHome(false);
			temporaryDraftSessionIdRef.current = null;
			setActiveSessionMetadata((metadata: SessionMetadata | null): SessionMetadata | null => {
				return metadata?.temporary === true ? { ...metadata, temporary: false } : metadata;
			});
		}

		if (activeSessionId === null || workbench === null) {
			setSessionError("Please open session first before sending a message");
			return;
		}

		const message: string = nextMessage.trim();
		const additionalContext: AdditionalContextItem[] = workbench.composer.additionalContext;
		if (message.length === 0 && additionalContext.length === 0) {
			return;
		}
		replaceComposerInput("", activeSessionId);

		const currentChatMode: ChatMode = getChatMode(workbench);
		const chatMode: ChatMode = modeOverride ?? currentChatMode;
		if (modeOverride !== undefined && modeOverride !== currentChatMode) {
			persistNewSessionComposerDefaults({ mode: chatMode });
			setWorkbench((currentWorkbench: WorkbenchSnapshot | null): WorkbenchSnapshot | null => {
				return currentWorkbench === null
					? currentWorkbench
					: {
						...currentWorkbench,
						composer: {
							...currentWorkbench.composer,
							chatMode
						}
					};
			});
			void persistSessionUiMetadata({ chatMode });
		}

		if (isRunControllerActive(runState)) {
			await handleQueueMessageSubmit(message, modeOverride);
			return;
		}

		const requestId: string = createChatRequestId();
		const skillRefs: string[] = extractEnabledSkillRefs(message, skills);
		const pendingPatch: WorkbenchPatch = mergeWorkbenchPatch(mergeWorkbenchPatch(takePendingWorkbenchPatch(), modeOverride === undefined
			? {}
			: { composer: { chatMode } }), {
			additionalContextAction: { action: "clearUnpinned" }
		});
		const flushPendingPatch = sendWorkbenchPatch(pendingPatch, false);

		try {
			setSessionError(null);
			setActiveRetryRequestId(null);
			activeChatRequestIdRef.current = requestId;
			applyOptimisticSend(requestId, message, additionalContext);

			await flushPendingPatch;
			await sendChatMessage({
				requestId,
				message,
				mode: chatMode,
				provider: workbench.composer.provider ?? undefined,
				model: workbench.composer.model ?? undefined,
				reasoningEffort: workbench.composer.reasoningEffort ?? undefined,
				executionPolicy: "auto",
				outputTarget: getChatOutputTarget(chatMode, getCurrentWorkspaceId(activeWorkspace, workbench)),
				additionalContext,
				skillRefs
			});
			if (chatMode !== "goal") {
				await refreshLatestTimeline();
			}
		} catch (error: unknown) {
			const errorMessage: string = error instanceof Error ? error.message : "Failed to send message";

			replaceComposerInput(message, activeSessionId);
			setRunState((currentState: RunControllerState): RunControllerState => finishOptimisticRunState(currentState, requestId));
			setRunningSessionState((current: RunningSessionState): RunningSessionState => {
				return markRunStopped(current, requestId);
			});
			setWorkbench((currentWorkbench: WorkbenchSnapshot | null): WorkbenchSnapshot | null => {
				return currentWorkbench === null
					? currentWorkbench
					: {
						...currentWorkbench,
						composer: {
							...currentWorkbench.composer,
							additionalContext
						},
						activeRun: currentWorkbench.activeRun.requestId === requestId
							? { status: "idle" }
							: currentWorkbench.activeRun
					};
			});
			setSessionError(errorMessage);
			if (!isBackendRpcErrorMessage(errorMessage)) {
				timelineStore.update((currentPage: TimelinePageState): TimelinePageState => {
					return {
						...currentPage,
						blocks: applyBackendEventToTimeline(
							currentPage.blocks,
							createFrontendFailedRunEvent(requestId, currentPage.sessionId ?? activeSessionId ?? "", errorMessage)
						)
					};
				});
			}
			console.error("[App] send message failed", error);
		} finally {
			if (activeChatRequestIdRef.current === requestId) {
				activeChatRequestIdRef.current = null;
			}
		}
	}

	async function handleQueueMessageSubmit(nextMessage: string, modeOverride?: ChatMode): Promise<void> {
		if (activeSessionId === null || workbench === null) {
			setSessionError("Please open session first before queueing a message");
			return;
		}
		const message: string = nextMessage.trim();
		const additionalContext: AdditionalContextItem[] = workbench.composer.additionalContext;
		if (message.length === 0 && additionalContext.length === 0) {
			return;
		}

		const previousWorkbench: WorkbenchSnapshot = workbench;
		const skillRefs: string[] = extractEnabledSkillRefs(message, skills);
		const chatMode: ChatMode = modeOverride ?? getChatMode(workbench);
		const pendingPatch: WorkbenchPatch = mergeWorkbenchPatch(mergeWorkbenchPatch(takePendingWorkbenchPatch(), modeOverride === undefined
			? {}
			: { composer: { chatMode } }), {
			additionalContextAction: { action: "clearUnpinned" }
		});

		setWorkbench((currentWorkbench: WorkbenchSnapshot | null): WorkbenchSnapshot | null => {
			return currentWorkbench === null
				? currentWorkbench
				: {
					...currentWorkbench,
					composer: {
						...currentWorkbench.composer,
						additionalContext: currentWorkbench.composer.additionalContext.filter((item: AdditionalContextItem): boolean => item.pinned === true)
					}
				};
		});

		try {
			await sendWorkbenchPatch(pendingPatch, false);
			const result = await addQueuedMessage({
				text: message,
				additionalContext,
				mode: chatMode,
				provider: workbench.composer.provider,
				model: workbench.composer.model,
				reasoningEffort: workbench.composer.reasoningEffort ?? undefined,
				executionPolicy: "auto",
				outputTarget: getChatOutputTarget(chatMode, getCurrentWorkspaceId(activeWorkspace, workbench)),
				skillRefs
			});
			applyWorkbench(result.workbench);
			setSessionError(null);
		} catch (error: unknown) {
			setWorkbench(previousWorkbench);
			replaceComposerInput(message, activeSessionId);
			const errorMessage: string = error instanceof Error ? error.message : "Failed to queue message";
			setSessionError(errorMessage);
			console.error("[App] queue message failed", error);
		}
	}

	async function handleGuideSubmit(nextMessage: string): Promise<void> {
		if (isNewSessionHome && activeSessionId === null) {
			replaceComposerInput(nextMessage, "home");
			void messageApi.info("Guides can be added after a session starts.");
			return;
		}
		if (activeSessionId === null || workbench === null) {
			setSessionError("Please open session first before adding a guide");
			return;
		}
		const message: string = nextMessage.trim();
		if (message.length === 0) {
			return;
		}
		replaceComposerInput("", activeSessionId);

		const pendingPatch: WorkbenchPatch = takePendingWorkbenchPatch();

		try {
			await sendWorkbenchPatch(pendingPatch, false);
			const result = await addGuide(message, getRunControllerRequestId(runState) ?? undefined);
			applyWorkbench(result.workbench);
			setSessionError(null);
		} catch (error: unknown) {
			replaceComposerInput(message, activeSessionId);
			const errorMessage: string = error instanceof Error ? error.message : "Failed to add guide";
			setSessionError(errorMessage);
			console.error("[App] add guide failed", error);
		}
	}

	async function handleQueueMessageRemove(queueId: number): Promise<void> {
		if (workbench === null) {
			return;
		}
		const previousWorkbench: WorkbenchSnapshot = workbench;
		setWorkbench((currentWorkbench: WorkbenchSnapshot | null): WorkbenchSnapshot | null => {
			return currentWorkbench === null
				? currentWorkbench
				: {
					...currentWorkbench,
					messageQueue: currentWorkbench.messageQueue.filter((item: MessageQueueItem): boolean => item.id !== queueId)
				};
		});
		try {
			const result = await removeQueuedMessage(queueId);
			applyWorkbench(result.workbench);
		} catch (error: unknown) {
			setWorkbench(previousWorkbench);
			const errorMessage: string = error instanceof Error ? error.message : "Failed to remove queued message";
			setSessionError(errorMessage);
			console.error("[App] remove queued message failed", error);
		}
	}

	async function handleQueueMessageEdit(item: MessageQueueItem): Promise<void> {
		if (workbench === null) {
			return;
		}

		const previousWorkbench: WorkbenchSnapshot = workbench;
		const additionalContext: AdditionalContextItem[] = item.additionalContext ?? [];
		const pendingPatch: WorkbenchPatch = mergeWorkbenchPatch(takePendingWorkbenchPatch(), {
			composer: {
				additionalContext
			}
		});
		replaceComposerInput(item.text, activeSessionIdRef.current ?? "home");

		setWorkbench((currentWorkbench: WorkbenchSnapshot | null): WorkbenchSnapshot | null => {
			return currentWorkbench === null
				? currentWorkbench
				: {
					...currentWorkbench,
					composer: {
						...currentWorkbench.composer,
						additionalContext
					},
					messageQueue: currentWorkbench.messageQueue.filter((queueItem: MessageQueueItem): boolean => queueItem.id !== item.id)
				};
		});

		try {
			await sendWorkbenchPatch(pendingPatch, false);
			const result = await removeQueuedMessage(item.id);
			applyWorkbench(result.workbench);
			setSessionError(null);
		} catch (error: unknown) {
			setWorkbench(previousWorkbench);
			const errorMessage: string = error instanceof Error ? error.message : "Failed to edit queued message";
			setSessionError(errorMessage);
			console.error("[App] edit queued message failed", error);
		}
	}

	async function handleQueueMessageReorder(queueIds: number[]): Promise<void> {
		if (workbench === null) {
			return;
		}
		const previousWorkbench: WorkbenchSnapshot = workbench;
		const pendingItemsById: Map<number, MessageQueueItem> = new Map(
			workbench.messageQueue
				.filter((item: MessageQueueItem): boolean => item.status === "pending")
				.map((item: MessageQueueItem): [number, MessageQueueItem] => [item.id, item])
		);
		let pendingIndex: number = 0;
		const nextPendingItems: MessageQueueItem[] = queueIds.map((queueId: number): MessageQueueItem => pendingItemsById.get(queueId) as MessageQueueItem);
		setWorkbench({
			...workbench,
			messageQueue: workbench.messageQueue.map((item: MessageQueueItem): MessageQueueItem => {
				if (item.status !== "pending") {
					return item;
				}
				const nextItem: MessageQueueItem = nextPendingItems[pendingIndex] ?? item;
				pendingIndex += 1;
				return nextItem;
			})
		});
		try {
			const result = await reorderQueuedMessages(queueIds);
			applyWorkbench(result.workbench);
		} catch (error: unknown) {
			setWorkbench(previousWorkbench);
			const errorMessage: string = error instanceof Error ? error.message : "Failed to reorder queued messages";
			setSessionError(errorMessage);
			console.error("[App] reorder queued messages failed", error);
		}
	}

	async function handleGuideDelete(guideId: string): Promise<void> {
		if (workbench === null) {
			return;
		}
		const previousWorkbench: WorkbenchSnapshot = workbench;
		setWorkbench({
			...workbench,
			pendingGuides: workbench.pendingGuides.filter((guide: PendingGuide): boolean => guide.guideId !== guideId)
		});
		try {
			const result = await deleteGuide(guideId);
			applyWorkbench(result.workbench);
		} catch (error: unknown) {
			setWorkbench(previousWorkbench);
			const errorMessage: string = error instanceof Error ? error.message : "Failed to delete guide";
			setSessionError(errorMessage);
			console.error("[App] delete guide failed", error);
		}
	}

	async function handleGuideReorder(guideIds: string[]): Promise<void> {
		if (workbench === null) {
			return;
		}
		const previousWorkbench: WorkbenchSnapshot = workbench;
		const guidesById: Map<string, PendingGuide> = new Map(workbench.pendingGuides.map((guide: PendingGuide): [string, PendingGuide] => [guide.guideId, guide]));
		setWorkbench({
			...workbench,
			pendingGuides: guideIds.map((guideId: string): PendingGuide => guidesById.get(guideId) as PendingGuide)
		});
		try {
			const result = await reorderGuides(guideIds);
			applyWorkbench(result.workbench);
		} catch (error: unknown) {
			setWorkbench(previousWorkbench);
			const errorMessage: string = error instanceof Error ? error.message : "Failed to reorder guides";
			setSessionError(errorMessage);
			console.error("[App] reorder guides failed", error);
		}
	}

	async function handleRetryFromUserMessage(payload: RetryUserMessagePayload): Promise<boolean> {
		if (activeSessionId === null || workbench === null) {
			setSessionError("请先打开一个会话再重新发送消息");
			return false;
		}

		if (isRunControllerActive(runState) || isSessionLoading) {
			return false;
		}

		const message: string = payload.message.trim();
		if (message.length === 0 && payload.additionalContext.length === 0) {
			return false;
		}

		const requestId: string = createChatRequestId();
		const chatMode: ChatMode = getChatMode(workbench);
		const skillRefs: string[] = extractEnabledSkillRefs(message, skills);
		const pendingPatch: WorkbenchPatch = takePendingWorkbenchPatch();
		const flushPendingPatch = sendWorkbenchPatch(pendingPatch, false);

		try {
			setSessionError(null);
			activeChatRequestIdRef.current = requestId;
			applyOptimisticRetry(payload.requestId, requestId, message, payload.additionalContext);
			setActiveRetryRequestId(null);

			await flushPendingPatch;
			await sendChatMessage({
				requestId,
				message,
				mode: chatMode,
				provider: workbench.composer.provider ?? undefined,
				model: workbench.composer.model ?? undefined,
				reasoningEffort: workbench.composer.reasoningEffort ?? undefined,
				executionPolicy: "auto",
				outputTarget: getChatOutputTarget(chatMode, getCurrentWorkspaceId(activeWorkspace, workbench)),
				retryFromRequestId: payload.requestId,
				additionalContext: payload.additionalContext,
				skillRefs
			});
			if (chatMode !== "goal") {
				await refreshLatestTimeline();
			}
			return true;
		} catch (error: unknown) {
			const errorMessage: string = error instanceof Error ? error.message : "Failed to retry message";

			setRunState((currentState: RunControllerState): RunControllerState => finishOptimisticRunState(currentState, requestId));
			setWorkbench((currentWorkbench: WorkbenchSnapshot | null): WorkbenchSnapshot | null => {
				return currentWorkbench === null
					? currentWorkbench
					: {
						...currentWorkbench,
						activeRun: currentWorkbench.activeRun.requestId === requestId
							? { status: "idle" }
							: currentWorkbench.activeRun
					};
			});
			setSessionError(errorMessage);
			await refreshLatestTimeline().catch((refreshError: unknown): void => {
				console.error("[App] refresh timeline after retry failure failed", refreshError);
			});
			console.error("[App] retry message failed", error);
			return false;
		} finally {
			if (activeChatRequestIdRef.current === requestId) {
				activeChatRequestIdRef.current = null;
			}
		}
	}

	async function handleInterruptedRunRetry(runId: string): Promise<void> {
		if (
			activeSessionIdRef.current === null
			|| isSessionLoading
			|| isRunControllerActive(runState)
		) {
			return;
		}
		try {
			setSessionError(null);
			await retryAgentRun(runId);
			await refreshLatestTimeline();
		} catch (error: unknown) {
			const message: string = error instanceof Error ? error.message : "Failed to retry interrupted run";
			setSessionError(message);
			console.error("[App] retry interrupted run failed", error);
		}
	}

	async function handleComposerCancel(): Promise<void> {
		const requestId: string | null = getRunControllerRequestId(runState);
		const cancellationRequestId: string | null = requestId ?? activeChatRequestIdRef.current;
		if (cancellationRequestId === null) {
			return;
		}
		if (runState.status === "cancelling" || cancelledChatRequestIdsRef.current.has(cancellationRequestId)) {
			return;
		}

		const wasCreatingSession: boolean = isHomeSubmitting;
		const previousRunState: RunControllerState = runState;
		cancelledChatRequestIdsRef.current.add(cancellationRequestId);
		setRunState((currentState: RunControllerState): RunControllerState => ({
			...currentState,
			status: "cancelling",
			requestId: cancellationRequestId,
			startedAt: currentState.startedAt ?? new Date().toISOString()
		}));
		try {
			activeChatRequestIdRef.current = cancellationRequestId;
			const result = await cancelChatMessage(cancellationRequestId);
			if (!result.cancelled && !result.alreadyFinished && !wasCreatingSession) {
				throw new Error("The backend did not accept the cancellation request.");
			}
		} catch (error: unknown) {
			console.error("[App] cancel chat failed", error);
			if (!wasCreatingSession) {
				cancelledChatRequestIdsRef.current.delete(cancellationRequestId);
				setRunState((currentState: RunControllerState): RunControllerState => (
					currentState.requestId === cancellationRequestId ? previousRunState : currentState
				));
				showTransientError(error instanceof Error ? error.message : "Failed to stop the response");
			}
		}
	}

	async function refreshLatestTimeline(sessionIdOverride?: string): Promise<void> {
		const sessionId: string | null = sessionIdOverride ?? activeSessionId;
		if (sessionId === null) {
			return;
		}

		const timeline: SessionTimelineResult = await fetchSessionTimeline(sessionId);
		if (activeSessionIdRef.current !== sessionId || timeline.sessionId !== sessionId) {
			console.warn("[App] ignored latest timeline for inactive session", {
				requestedSessionId: sessionId,
				activeSessionId: activeSessionIdRef.current,
				resultSessionId: timeline.sessionId
			});
			return;
		}

		const activeOptimisticRequestId: string | null = activeChatRequestIdRef.current ?? getRunControllerRequestId(runState);
		timelineStore.update((currentPage: TimelinePageState): TimelinePageState => {
			return mergeOptimisticUserBlocks(currentPage, createTimelinePageFromTimelineResult(timeline), activeOptimisticRequestId);
		});
		setLatestPlanClarification(timeline.latestPlanClarification);
		setLatestPlanApproval(timeline.latestPlanApproval);
		const workflowTodo: WorkflowTodoSnapshot | null = createWorkflowTodoSnapshotFromTimelineResult(timeline);
		setWorkflowTodoSnapshot(workflowTodo);
		rememberLoadedWorkflowTodo(workflowTodo);
		if (workflowTodo !== null && isWorkflowTodoActive(workflowTodo)) {
			expandWorkflowTodoPanel();
		}

		const sessionList = await fetchSessions();
		const metadata: SessionMetadata | undefined = sessionList.sessions.find((session: SessionMetadata): boolean => session.id === sessionId);
		if (metadata !== undefined) {
			setActiveSessionMetadata(metadata);
			setActiveWorkspace((currentWorkspace: WorkspaceConfig | null): WorkspaceConfig | null => {
				if (metadata.workspaceId === undefined || metadata.workspaceRoot === undefined) {
					return null;
				}
				if (currentWorkspace?.id === metadata.workspaceId) {
					return currentWorkspace;
				}

				return createSingleSourceWorkspaceSnapshot({
					id: metadata.workspaceId,
					name: metadata.workspaceName ?? metadata.title,
					kind: metadata.workspaceKind ?? "godot",
					rootPath: metadata.workspaceRoot,
					godotExecutablePath: metadata.godotExecutablePath
				});
			});
		}
	}

	async function handleWorkflowTodoDismiss(snapshot: WorkflowTodoSnapshot): Promise<void> {
		const params: { workflowId?: string; runId?: string } = {};
		if (snapshot.workflowId !== undefined) {
			params.workflowId = snapshot.workflowId;
		}
		if (snapshot.runId !== undefined) {
			params.runId = snapshot.runId;
		}

		try {
			await dismissWorkflowTodo(params);
			setWorkflowTodoSnapshot((currentSnapshot: WorkflowTodoSnapshot | null): WorkflowTodoSnapshot | null => {
				if (currentSnapshot === null || isSameWorkflowTodoSnapshot(currentSnapshot, snapshot)) {
					return null;
				}

				return currentSnapshot;
			});
		} catch (error: unknown) {
			const message: string = error instanceof Error ? error.message : "Failed to dismiss workflow todo";
			setSessionError(message);
			console.error("[App] dismiss workflow todo failed", error);
		}
	}

	async function handleTerminalGoalDismiss(goal: AgentGoalState): Promise<void> {
		if (!isAgentGoalTerminal(goal)) return;
		await dismissGoal(goal.goalId);
		const snapshot: WorkflowTodoSnapshot | null = workflowTodoSnapshot;
		if (snapshot !== null) {
			const params: { workflowId?: string; runId?: string } = {};
			if (snapshot.workflowId !== undefined) params.workflowId = snapshot.workflowId;
			if (snapshot.runId !== undefined) params.runId = snapshot.runId;
			await dismissWorkflowTodo(params);
		}
		dismissedTerminalGoalIdsRef.current.add(goal.goalId);
		setCurrentGoal((current: AgentGoalState | null): AgentGoalState | null => current?.goalId === goal.goalId ? null : current);
		setWorkflowTodoSnapshot(null);
	}

	const handleLoadMoreBefore = useCallback((): void => {
		const timelinePage: TimelinePageState = timelineStore.getSnapshot();
		if (activeSessionId === null || !timelinePage.hasMoreBefore || isTimelinePageLoadingRef.current) {
			return;
		}

		isTimelinePageLoadingRef.current = true;
		setIsTimelineLoadingBefore(true);
		const requestedSessionId: string = activeSessionId;
		void fetchSessionTimelineBefore(activeSessionId, timelinePage.blockOffset)
			.then((result: SessionTimelineResult): void => {
				if (activeSessionIdRef.current !== requestedSessionId || result.sessionId !== requestedSessionId) {
					console.warn("[App] ignored previous timeline page for inactive session", {
						requestedSessionId,
						activeSessionId: activeSessionIdRef.current,
						resultSessionId: result.sessionId
					});
					return;
				}
				timelineStore.mergeBefore(createTimelinePageFromTimelineResult(result));
			})
			.catch((error: unknown): void => {
				console.error("[App] load previous timeline page failed", error);
			})
			.finally((): void => {
				isTimelinePageLoadingRef.current = false;
				setIsTimelineLoadingBefore(false);
			});
	}, [activeSessionId, timelineStore]);

	const handleLoadMoreAfter = useCallback((): void => {
		const timelinePage: TimelinePageState = timelineStore.getSnapshot();
		if (activeSessionId === null || !timelinePage.hasMoreAfter || isTimelinePageLoadingRef.current) {
			return;
		}

		isTimelinePageLoadingRef.current = true;
		setIsTimelineLoadingAfter(true);
		const requestedSessionId: string = activeSessionId;
		void fetchSessionTimelineAfter(activeSessionId, timelinePage.blockOffset + timelinePage.blocks.length)
			.then((result: SessionTimelineResult): void => {
				if (activeSessionIdRef.current !== requestedSessionId || result.sessionId !== requestedSessionId) {
					console.warn("[App] ignored next timeline page for inactive session", {
						requestedSessionId,
						activeSessionId: activeSessionIdRef.current,
						resultSessionId: result.sessionId
					});
					return;
				}
				timelineStore.mergeAfter(createTimelinePageFromTimelineResult(result));
			})
			.catch((error: unknown): void => {
				console.error("[App] load next timeline page failed", error);
			})
			.finally((): void => {
				isTimelinePageLoadingRef.current = false;
				setIsTimelineLoadingAfter(false);
			});
	}, [activeSessionId, timelineStore]);

	const handleTimelineSearchLoadOffset = useCallback(async (blockOffset: number): Promise<void> => {
		if (activeSessionId === null || blockOffset < 0) {
			return;
		}
		const sessionId: string = activeSessionId;
		const pageStart: number = Math.max(0, blockOffset - 40);
		const result: SessionTimelineResult = await fetchSessionTimelineAfter(sessionId, pageStart, 100);
		if (activeSessionIdRef.current !== sessionId || result.sessionId !== sessionId) {
			return;
		}
		timelineStore.replace(createTimelinePageFromTimelineResult(result));
	}, [activeSessionId, timelineStore]);

	const handleTimelineNavigationLoadEntry = useCallback(async (entry: SessionTimelineNavigationEntry): Promise<void> => {
		try {
			await handleTimelineSearchLoadOffset(entry.blockOffset);
		} catch (error: unknown) {
			const errorMessage: string = error instanceof Error ? error.message : "Failed to load conversation turn";
			setSessionError(errorMessage);
			console.error("[App] load timeline navigation entry failed", error);
		}
	}, [handleTimelineSearchLoadOffset]);

	function patchContext(action: NonNullable<WorkbenchPatch["additionalContextAction"]>): void {
		queueWorkbenchPatch({ additionalContextAction: action }, true);
	}

	async function handleAddImageFiles(files: File[]): Promise<void> {
		if (activeSessionId === null) {
			showTransientError("Please open a session before adding images.");
			return;
		}

		try {
			for (const file of files.slice(0, 3)) {
				if (!isSupportedImageMimeType(file.type)) {
					throw new Error(`Unsupported image type: ${file.type || file.name}`);
				}
				if (file.size <= 0 || file.size > MAX_IMAGE_ATTACHMENT_BYTES) {
					throw new Error(`${file.name} is larger than 5 MiB.`);
				}

				const dataUrl: string = await readFileAsDataUrl(file);
				const dimensions = await readImageDimensions(dataUrl);
				const sourcePath: string | null = getLocalPathForFile(file);
				const result = await saveImageAttachment({
					sessionId: activeSessionId,
					mimeType: file.type,
					dataUrl,
					byteSize: file.size,
					width: dimensions.width,
					height: dimensions.height,
					title: file.name,
					sourcePath: sourcePath ?? undefined
				});
				patchContext({ action: "addOrReplace", item: result.attachment });
			}
		} catch (error: unknown) {
			const errorMessage: string = error instanceof Error ? error.message : "Failed to add image";
			showTransientError(errorMessage);
			console.error("[App] add image failed", error);
		}
	}

	function handleAddPastedTextAttachment(content: string): boolean {
		if (activeSessionId === null) {
			return false;
		}

    setPendingTextAttachmentCount((count) => count + 1);
		void saveTextAttachment({ sessionId: activeSessionId, content })
			.then((result): void => {
				patchContext({ action: "addOrReplace", item: result.attachment });
			})
			.catch((error: unknown): void => {
				const errorMessage: string = error instanceof Error ? error.message : "Failed to save pasted text";
				showTransientError(errorMessage);
				console.error("[App] save pasted text attachment failed", error);
			})
			.finally((): void => {
        setPendingTextAttachmentCount((count) => Math.max(0, count - 1));
			});
		return true;
	}

	function getContextWorkspace(): WorkspaceConfig | null {
		if (activeWorkspace !== null) {
			return activeWorkspace;
		}
		if (activeSessionMetadata?.workspaceId !== undefined && activeSessionMetadata.workspaceRoot !== undefined) {
			return createSingleSourceWorkspaceSnapshot({
				id: activeSessionMetadata.workspaceId,
				name: activeSessionMetadata.workspaceName ?? activeSessionMetadata.workspaceId,
				kind: activeSessionMetadata.workspaceKind ?? "godot",
				rootPath: activeSessionMetadata.workspaceRoot,
				godotExecutablePath: activeSessionMetadata.godotExecutablePath
			});
		}
		return null;
	}

	async function handleAddWorkspaceContext(kind: "files" | "folder"): Promise<void> {
		if (activeSessionId === null) {
			showTransientError("Please open a session before adding files or folders.");
			return;
		}
		const workspace: WorkspaceConfig | null = getContextWorkspace();
		if (workspace === null) {
			showTransientError("Please select a workspace before adding files or folders.");
			return;
		}

		try {
			const entries: WorkspacePickedEntry[] | null = kind === "files"
				? await window.electronAPI.workspaceFs.pickWorkspaceFiles({ workspaceRoot: workspace.rootPath })
				: await window.electronAPI.workspaceFs.pickWorkspaceFolder({ workspaceRoot: workspace.rootPath });
			if (entries === null || entries.length === 0) {
				return;
			}
			for (const entry of entries) {
				patchContext({ action: "addOrReplace", item: createWorkspacePathContextItem(entry, workspace) });
			}
		} catch (error: unknown) {
			const errorMessage: string = error instanceof Error ? error.message : "Failed to add workspace context";
			showTransientError(errorMessage);
			console.error("[App] add workspace context failed", error);
		}
	}

	async function handleAddContextFiles(files: File[]): Promise<void> {
		const now: number = Date.now();
		for (const [signature, timestamp] of recentContextFileSignaturesRef.current) {
			if (now - timestamp > RECENT_CONTEXT_FILE_WINDOW_MS) {
				recentContextFileSignaturesRef.current.delete(signature);
			}
		}

		const nextFiles: File[] = [];
		for (const file of files) {
			const signature: string = createContextFileSignature(file);
			if (recentContextFileSignaturesRef.current.has(signature)) {
				continue;
			}

			recentContextFileSignaturesRef.current.set(signature, now);
			nextFiles.push(file);
		}

		if (nextFiles.length === 0) {
			return;
		}
		if (activeSessionId === null) {
			showTransientError("Please open a session before adding files.");
			return;
		}

		const imageFiles: File[] = [];
		const workspaceFiles: File[] = [];
		for (const file of nextFiles) {
			if (isSupportedImageMimeType(file.type)) {
				imageFiles.push(file);
				continue;
			}
			workspaceFiles.push(file);
		}

		try {
			if (imageFiles.length > 0) {
				await handleAddImageFiles(imageFiles);
			}

			if (workspaceFiles.length === 0) {
				return;
			}

			const localFiles: Array<{ file: File; path: string }> = workspaceFiles.flatMap((file: File): Array<{ file: File; path: string }> => {
				const filePath: string | null = getLocalPathForFile(file);
				return filePath === null ? [] : [{ file, path: filePath }];
			});
			if (localFiles.length === 0) {
				showTransientError(imageFiles.length > 0 ? "Images added. Dropped files did not expose local paths." : "Dropped files did not expose local paths.");
				return;
			}

			const workspace: WorkspaceConfig | null = getContextWorkspace();
			const workspaceLocalFiles: Array<{ file: File; path: string }> = workspace === null
				? []
				: localFiles.filter((fileEntry: { file: File; path: string }): boolean => isLocalPathInsideWorkspace(fileEntry.path, workspace.rootPath));
			const externalLocalFiles: Array<{ file: File; path: string }> = workspace === null
				? localFiles
				: localFiles.filter((fileEntry: { file: File; path: string }): boolean => !isLocalPathInsideWorkspace(fileEntry.path, workspace.rootPath));

			if (workspace !== null && workspaceLocalFiles.length > 0) {
				const entries: WorkspacePickedEntry[] = await window.electronAPI.workspaceFs.createEntriesFromPaths({
					workspaceRoot: workspace.rootPath,
					paths: workspaceLocalFiles.map((fileEntry: { file: File; path: string }): string => fileEntry.path)
				});
				for (const entry of entries) {
					patchContext({ action: "addOrReplace", item: createWorkspacePathContextItem(entry, workspace) });
				}
			}
			for (const fileEntry of externalLocalFiles) {
				patchContext({ action: "addOrReplace", item: createExternalFileContextItem(fileEntry.file, fileEntry.path) });
			}
		} catch (error: unknown) {
			const errorMessage: string = error instanceof Error ? error.message : "Failed to add files";
			showTransientError(errorMessage);
			console.error("[App] add context files failed", error);
		}
	}

	const displayedComposerModel = getDisplayedComposerModel({
		isNewSessionHome,
		homeDraft,
		workbench,
		activeSessionMetadata,
		providerModelSelection
	});
	const selectedProviderId: string | null = displayedComposerModel.providerId;
	const selectedModelId: string | null = displayedComposerModel.modelId;
	const latestPlanClarificationKey: string | null = latestPlanClarification === null
		? null
		: createPlanClarificationKey(latestPlanClarification);
	const pendingPlanClarification: PlanClarificationState | null = latestPlanClarificationKey !== null
		&& latestPlanClarificationKey === suppressedPlanClarificationKey
		? null
		: latestPlanClarification;
	const latestPlanApprovalKey: string | null = latestPlanApproval === null
		? null
		: createPlanApprovalKey(latestPlanApproval);
	const pendingPlanApproval: PlanApprovalState | null = latestPlanApproval;
	const pendingToolBudget: PendingToolBudget | null = workbench?.pendingToolBudget ?? null;
	const chatTitle: string = isNewSessionHome ? "New session" : getSessionTitle(activeSessionMetadata, activeSessionId);
	const composerScopeId: string = activeSessionId ?? "home";
	const composerMessage: string = composerDraftsRef.current.get(composerScopeId) ?? "";
	const composerInstanceKey: string = `${composerScopeId}:${composerInputReset.scopeId === composerScopeId ? composerInputReset.revision : 0}`;
	const composerMode: ChatMode = activeSessionId === null ? homeDraft.chatMode : getChatMode(workbench);
	const composerReasoningEffort: string | null = activeSessionId === null
		? homeDraft.reasoningEffort
		: workbench?.composer.reasoningEffort ?? activeSessionMetadata?.reasoningEffort ?? null;
	const composerContextItems: AdditionalContextItem[] = activeSessionId === null ? [] : workbench?.composer.additionalContext ?? [];
	const composerMessageQueue: MessageQueueItem[] = activeSessionId === null ? [] : workbench?.messageQueue ?? [];
	const composerPendingGuides: PendingGuide[] = activeSessionId === null ? [] : workbench?.pendingGuides ?? [];
	const currentSessionWorkspaceId: string | null = activeSessionMetadata?.workspaceId ?? null;
	const composerWorkspaceLocked: boolean = isWorkspaceSessionCreating
		|| isComposerWorkspaceSelectionLocked(activeSessionId, activeSessionMetadata);
	const displayedWorkspace: WorkspaceConfig | null = activeSessionId === null
		? homeDraft.workspace
		: currentSessionWorkspaceId === null
			? null
			: activeWorkspace;
	const godotLaunchExecutablePath: string | null = displayedWorkspace?.godotExecutablePath
		?? activeSessionMetadata?.godotExecutablePath
		?? (generalSettings.godotExecutableStatus === "ready" ? generalSettings.godotExecutablePath : null);
	const composerIsSending: boolean = isRunControllerActive(runState) || isHomeSubmitting;
	const composerIsCancelling: boolean = runState.status === "cancelling";
	const runningSessionIds: string[] = [...runningSessionState.keys()];

	useEffect((): void => {
		activeSessionTitleRef.current = chatTitle;
	}, [chatTitle]);

	useEffect((): (() => void) | void => {
		if (activeSessionId === null) {
			setTimelineNavigationEntries([]);
			return;
		}
		let cancelled: boolean = false;
		const sessionId: string = activeSessionId;
		void fetchSessionTimelineIndex(sessionId)
			.then((result) => {
				if (!cancelled && activeSessionIdRef.current === sessionId && result.sessionId === sessionId) {
					setTimelineNavigationEntries(result.entries);
				}
			})
			.catch((error: unknown): void => {
				if (!cancelled) {
					console.warn("[App] load timeline navigation index failed", error);
				}
			});
		return (): void => {
			cancelled = true;
		};
	}, [activeSessionId, timelineBlockCount]);

	useEffect((): void => {
		pendingUserActionRequestIdsRef.current.clear();
		clearNativeTaskNotificationAttention();
	}, [activeSessionId, clearNativeTaskNotificationAttention]);

	useEffect((): void => {
		if (activeSessionId === null || pendingApproval === null) {
			return;
		}

		showNativeTaskNotification({
			kind: "approval_required",
			sessionId: activeSessionId,
			requestId: pendingApproval.requestId,
			title: "Daedalus needs approval",
			body: "The assistant is waiting for tool approval.",
			dedupeKey: `approval_required:${activeSessionId}:tool:${pendingApproval.approvalId}`
		});
	}, [activeSessionId, pendingApproval?.approvalId, pendingApproval?.requestId]);

	useEffect((): void => {
		if (activeSessionId === null || pendingToolBudget === null) {
			return;
		}

		showNativeTaskNotification({
			kind: "approval_required",
			sessionId: activeSessionId,
			requestId: pendingToolBudget.requestId,
			title: "Daedalus needs approval",
			body: "The assistant needs a tool budget decision.",
			dedupeKey: `approval_required:${activeSessionId}:tool_budget:${pendingToolBudget.budgetId}`
		});
	}, [activeSessionId, pendingToolBudget?.budgetId, pendingToolBudget?.requestId]);

	useEffect((): void => {
		if (activeSessionId === null || pendingPlanApproval === null) {
			return;
		}

		showNativeTaskNotification({
			kind: "approval_required",
			sessionId: activeSessionId,
			requestId: pendingPlanApproval.requestId,
			title: "Daedalus needs approval",
			body: "A plan is ready for review.",
			dedupeKey: `approval_required:${activeSessionId}:plan:${pendingPlanApproval.planId}:${pendingPlanApproval.updatedAt}`
		});
	}, [activeSessionId, pendingPlanApproval?.planId, pendingPlanApproval?.requestId, pendingPlanApproval?.updatedAt]);

	useEffect((): void => {
		if (activeSessionId === null || pendingPlanClarification === null) {
			return;
		}

		showNativeTaskNotification({
			kind: "clarification_required",
			sessionId: activeSessionId,
			requestId: pendingPlanClarification.requestId,
			title: "Daedalus needs clarification",
			body: "A plan question is waiting for your reply.",
			dedupeKey: `clarification_required:${activeSessionId}:${pendingPlanClarification.planId}:${pendingPlanClarification.question}`
		});
	}, [activeSessionId, pendingPlanClarification?.planId, pendingPlanClarification?.question, pendingPlanClarification?.requestId]);

	useEffect((): void => {
		if (latestPlanClarificationKey === null && suppressedPlanClarificationKey !== null) {
			setSuppressedPlanClarificationKey(null);
		}
		if (latestPlanClarificationKey !== suppressedPlanClarificationKey) {
			setPlanClarificationError(null);
			setIsPlanClarificationSubmitting(false);
		}
	}, [latestPlanClarificationKey, suppressedPlanClarificationKey]);

	useEffect((): void => {
		setPlanApprovalError(null);
		setIsPlanApproving(false);
		setIsPlanRevising(false);
	}, [latestPlanApprovalKey]);

	async function handlePlanClarificationSubmit(reply: string | undefined, skip: boolean = false): Promise<void> {
		const clarification: PlanClarificationState | null = pendingPlanClarification;
		const trimmedReply: string = reply?.trim() ?? "";
		if (clarification === null || (!skip && trimmedReply.length === 0) || isPlanClarificationSubmitting) {
			return;
		}

	const currentClarificationKey: string = createPlanClarificationKey(clarification);
	const runRequestId: string = clarification.requestId;
	try {
		setIsPlanClarificationSubmitting(true);
		setPlanClarificationError(null);
		setSuppressedPlanClarificationKey(currentClarificationKey);
		activeChatRequestIdRef.current = runRequestId;
		applyOptimisticActiveRun(runRequestId, false, false);
		const submission: PlanClarificationSubmission = skip ? { skip: true } : { reply: trimmedReply };
		const result: PlanResult = await submitPlanClarification(clarification.planId, submission);
		if ((result as unknown as { cancelled?: unknown }).cancelled === true) {
			return;
		}
		const nextClarification: PlanClarificationState | null = result.status === "clarification_required"
			? normalizePlanClarification(result)
			: null;
			setLatestPlanClarification(nextClarification);
			setLatestPlanApproval(getPlanApprovalFromResult(result));
			setSuppressedPlanClarificationKey(nextClarification === null ? null : currentClarificationKey);
		} catch (error: unknown) {
			const errorMessage: string = error instanceof Error ? error.message : "Failed to submit clarification";
			setPlanClarificationError(errorMessage);
		setSessionError(errorMessage);
		console.error("[App] submit plan clarification failed", error);
	} finally {
		finishOptimisticActiveRun(runRequestId);
		if (activeChatRequestIdRef.current === runRequestId) {
			activeChatRequestIdRef.current = null;
		}
		setIsPlanClarificationSubmitting(false);
	}
}

	async function handlePlanApprove(planId: string): Promise<void> {
		if (latestPlanApproval === null || planId !== latestPlanApproval.planId || isPlanApproving || isPlanRevising) {
			return;
		}

		try {
			setIsPlanApproving(true);
			setPlanApprovalError(null);
			const planTodo: WorkflowTodoSnapshot | null = createWorkflowTodoSnapshotFromPlanData(latestPlanApproval, true);
			if (planTodo !== null) {
				showWorkflowTodo(planTodo, true);
			}
			const result = await approvePlan(planId);
			setWorkbench(result.workbench);
			setActiveSessionMetadata((currentMetadata: SessionMetadata | null): SessionMetadata | null => (
				currentMetadata === null
					? currentMetadata
					: { ...currentMetadata, chatMode: result.chatMode }
			));
			activeChatRequestIdRef.current = result.executionRequestId;
			applyOptimisticSend(result.executionRequestId, "执行计划。", [], true, true);
			setLatestPlanApproval((currentPlanApproval: PlanApprovalState | null): PlanApprovalState | null => {
				return currentPlanApproval?.planId === planId ? null : currentPlanApproval;
			});
		} catch (error: unknown) {
			const errorMessage: string = error instanceof Error ? error.message : "Failed to approve plan";
			setPlanApprovalError(errorMessage);
			console.error("[App] approve plan failed", error);
		} finally {
			setIsPlanApproving(false);
		}
	}

	async function handlePlanRevise(planId: string, feedback: string): Promise<void> {
		const trimmedFeedback: string = feedback.trim();
		if (latestPlanApproval === null || planId !== latestPlanApproval.planId || trimmedFeedback.length === 0 || isPlanApproving || isPlanRevising) {
			return;
	}

	const runRequestId: string = latestPlanApproval.requestId;
	try {
		setIsPlanRevising(true);
		setPlanApprovalError(null);
		activeChatRequestIdRef.current = runRequestId;
		applyOptimisticActiveRun(runRequestId, false, false);
		const result: PlanResult = await revisePlan(planId, trimmedFeedback);
		if ((result as unknown as { cancelled?: unknown }).cancelled === true) {
			return;
		}
		const nextPlanApproval: PlanApprovalState | null = getPlanApprovalFromResult(result);
		setLatestPlanApproval(nextPlanApproval);
		if (result.status === "clarification_required") {
				setLatestPlanClarification(normalizePlanClarification(result));
			}
		} catch (error: unknown) {
			const errorMessage: string = error instanceof Error ? error.message : "Failed to revise plan";
		setPlanApprovalError(errorMessage);
		console.error("[App] revise plan failed", error);
	} finally {
		finishOptimisticActiveRun(runRequestId);
		if (activeChatRequestIdRef.current === runRequestId) {
			activeChatRequestIdRef.current = null;
		}
		setIsPlanRevising(false);
	}
}

	return (
		<main className={styles.shell}>
			{messageContextHolder}
			<Modal
				open={isFullTrustModalOpen}
				title={t("app.fullTrust.title")}
				okText={t("app.fullTrust.actions.enable")}
				cancelText={t("app.fullTrust.actions.cancel")}
				okButtonProps={{
					danger: true,
					disabled: fullTrustConfirmationText !== FULL_TRUST_CONFIRMATION_TEXT
				}}
				confirmLoading={isApprovalModeSaving}
				onOk={(): void => {
					void handleFullTrustConfirm();
				}}
				onCancel={(): void => {
					if (!isApprovalModeSaving) {
						setIsFullTrustModalOpen(false);
						setFullTrustConfirmationText("");
					}
				}}
			>
				<Typography.Paragraph>
					{t("app.fullTrust.description")}
				</Typography.Paragraph>
				<Typography.Paragraph type="secondary">
					{t("app.fullTrust.confirmationPrefix")}{" "}
					<Typography.Text code>{FULL_TRUST_CONFIRMATION_TEXT}</Typography.Text>{" "}
					{t("app.fullTrust.confirmationSuffix")}
				</Typography.Paragraph>
				<Input
					value={fullTrustConfirmationText}
					placeholder={FULL_TRUST_CONFIRMATION_TEXT}
					disabled={isApprovalModeSaving}
					onChange={(event: React.ChangeEvent<HTMLInputElement>): void => {
						setFullTrustConfirmationText(event.target.value);
					}}
				/>
			</Modal>
			<div className={styles.pageSurface}>
				<HomePage
						workspaceRefreshToken={workspaceRefreshToken}
						isHome={isNewSessionHome}
						activeSessionId={activeSessionId}
						workspaceSidebar={clientPreferences.workspaceSidebar}
						keyboardShortcuts={clientPreferences.keyboardShortcuts}
						onWorkspaceSidebarChange={handleWorkspaceSidebarChange}
						sessionLayout={activeSessionLayout}
						onSessionLayoutChange={handleSessionLayoutChange}
						activeSessionMetadata={activeSessionMetadata}
						activeWorkspaceId={activeSessionId === null ? homeDraft.workspaceId : currentSessionWorkspaceId}
						chatTitle={chatTitle}
						timelineStore={timelineStore}
						timelineNavigationEntries={timelineNavigationEntries}
						isSessionLoading={isSessionLoading}
						sessionError={sessionError}
						isLoadingMoreBefore={isTimelineLoadingBefore}
						isLoadingMoreAfter={isTimelineLoadingAfter}
						retryDisabled={composerIsSending || isSessionLoading}
						activeRetryRequestId={activeRetryRequestId}
						providerModelSelection={providerModelSelection}
						selectedProviderId={selectedProviderId}
						selectedModelId={selectedModelId}
						reasoningEffort={composerReasoningEffort}
						composerInstanceKey={composerInstanceKey}
						message={composerMessage}
						onDraftChange={handleComposerDraftChange}
						contextItems={composerContextItems}
						selectionAskThreads={selectionAskThreads}
						messageQueue={composerMessageQueue}
						pendingGuides={composerPendingGuides}
						workflowTodoSnapshot={workflowTodoSnapshot}
						currentGoal={currentGoal}
						workflowTodoCollapsed={activeSessionMetadata?.workflowTodoCollapsed === true}
						mode={composerMode}
						approvalMode={approvalMode}
						pendingApproval={pendingApproval}
						isApproving={isApproving}
						isRejecting={isRejecting}
						approvalError={approvalError}
						pendingToolBudget={pendingToolBudget}
						isToolBudgetContinuing={isToolBudgetContinuing}
						isToolBudgetStopping={isToolBudgetStopping}
						toolBudgetError={toolBudgetError}
						pendingPlanClarification={pendingPlanClarification}
						isPlanClarificationSubmitting={isPlanClarificationSubmitting}
						planClarificationError={planClarificationError}
						pendingPlanApproval={pendingPlanApproval}
						isPlanApproving={isPlanApproving}
						isPlanRevising={isPlanRevising}
						planApprovalError={planApprovalError}
						slashCommands={slashCommands}
						skills={skills}
						isSending={composerIsSending}
						isCancelling={composerIsCancelling}
						isAddingTextAttachment={isAddingTextAttachment}
						isApprovalModeSaving={isApprovalModeSaving}
						workspaceOptions={homeWorkspaceOptions}
						initialWorkspaces={bootstrapData.workspaceList.workspaces}
						initialSessions={bootstrapData.sessionList.sessions}
						initialActiveWorkspaceId={bootstrapData.workspaceList.active}
						initialWorkspaceTreeOrder={bootstrapData.workspaceTreeOrder}
						runningSessionIds={runningSessionIds}
						unreadSessionIds={[...unreadSessionIds]}
						homeWorkspace={homeDraft.workspace}
						workspaceFooterDisabled={isHomeSubmitting || composerWorkspaceLocked || isSessionLoading}
						activeWorkspace={displayedWorkspace}
						godotLaunchExecutablePath={godotLaunchExecutablePath}
						onNewSession={handleNewSession}
						onNewUnboundSession={(): void => {
							void handleNewSession({ restoreTemporaryDraft: false });
						}}
						onNewWorkspaceSession={(workspace: WorkspaceConfig): void => {
							void handleNewWorkspaceSession(workspace);
						}}
						onWorkspaceRefresh={(): void => {
							setWorkspaceRefreshToken((currentToken: number): number => currentToken + 1);
						}}
						onHomeWorkspaceSelect={(workspaceId: string): void => {
							void handleHomeWorkspaceSelect(workspaceId);
						}}
						onHomeWorkspaceAdd={handleHomeWorkspaceAdd}
						onHomeWorkspaceClear={handleHomeWorkspaceClear}
						onSessionSelect={handleSessionSelect}
						onSessionArchive={handleSessionArchive}
						onSessionRename={handleSessionRename}
						onSessionsChange={handleSessionsChange}
						onWorkspaceDelete={handleWorkspaceDelete}
						onWorkspaceUpdate={handleWorkspaceUpdate}
						onWorkspaceProjectCreated={handleWorkspaceTreeProjectCreated}
						onLoadMoreBefore={handleLoadMoreBefore}
						onLoadMoreAfter={handleLoadMoreAfter}
						onTimelineNavigationLoadEntry={handleTimelineNavigationLoadEntry}
						onTimelineSearchLoadOffset={handleTimelineSearchLoadOffset}
						onRetryEditStart={(requestId: string): void => {
							setActiveRetryRequestId(requestId);
						}}
						onRetryEditCancel={(requestId: string): void => {
							setActiveRetryRequestId((currentRequestId: string | null): string | null => {
								return currentRequestId === requestId ? null : currentRequestId;
							});
						}}
						onRetryFromUserMessage={handleRetryFromUserMessage}
						onModeChange={(mode: ChatMode): void => {
							void handleModeChange(mode);
						}}
						onApprovalModeChange={(mode: ApprovalMode): void => {
							void handleApprovalModeChange(mode);
						}}
						onApprovalApprove={(approvalId: string, consentText?: string): void => {
							void handleApprovalApprove(approvalId, consentText);
						}}
						onApprovalReject={(approvalId: string): void => {
							void handleApprovalReject(approvalId);
						}}
						onToolBudgetContinue={(budgetId: string): void => {
							void handleToolBudgetContinue(budgetId);
						}}
						onToolBudgetStop={(budgetId: string): void => {
							void handleToolBudgetStop(budgetId);
						}}
						onPlanClarificationSubmit={(reply: string): void => {
							void handlePlanClarificationSubmit(reply);
						}}
							onPlanClarificationSkip={(): void => {
								void handlePlanClarificationSubmit(undefined, true);
							}}
						onPlanApprove={(planId: string): void => {
							void handlePlanApprove(planId);
						}}
						onPlanRevise={(planId: string, feedback: string): void => {
							void handlePlanRevise(planId, feedback);
						}}
						onProviderModelChange={(providerId: string, modelId: string): void => {
							void handleProviderModelChange(providerId, modelId);
						}}
						onReasoningEffortChange={(effort: string): void => {
							void handleReasoningEffortChange(effort);
						}}
						onAddFiles={(): void => {
							void handleAddWorkspaceContext("files");
						}}
						onAddFolder={(): void => {
							void handleAddWorkspaceContext("folder");
						}}
						onAddImages={(files: File[]): void => {
							void handleAddImageFiles(files);
						}}
						onAddPastedTextAttachment={handleAddPastedTextAttachment}
						onAddContextFiles={(files: File[]): void => {
							void handleAddContextFiles(files);
						}}
						onAddContext={(item: AdditionalContextItem): void => patchContext({ action: "addOrReplace", item })}
						onRemoveContext={(contextId: string): void => patchContext({ action: "remove", contextId })}
						onPinContext={(contextId: string, pinned: boolean): void => patchContext({ action: "pin", contextId, pinned })}
						onClearUnpinnedContext={(): void => patchContext({ action: "clearUnpinned" })}
						onCancel={(): void => {
							void handleComposerCancel();
						}}
						onSubmit={(message: string, modeOverride?: ChatMode): void => {
							void handleComposerSubmit(message, modeOverride);
						}}
						onGuideSubmit={(message: string): void => {
							void handleGuideSubmit(message);
						}}
						activeQueueItemId={workbench?.activeRun.queueItemId ?? null}
						onQueueMessageRemove={(queueId: number): void => {
							void handleQueueMessageRemove(queueId);
						}}
						onQueueMessageEdit={(item: MessageQueueItem): void => {
							void handleQueueMessageEdit(item);
						}}
						onQueueMessageReorder={(queueIds: number[]): void => {
							void handleQueueMessageReorder(queueIds);
						}}
						onGuideDelete={(guideId: string): void => {
							void handleGuideDelete(guideId);
						}}
						onGuideReorder={(guideIds: string[]): void => {
							void handleGuideReorder(guideIds);
						}}
						onWorkflowTodoDismiss={(snapshot: WorkflowTodoSnapshot): void => {
							void handleWorkflowTodoDismiss(snapshot);
						}}
						onGoalChange={applyCurrentGoalSnapshot}
						onGoalDismiss={handleTerminalGoalDismiss}
						onCompletionOpen={handleCompletionOpen}
				/>
			</div>
			<WorkspaceProjectDialog
				open={isWorkspaceProjectDialogOpen}
				workspace={null}
				onCancel={(): void => setIsWorkspaceProjectDialogOpen(false)}
				onSaved={handleWorkspaceProjectCreated}
			/>
		</main>
	);
}

export default App;

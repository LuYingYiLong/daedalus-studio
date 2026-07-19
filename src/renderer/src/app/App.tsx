import { useCallback, useEffect, useRef, useState } from "react";
import { message as antdMessage } from "antd";
import { useDiskSpaceCheck } from "@/hooks/useDiskSpaceCheck";
import { configureEnvironment, fetchWorkspaces, selectWorkspace, type DeleteWorkspaceResult } from "@/api/workspace-api";
import styles from "./App.module.css";
import type { AdditionalContextItem, PlanApprovalState, PlanClarificationState, PlanRecommendedReply, SessionMetadata, SessionOpenResult, SessionTimelineResult, TimelineBlock, WorkbenchPatch, WorkbenchPatchResult, WorkbenchSnapshot, WorkflowTodoSnapshot, WorkspaceConfig } from "@/api/types";
import { createSession, dismissWorkflowTodo, fetchSessions, fetchSessionTimeline, fetchSessionTimelineAfter, fetchSessionTimelineBefore, openSession, saveSessionUiMetadata, setSessionModel, type SaveSessionUiMetadataParams } from "@/api/session-api";
import type { RetryUserMessagePayload } from "@/features/bubble/UserBubble";
import { fetchProviderModelSelection, type ProviderModelSelection } from "@/api/provider-api";
import type { ProviderModelSelectionProvider } from "@/api/provider-api";
import { createBackendClient } from "@/api/backend-client";
import type { BackendEvent } from "@/api/backend-rpc-client";
import { cancelChatMessage, sendChatMessage, type ChatMode } from "@/api/chat-api";
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
	emptyTimelinePage,
	mergeTimelineAfter,
	mergeTimelineBefore,
	type TimelinePageState
} from "@/features/workbench/workbench-state";
import { patchWorkbench } from "@/api/workbench-api";
import { getSessionTitle } from "./session-title";
import AppNavTabs, { type AppPageKey } from "./AppNavTabs";
import AgentPage from "@/pages/agent/AgentPage";
import SettingsPage from "@/pages/settings/SettingsPage";
import DrawingPage from "@/pages/drawing/DrawingPage";
import KnowledgePage from "@/pages/knowledge/KnowledgePage";
import { extractEnabledSkillRefs, type ComposerCompletionTrigger } from "@/features/composer/composer-completion";
import { getWorkflowTodoSnapshotKey, isWorkflowTodoClearEvent, normalizeWorkflowTodoSnapshot } from "@/features/composer/workflow-todo";
import { saveImageAttachment, type SaveImageAttachmentParams } from "@/api/image-attachment-api";
import { DEFAULT_CLIENT_PREFERENCES, fetchClientPreferences, updateClientPreferences, type ClientPreferences } from "@/api/client-preferences-api";
import { DEFAULT_GENERAL_SETTINGS, fetchGeneralSettings, type GeneralSettings } from "@/api/general-settings-api";
import { approvePlan, revisePlan, submitPlanClarification, type PlanResult } from "@/api/plan-api";

type SupportedImageMimeType = SaveImageAttachmentParams["mimeType"];
type WorkspacePickedEntry = {
	name: string;
	relativePath: string;
	resourcePath: string;
	kind: "file" | "folder";
};

const SUPPORTED_IMAGE_MIME_TYPES: readonly SupportedImageMimeType[] = ["image/png", "image/jpeg", "image/webp", "image/gif"];
const MAX_IMAGE_ATTACHMENT_BYTES: number = 1024 * 1024;
const RECENT_CONTEXT_FILE_WINDOW_MS: number = 2000;
const PLAN_CLARIFICATION_SKIP_REPLY: string = "Continue with the current assumptions.";

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

function getStringField(record: Record<string, unknown>, key: string): string {
	const value: unknown = record[key];
	return typeof value === "string" ? value : "";
}

function parsePlanRecommendedReplies(value: unknown): PlanRecommendedReply[] {
	if (!Array.isArray(value)) {
		return [];
	}

	const replies: PlanRecommendedReply[] = [];
	for (const item of value.slice(0, 3)) {
		if (!isRecord(item)) {
			continue;
		}

		const label: string = getStringField(item, "label").trim();
		const text: string = getStringField(item, "text").trim();
		const description: string = getStringField(item, "description").trim();
		if (label.length === 0 || text.length === 0) {
			continue;
		}

		replies.push({
			label,
			text,
			description: description.length > 0 ? description : undefined
		});
	}
	return replies;
}

function normalizePlanClarification(value: unknown): PlanClarificationState | null {
	if (!isRecord(value)) {
		return null;
	}

	const planId: string = getStringField(value, "planId").trim();
	const question: string = getStringField(value, "question").trim();
	if (planId.length === 0 || question.length === 0) {
		return null;
	}

	const title: string = getStringField(value, "title").trim();
	return {
		planId,
		title: title.length > 0 ? title : "Plan clarification",
		question,
		recommendedReplies: parsePlanRecommendedReplies(value.recommendedReplies)
	};
}

function getPlanClarificationFromEvent(event: BackendEvent): PlanClarificationState | null {
	if (event.event !== "plan.clarification.required") {
		return null;
	}

	return normalizePlanClarification(event.data);
}

function normalizePlanApproval(value: unknown): PlanApprovalState | null {
	if (!isRecord(value)) {
		return null;
	}

	const planId: string = getStringField(value, "planId").trim();
	const status: string = getStringField(value, "status").trim();
	const previewMarkdown: string = getStringField(value, "previewMarkdown").trim();
	if (planId.length === 0 || status !== "ready") {
		return null;
	}

	const title: string = getStringField(value, "title").trim();
	return {
		planId,
		title: title.length > 0 ? title : "Plan",
		status,
		previewMarkdown,
		updatedAt: getStringField(value, "updatedAt").trim()
	};
}

function getPlanApprovalFromEvent(event: BackendEvent): PlanApprovalState | null {
	if (event.event !== "plan.generated" && event.event !== "plan.revised") {
		return null;
	}

	return normalizePlanApproval(event.data);
}

function getPlanApprovalFromResult(result: PlanResult): PlanApprovalState | null {
	return normalizePlanApproval(result);
}

function getPlanIdFromEvent(event: BackendEvent): string {
	return isRecord(event.data) ? getStringField(event.data, "planId").trim() : "";
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

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function getBackendEventSessionId(event: BackendEvent): string | null {
	if (!isRecord(event.data)) {
		return null;
	}

	return typeof event.data.sessionId === "string" ? event.data.sessionId : null;
}

function getBackendEventSessionMetadata(event: BackendEvent): SessionMetadata | null {
	if (!isRecord(event.data) || !isRecord(event.data.metadata)) {
		return null;
	}

	const metadata: Record<string, unknown> = event.data.metadata;
	return typeof metadata.id === "string" && typeof metadata.title === "string"
		? metadata as SessionMetadata
		: null;
}

function getWorkbenchFromEvent(event: BackendEvent): WorkbenchSnapshot | null {
	if (event.event !== "session.workbench.updated" || !isRecord(event.data)) {
		return null;
	}

	const workbench: unknown = event.data.workbench;
	if (!isRecord(workbench) || typeof workbench.revision !== "number") {
		return null;
	}

	return workbench as WorkbenchSnapshot;
}

function mergePatch(left: WorkbenchPatch, right: WorkbenchPatch): WorkbenchPatch {
	return {
		...left,
		...right,
		composer: {
			...left.composer,
			...right.composer
		}
	};
}

function getChatMode(workbench: WorkbenchSnapshot | null): ChatMode {
	return workbench?.composer.chatMode ?? "ask";
}

function getActiveRunRequestId(workbench: WorkbenchSnapshot | null): string | null {
	const activeRun = workbench?.activeRun;
	if (activeRun === undefined || activeRun.status === "idle") {
		return null;
	}

	return activeRun.requestId ?? null;
}

function getIsSending(workbench: WorkbenchSnapshot | null): boolean {
	const status = workbench?.activeRun.status;

	return status === "streaming" || status === "approval" || status === "paused" || status === "cancelling";
}

function getPendingApprovalCount(workbench: WorkbenchSnapshot | null): number {
	const count = workbench?.pendingApproval?.count;
	return typeof count === "number" && Number.isFinite(count) ? count : 0;
}

type HomeDraft = {
	message: string;
	workspaceId: string | null;
	workspace: WorkspaceConfig | null;
	chatMode: ChatMode;
	providerId: string | null;
	modelId: string | null;
};

function createHomeDraft(): HomeDraft {
	return {
		message: "",
		workspaceId: null,
		workspace: null,
		chatMode: "agent",
		providerId: null,
		modelId: null
	};
}

function findPreferredComposerModel(
	preferences: ClientPreferences,
	selection: ProviderModelSelection | null
): { providerId: string; modelId: string } | null {
	const lastComposerModel = preferences.lastComposerModel;
	if (lastComposerModel !== null && selection !== null) {
		const provider: ProviderModelSelectionProvider | undefined = selection.providers.find((item: ProviderModelSelectionProvider): boolean => {
			return item.provider === lastComposerModel.providerId;
		});
		if (provider?.models.some((model): boolean => model.id === lastComposerModel.modelId) === true) {
			return lastComposerModel;
		}
	}

	const firstProviderWithModel: ProviderModelSelectionProvider | undefined = selection?.providers.find((provider: ProviderModelSelectionProvider): boolean => {
		return provider.models.length > 0;
	});
	const firstModelId: string | undefined = firstProviderWithModel?.models[0]?.id;
	if (firstProviderWithModel !== undefined && firstModelId !== undefined) {
		return {
			providerId: firstProviderWithModel.provider,
			modelId: firstModelId
		};
	}

	if (selection !== null) {
		return selection.activeModel;
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
		modelId: preferredModel.modelId
	};
}

function createWorkspaceFromSessionMetadata(metadata: SessionMetadata, workbench: WorkbenchSnapshot): WorkspaceConfig | null {
	const metadataWorkspaceId: string | undefined = metadata.workspaceId;
	const metadataWorkspaceRoot: string | undefined = metadata.workspaceRoot;
	if (metadataWorkspaceId !== undefined && metadataWorkspaceRoot !== undefined) {
		return {
			id: metadataWorkspaceId,
			name: metadata.workspaceName ?? metadata.title,
			kind: metadata.workspaceKind ?? "godot",
			rootPath: metadataWorkspaceRoot,
			godotExecutablePath: metadata.godotExecutablePath
		};
	}

	const selection = workbench.activeSelection;
	if (typeof selection.workspaceId === "string" && typeof selection.workspaceRoot === "string") {
		return {
			id: selection.workspaceId,
			name: typeof selection.workspaceName === "string" && selection.workspaceName.length > 0
				? selection.workspaceName
				: metadata.title,
			kind: "godot",
			rootPath: selection.workspaceRoot
		};
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
	return normalizeWorkflowTodoSnapshot(result.latestWorkflowSnapshot)
		?? normalizeWorkflowTodoSnapshot(result.latestAgentSnapshot);
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

function mergeOptimisticUserBlocks(currentPage: TimelinePageState, nextPage: TimelinePageState): TimelinePageState {
	const optimisticUserBlocks: TimelineBlock[] = currentPage.blocks.filter((block: TimelineBlock): boolean => {
		return block.type === "user" && block.id.startsWith("optimistic:");
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

function App(): React.JSX.Element {
	const [activePage, setActivePage] = useState<AppPageKey>("agent");
	const [workspaceRefreshToken, setWorkspaceRefreshToken] = useState<number>(0);
	const [isNewSessionHome, setIsNewSessionHome] = useState<boolean>(true);
	const [homeDraft, setHomeDraft] = useState<HomeDraft>(() => createHomeDraft());
	const [homeWorkspaceOptions, setHomeWorkspaceOptions] = useState<WorkspaceConfig[]>([]);
	const [isWorkspaceAdding, setIsWorkspaceAdding] = useState<boolean>(false);
	const [isHomeSubmitting, setIsHomeSubmitting] = useState<boolean>(false);
	const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
	const activeSessionIdRef = useRef<string | null>(null);
	const [activeSessionMetadata, setActiveSessionMetadata] = useState<SessionMetadata | null>(null);
	const [activeWorkspace, setActiveWorkspace] = useState<WorkspaceConfig | null>(null);
	const [timelinePage, setTimelinePage] = useState<TimelinePageState>(emptyTimelinePage);
	const [workbench, setWorkbench] = useState<WorkbenchSnapshot | null>(null);
	const [sessionError, setSessionError] = useState<string | null>(null);
	const [isSessionLoading, setIsSessionLoading] = useState(false);
	const [providerModelSelection, setProviderModelSelection] = useState<ProviderModelSelection | null>(null);
	const [slashCommands, setSlashCommands] = useState<SlashCommandDefinition[]>([]);
	const [skills, setSkills] = useState<SkillSummary[]>([]);
	const [approvalMode, setApprovalModeState] = useState<ApprovalMode>("manual");
	const [isApprovalModeSaving, setIsApprovalModeSaving] = useState<boolean>(false);
	const [pendingApproval, setPendingApproval] = useState<PendingApproval | null>(null);
	const [approvalError, setApprovalError] = useState<string | null>(null);
	const [isApproving, setIsApproving] = useState<boolean>(false);
	const [isRejecting, setIsRejecting] = useState<boolean>(false);
	const [latestPlanClarification, setLatestPlanClarification] = useState<PlanClarificationState | null>(null);
	const [suppressedPlanClarificationKey, setSuppressedPlanClarificationKey] = useState<string | null>(null);
	const [isPlanClarificationSubmitting, setIsPlanClarificationSubmitting] = useState<boolean>(false);
	const [planClarificationError, setPlanClarificationError] = useState<string | null>(null);
	const [latestPlanApproval, setLatestPlanApproval] = useState<PlanApprovalState | null>(null);
	const [isPlanApproving, setIsPlanApproving] = useState<boolean>(false);
	const [isPlanRevising, setIsPlanRevising] = useState<boolean>(false);
	const [planApprovalError, setPlanApprovalError] = useState<string | null>(null);
	const [webSearchEnabled, setWebSearchEnabled] = useState<boolean>(false);
	const [messageApi, messageContextHolder] = antdMessage.useMessage();
	const [activeRetryRequestId, setActiveRetryRequestId] = useState<string | null>(null);
	const [workflowTodoSnapshot, setWorkflowTodoSnapshot] = useState<WorkflowTodoSnapshot | null>(null);
	const [clientPreferences, setClientPreferences] = useState<ClientPreferences>(DEFAULT_CLIENT_PREFERENCES);
	const [generalSettings, setGeneralSettings] = useState<GeneralSettings>(DEFAULT_GENERAL_SETTINGS);
	const pendingPatchRef = useRef<WorkbenchPatch>({});
	const patchTimerRef = useRef<number | null>(null);
	const patchSequenceRef = useRef<number>(0);
	const isTimelinePageLoadingRef = useRef<boolean>(false);
	const activeChatRequestIdRef = useRef<string | null>(null);
	const submittedComposerTextRef = useRef<{ requestId: string; text: string } | null>(null);
	const slashCommandsLoadingRef = useRef<boolean>(false);
	const skillsLoadingRef = useRef<boolean>(false);
	const slashCommandsRetryAtRef = useRef<number>(0);
	const skillsRetryAtRef = useRef<number>(0);
	const recentContextFileSignaturesRef = useRef<Map<string, number>>(new Map());
	const initializedWorkflowTodoKeyRef = useRef<string>("");

	useDiskSpaceCheck();

	useEffect((): void => {
		if (workbench?.activeRun.status === "idle") {
			activeChatRequestIdRef.current = null;
		}
	}, [workbench?.activeRun.requestId, workbench?.activeRun.status]);

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

	function applyInitialWorkflowTodoPreference(snapshot: WorkflowTodoSnapshot | null): void {
		if (snapshot === null) {
			initializedWorkflowTodoKeyRef.current = "";
			return;
		}

		const workflowTodoKey: string = getWorkflowTodoSnapshotKey(snapshot);
		if (initializedWorkflowTodoKeyRef.current === workflowTodoKey) {
			return;
		}

		initializedWorkflowTodoKeyRef.current = workflowTodoKey;
		const workflowTodoCollapsed: boolean = !generalSettings.autoExpandTodoList;
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
			const submittedComposerText = submittedComposerTextRef.current;
			const normalizedWorkbench: WorkbenchSnapshot = submittedComposerText !== null
				&& currentWorkbench?.composer.text === ""
				&& nextWorkbench.composer.text === submittedComposerText.text
				? {
					...nextWorkbench,
					composer: {
						...nextWorkbench.composer,
						text: ""
					}
				}
				: nextWorkbench;

			if (normalizedWorkbench.composer.text === "" && submittedComposerText !== null) {
				submittedComposerTextRef.current = null;
			}

			return applyWorkbenchSnapshot(currentWorkbench, normalizedWorkbench);
		});
	}, []);

	const takePendingWorkbenchPatch = useCallback((): WorkbenchPatch => {
		if (patchTimerRef.current !== null) {
			window.clearTimeout(patchTimerRef.current);
			patchTimerRef.current = null;
		}

		const pendingPatch: WorkbenchPatch = pendingPatchRef.current;
		pendingPatchRef.current = {};

		return pendingPatch;
	}, []);

	const sendWorkbenchPatch = useCallback(async (patch: WorkbenchPatch, applyResult: boolean = true): Promise<WorkbenchPatchResult | null> => {
		const pendingPatch: WorkbenchPatch = patch;

		if (Object.keys(pendingPatch).length === 0) {
			return null;
		}

		const result = await patchWorkbench({
			...pendingPatch,
			clientSequence: patchSequenceRef.current += 1
		});

		if (applyResult) {
			applyWorkbench(result.workbench);
		}

		return result;
	}, [applyWorkbench]);

	const sendPendingWorkbenchPatch = useCallback(async (): Promise<void> => {
		await sendWorkbenchPatch(takePendingWorkbenchPatch());
	}, [sendWorkbenchPatch, takePendingWorkbenchPatch]);

	function applyOptimisticActiveRun(requestId: string, clearComposerText: boolean, clearComposerContext: boolean = false): void {
		const startedAt: string = new Date().toISOString();

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
						startedAt
					}
				};
		});
	}

	function applyOptimisticSend(requestId: string, message: string, additionalContext: AdditionalContextItem[], clearComposerText: boolean = true): void {
		applyOptimisticActiveRun(requestId, clearComposerText, true);
		setTimelinePage((currentPage: TimelinePageState): TimelinePageState => {
			const hasUserBlock: boolean = currentPage.blocks.some((block: TimelineBlock): boolean => {
				return block.type === "user" && block.requestId === requestId;
			});

			if (hasUserBlock) {
				return currentPage;
			}

			return {
				...currentPage,
				blocks: [
					...currentPage.blocks,
					createOptimisticUserBlock(requestId, message, additionalContext)
				],
				blockCount: currentPage.blockCount + 1,
				hasMoreAfter: false
			};
		});
	}

	function finishOptimisticActiveRun(requestId: string): void {
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
		setTimelinePage((currentPage: TimelinePageState): TimelinePageState => {
			const trimmedPage: TimelinePageState = trimTimelineFromRequest(currentPage, retryFromRequestId);

			return {
				...trimmedPage,
				blocks: [
					...trimmedPage.blocks,
					createOptimisticUserBlock(requestId, message, additionalContext)
				],
				blockCount: trimmedPage.blockCount + 1,
				hasMoreAfter: false
			};
		});
	}

	const queueWorkbenchPatch = useCallback((patch: WorkbenchPatch, immediate: boolean = false): void => {
		pendingPatchRef.current = mergePatch(pendingPatchRef.current, patch);

		if (immediate) {
			void sendPendingWorkbenchPatch().catch((error: unknown): void => {
				console.error("[App] workbench patch failed", error);
			});
			return;
		}

		if (patchTimerRef.current !== null) {
			window.clearTimeout(patchTimerRef.current);
		}

		patchTimerRef.current = window.setTimeout((): void => {
			void sendPendingWorkbenchPatch().catch((error: unknown): void => {
				console.error("[App] workbench patch failed", error);
			});
		}, 220);
	}, [sendPendingWorkbenchPatch]);

	useEffect((): void => {
		activeSessionIdRef.current = activeSessionId;
	}, [activeSessionId]);

	useEffect((): void => {
		if (!isNewSessionHome) {
			return;
		}

		setHomeDraft((currentDraft: HomeDraft): HomeDraft => {
			if (currentDraft.providerId !== null || currentDraft.modelId !== null) {
				return currentDraft;
			}

			const preferredModel = findPreferredComposerModel(clientPreferences, providerModelSelection);
			if (preferredModel === null) {
				return currentDraft;
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
			if (patchTimerRef.current !== null) {
				window.clearTimeout(patchTimerRef.current);
			}
		};
	}, []);

	useEffect((): void => {
		async function loadProviderModelSelection(): Promise<void> {
			try {
				const result: ProviderModelSelection = await fetchProviderModelSelection();

				setProviderModelSelection(result);
			} catch (error: unknown) {
				console.error("[App] load provider model selection failed", error);
			}
		}

		void loadProviderModelSelection();
	}, []);

	useEffect((): void => {
		void loadSlashCommands();
	}, [loadSlashCommands]);

	useEffect((): void => {
		if (isNewSessionHome) {
			void loadHomeWorkspaces();
		}
	}, [isNewSessionHome, loadHomeWorkspaces, workspaceRefreshToken]);

	useEffect((): void => {
		if (activeSessionId === null && activeWorkspace === null && homeDraft.workspace === null) {
			setSkills([]);
			return;
		}

		void loadSkills();
	}, [activeSessionId, activeWorkspace?.id, homeDraft.workspace?.id, loadSkills]);

	useEffect((): (() => void) => {
		let cancelled: boolean = false;
		let unsubscribe: (() => void) | null = null;

		async function subscribeBackendEvents(): Promise<void> {
			try {
				const client = await createBackendClient();

				if (cancelled) {
					return;
				}

				unsubscribe = client.addEventListener((event: BackendEvent): void => {
					const eventSessionId: string | null = getBackendEventSessionId(event);
					if (eventSessionId !== null && eventSessionId !== activeSessionIdRef.current) {
						return;
					}

					if (event.event === "session.renamed") {
						const metadata: SessionMetadata | null = getBackendEventSessionMetadata(event);
						if (metadata !== null) {
							setActiveSessionMetadata(metadata);
							setWebSearchEnabled(metadata.webSearchEnabled === true);
						}
						return;
					}

					const eventWorkbench: WorkbenchSnapshot | null = getWorkbenchFromEvent(event);
					if (eventWorkbench !== null) {
						applyWorkbench(eventWorkbench);
						return;
					}

					if (event.event === "skill.catalog.changed") {
						void loadSkills();
					}

					if (event.event === "workflow.todo.updated" || event.event === "agent.run.snapshot") {
						const snapshot: WorkflowTodoSnapshot | null = normalizeWorkflowTodoSnapshot(event.data);
						setWorkflowTodoSnapshot(snapshot);
						applyInitialWorkflowTodoPreference(snapshot);
					} else if (isWorkflowTodoClearEvent(event)) {
						setWorkflowTodoSnapshot(null);
						rememberLoadedWorkflowTodo(null);
					}

					const eventPlanClarification: PlanClarificationState | null = getPlanClarificationFromEvent(event);
					if (eventPlanClarification !== null) {
						setLatestPlanClarification(eventPlanClarification);
						setLatestPlanApproval(null);
						setPlanClarificationError(null);
						setIsPlanClarificationSubmitting(false);
					} else {
						const eventPlanApproval: PlanApprovalState | null = getPlanApprovalFromEvent(event);
						if (eventPlanApproval !== null) {
							setLatestPlanApproval(eventPlanApproval);
							setPlanApprovalError(null);
							setIsPlanApproving(false);
							setIsPlanRevising(false);
						}
					}
					if (event.event === "plan.generated" || event.event === "plan.revised" || event.event === "plan.approved") {
						const eventPlanId: string = getPlanIdFromEvent(event);
						setLatestPlanClarification((currentClarification: PlanClarificationState | null): PlanClarificationState | null => {
							if (currentClarification === null) {
								return null;
							}
							return eventPlanId.length === 0 || eventPlanId === currentClarification.planId ? null : currentClarification;
						});
					}
					if (event.event === "plan.approved" || event.event === "plan.execution.started") {
						const eventPlanId: string = getPlanIdFromEvent(event);
						setLatestPlanApproval((currentPlanApproval: PlanApprovalState | null): PlanApprovalState | null => {
							if (currentPlanApproval === null) {
								return null;
							}
							return eventPlanId.length === 0 || eventPlanId === currentPlanApproval.planId ? null : currentPlanApproval;
						});
					}

					setTimelinePage((currentPage: TimelinePageState): TimelinePageState => {
						return {
							...currentPage,
							blocks: applyBackendEventToTimeline(currentPage.blocks, event)
						};
					});

					if (event.event === "agent.run.done" || event.event === "workflow.done" || event.event === "ai.done") {
						void refreshLatestTimeline();
					}
				});
			} catch (error: unknown) {
				console.error("[App] subscribe backend events failed", error);
			}
		}

		void subscribeBackendEvents();

		return (): void => {
			cancelled = true;
			unsubscribe?.();
		};
	}, [applyWorkbench, generalSettings.autoExpandTodoList, loadSkills]);

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
			const workspace = await selectWorkspace(workspaceId);

			setActiveWorkspace(workspace);
			console.info("[App] workspace selected", workspace);
		} catch (error: unknown) {
			console.error("[App] select workspace failed", error);
		}
	}

	function handleNewSession(): void {
		takePendingWorkbenchPatch();
		submittedComposerTextRef.current = null;
		setIsNewSessionHome(true);
		setHomeDraft(createPreferredHomeDraft(clientPreferences, providerModelSelection));
		activeSessionIdRef.current = null;
		setActiveSessionId(null);
		setActiveSessionMetadata(null);
		setActiveWorkspace(null);
		setTimelinePage(emptyTimelinePage);
		setWorkbench(null);
		setWorkflowTodoSnapshot(null);
		setWebSearchEnabled(false);
		rememberLoadedWorkflowTodo(null);
		resetPlanClarificationUiState();
		resetPlanApprovalUiState();
		setActiveRetryRequestId(null);
		setSessionError(null);
		void loadHomeWorkspaces();
	}

	async function handleNewWorkspaceSession(workspace: WorkspaceConfig): Promise<void> {
		takePendingWorkbenchPatch();
		submittedComposerTextRef.current = null;
		setIsNewSessionHome(true);
		setHomeDraft(createPreferredHomeDraft(clientPreferences, providerModelSelection, workspace));
		activeSessionIdRef.current = null;
		setActiveSessionId(null);
		setActiveSessionMetadata(null);
		setActiveWorkspace(workspace);
		setTimelinePage(emptyTimelinePage);
		setWorkbench(null);
		setWorkflowTodoSnapshot(null);
		setWebSearchEnabled(false);
		rememberLoadedWorkflowTodo(null);
		resetPlanClarificationUiState();
		resetPlanApprovalUiState();
		setActiveRetryRequestId(null);
		setSessionError(null);
		setHomeWorkspaceOptions((currentWorkspaces: WorkspaceConfig[]): WorkspaceConfig[] => {
			if (currentWorkspaces.some((currentWorkspace: WorkspaceConfig): boolean => currentWorkspace.id === workspace.id)) {
				return currentWorkspaces;
			}
			return [...currentWorkspaces, workspace];
		});

		try {
			const selectedWorkspace = await selectWorkspace(workspace.id);
			setActiveWorkspace(selectedWorkspace);
			setHomeDraft((currentDraft: HomeDraft): HomeDraft => ({
				...currentDraft,
				workspaceId: selectedWorkspace.id,
				workspace: selectedWorkspace
			}));
			setHomeWorkspaceOptions((currentWorkspaces: WorkspaceConfig[]): WorkspaceConfig[] => {
				const existingIndex: number = currentWorkspaces.findIndex((currentWorkspace: WorkspaceConfig): boolean => currentWorkspace.id === selectedWorkspace.id);
				if (existingIndex < 0) {
					return [...currentWorkspaces, selectedWorkspace];
				}
				const nextWorkspaces: WorkspaceConfig[] = [...currentWorkspaces];
				nextWorkspaces[existingIndex] = selectedWorkspace;
				return nextWorkspaces;
			});
		} catch (error: unknown) {
			setSessionError(error instanceof Error ? error.message : "Failed to select workspace");
			console.error("[App] select workspace for new session failed", error);
		}
	}

	async function handleHomeWorkspaceSelect(workspaceId: string): Promise<void> {
		try {
			const workspace = await selectWorkspace(workspaceId);

			setHomeDraft((currentDraft: HomeDraft): HomeDraft => ({
				...currentDraft,
				workspaceId: workspace.id,
				workspace
			}));
			setActiveWorkspace(workspace);
			setSessionError(null);
		} catch (error: unknown) {
			setSessionError(error instanceof Error ? error.message : "Failed to select workspace");
			console.error("[App] select home workspace failed", error);
		}
	}

	function handleHomeWorkspaceClear(): void {
		setHomeDraft((currentDraft: HomeDraft): HomeDraft => ({
			...currentDraft,
			workspaceId: null,
			workspace: null
		}));
		setActiveWorkspace(null);
	}

	async function handleHomeWorkspaceAdd(): Promise<void> {
		if (isWorkspaceAdding) {
			return;
		}

		try {
			setIsWorkspaceAdding(true);
			const directory: string | null = await window.electronAPI.workspaceFs.pickWorkspaceDirectory();
			if (directory === null) {
				return;
			}

			const result = await configureEnvironment({ godotProjectPath: directory });
			const workspace: WorkspaceConfig | null = result.workspace;
			if (workspace === null) {
				throw new Error("Workspace registration did not return a workspace");
			}

			setHomeDraft((currentDraft: HomeDraft): HomeDraft => ({
				...currentDraft,
				workspaceId: workspace.id,
				workspace
			}));
			setActiveWorkspace(workspace);
			setHomeWorkspaceOptions((currentWorkspaces: WorkspaceConfig[]): WorkspaceConfig[] => {
				const existingIndex: number = currentWorkspaces.findIndex((currentWorkspace: WorkspaceConfig): boolean => currentWorkspace.id === workspace.id);
				if (existingIndex < 0) {
					return [...currentWorkspaces, workspace];
				}

				const nextWorkspaces: WorkspaceConfig[] = [...currentWorkspaces];
				nextWorkspaces[existingIndex] = workspace;
				return nextWorkspaces;
			});
			setWorkspaceRefreshToken((currentToken: number): number => currentToken + 1);
			setSessionError(null);
		} catch (error: unknown) {
			setSessionError(error instanceof Error ? error.message : "Failed to add workspace");
			console.error("[App] add home workspace failed", error);
		} finally {
			setIsWorkspaceAdding(false);
		}
	}

	async function handleSessionSelect(session: SessionMetadata): Promise<void> {
		const sessionId: string = session.id;
		console.info("[App] session selected", { sessionId });

		try {
			setIsSessionLoading(true);
			setSessionError(null);
			setIsNewSessionHome(false);
			activeSessionIdRef.current = sessionId;
			setActiveSessionId(sessionId);
			setActiveSessionMetadata(session);
			setActiveWorkspace(null);
			setTimelinePage(emptyTimelinePage);
			setWorkbench(null);
			setWorkflowTodoSnapshot(null);
			rememberLoadedWorkflowTodo(null);
			resetPlanClarificationUiState();
			resetPlanApprovalUiState();

			const result: SessionOpenResult = await openSession(sessionId);

			setTimelinePage(createTimelinePageFromOpenResult(result));
			setLatestPlanClarification(result.latestPlanClarification);
			setLatestPlanApproval(result.latestPlanApproval);
			setActiveSessionMetadata(result.metadata);
			setWebSearchEnabled(result.metadata.webSearchEnabled === true);
			setWorkbench(result.workbench);
			setApprovalModeState(result.metadata.approvalMode ?? "manual");
			setActiveWorkspace(createWorkspaceFromSessionOpenResult(result));
			const workflowTodo: WorkflowTodoSnapshot | null = createWorkflowTodoSnapshotFromTimelineResult(result);
			setWorkflowTodoSnapshot(workflowTodo);
			rememberLoadedWorkflowTodo(workflowTodo);

			if (result.workspaceWarning) {
				console.warn("[App] session workspace warning", result.workspaceWarning);
			}
		} catch (error: unknown) {
			const message: string = error instanceof Error ? error.message : "Failed to open session";

			setSessionError(message);
			console.error("[App] open session failed", error);
		} finally {
			setIsSessionLoading(false);
		}
	}

	function resetToNewSessionHome(): void {
		activeSessionIdRef.current = null;
		setActiveSessionId(null);
		setActiveSessionMetadata(null);
		setTimelinePage(emptyTimelinePage);
		setWorkbench(null);
		setWorkflowTodoSnapshot(null);
		rememberLoadedWorkflowTodo(null);
		resetPlanClarificationUiState();
		resetPlanApprovalUiState();
		setActiveRetryRequestId(null);
		setActiveWorkspace(null);
		setSessionError(null);
		setIsNewSessionHome(true);
		setHomeDraft(createPreferredHomeDraft(clientPreferences, providerModelSelection));
	}

	function handleSessionArchive(session: SessionMetadata): void {
		if (session.id !== activeSessionId) {
			return;
		}

		resetToNewSessionHome();
	}

	function handleWorkspaceDelete(result: DeleteWorkspaceResult): void {
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
		if (activeSessionDeleted || activeWorkspaceDeleted) {
			resetToNewSessionHome();
		}
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
		if (isNewSessionHome) {
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

	async function handleApprovalModeChange(nextMode: ApprovalMode): Promise<void> {
		if (nextMode === approvalMode || isApprovalModeSaving) {
			return;
		}

		const previousMode: ApprovalMode = approvalMode;

		setApprovalModeState(nextMode);
		setIsApprovalModeSaving(true);
		setSessionError(null);

		try {
			const result = await setApprovalMode(nextMode);

			setApprovalModeState(result.mode);
			await persistSessionUiMetadata({ approvalMode: result.mode });
		} catch (error: unknown) {
			const message: string = error instanceof Error ? error.message : "Failed to save approval mode";

			setApprovalModeState(previousMode);
			setSessionError(message);
			console.error("[App] save approval mode failed", error);
		} finally {
			setIsApprovalModeSaving(false);
		}
	}

	async function handleProviderModelChange(providerId: string, modelId: string): Promise<void> {
		if (isNewSessionHome) {
			if (isHomeSubmitting) {
				void messageApi.info("Model changes apply to your next message.");
			}
			setHomeDraft((currentDraft: HomeDraft): HomeDraft => ({
				...currentDraft,
				providerId,
				modelId
			}));
			persistLastComposerModel(providerId, modelId);
			return;
		}

		const sessionId: string | null = activeSessionId;
		if (sessionId === null) {
			return;
		}

		if (getIsSending(workbench)) {
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
			persistLastComposerModel(providerId, modelId);
		} catch (error: unknown) {
			if (activeSessionIdRef.current === sessionId && previousWorkbench !== null) {
				setWorkbench(previousWorkbench);
			}
			const message: string = error instanceof Error ? error.message : "Failed to save session model";
			setSessionError(message);
			console.error("[App] save session model failed", error);
		}
	}

	async function handleApprovalApprove(approvalId: string): Promise<void> {
		if (isApproving || isRejecting) {
			return;
		}

		setIsApproving(true);
		setApprovalError(null);
		try {
			await approveApproval(approvalId);
			await refreshPendingApproval();
			await refreshLatestTimeline();
		} catch (error: unknown) {
			const message: string = error instanceof Error ? error.message : "Failed to approve tool execution";
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

		setIsRejecting(true);
		setApprovalError(null);
		try {
			await rejectApproval(approvalId);
			setPendingApproval(null);
			await refreshPendingApproval();
			await refreshLatestTimeline();
		} catch (error: unknown) {
			const message: string = error instanceof Error ? error.message : "Failed to reject tool execution";
			setApprovalError(message);
			console.error("[App] reject approval failed", error);
		} finally {
			setIsRejecting(false);
		}
	}

	function persistLastComposerModel(providerId: string, modelId: string): void {
		const nextPreferences: ClientPreferences = {
			...clientPreferences,
			lastComposerModel: {
				providerId,
				modelId
			}
		};
		setClientPreferences(nextPreferences);
		void updateClientPreferences({
			lastComposerModel: nextPreferences.lastComposerModel
		}).then((savedPreferences: ClientPreferences): void => {
			setClientPreferences(savedPreferences);
		}).catch((error: unknown): void => {
			console.error("[App] save last composer model failed", error);
		});
	}

	function showWebSearchErrorIfRequested(requestedWebSearchEnabled: boolean, errorMessage: string): void {
		if (!requestedWebSearchEnabled) {
			return;
		}

		void messageApi.error(errorMessage);
	}

	function handleComposerTextChange(nextText: string): void {
		if (nextText.length > 0) {
			submittedComposerTextRef.current = null;
		}

		if (isNewSessionHome) {
			setHomeDraft((currentDraft: HomeDraft): HomeDraft => ({
				...currentDraft,
				message: nextText
			}));
			return;
		}

		queueWorkbenchPatch({ composer: { text: nextText } });
	}

	async function handleHomeComposerSubmit(nextMessage: string): Promise<void> {
		const message: string = nextMessage.trim();
		if (message.length === 0 || isHomeSubmitting) {
			return;
		}

		const requestId: string = createChatRequestId();
		const providerId: string | null = homeDraft.providerId ?? providerModelSelection?.activeModel.providerId ?? null;
		const modelId: string | null = homeDraft.modelId ?? providerModelSelection?.activeModel.modelId ?? null;
		const skillRefs: string[] = extractEnabledSkillRefs(message, skills);
		let sessionCreated: boolean = false;
		const requestedWebSearchEnabled: boolean = webSearchEnabled;

		try {
			setIsHomeSubmitting(true);
			setSessionError(null);
			setActiveRetryRequestId(null);
			activeChatRequestIdRef.current = requestId;
			submittedComposerTextRef.current = {
				requestId,
				text: message
			};

			const created = await createSession({
				title: "New session",
				workspaceId: homeDraft.workspaceId,
				provider: providerId ?? undefined,
				model: modelId ?? undefined,
				chatMode: homeDraft.chatMode,
				approvalMode,
				webSearchEnabled: requestedWebSearchEnabled
			});
			sessionCreated = true;

			setIsNewSessionHome(false);
			activeSessionIdRef.current = created.id;
			setActiveSessionId(created.id);
			setActiveSessionMetadata(created);
			setActiveWorkspace(createWorkspaceFromSessionMetadata(created, created.workbench));
			setTimelinePage(emptyTimelinePage);
				setWorkbench(created.workbench);
				setWorkflowTodoSnapshot(null);
				rememberLoadedWorkflowTodo(null);
				setHomeDraft(createPreferredHomeDraft(clientPreferences, providerModelSelection));
			applyOptimisticSend(requestId, message, created.workbench.composer.additionalContext);

			await sendChatMessage({
				requestId,
				message,
				mode: created.workbench.composer.chatMode ?? homeDraft.chatMode,
				provider: providerId ?? undefined,
				model: modelId ?? undefined,
				additionalContext: created.workbench.composer.additionalContext,
				skillRefs,
				webSearchEnabled: requestedWebSearchEnabled
			});
			finishOptimisticActiveRun(requestId);
			await refreshLatestTimeline(created.id);
		} catch (error: unknown) {
			const errorMessage: string = error instanceof Error ? error.message : "Failed to start new session";

			if (submittedComposerTextRef.current?.requestId === requestId) {
				submittedComposerTextRef.current = null;
			}
			if (!sessionCreated) {
				setIsNewSessionHome(true);
				setHomeDraft((currentDraft: HomeDraft): HomeDraft => ({
					...currentDraft,
					message
				}));
			}
			setWorkbench((currentWorkbench: WorkbenchSnapshot | null): WorkbenchSnapshot | null => {
				return currentWorkbench === null
					? currentWorkbench
					: {
						...currentWorkbench,
						composer: {
							...currentWorkbench.composer,
							text: message
						},
						activeRun: currentWorkbench.activeRun.requestId === requestId
							? { status: "idle" }
							: currentWorkbench.activeRun
					};
			});
			setSessionError(errorMessage);
			showWebSearchErrorIfRequested(requestedWebSearchEnabled, errorMessage);
			if (sessionCreated && !isBackendRpcErrorMessage(errorMessage)) {
				setTimelinePage((currentPage: TimelinePageState): TimelinePageState => {
					return {
						...currentPage,
						blocks: applyBackendEventToTimeline(currentPage.blocks, {
							type: "event",
							id: requestId,
							event: "agent.run.error",
							data: {
								code: "frontend_send_error",
								message: errorMessage
							}
						})
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

	async function handleComposerSubmit(nextMessage: string): Promise<void> {
		if (isNewSessionHome) {
			await handleHomeComposerSubmit(nextMessage);
			return;
		}

		if (activeSessionId === null || workbench === null) {
			setSessionError("Please open session first before sending a message");
			return;
		}

		const message: string = nextMessage.trim();
		if (message.length === 0) {
			return;
		}

		const requestId: string = createChatRequestId();
		const additionalContext: AdditionalContextItem[] = workbench.composer.additionalContext;
		const chatMode: ChatMode = getChatMode(workbench);
		const skillRefs: string[] = extractEnabledSkillRefs(message, skills);
		const requestedWebSearchEnabled: boolean = webSearchEnabled;
		const pendingPatch: WorkbenchPatch = mergePatch(takePendingWorkbenchPatch(), {
			additionalContextAction: { action: "set", items: [] }
		});
		const flushPendingPatch = sendWorkbenchPatch(pendingPatch, false);

		try {
			setSessionError(null);
			setActiveRetryRequestId(null);
			activeChatRequestIdRef.current = requestId;
			submittedComposerTextRef.current = {
				requestId,
				text: message
			};
			applyOptimisticSend(requestId, message, additionalContext);

			await flushPendingPatch;
			await sendChatMessage({
				requestId,
				message,
				mode: chatMode,
				provider: workbench.composer.provider ?? undefined,
				model: workbench.composer.model ?? undefined,
				additionalContext,
				skillRefs,
				webSearchEnabled: requestedWebSearchEnabled
			});
			finishOptimisticActiveRun(requestId);
			await refreshLatestTimeline();
		} catch (error: unknown) {
			const errorMessage: string = error instanceof Error ? error.message : "Failed to send message";

			if (submittedComposerTextRef.current?.requestId === requestId) {
				submittedComposerTextRef.current = null;
			}
			setWorkbench((currentWorkbench: WorkbenchSnapshot | null): WorkbenchSnapshot | null => {
				return currentWorkbench === null
					? currentWorkbench
					: {
						...currentWorkbench,
						composer: {
							...currentWorkbench.composer,
							text: message,
							additionalContext
						},
						activeRun: currentWorkbench.activeRun.requestId === requestId
							? { status: "idle" }
							: currentWorkbench.activeRun
					};
			});
			setSessionError(errorMessage);
			showWebSearchErrorIfRequested(requestedWebSearchEnabled, errorMessage);
			if (!isBackendRpcErrorMessage(errorMessage)) {
				setTimelinePage((currentPage: TimelinePageState): TimelinePageState => {
					return {
						...currentPage,
						blocks: applyBackendEventToTimeline(currentPage.blocks, {
							type: "event",
							id: requestId,
							event: "agent.run.error",
							data: {
								code: "frontend_send_error",
								message: errorMessage
							}
						})
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

	async function handleRetryFromUserMessage(payload: RetryUserMessagePayload): Promise<boolean> {
		if (activeSessionId === null || workbench === null) {
			setSessionError("请先打开一个会话再重新发送消息");
			return false;
		}

		if (getIsSending(workbench) || isSessionLoading) {
			return false;
		}

		const message: string = payload.message.trim();
		if (message.length === 0) {
			return false;
		}

		const requestId: string = createChatRequestId();
		const chatMode: ChatMode = getChatMode(workbench);
		const skillRefs: string[] = extractEnabledSkillRefs(message, skills);
		const pendingPatch: WorkbenchPatch = takePendingWorkbenchPatch();
		const flushPendingPatch = sendWorkbenchPatch(pendingPatch, false);
		const previousTimelinePage: TimelinePageState = timelinePage;
		const requestedWebSearchEnabled: boolean = webSearchEnabled;

		try {
			setSessionError(null);
			activeChatRequestIdRef.current = requestId;
			applyOptimisticRetry(payload.requestId, requestId, message, payload.additionalContext);

			await flushPendingPatch;
			await sendChatMessage({
				requestId,
				message,
				mode: chatMode,
				provider: workbench.composer.provider ?? undefined,
				model: workbench.composer.model ?? undefined,
				retryFromRequestId: payload.requestId,
				additionalContext: payload.additionalContext,
				skillRefs,
				webSearchEnabled: requestedWebSearchEnabled
			});
			finishOptimisticActiveRun(requestId);
			await refreshLatestTimeline();
			setActiveRetryRequestId(null);
			return true;
		} catch (error: unknown) {
			const errorMessage: string = error instanceof Error ? error.message : "Failed to retry message";

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
			showWebSearchErrorIfRequested(requestedWebSearchEnabled, errorMessage);
			setTimelinePage(previousTimelinePage);
			console.error("[App] retry message failed", error);
			return false;
		} finally {
			if (activeChatRequestIdRef.current === requestId) {
				activeChatRequestIdRef.current = null;
			}
		}
	}

	async function handleComposerCancel(): Promise<void> {
		const requestId: string | null = activeChatRequestIdRef.current ?? getActiveRunRequestId(workbench);
		if (requestId === null) {
			return;
		}

		try {
			activeChatRequestIdRef.current = requestId;
			await cancelChatMessage(requestId);
		} catch (error: unknown) {
			console.error("[App] cancel chat failed", error);
		}
	}

	async function refreshLatestTimeline(sessionIdOverride?: string): Promise<void> {
		const sessionId: string | null = sessionIdOverride ?? activeSessionId;
		if (sessionId === null) {
			return;
		}

		const timeline: SessionTimelineResult = await fetchSessionTimeline(sessionId);

		setTimelinePage((currentPage: TimelinePageState): TimelinePageState => {
			return mergeOptimisticUserBlocks(currentPage, createTimelinePageFromTimelineResult(timeline));
		});
		setLatestPlanClarification(timeline.latestPlanClarification);
		setLatestPlanApproval(timeline.latestPlanApproval);
		const workflowTodo: WorkflowTodoSnapshot | null = createWorkflowTodoSnapshotFromTimelineResult(timeline);
		setWorkflowTodoSnapshot(workflowTodo);
		rememberLoadedWorkflowTodo(workflowTodo);

		const sessionList = await fetchSessions();
		const metadata: SessionMetadata | undefined = sessionList.sessions.find((session: SessionMetadata): boolean => session.id === sessionId);
		if (metadata !== undefined) {
			setActiveSessionMetadata(metadata);
			setWebSearchEnabled(metadata.webSearchEnabled === true);
			setActiveWorkspace((currentWorkspace: WorkspaceConfig | null): WorkspaceConfig | null => {
				if (metadata.workspaceId === undefined || metadata.workspaceRoot === undefined) {
					return null;
				}
				if (currentWorkspace?.id === metadata.workspaceId) {
					return currentWorkspace;
				}

				return {
					id: metadata.workspaceId,
					name: metadata.workspaceName ?? metadata.title,
					kind: metadata.workspaceKind ?? "godot",
					rootPath: metadata.workspaceRoot,
					godotExecutablePath: metadata.godotExecutablePath
				};
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

	function handleWorkflowTodoCollapseChange(collapsed: boolean): void {
		void persistSessionUiMetadata({ workflowTodoCollapsed: collapsed });
	}

	const handleLoadMoreBefore = useCallback((): void => {
		if (activeSessionId === null || !timelinePage.hasMoreBefore || isTimelinePageLoadingRef.current) {
			return;
		}

		isTimelinePageLoadingRef.current = true;
		void fetchSessionTimelineBefore(activeSessionId, timelinePage.blockOffset)
			.then((result: SessionTimelineResult): void => {
				setTimelinePage((currentPage: TimelinePageState): TimelinePageState => {
					return mergeTimelineBefore(currentPage, createTimelinePageFromTimelineResult(result));
				});
			})
			.catch((error: unknown): void => {
				console.error("[App] load previous timeline page failed", error);
			})
			.finally((): void => {
				isTimelinePageLoadingRef.current = false;
			});
	}, [activeSessionId, timelinePage.blockOffset, timelinePage.hasMoreBefore]);

	const handleLoadMoreAfter = useCallback((): void => {
		if (activeSessionId === null || !timelinePage.hasMoreAfter || isTimelinePageLoadingRef.current) {
			return;
		}

		isTimelinePageLoadingRef.current = true;
		void fetchSessionTimelineAfter(activeSessionId, timelinePage.blockOffset + timelinePage.blocks.length)
			.then((result: SessionTimelineResult): void => {
				setTimelinePage((currentPage: TimelinePageState): TimelinePageState => {
					return mergeTimelineAfter(currentPage, createTimelinePageFromTimelineResult(result));
				});
			})
			.catch((error: unknown): void => {
				console.error("[App] load next timeline page failed", error);
			})
			.finally((): void => {
				isTimelinePageLoadingRef.current = false;
			});
	}, [activeSessionId, timelinePage.blockOffset, timelinePage.blocks.length, timelinePage.hasMoreAfter]);

	function patchContext(action: NonNullable<WorkbenchPatch["additionalContextAction"]>): void {
		queueWorkbenchPatch({ additionalContextAction: action }, true);
	}

	async function handleAddImageFiles(files: File[]): Promise<void> {
		if (activeSessionId === null || isNewSessionHome) {
			setSessionError("Please open a session before adding images.");
			return;
		}

		try {
			setSessionError(null);
			for (const file of files.slice(0, 3)) {
				if (!isSupportedImageMimeType(file.type)) {
					throw new Error(`Unsupported image type: ${file.type || file.name}`);
				}
				if (file.size <= 0 || file.size > MAX_IMAGE_ATTACHMENT_BYTES) {
					throw new Error(`${file.name} is larger than 1 MiB.`);
				}

				const dataUrl: string = await readFileAsDataUrl(file);
				const dimensions = await readImageDimensions(dataUrl);
				const result = await saveImageAttachment({
					sessionId: activeSessionId,
					mimeType: file.type,
					dataUrl,
					byteSize: file.size,
					width: dimensions.width,
					height: dimensions.height,
					title: file.name
				});
				patchContext({ action: "addOrReplace", item: result.attachment });
			}
		} catch (error: unknown) {
			const errorMessage: string = error instanceof Error ? error.message : "Failed to add image";
			setSessionError(errorMessage);
			console.error("[App] add image failed", error);
		}
	}

	function getContextWorkspace(): WorkspaceConfig | null {
		if (activeWorkspace !== null) {
			return activeWorkspace;
		}
		if (activeSessionMetadata?.workspaceId !== undefined && activeSessionMetadata.workspaceRoot !== undefined) {
			return {
				id: activeSessionMetadata.workspaceId,
				name: activeSessionMetadata.workspaceName ?? activeSessionMetadata.workspaceId,
				kind: activeSessionMetadata.workspaceKind ?? "godot",
				rootPath: activeSessionMetadata.workspaceRoot,
				godotExecutablePath: activeSessionMetadata.godotExecutablePath
			};
		}
		return null;
	}

	async function handleAddWorkspaceContext(kind: "files" | "folder"): Promise<void> {
		if (activeSessionId === null || isNewSessionHome) {
			setSessionError("Please open a session before adding files or folders.");
			return;
		}
		const workspace: WorkspaceConfig | null = getContextWorkspace();
		if (workspace === null) {
			setSessionError("Please select a workspace before adding files or folders.");
			return;
		}

		try {
			setSessionError(null);
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
			setSessionError(errorMessage);
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
		if (activeSessionId === null || isNewSessionHome) {
			setSessionError("Please open a session before adding files.");
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
			setSessionError(null);
			if (imageFiles.length > 0) {
				await handleAddImageFiles(imageFiles);
			}

			if (workspaceFiles.length === 0) {
				return;
			}

			const workspace: WorkspaceConfig | null = getContextWorkspace();
			if (workspace === null) {
				setSessionError(imageFiles.length > 0 ? "Images added. Select a workspace to add non-image files." : "Please select a workspace before adding files.");
				return;
			}

			const paths: string[] = workspaceFiles
				.map((file: File): string | null => getLocalPathForFile(file))
				.filter((filePath: string | null): filePath is string => filePath !== null);
			if (paths.length === 0) {
				setSessionError(imageFiles.length > 0 ? "Images added. Dropped files did not expose local paths." : "Dropped files did not expose local paths.");
				return;
			}

			const entries: WorkspacePickedEntry[] = await window.electronAPI.workspaceFs.createEntriesFromPaths({
				workspaceRoot: workspace.rootPath,
				paths
			});
			for (const entry of entries) {
				patchContext({ action: "addOrReplace", item: createWorkspacePathContextItem(entry, workspace) });
			}
		} catch (error: unknown) {
			const errorMessage: string = error instanceof Error ? error.message : "Failed to add files";
			setSessionError(errorMessage);
			console.error("[App] add context files failed", error);
		}
	}

	const selectedProviderId: string | null = isNewSessionHome
		? homeDraft.providerId ?? providerModelSelection?.activeModel.providerId ?? null
		: workbench?.composer.provider ?? providerModelSelection?.activeModel.providerId ?? null;
	const selectedModelId: string | null = isNewSessionHome
		? homeDraft.modelId ?? providerModelSelection?.activeModel.modelId ?? null
		: workbench?.composer.model ?? providerModelSelection?.activeModel.modelId ?? null;
	const timelineBlocks: TimelineBlock[] = timelinePage.blocks;
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
	const chatTitle: string = isNewSessionHome ? "New session" : getSessionTitle(activeSessionMetadata, activeSessionId);
	const initialScrollToBottomKey: string = activeSessionId === null ? "" : `${activeSessionId}:${timelinePage.blockCount}`;
	const composerMessage: string = isNewSessionHome ? homeDraft.message : workbench?.composer.text ?? "";
	const composerMode: ChatMode = isNewSessionHome ? homeDraft.chatMode : getChatMode(workbench);
	const composerContextItems: AdditionalContextItem[] = isNewSessionHome ? [] : workbench?.composer.additionalContext ?? [];
	const displayedWorkspace: WorkspaceConfig | null = isNewSessionHome ? homeDraft.workspace : activeWorkspace;
	const composerIsSending: boolean = getIsSending(workbench) || isHomeSubmitting;
	const handleWebSearchEnabledChange = (enabled: boolean): void => {
		setWebSearchEnabled(enabled);
		if (!isNewSessionHome && activeSessionId !== null) {
			void persistSessionUiMetadata({ webSearchEnabled: enabled });
		}
		if (composerIsSending) {
			void messageApi.info("Web search changes apply to your next message.");
		}
	};

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

	async function handlePlanClarificationSubmit(reply: string): Promise<void> {
		const clarification: PlanClarificationState | null = pendingPlanClarification;
		const trimmedReply: string = reply.trim();
		if (clarification === null || trimmedReply.length === 0 || isPlanClarificationSubmitting) {
			return;
		}

		const currentClarificationKey: string = createPlanClarificationKey(clarification);
		try {
			setIsPlanClarificationSubmitting(true);
			setPlanClarificationError(null);
			setSuppressedPlanClarificationKey(currentClarificationKey);
			const result: PlanResult = await submitPlanClarification(clarification.planId, trimmedReply);
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
			const result = await approvePlan(planId);
			setWorkbench(result.workbench);
			setActiveSessionMetadata((currentMetadata: SessionMetadata | null): SessionMetadata | null => (
				currentMetadata === null
					? currentMetadata
					: { ...currentMetadata, chatMode: result.chatMode }
			));
			activeChatRequestIdRef.current = result.executionRequestId;
			applyOptimisticSend(result.executionRequestId, "执行计划。", []);
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

		try {
			setIsPlanRevising(true);
			setPlanApprovalError(null);
			const result: PlanResult = await revisePlan(planId, trimmedFeedback);
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
			setIsPlanRevising(false);
		}
	}

	return (
		<main className={`${styles.shell} ${activePage === "agent" ? styles.agentShell : styles.pageShell}`}>
			{messageContextHolder}
			<AppNavTabs activePage={activePage} onPageChange={setActivePage} />
			{activePage === "agent" ? (
				<AgentPage
					workspaceRefreshToken={workspaceRefreshToken}
					isHome={isNewSessionHome}
					activeSessionId={activeSessionId}
					activeSessionMetadata={activeSessionMetadata}
					activeWorkspaceId={isNewSessionHome ? homeDraft.workspaceId : activeSessionMetadata?.workspaceId ?? activeWorkspace?.id ?? null}
					chatTitle={chatTitle}
					timelineBlocks={timelineBlocks}
					isSessionLoading={isSessionLoading}
					sessionError={sessionError}
					hasMoreBefore={timelinePage.hasMoreBefore}
					hasMoreAfter={timelinePage.hasMoreAfter}
					initialScrollToBottomKey={initialScrollToBottomKey}
					retryDisabled={composerIsSending || isSessionLoading}
					activeRetryRequestId={activeRetryRequestId}
					providerModelSelection={providerModelSelection}
					selectedProviderId={selectedProviderId}
					selectedModelId={selectedModelId}
					message={composerMessage}
					contextItems={composerContextItems}
					workflowTodoSnapshot={workflowTodoSnapshot}
					workflowTodoCollapsed={activeSessionMetadata?.workflowTodoCollapsed === true}
					mode={composerMode}
					approvalMode={approvalMode}
					pendingApproval={pendingApproval}
					isApproving={isApproving}
					isRejecting={isRejecting}
					approvalError={approvalError}
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
					isApprovalModeSaving={isApprovalModeSaving}
					webSearchEnabled={webSearchEnabled}
					workspaceOptions={homeWorkspaceOptions}
					homeWorkspace={homeDraft.workspace}
					workspaceFooterDisabled={!isNewSessionHome || isHomeSubmitting}
					isWorkspaceAdding={isWorkspaceAdding}
					activeWorkspace={displayedWorkspace}
					onNewSession={handleNewSession}
					onNewWorkspaceSession={(workspace: WorkspaceConfig): void => {
						void handleNewWorkspaceSession(workspace);
					}}
					onWorkspaceRefresh={(): void => {
						setWorkspaceRefreshToken((currentToken: number): number => currentToken + 1);
					}}
					onWorkspaceSelect={(workspaceId: string): void => {
						void (isNewSessionHome ? handleHomeWorkspaceSelect(workspaceId) : handleWorkspaceSelect(workspaceId));
					}}
					onHomeWorkspaceSelect={(workspaceId: string): void => {
						void handleHomeWorkspaceSelect(workspaceId);
					}}
					onHomeWorkspaceAdd={(): void => {
						void handleHomeWorkspaceAdd();
					}}
					onHomeWorkspaceClear={handleHomeWorkspaceClear}
					onSessionSelect={handleSessionSelect}
					onSessionArchive={handleSessionArchive}
					onWorkspaceDelete={handleWorkspaceDelete}
					onLoadMoreBefore={handleLoadMoreBefore}
					onLoadMoreAfter={handleLoadMoreAfter}
					onRetryEditStart={(requestId: string): void => {
						setActiveRetryRequestId(requestId);
					}}
					onRetryEditCancel={(requestId: string): void => {
						setActiveRetryRequestId((currentRequestId: string | null): string | null => {
							return currentRequestId === requestId ? null : currentRequestId;
						});
					}}
					onRetryFromUserMessage={handleRetryFromUserMessage}
					onMessageChange={handleComposerTextChange}
					onModeChange={(mode: ChatMode): void => {
						void handleModeChange(mode);
					}}
					onApprovalModeChange={(mode: ApprovalMode): void => {
						void handleApprovalModeChange(mode);
					}}
					onApprovalApprove={(approvalId: string): void => {
						void handleApprovalApprove(approvalId);
					}}
					onApprovalReject={(approvalId: string): void => {
						void handleApprovalReject(approvalId);
					}}
					onPlanClarificationSubmit={(reply: string): void => {
						void handlePlanClarificationSubmit(reply);
					}}
					onPlanClarificationSkip={(): void => {
						void handlePlanClarificationSubmit(PLAN_CLARIFICATION_SKIP_REPLY);
					}}
					onPlanApprove={(planId: string): void => {
						void handlePlanApprove(planId);
					}}
					onPlanRevise={(planId: string, feedback: string): void => {
						void handlePlanRevise(planId, feedback);
					}}
					onWebSearchEnabledChange={handleWebSearchEnabledChange}
					onProviderModelChange={(providerId: string, modelId: string): void => {
						void handleProviderModelChange(providerId, modelId);
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
					onAddContextFiles={(files: File[]): void => {
						void handleAddContextFiles(files);
					}}
					onRemoveContext={(contextId: string): void => patchContext({ action: "remove", contextId })}
					onPinContext={(contextId: string, pinned: boolean): void => patchContext({ action: "pin", contextId, pinned })}
					onClearUnpinnedContext={(): void => patchContext({ action: "clearUnpinned" })}
					onCancel={(): void => {
						void handleComposerCancel();
					}}
					onSubmit={(message: string): void => {
						void handleComposerSubmit(message);
					}}
					onWorkflowTodoDismiss={(snapshot: WorkflowTodoSnapshot): void => {
						void handleWorkflowTodoDismiss(snapshot);
					}}
					onWorkflowTodoCollapseChange={handleWorkflowTodoCollapseChange}
					onCompletionOpen={handleCompletionOpen}
				/>
			) : activePage === "settings" ? (
				<SettingsPage
					onProviderModelSelectionChange={setProviderModelSelection}
					clientPreferences={clientPreferences}
					generalSettings={generalSettings}
					onClientPreferencesChange={setClientPreferences}
					onGeneralSettingsChange={setGeneralSettings}
				/>
			) : activePage === "drawing" ? (
				<DrawingPage />
			) : (
				<KnowledgePage />
			)}
		</main>
	);
}

export default App;

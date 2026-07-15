import { useCallback, useEffect, useRef, useState } from "react";
import { configureEnvironment, fetchWorkspaces, selectWorkspace } from "@/api/workspace-api";
import styles from "./App.module.css";
import type { AdditionalContextItem, SessionMetadata, SessionOpenResult, SessionTimelineResult, TimelineBlock, WorkbenchPatch, WorkbenchPatchResult, WorkbenchSnapshot, WorkflowTodoSnapshot, WorkspaceConfig } from "@/api/types";
import { createSession, fetchSessionTimeline, fetchSessionTimelineAfter, fetchSessionTimelineBefore, openSession, saveSessionUiMetadata, type SaveSessionUiMetadataParams } from "@/api/session-api";
import type { RetryUserMessagePayload } from "@/features/bubble/UserBubble";
import { fetchProviderModelSelection, type ProviderModelSelection } from "@/api/provider-api";
import { createBackendClient } from "@/api/backend-client";
import type { BackendEvent } from "@/api/backend-rpc-client";
import { cancelChatMessage, sendChatMessage, type ChatMode } from "@/api/chat-api";
import { fetchSlashCommands, type SlashCommandDefinition } from "@/api/command-api";
import { fetchSkills, type SkillSummary } from "@/api/skill-api";
import {
	approveApproval,
	rejectApproval,
	setApprovalMode,
	type ApprovalMode,
} from "@/api/approval-api";
import WorkbenchPanel from "@/features/workbench/WorkbenchPanel";
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
import { isWorkflowTodoClearEvent, normalizeWorkflowTodoSnapshot } from "@/features/composer/workflow-todo";

function createChatRequestId(): string {
	return `studio-chat-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
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
		chatMode: "ask",
		providerId: null,
		modelId: null
	};
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
	const [approvalAction, setApprovalAction] = useState<"approve" | "reject" | null>(null);
	const [workbenchPanelOpen, setWorkbenchPanelOpen] = useState<boolean>(true);
	const [activeRetryRequestId, setActiveRetryRequestId] = useState<string | null>(null);
	const [workflowTodoSnapshot, setWorkflowTodoSnapshot] = useState<WorkflowTodoSnapshot | null>(null);
	const pendingPatchRef = useRef<WorkbenchPatch>({});
	const patchTimerRef = useRef<number | null>(null);
	const patchSequenceRef = useRef<number>(0);
	const isTimelinePageLoadingRef = useRef<boolean>(false);
	const submittedComposerTextRef = useRef<{ requestId: string; text: string } | null>(null);
	const slashCommandsLoadingRef = useRef<boolean>(false);
	const skillsLoadingRef = useRef<boolean>(false);
	const slashCommandsRetryAtRef = useRef<number>(0);
	const skillsRetryAtRef = useRef<number>(0);

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

	const handleCompletionOpen = useCallback((trigger: ComposerCompletionTrigger): void => {
		if (trigger === "/" && slashCommands.length === 0) {
			void loadSlashCommands();
		}

		if (trigger === "@" && skills.length === 0) {
			void loadSkills();
		}
	}, [loadSkills, loadSlashCommands, skills.length, slashCommands.length]);

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

	function applyOptimisticActiveRun(requestId: string, clearComposerText: boolean): void {
		const startedAt: string = new Date().toISOString();

		setWorkbench((currentWorkbench: WorkbenchSnapshot | null): WorkbenchSnapshot | null => {
			return currentWorkbench === null
				? currentWorkbench
				: {
					...currentWorkbench,
					composer: {
						...currentWorkbench.composer,
						text: clearComposerText ? "" : currentWorkbench.composer.text
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
		applyOptimisticActiveRun(requestId, clearComposerText);
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

	function applyOptimisticRetry(retryFromRequestId: string, requestId: string, message: string, additionalContext: AdditionalContextItem[]): void {
		applyOptimisticActiveRun(requestId, false);
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
					const eventWorkbench: WorkbenchSnapshot | null = getWorkbenchFromEvent(event);
					if (eventWorkbench !== null) {
						applyWorkbench(eventWorkbench);
						return;
					}

					if (event.event === "skill.catalog.changed") {
						void loadSkills();
					}

					if (event.event === "workflow.todo.updated" || event.event === "agent.run.snapshot") {
						setWorkflowTodoSnapshot(normalizeWorkflowTodoSnapshot(event.data));
					} else if (isWorkflowTodoClearEvent(event)) {
						setWorkflowTodoSnapshot(null);
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
	}, [applyWorkbench, loadSkills]);

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
		setHomeDraft(createHomeDraft());
		setActiveSessionId(null);
		setActiveSessionMetadata(null);
		setActiveWorkspace(null);
		setTimelinePage(emptyTimelinePage);
		setWorkbench(null);
		setWorkflowTodoSnapshot(null);
		setActiveRetryRequestId(null);
		setSessionError(null);
		void loadHomeWorkspaces();
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
			setActiveSessionId(sessionId);
			setActiveSessionMetadata(session);
			setTimelinePage(emptyTimelinePage);
			setWorkbench(null);
			setWorkflowTodoSnapshot(null);

			const result: SessionOpenResult = await openSession(sessionId);

			setTimelinePage(createTimelinePageFromOpenResult(result));
			setActiveSessionMetadata(result.metadata);
			setWorkbench(result.workbench);
			setApprovalModeState(result.metadata.approvalMode ?? "manual");
			if (typeof result.workbench.activeSelection.workspaceId === "string" && typeof result.workbench.activeSelection.workspaceRoot === "string") {
				setActiveWorkspace({
					id: result.workbench.activeSelection.workspaceId,
					name: result.workbench.activeSelection.workspaceName ?? result.metadata.title,
					kind: "godot",
					rootPath: result.workbench.activeSelection.workspaceRoot
				});
			}

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

	function handleSessionArchive(session: SessionMetadata): void {
		if (session.id !== activeSessionId) {
			return;
		}

		setActiveSessionId(null);
		setActiveSessionMetadata(null);
		setTimelinePage(emptyTimelinePage);
		setWorkbench(null);
		setWorkflowTodoSnapshot(null);
		setSessionError(null);
		setIsNewSessionHome(true);
		setHomeDraft(createHomeDraft());
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
			setWorkspaceRefreshToken((currentToken: number): number => currentToken + 1);
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
			setHomeDraft((currentDraft: HomeDraft): HomeDraft => ({
				...currentDraft,
				providerId,
				modelId
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
						provider: providerId,
						model: modelId
					}
				};
		});
		queueWorkbenchPatch({ composer: { provider: providerId, model: modelId } }, true);
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

		try {
			setIsHomeSubmitting(true);
			setSessionError(null);
			setActiveRetryRequestId(null);
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
				approvalMode
			});
			sessionCreated = true;

			setIsNewSessionHome(false);
			setActiveSessionId(created.id);
			setActiveSessionMetadata(created);
			setActiveWorkspace(homeDraft.workspace);
			setTimelinePage(emptyTimelinePage);
			setWorkbench(created.workbench);
			setWorkflowTodoSnapshot(null);
			setHomeDraft(createHomeDraft());
			applyOptimisticSend(requestId, message, created.workbench.composer.additionalContext);

			await sendChatMessage({
				requestId,
				message,
				mode: created.workbench.composer.chatMode ?? homeDraft.chatMode,
				additionalContext: created.workbench.composer.additionalContext,
				skillRefs
			});
			await refreshLatestTimeline(created.id);
			setWorkspaceRefreshToken((currentToken: number): number => currentToken + 1);
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
			if (sessionCreated) {
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
		const pendingPatch: WorkbenchPatch = takePendingWorkbenchPatch();
		const flushPendingPatch = sendWorkbenchPatch(pendingPatch, false);

		try {
			setSessionError(null);
			setActiveRetryRequestId(null);
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
				additionalContext,
				skillRefs
			});
			await refreshLatestTimeline();
			setWorkspaceRefreshToken((currentToken: number): number => currentToken + 1);
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
							text: message
						},
						activeRun: currentWorkbench.activeRun.requestId === requestId
							? { status: "idle" }
							: currentWorkbench.activeRun
					};
			});
			setSessionError(errorMessage);
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
			console.error("[App] send message failed", error);
		}
	}

	async function handleRetryFromUserMessage(payload: RetryUserMessagePayload): Promise<boolean> {
		if (activeSessionId === null || workbench === null) {
			setSessionError("请先打开一个会话再重新发送消息");
			return false;
		}

		if (getIsSending(workbench) || approvalAction !== null || isSessionLoading) {
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

		try {
			setSessionError(null);
			applyOptimisticRetry(payload.requestId, requestId, message, payload.additionalContext);

			await flushPendingPatch;
			await sendChatMessage({
				requestId,
				message,
				mode: chatMode,
				retryFromRequestId: payload.requestId,
				additionalContext: payload.additionalContext,
				skillRefs
			});
			await refreshLatestTimeline();
			setWorkspaceRefreshToken((currentToken: number): number => currentToken + 1);
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
			setTimelinePage(previousTimelinePage);
			console.error("[App] retry message failed", error);
			return false;
		}
	}

	async function handleComposerCancel(): Promise<void> {
		const requestId: string | null = getActiveRunRequestId(workbench);
		if (requestId === null) {
			return;
		}

		try {
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

	async function handleApproveApproval(approvalId: string): Promise<void> {
		try {
			setApprovalAction("approve");
			await sendPendingWorkbenchPatch();
			const result = await approveApproval(approvalId);
			if ("workbench" in result && isRecord(result.workbench)) {
				applyWorkbench(result.workbench as WorkbenchSnapshot);
			}
		} catch (error: unknown) {
			setSessionError(error instanceof Error ? error.message : "Failed to approve");
		} finally {
			setApprovalAction(null);
		}
	}

	async function handleRejectApproval(approvalId: string): Promise<void> {
		try {
			setApprovalAction("reject");
			const result = await rejectApproval(approvalId);
			if ("workbench" in result && isRecord(result.workbench)) {
				applyWorkbench(result.workbench as WorkbenchSnapshot);
			}
		} catch (error: unknown) {
			setSessionError(error instanceof Error ? error.message : "Failed to reject");
		} finally {
			setApprovalAction(null);
		}
	}

	const selectedProviderId: string | null = isNewSessionHome
		? homeDraft.providerId ?? providerModelSelection?.activeModel.providerId ?? null
		: workbench?.composer.provider ?? providerModelSelection?.activeModel.providerId ?? null;
	const selectedModelId: string | null = isNewSessionHome
		? homeDraft.modelId ?? providerModelSelection?.activeModel.modelId ?? null
		: workbench?.composer.model ?? providerModelSelection?.activeModel.modelId ?? null;
	const timelineBlocks: TimelineBlock[] = timelinePage.blocks;
	const chatTitle: string = isNewSessionHome ? "New session" : getSessionTitle(activeSessionMetadata, activeSessionId);
	const initialScrollToBottomKey: string = activeSessionId === null ? "" : `${activeSessionId}:${timelinePage.blockCount}`;
	const composerMessage: string = isNewSessionHome ? homeDraft.message : workbench?.composer.text ?? "";
	const composerMode: ChatMode = isNewSessionHome ? homeDraft.chatMode : getChatMode(workbench);
	const composerContextItems: AdditionalContextItem[] = isNewSessionHome ? [] : workbench?.composer.additionalContext ?? [];
	const displayedWorkspace: WorkspaceConfig | null = isNewSessionHome ? homeDraft.workspace : activeWorkspace;
	const composerIsSending: boolean = getIsSending(workbench) || approvalAction !== null || isHomeSubmitting;

	return (
		<main className={`${styles.shell} ${activePage === "agent" ? styles.agentShell : styles.pageShell} ${activePage === "agent" && workbenchPanelOpen ? styles.shellWithPanel : ""}`}>
			<AppNavTabs activePage={activePage} onPageChange={setActivePage} />
			{activePage === "agent" ? (
				<AgentPage
					workspaceRefreshToken={workspaceRefreshToken}
					isHome={isNewSessionHome}
					activeSessionId={activeSessionId}
					activeWorkspaceId={isNewSessionHome ? homeDraft.workspaceId : activeSessionMetadata?.workspaceId ?? activeWorkspace?.id ?? null}
					chatTitle={chatTitle}
					workbenchPanelOpen={workbenchPanelOpen}
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
					mode={composerMode}
					approvalMode={approvalMode}
					slashCommands={slashCommands}
					skills={skills}
					isSending={composerIsSending}
					isApprovalModeSaving={isApprovalModeSaving}
					workspaceOptions={homeWorkspaceOptions}
					homeWorkspace={homeDraft.workspace}
					workspaceFooterDisabled={!isNewSessionHome || isHomeSubmitting}
					isWorkspaceAdding={isWorkspaceAdding}
					workbench={workbench}
					activeWorkspace={displayedWorkspace}
					onNewSession={handleNewSession}
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
					onWorkbenchPanelOpenChange={setWorkbenchPanelOpen}
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
					onProviderModelChange={(providerId: string, modelId: string): void => {
						void handleProviderModelChange(providerId, modelId);
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
					onCompletionOpen={handleCompletionOpen}
					onAddContext={(item: AdditionalContextItem): void => patchContext({ action: "addOrReplace", item })}
					onClearHints={(): void => queueWorkbenchPatch({ nextStepHintsAction: "clear" }, true)}
					onApprove={(approvalId: string): void => {
						void handleApproveApproval(approvalId);
					}}
					onReject={(approvalId: string): void => {
						void handleRejectApproval(approvalId);
					}}
				/>
			) : activePage === "settings" ? (
				<SettingsPage onProviderModelSelectionChange={setProviderModelSelection} />
			) : activePage === "drawing" ? (
				<DrawingPage />
			) : (
				<KnowledgePage />
			)}
		</main>
	);
}

export default App;

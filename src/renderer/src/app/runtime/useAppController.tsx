import { useCallback, useEffect, useRef, useState } from "react";
import { useEventListener, useLatest } from "ahooks";
import { Input, message as antdMessage, Spin } from "antd";
import { useTranslation } from "react-i18next";
import { useDiskSpaceCheck } from "@/app/runtime/hooks/useDiskSpaceCheck";
import { onBackendReconnected } from "@/platform/rpc/transport/backend-client";
import type { BackendEvent } from "@/platform/rpc/transport/backend-rpc-client";
import useNativeTaskNotifications from "./hooks/useNativeTaskNotifications";
import useAppEventBridge from "./hooks/useAppEventBridge";
import useTimelineStreamBuffer from "./hooks/useTimelineStreamBuffer";
import useWorkbenchPatchQueue, { mergeWorkbenchPatch } from "./hooks/useWorkbenchPatchQueue";
import useWorkspaceContextController from "@/features/workspace/controllers/useWorkspaceContextController";
import useApprovalController from "@/features/approval/controllers/useApprovalController";
import usePlanGoalController from "@/features/composer/controllers/usePlanGoalController";
import useTimelineController from "@/features/conversation/controllers/useTimelineController";
import { fetchWorkspaces, selectWorkspace, type DeleteWorkspaceResult } from "@/platform/rpc/workspace-api";
import styles from "../shell/App.module.css";
import type { AdditionalContextItem, MessageQueueItem, PendingGuide, PendingToolBudget, SelectionAskThread, SessionMetadata, SessionOpenResult, SessionTimelineNavigationEntry, SessionTimelineResult, TimelineBlock, WorkbenchPatch, WorkbenchSnapshot, WorkflowTodoSnapshot, WorkspaceConfig } from "@/platform/rpc/types";
import { isAgentGoalDismissed } from "@/domain/composer/goal-display";
import { checkSessionIntegrity, createSession, deleteSession, dismissWorkflowTodo, fetchSessions, fetchSessionTimeline, openSession, saveSessionUiMetadata, setSessionModel, type SaveSessionUiMetadataParams, type SessionIntegrityCheckResult } from "@/platform/rpc/session-api";
import type { RetryUserMessagePayload } from "@/widgets/conversation/UserBubble";
import { fetchProviderModelSelection, type ProviderModelSelection } from "@/platform/rpc/provider-api";
import type { ProviderModelInfo, ProviderModelSelectionProvider } from "@/platform/rpc/provider-api";
import { cancelChatMessage, retryAgentRun, sendChatMessage, type ChatMode } from "@/platform/rpc/chat-api";
import { fetchSlashCommands, type SlashCommandDefinition } from "@/platform/rpc/command-api";
import { fetchSkills, type SkillSummary } from "@/platform/rpc/skill-api";
import type { ApprovalMode } from "@/platform/rpc/approval-api";
import {
	applyBackendEventToTimeline,
	applyWorkbenchSnapshot,
	createTimelinePageFromOpenResult,
	createTimelinePageFromTimelineResult,
	type TimelinePageState
} from "@/domain/workbench/workbench-state";
import {
	createTimelinePageStore,
	useTimelineSelector,
	type TimelinePageStore
} from "@/domain/workbench/timeline-page-store";
import {
	applyRunStateFromWorkbench,
	applyAgentRunState,
	createIdleRunState,
	createOptimisticRunState,
	finishOptimisticRunState,
	getRunControllerRequestId,
	isRunControllerActive,
	type RunControllerState
} from "@/domain/workbench/run-state";
import { addGuide, deleteGuide, reorderGuides } from "@/platform/rpc/guide-api";
import { addQueuedMessage, removeQueuedMessage, reorderQueuedMessages } from "@/platform/rpc/message-queue-api";
import { getSessionTitle } from "./session-title";
import HomePage from "@/widgets/home/HomePage";
import WorkspaceProjectDialog from "@/widgets/workspace/WorkspaceProjectDialog";
import { extractEnabledSkillRefs, type ComposerCompletionTrigger } from "@/domain/composer/composer-completion";
import { createComposerReasoningEffortUpdate } from "@/domain/composer/composer-reasoning-effort";
import { isComposerWorkspaceSelectionLocked } from "@/domain/composer/composer-workspace-lock";
import { getWorkflowTodoSnapshotKey, isWorkflowTodoActive, selectLatestWorkflowTodoSnapshot } from "@/domain/composer/workflow-todo";
import { saveImageAttachment, saveTextAttachment, type SaveImageAttachmentParams } from "@/platform/rpc/image-attachment-api";
import {
	CLIENT_PREFERENCES_CHANGED_EVENT,
	DEFAULT_CLIENT_PREFERENCES,
	dispatchClientPreferencesChanged,
	fetchClientPreferences,
	updateClientPreferences,
	type ClientPreferences,
	type NewSessionComposerPreferences,
	type WorkspaceSidebarPreferences
} from "@/platform/rpc/client-preferences-api";
import { DEFAULT_GENERAL_SETTINGS, fetchGeneralSettings, type GeneralSettings } from "@/platform/rpc/general-settings-api";
import type { BootstrapData } from "../bootstrap/bootstrap";
import {
	createDefaultSessionLayout,
	type SessionLayoutMap,
	type SessionLayoutPreferences
} from "@/domain/session/session-layout";
import {
	applyResponseFinished,
	getUnreadResponseSessionId,
	markActiveSessionRead,
	removeUnreadSessions
} from "@/domain/workspace/session-unread";
import {
	applyRunningSessionEvent,
	markRunStopped,
	markSessionRunStarted,
	removeRunningSessions,
	syncSessionRunFromOpen,
	type RunningSessionState
} from "@/domain/workspace/session-running";
import { Icon } from "@/assets/icons";
import type { SessionArchiveContext } from "@/widgets/workspace/WorkspaceTree";
import {
	recordOpenedSession,
	removeSessionFromNavigationHistory,
	SESSION_NAVIGATION_EVENT
} from "@/domain/session/session-navigation-history";
import {
	type AppProps,
	type HomeDraft,
	type SupportedImageMimeType,
	type WorkspacePickedEntry,
	CONTEXT_SUBTITLE_MAX_CHARS,
	DEFAULT_SESSION_LAYOUT,
	FULL_TRUST_CONFIRMATION_TEXT,
	MAX_IMAGE_ATTACHMENT_BYTES,
	RECENT_CONTEXT_FILE_WINDOW_MS,
	SUPPORTED_IMAGE_MIME_TYPES,
	createChatRequestId,
	createContextFileSignature,
	createContextId,
	createFrontendFailedRunEvent,
	createHomeDraft,
	createOptimisticUserBlock,
	createPreferredHomeDraft,
	createSingleSourceWorkspaceSnapshot,
	createWorkspaceFromSessionMetadata,
	createWorkspaceFromSessionOpenResult,
	createWorkflowTodoSnapshotFromTimelineResult,
	createWorkspacePathContextItem,
	createExternalFileContextItem,
	findPreferredComposerModel,
	findProviderModel,
	getChatMode,
	getChatOutputTarget,
	getContextTitle,
	getCurrentWorkspaceId,
	getDisplayedComposerModel,
	getFileNameFromLocalPath,
	getLocalPathForFile,
	getPendingApprovalCount,
	getRecentSessions,
	getSessionSortTime,
	getWorkflowTodoSnapshotIdentity,
	isBackendRpcErrorMessage,
	isLocalPathInsideWorkspace,
	isSameWorkflowTodoSnapshot,
	isSupportedImageMimeType,
	insertUserBlockBeforeRequestAssistant,
	mergeOptimisticUserBlocks,
	normalizeLocalPathForCompare,
	readFileAsDataUrl,
	readImageDimensions,
	resolveReasoningEffortForComposerModelChange,
	trimTimelineFromRequest
} from "./app-helpers";
Spin.setDefaultIndicator(<Icon name="spin-indicator" className={styles.spinner} />)

export default function useAppController({ bootstrapData }: AppProps) {
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
	const [selectionAskThreads, setSelectionAskThreads] = useState<SelectionAskThread[]>([]);
	const [workbench, setWorkbench] = useState<WorkbenchSnapshot | null>(null);
	const activeWorkbenchRef = useLatest(workbench);
	const [sessionError, setSessionError] = useState<string | null>(null);
	const timelineController = useTimelineController({
		activeSessionId,
		activeSessionIdRef,
		timelineStore,
		timelineBlockCount,
		setSessionError
	});
	const {
		timelineNavigationEntries,
		isTimelineLoadingBefore,
		isTimelineLoadingAfter,
		handleLoadMoreBefore,
		handleLoadMoreAfter,
		handleTimelineSearchLoadOffset,
		handleTimelineNavigationLoadEntry,
		resetTimelineUiState
	} = timelineController;
	const [isSessionLoading, setIsSessionLoading] = useState(false);
	const [providerModelSelection, setProviderModelSelection] = useState<ProviderModelSelection | null>(bootstrapData.providerModelSelection);
	const [slashCommands, setSlashCommands] = useState<SlashCommandDefinition[]>(() => bootstrapData.slashCommands);
	const [skills, setSkills] = useState<SkillSummary[]>(() => bootstrapData.skills);
	const [messageApi, messageContextHolder] = antdMessage.useMessage();
	const [isFullTrustModalOpen, setIsFullTrustModalOpen] = useState<boolean>(false);
	const [fullTrustConfirmationText, setFullTrustConfirmationText] = useState<string>("");
	const [activeRetryRequestId, setActiveRetryRequestId] = useState<string | null>(null);
	const [workflowTodoSnapshot, setWorkflowTodoSnapshot] = useState<WorkflowTodoSnapshot | null>(null);
	const dismissedTerminalGoalIdsRef = useRef<Set<string>>(new Set());
	const [runState, setRunState] = useState<RunControllerState>(() => createIdleRunState());
	const [runningSessionState, setRunningSessionState] = useState<RunningSessionState>(() => new Map());
	const [unreadSessionIds, setUnreadSessionIds] = useState<ReadonlySet<string>>(() => new Set<string>());
	const windowFocusedRef = useRef<boolean>(document.hasFocus());
	const [clientPreferences, setClientPreferences] = useState<ClientPreferences>(bootstrapData.clientPreferences ?? DEFAULT_CLIENT_PREFERENCES);
	const clientPreferencesRef = useLatest(clientPreferences);
	const [generalSettings, setGeneralSettings] = useState<GeneralSettings>(bootstrapData.generalSettings ?? DEFAULT_GENERAL_SETTINGS);
	const navigationVersionRef = useRef<number>(0);
	const activeChatRequestIdRef = useRef<string | null>(null);
	const cancelledChatRequestIdsRef = useRef<Set<string>>(new Set());
	const homeSubmissionPendingRef = useRef<boolean>(false);
	const composerDraftsRef = useRef<Map<string, string>>(new Map());
	const [composerInputReset, setComposerInputReset] = useState<{ scopeId: string; revision: number }>({
		scopeId: "home",
		revision: 0
	});
	const slashCommandsLoadingRef = useRef<boolean>(false);
	const skillsLoadingRef = useRef<boolean>(false);
	const slashCommandsRetryAtRef = useRef<number>(0);
	const skillsRetryAtRef = useRef<number>(0);
	const initializedWorkflowTodoKeyRef = useRef<string>("");
	const expandedActiveWorkflowTodoKeyRef = useRef<string>("");
	const pendingUserActionRequestIdsRef = useRef<Set<string>>(new Set());
	const activeSessionTitleRef = useRef<string>("Daedalus session");
	const activeSessionLayout: SessionLayoutPreferences = activeSessionId === null
		? temporarySessionLayout
		: sessionLayouts[activeSessionId] ?? DEFAULT_SESSION_LAYOUT;
	const planGoalController = usePlanGoalController({
		activeSessionId,
		activeChatRequestIdRef,
		dismissedTerminalGoalIdsRef,
		setSessionError,
		setWorkbench,
		setActiveSessionMetadata,
		applyOptimisticActiveRun,
		applyOptimisticSend,
		finishOptimisticActiveRun,
		showWorkflowTodo,
		dismissWorkflowTodoForGoal: async (): Promise<void> => {
			const snapshot: WorkflowTodoSnapshot | null = workflowTodoSnapshot;
			if (snapshot === null) return;
			const dismissParams: { workflowId?: string; runId?: string } = {};
			if (snapshot.workflowId !== undefined) dismissParams.workflowId = snapshot.workflowId;
			if (snapshot.runId !== undefined) dismissParams.runId = snapshot.runId;
			await dismissWorkflowTodo(dismissParams);
			setWorkflowTodoSnapshot(null);
		}
	});
	const {
		currentGoal,
		setCurrentGoal,
		applyCurrentGoalSnapshot,
		latestPlanClarification,
		setLatestPlanClarification,
		suppressedPlanClarificationKey,
		setSuppressedPlanClarificationKey,
		isPlanClarificationSubmitting,
		setIsPlanClarificationSubmitting,
		planClarificationError,
		setPlanClarificationError,
		latestPlanApproval,
		setLatestPlanApproval,
		isPlanApproving,
		setIsPlanApproving,
		isPlanRevising,
		setIsPlanRevising,
		planApprovalError,
		setPlanApprovalError,
		pendingPlanClarification,
		pendingPlanApproval,
		latestPlanClarificationKey,
		latestPlanApprovalKey,
		resetPlanClarificationUiState,
		resetPlanApprovalUiState,
		resetPlanGoalUiState,
		handlePlanClarificationSubmit,
		handlePlanApprove,
		handlePlanRevise,
		handleTerminalGoalDismiss
	} = planGoalController;
	const approvalController = useApprovalController({
		initialMode: bootstrapData.clientPreferences.newSessionComposer.approvalMode,
		activeSessionId,
		pendingToolBudgetId: workbench?.pendingToolBudget?.budgetId,
		activeSessionIdRef,
		persistSessionUiMetadata,
		persistNewSessionComposerDefaults,
		refreshLatestTimeline,
		setSessionError,
		onFullTrustRequested: (): void => {
			setFullTrustConfirmationText("");
			setIsFullTrustModalOpen(true);
		}
	});
	const {
		approvalMode,
		setApprovalModeState,
		isApprovalModeSaving,
		pendingApproval,
		setPendingApproval,
		approvalError,
		clearApprovalError,
		isApproving,
		isRejecting,
		isToolBudgetContinuing,
		isToolBudgetStopping,
		toolBudgetError,
		refreshPendingApproval,
		saveApprovalMode,
		handleApprovalModeChange,
		handleApprovalApprove,
		handleApprovalReject,
		handleToolBudgetContinue,
		handleToolBudgetStop
	} = approvalController;

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
		setRunState((currentState: RunControllerState): RunControllerState => applyRunStateFromWorkbench(
			currentState,
			workbench,
			cancelledChatRequestIdsRef.current
		));
	}, [workbench]);

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

	function resetSessionPresentationState(): void {
		timelineStore.reset();
		resetTimelineUiState();
		setWorkbench(null);
		clearWorkflowTodoUiState();
		resetPlanGoalUiState();
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
		if (activeSessionMetadata?.workflowTodoDismissedKey === workflowTodoKey) {
			initializedWorkflowTodoKeyRef.current = workflowTodoKey;
			return;
		}
		if (initializedWorkflowTodoKeyRef.current === workflowTodoKey) {
			if (!workflowTodoIsActive || expandedActiveWorkflowTodoKeyRef.current === workflowTodoKey) {
				return;
			}
		}

		initializedWorkflowTodoKeyRef.current = workflowTodoKey;
		if (workflowTodoIsActive) {
			expandedActiveWorkflowTodoKeyRef.current = workflowTodoKey;
		}
		const workflowTodoCollapsed: boolean = !workflowTodoIsActive;
		setActiveSessionMetadata((currentMetadata: SessionMetadata | null): SessionMetadata | null => {
			return currentMetadata === null
				? currentMetadata
				: {
					...currentMetadata,
					workflowTodoCollapsed,
					workflowTodoDismissedKey: null
				};
		});
		void saveSessionUiMetadata({ workflowTodoCollapsed, workflowTodoDismissedKey: null }).catch((error: unknown): void => {
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
			const blocks: TimelineBlock[] = insertUserBlockBeforeRequestAssistant(
				currentPage.blocks,
				createOptimisticUserBlock(requestId, message, additionalContext)
			);

			return {
				...currentPage,
				sessionId: currentPage.sessionId ?? sessionId,
				blocks,
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
				blocks: insertUserBlockBeforeRequestAssistant(
					trimmedPage.blocks,
					createOptimisticUserBlock(requestId, message, additionalContext)
				),
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
						&& provider.enabled !== false
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

	useAppEventBridge({
		activeSessionIdRef,
		activeChatRequestIdRef,
		cancelledChatRequestIdsRef,
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
			clearApprovalError();
			return;
		}

		void refreshPendingApproval();
	}, [activeSessionId, clearApprovalError, isNewSessionHome, refreshPendingApproval, workbench?.pendingApproval?.count, workbench?.pendingApproval?.first?.approvalId]);

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
			setCurrentGoal(result.currentGoal === null || openedGoalDismissed ? null : result.currentGoal);
			setApprovalModeState(result.metadata.approvalMode ?? "manual");
			setActiveWorkspace(createWorkspaceFromSessionOpenResult(result));
			if (options.recordNavigation !== false && result.metadata.temporary !== true) {
				recordOpenedSession(sessionId);
			}
			const workflowTodo: WorkflowTodoSnapshot | null = openedGoalDismissed ? null : createWorkflowTodoSnapshotFromTimelineResult(result);
			setWorkflowTodoSnapshot(workflowTodo);
			rememberLoadedWorkflowTodo(workflowTodo);
			if (
				workflowTodo !== null
				&& isWorkflowTodoActive(workflowTodo)
				&& result.metadata.workflowTodoDismissedKey !== getWorkflowTodoSnapshotKey(workflowTodo)
			) {
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
		if (message.length === 0 || homeSubmissionPendingRef.current) {
			return;
		}
		homeSubmissionPendingRef.current = true;

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

			if (cancelledChatRequestIdsRef.current.has(requestId)) {
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
			if (cancelledChatRequestIdsRef.current.has(requestId)) {
				finishOptimisticActiveRun(requestId);
				setSessionError(null);
				return;
			}
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
			homeSubmissionPendingRef.current = false;
			cancelledChatRequestIdsRef.current.delete(requestId);
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
			if (cancelledChatRequestIdsRef.current.has(requestId)) {
				finishOptimisticActiveRun(requestId);
				setSessionError(null);
				return;
			}
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
			cancelledChatRequestIdsRef.current.delete(requestId);
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
			setSessionError("Please open a session before retrying.");
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
			if (cancelledChatRequestIdsRef.current.has(requestId)) {
				finishOptimisticActiveRun(requestId);
				setSessionError(null);
				return true;
			}
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
			cancelledChatRequestIdsRef.current.delete(requestId);
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

		const wasCreatingSession: boolean = homeSubmissionPendingRef.current;
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
			if (result.cancelled || result.alreadyFinished || wasCreatingSession) {
				// The cancellation response is authoritative. Terminal events remain the
				// persisted source of truth, but the Composer must not stay in a stopping
				// state while waiting for an event that may already have been delivered.
				if (activeChatRequestIdRef.current === cancellationRequestId) {
					activeChatRequestIdRef.current = null;
				}
				if (result.alreadyFinished === true) {
					cancelledChatRequestIdsRef.current.delete(cancellationRequestId);
				}
				finishOptimisticActiveRun(cancellationRequestId);
				setIsHomeSubmitting(false);
				resetPlanClarificationUiState();
				resetPlanApprovalUiState();
				return;
			}
			if (!result.cancelled && !result.alreadyFinished && !wasCreatingSession) {
				throw new Error("The backend did not accept the cancellation request.");
			}
		} catch (error: unknown) {
			console.error("[App] cancel chat failed", error);
			if (wasCreatingSession) {
				if (activeChatRequestIdRef.current === cancellationRequestId) {
					activeChatRequestIdRef.current = null;
				}
				finishOptimisticActiveRun(cancellationRequestId);
				setIsHomeSubmitting(false);
				resetPlanClarificationUiState();
				resetPlanApprovalUiState();
				return;
			}
			cancelledChatRequestIdsRef.current.delete(cancellationRequestId);
			setRunState((currentState: RunControllerState): RunControllerState => (
				currentState.requestId === cancellationRequestId ? previousRunState : currentState
			));
			showTransientError(error instanceof Error ? error.message : "Failed to stop the response");
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
		if (
			workflowTodo !== null
			&& isWorkflowTodoActive(workflowTodo)
			&& activeSessionMetadata?.workflowTodoDismissedKey !== getWorkflowTodoSnapshotKey(workflowTodo)
		) {
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
		const dismissedKey: string = getWorkflowTodoSnapshotKey(snapshot);
		const params: { workflowId?: string; runId?: string } = {};
		if (snapshot.workflowId !== undefined) {
			params.workflowId = snapshot.workflowId;
		}
		if (snapshot.runId !== undefined) {
			params.runId = snapshot.runId;
		}

		try {
			await dismissWorkflowTodo(params);
			setActiveSessionMetadata((currentMetadata: SessionMetadata | null): SessionMetadata | null => {
				return currentMetadata === null
					? currentMetadata
					: {
						...currentMetadata,
						workflowTodoCollapsed: true,
						workflowTodoDismissedKey: dismissedKey
					};
			});
			void saveSessionUiMetadata({
				workflowTodoCollapsed: true,
				workflowTodoDismissedKey: dismissedKey
			}).catch((error: unknown): void => {
				console.error("[App] save dismissed workflow todo state failed", error);
			});
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

	const {
		patchContext,
		handleAddImageFiles,
		handleAddPastedTextAttachment,
		handleAddWorkspaceContext,
		handleAddContextFiles
	} = useWorkspaceContextController({
		activeSessionId,
		activeWorkspace,
		activeSessionMetadata,
		queueWorkbenchPatch,
		setPendingTextAttachmentCount,
		showTransientError
	});
	const displayedComposerModel = getDisplayedComposerModel({
		isNewSessionHome,
		homeDraft,
		workbench,
		activeSessionMetadata,
		providerModelSelection
	});
	const selectedProviderId: string | null = displayedComposerModel.providerId;
	const selectedModelId: string | null = displayedComposerModel.modelId;
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
	const nextStepSuggestionCandidate: unknown = workbench?.nextStepHints?.hints?.[0]?.message;
	const nextStepSuggestion: string | null = activeSessionId === null || composerIsSending || typeof nextStepSuggestionCandidate !== "string"
		? null
		: nextStepSuggestionCandidate.trim() || null;
	const runningSessionIds: string[] = [...runningSessionState.keys()];

	useEffect((): void => {
		activeSessionTitleRef.current = chatTitle;
	}, [chatTitle]);

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
			title: t("nativeNotifications.approvalTitle"),
			body: t("nativeNotifications.toolApprovalBody"),
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
			title: t("nativeNotifications.approvalTitle"),
			body: t("nativeNotifications.toolBudgetBody"),
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
			title: t("nativeNotifications.approvalTitle"),
			body: t("nativeNotifications.planApprovalBody"),
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
			title: t("nativeNotifications.clarificationTitle"),
			body: t("nativeNotifications.clarificationBody"),
			dedupeKey: `clarification_required:${activeSessionId}:${pendingPlanClarification.planId}:${pendingPlanClarification.question}`
		});
	}, [activeSessionId, pendingPlanClarification?.planId, pendingPlanClarification?.question, pendingPlanClarification?.requestId]);

	const homePageProps = {
		workspaceRefreshToken,
		isHome: isNewSessionHome,
		activeSessionId,
		workspaceSidebar: clientPreferences.workspaceSidebar,
		keyboardShortcuts: clientPreferences.keyboardShortcuts,
		onWorkspaceSidebarChange: handleWorkspaceSidebarChange,
		sessionLayout: activeSessionLayout,
		onSessionLayoutChange: handleSessionLayoutChange,
		activeSessionMetadata,
		activeWorkspaceId: activeSessionId === null ? homeDraft.workspaceId : currentSessionWorkspaceId,
		chatTitle,
		timelineStore,
		timelineNavigationEntries,
		isSessionLoading,
		sessionError,
		isLoadingMoreBefore: isTimelineLoadingBefore,
		isLoadingMoreAfter: isTimelineLoadingAfter,
		retryDisabled: composerIsSending || isSessionLoading,
		activeRetryRequestId,
		providerModelSelection,
		selectedProviderId,
		selectedModelId,
		reasoningEffort: composerReasoningEffort,
		composerInstanceKey,
		message: composerMessage,
		nextStepSuggestion,
		onDraftChange: handleComposerDraftChange,
		contextItems: composerContextItems,
		selectionAskThreads,
		messageQueue: composerMessageQueue,
		pendingGuides: composerPendingGuides,
		workflowTodoSnapshot,
		currentGoal,
		workflowTodoCollapsed: activeSessionMetadata?.workflowTodoCollapsed === true,
		mode: composerMode,
		approvalMode,
		pendingApproval,
		isApproving,
		isRejecting,
		approvalError,
		pendingToolBudget,
		isToolBudgetContinuing,
		isToolBudgetStopping,
		toolBudgetError,
		pendingPlanClarification,
		isPlanClarificationSubmitting,
		planClarificationError,
		pendingPlanApproval,
		isPlanApproving,
		isPlanRevising,
		planApprovalError,
		slashCommands,
		skills,
		isSending: composerIsSending,
		isCancelling: composerIsCancelling,
		isAddingTextAttachment,
		isApprovalModeSaving,
		workspaceOptions: homeWorkspaceOptions,
		initialWorkspaces: bootstrapData.workspaceList.workspaces,
		initialSessions: bootstrapData.sessionList.sessions,
		initialActiveWorkspaceId: bootstrapData.workspaceList.active,
		initialWorkspaceTreeOrder: bootstrapData.workspaceTreeOrder,
		runningSessionIds,
		unreadSessionIds: [...unreadSessionIds],
		homeWorkspace: homeDraft.workspace,
		workspaceFooterDisabled: isHomeSubmitting || composerWorkspaceLocked || isSessionLoading,
		activeWorkspace: displayedWorkspace,
		godotLaunchExecutablePath,
		onNewSession: handleNewSession,
		onNewUnboundSession: (): void => {
			void handleNewSession({ restoreTemporaryDraft: false });
		},
		onNewWorkspaceSession: (workspace: WorkspaceConfig): void => {
			void handleNewWorkspaceSession(workspace);
		},
		onWorkspaceRefresh: (): void => {
			setWorkspaceRefreshToken((currentToken: number): number => currentToken + 1);
		},
		onHomeWorkspaceSelect: (workspaceId: string): void => {
			void handleHomeWorkspaceSelect(workspaceId);
		},
		onHomeWorkspaceAdd: handleHomeWorkspaceAdd,
		onHomeWorkspaceClear: handleHomeWorkspaceClear,
		onSessionSelect: handleSessionSelect,
		onSessionArchive: handleSessionArchive,
		onSessionRename: handleSessionRename,
		onSessionsChange: handleSessionsChange,
		onWorkspaceDelete: handleWorkspaceDelete,
		onWorkspaceUpdate: handleWorkspaceUpdate,
		onWorkspaceProjectCreated: handleWorkspaceTreeProjectCreated,
		onLoadMoreBefore: handleLoadMoreBefore,
		onLoadMoreAfter: handleLoadMoreAfter,
		onTimelineNavigationLoadEntry: handleTimelineNavigationLoadEntry,
		onTimelineSearchLoadOffset: handleTimelineSearchLoadOffset,
		onRetryEditStart: (requestId: string): void => {
			setActiveRetryRequestId(requestId);
		},
		onRetryEditCancel: (requestId: string): void => {
			setActiveRetryRequestId((currentRequestId: string | null): string | null => {
				return currentRequestId === requestId ? null : currentRequestId;
			});
		},
		onRetryFromUserMessage: handleRetryFromUserMessage,
		onModeChange: (mode: ChatMode): void => {
			void handleModeChange(mode);
		},
		onApprovalModeChange: (mode: ApprovalMode): void => {
			void handleApprovalModeChange(mode);
		},
		onApprovalApprove: (approvalId: string, consentText?: string): void => {
			void handleApprovalApprove(approvalId, consentText);
		},
		onApprovalReject: (approvalId: string): void => {
			void handleApprovalReject(approvalId);
		},
		onToolBudgetContinue: (budgetId: string): void => {
			void handleToolBudgetContinue(budgetId);
		},
		onToolBudgetStop: (budgetId: string): void => {
			void handleToolBudgetStop(budgetId);
		},
		onPlanClarificationSubmit: (reply: string): void => {
			void handlePlanClarificationSubmit(reply);
		},
		onPlanClarificationSkip: (): void => {
			void handlePlanClarificationSubmit(undefined, true);
		},
		onPlanApprove: (planId: string): void => {
			void handlePlanApprove(planId);
		},
		onPlanRevise: (planId: string, feedback: string): void => {
			void handlePlanRevise(planId, feedback);
		},
		onProviderModelChange: (providerId: string, modelId: string): void => {
			void handleProviderModelChange(providerId, modelId);
		},
		onReasoningEffortChange: (effort: string): void => {
			void handleReasoningEffortChange(effort);
		},
		onAddFiles: (): void => {
			void handleAddWorkspaceContext("files");
		},
		onAddFolder: (): void => {
			void handleAddWorkspaceContext("folder");
		},
		onAddImages: (files: File[]): void => {
			void handleAddImageFiles(files);
		},
		onAddPastedTextAttachment: handleAddPastedTextAttachment,
		onAddContextFiles: (files: File[]): void => {
			void handleAddContextFiles(files);
		},
		onAddContext: (item: AdditionalContextItem): void => patchContext({ action: "addOrReplace", item }),
		onRemoveContext: (contextId: string): void => patchContext({ action: "remove", contextId }),
		onPinContext: (contextId: string, pinned: boolean): void => patchContext({ action: "pin", contextId, pinned }),
		onClearUnpinnedContext: (): void => patchContext({ action: "clearUnpinned" }),
		onCancel: (): void => {
			void handleComposerCancel();
		},
		onSubmit: (message: string, modeOverride?: ChatMode): void => {
			void handleComposerSubmit(message, modeOverride);
		},
		onGuideSubmit: (message: string): void => {
			void handleGuideSubmit(message);
		},
		activeQueueItemId: workbench?.activeRun.queueItemId ?? null,
		onQueueMessageRemove: (queueId: number): void => {
			void handleQueueMessageRemove(queueId);
		},
		onQueueMessageEdit: (item: MessageQueueItem): void => {
			void handleQueueMessageEdit(item);
		},
		onQueueMessageReorder: (queueIds: number[]): void => {
			void handleQueueMessageReorder(queueIds);
		},
		onGuideDelete: (guideId: string): void => {
			void handleGuideDelete(guideId);
		},
		onGuideReorder: (guideIds: string[]): void => {
			void handleGuideReorder(guideIds);
		},
		onWorkflowTodoDismiss: (snapshot: WorkflowTodoSnapshot): void => {
			void handleWorkflowTodoDismiss(snapshot);
		},
		onGoalChange: applyCurrentGoalSnapshot,
		onGoalDismiss: handleTerminalGoalDismiss,
		onCompletionOpen: handleCompletionOpen
	};

	return {
		messageContextHolder,
		homePageProps,
		fullTrustOpen: isFullTrustModalOpen,
		fullTrustConfirmationText,
		isApprovalModeSaving,
		fullTrustConfirmationToken: FULL_TRUST_CONFIRMATION_TEXT,
		fullTrustTitle: t("app.fullTrust.title"),
		fullTrustEnableLabel: t("app.fullTrust.actions.enable"),
		fullTrustCancelLabel: t("app.fullTrust.actions.cancel"),
		fullTrustDescription: t("app.fullTrust.description"),
		fullTrustConfirmationPrefix: t("app.fullTrust.confirmationPrefix"),
		fullTrustConfirmationSuffix: t("app.fullTrust.confirmationSuffix"),
		fullTrustConfirmationError: (confirmationText: string): void => {
			void messageApi.error(t("app.fullTrust.errors.confirmation", { confirmationText }));
		},
		onFullTrustConfirm: (): void => {
			void handleFullTrustConfirm();
		},
		onFullTrustCancel: (): void => {
			if (!isApprovalModeSaving) {
				setIsFullTrustModalOpen(false);
				setFullTrustConfirmationText("");
			}
		},
		onFullTrustConfirmationTextChange: (value: string): void => {
			setFullTrustConfirmationText(value);
		},
		workspaceProjectDialogOpen: isWorkspaceProjectDialogOpen,
		onWorkspaceProjectDialogCancel: (): void => setIsWorkspaceProjectDialogOpen(false),
		onWorkspaceProjectSaved: handleWorkspaceProjectCreated
	};

}

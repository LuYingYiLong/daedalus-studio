import { useCallback, useEffect, useRef, useState } from "react";
import {
	Alert,
	App,
	Badge,
	Button,
	Dropdown,
	Drawer,
	Empty,
	Input,
	Select,
	Space,
	Spin,
	Tag,
	Typography,
} from "antd";
import type { BadgeProps } from "antd";
import { useTranslation } from "react-i18next";
import { Icon } from "@/assets/icons";
import BreadcrumbsIcon from "@/assets/icons/breadcrumbs.svg?react";
import MessageList from "@/widgets/conversation/MessageList";
import Composer from "@/widgets/composer/Composer";
import NewSessionHome from "@/widgets/home/surface/NewSessionHome";
import { TraceInspector } from "@/widgets/home/trajectory/TrajectoryPanel";
import ApprovalDialog from "@/widgets/approval/ApprovalDialog";
import ToolBudgetDialog from "@/widgets/approval/ToolBudgetDialog";
import PlanApprovalDialog from "@/widgets/approval/PlanApprovalDialog";
import FullTrustConfirmationModal from "@/widgets/approval/FullTrustConfirmationModal";
import ClarificationDialog from "@/widgets/clarification/ClarificationDialog";
import {
	approveApproval,
	fetchApprovalList,
	rejectApproval,
	setApprovalMode,
	type ApprovalMode,
	type ApprovalListResult,
} from "@/platform/rpc/approval-api";
import {
	cancelChatMessage,
	continueToolBudget,
	retryAgentRun,
	sendChatMessage,
	stopToolBudget,
	type ChatMode,
} from "@/platform/rpc/chat-api";
import {
	createSession,
	fetchSessionTimeline,
	fetchSessions,
	openSession,
	saveSessionUiMetadata,
	setSessionModel,
	subscribeSession,
	unsubscribeSession,
} from "@/platform/rpc/session-api";
import {
	fetchProviderModelSelection,
	type ProviderModelSelection,
} from "@/platform/rpc/provider-api";
import { fetchWorkspaces } from "@/platform/rpc/workspace-api";
import { fetchWorkbench } from "@/platform/rpc/workbench-api";
import {
	approvePlan,
	getPlan,
	revisePlan,
	submitPlanClarification,
	type PlanResult,
} from "@/platform/rpc/plan-api";
import {
	fetchTraceDetail,
	fetchTracePage,
	fetchTraceSummary,
	type TraceDetail,
	type TracePage,
	type TraceRecord,
	type TraceSummary,
} from "@/platform/rpc/trace-api";
import {
	createBackendClient,
	onBackendEvent,
	onBackendConnectionStateChanged,
	onBackendReconnected,
} from "@/platform/rpc/transport/backend-client";
import {
	BackendConnectionError,
	BackendRpcError,
} from "@/platform/rpc/transport/backend-rpc-client";
import type {
	SessionMetadata,
	SessionOpenResult,
	TimelineBlock,
	WorkbenchSnapshot,
	WorkspaceConfig,
} from "@/platform/rpc/types";
import {
	fetchRemoteGatewayStatus,
	pairFromLocationFragment,
} from "./remote-bootstrap";
import { notifyNativeBridge } from "./native-bridge";
import RemoteNavigationDrawer from "./RemoteNavigationDrawer";
import RemoteSessionHome from "./RemoteSessionHome";
import RemoteTraceScreen from "./RemoteTraceScreen";
import { RemoteRefreshScheduler } from "./remote-refresh-scheduler";
import {
	getRemoteDraftStorageKey,
	normalizeRemoteScreen,
	type RemotePrimaryScreen,
} from "./remote-model";
import styles from "./RemoteApp.module.css";

type ConnectionStatus =
	| "connecting"
	| "connected"
	| "disconnected"
	| "pairing_required";

const FULL_TRUST_CONFIRMATION_TEXT: string = "ENABLE FULL TRUST";
const ACTIVE_SESSION_REFRESH_INTERVAL_MS: number = 2_000;

function getConnectionBadgeStatus(
	status: ConnectionStatus,
): NonNullable<BadgeProps["status"]> {
	if (status === "connected") return "success";
	if (status === "connecting") return "processing";
	if (status === "pairing_required") return "warning";
	return "error";
}

function errorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

function createRequestId(): string {
	return `remote-${crypto.randomUUID()}`;
}

function RemoteApp(): React.JSX.Element {
	const { t } = useTranslation();
	const { message } = App.useApp();
	const [connectionStatus, setConnectionStatus] =
		useState<ConnectionStatus>("connecting");
	const [error, setError] = useState<string | null>(null);
	const [sessions, setSessions] = useState<SessionMetadata[]>([]);
	const [workspaces, setWorkspaces] = useState<WorkspaceConfig[]>([]);
	const [providerModelSelection, setProviderModelSelection] =
		useState<ProviderModelSelection | null>(null);
	const [activeSession, setActiveSession] = useState<SessionMetadata | null>(
		null,
	);
	const [activeScreen, setActiveScreen] =
		useState<RemotePrimaryScreen>("sessions");
	const [navigationOpen, setNavigationOpen] = useState<boolean>(false);
	const [timeline, setTimeline] = useState<TimelineBlock[]>([]);
	const [workbench, setWorkbench] = useState<WorkbenchSnapshot | null>(null);
	const [approvals, setApprovals] = useState<ApprovalListResult>({
		pending: [],
		mode: "manual",
	});
	const [composerText, setComposerText] = useState<string>("");
	const [chatMode, setChatMode] =
		useState<Exclude<ChatMode, "goal">>("agent");
	const [sending, setSending] = useState<boolean>(false);
	const [createOpen, setCreateOpen] = useState<boolean>(false);
	const [createWorkspaceId, setCreateWorkspaceId] = useState<
		string | undefined
	>();
	const [approvalBusy, setApprovalBusy] = useState<
		"approve" | "reject" | "auto" | null
	>(null);
	const [approvalModeBusy, setApprovalModeBusy] = useState<boolean>(false);
	const [fullTrustOpen, setFullTrustOpen] = useState<boolean>(false);
	const [fullTrustText, setFullTrustText] = useState<string>("");
	const [planOpen, setPlanOpen] = useState<boolean>(false);
	const [plan, setPlan] = useState<PlanResult | null>(null);
	const [planBusy, setPlanBusy] = useState<boolean>(false);
	const [traceSummary, setTraceSummary] = useState<TraceSummary | null>(null);
	const [tracePage, setTracePage] = useState<TracePage | null>(null);
	const [traceDetail, setTraceDetail] = useState<TraceDetail | null>(null);
	const [traceBusy, setTraceBusy] = useState<boolean>(false);
	const activeSessionIdRef = useRef<string | null>(null);
	const pendingApprovalCountRef = useRef<number>(0);
	const describeError = useCallback(
		(caught: unknown): string => {
			if (
				caught instanceof BackendRpcError &&
				caught.code === "remote_rate_limited"
			) {
				return t("remote.errors.rateLimited");
			}
			return errorMessage(caught);
		},
		[t],
	);

	const showScreen = useCallback(
		(
			requestedScreen: RemotePrimaryScreen,
			historyMode: "push" | "replace" = "push",
		): void => {
			const nextScreen: RemotePrimaryScreen = normalizeRemoteScreen(
				requestedScreen,
				activeSessionIdRef.current !== null,
			);
			setActiveScreen(nextScreen);
			const state = { daedalusRemoteScreen: nextScreen };
			if (historyMode === "replace")
				globalThis.history.replaceState(
					state,
					"",
					`${location.pathname}${location.search}`,
				);
			else if (
				(
					globalThis.history.state as {
						daedalusRemoteScreen?: unknown;
					} | null
				)?.daedalusRemoteScreen !== nextScreen
			)
				globalThis.history.pushState(state, "");
		},
		[],
	);

	const refreshCatalog = useCallback(async (): Promise<void> => {
		const [sessionResult, workspaceResult, modelSelection] =
			await Promise.all([
				fetchSessions(),
				fetchWorkspaces(),
				fetchProviderModelSelection(),
			]);
		setSessions(sessionResult.sessions);
		setWorkspaces(workspaceResult.workspaces);
		setProviderModelSelection(modelSelection);
		setCreateWorkspaceId(
			(current: string | undefined): string | undefined =>
				current ?? workspaceResult.workspaces[0]?.id,
		);
	}, []);

	const loadPlanFromOpenResult = useCallback(
		async (
			result: Pick<
				SessionOpenResult,
				"latestPlanClarification" | "latestPlanApproval"
			>,
		): Promise<void> => {
			const planId: string | undefined =
				result.latestPlanClarification?.planId ??
				result.latestPlanApproval?.planId;
			if (planId === undefined || activeSessionIdRef.current === null) {
				setPlan(null);
				return;
			}
			setPlan(await getPlan(planId, activeSessionIdRef.current));
		},
		[],
	);

	const refreshActiveSession = useCallback(
		async (sessionId: string): Promise<void> => {
			try {
				const [timelineResult, nextWorkbench, nextApprovals] =
					await Promise.all([
						fetchSessionTimeline(sessionId, 180),
						fetchWorkbench(),
						fetchApprovalList(),
					]);
				if (activeSessionIdRef.current !== sessionId) return;
				setTimeline(timelineResult.timelineBlocks);
				setWorkbench(nextWorkbench);
				setApprovals(nextApprovals);
				if (
					nextApprovals.pending.length > 0 &&
					pendingApprovalCountRef.current === 0
				)
					setActiveScreen("approvals");
				pendingApprovalCountRef.current = nextApprovals.pending.length;
				await loadPlanFromOpenResult(timelineResult);
				setConnectionStatus("connected");
				setError(null);
			} catch (refreshError: unknown) {
				if (refreshError instanceof BackendConnectionError) {
					setConnectionStatus("disconnected");
				}
				setError(describeError(refreshError));
			}
		},
		[describeError, loadPlanFromOpenResult],
	);

	const refreshCallbackRef = useRef(refreshActiveSession);
	refreshCallbackRef.current = refreshActiveSession;
	const refreshSchedulerRef = useRef<RemoteRefreshScheduler | null>(null);
	if (refreshSchedulerRef.current === null) {
		refreshSchedulerRef.current = new RemoteRefreshScheduler(
			async (sessionId: string): Promise<void> =>
				await refreshCallbackRef.current(sessionId),
			ACTIVE_SESSION_REFRESH_INTERVAL_MS,
		);
	}
	const scheduleRefresh = useCallback((sessionId: string): void => {
		refreshSchedulerRef.current?.schedule(sessionId);
	}, []);

	const openRemoteSession = useCallback(
		async (session: SessionMetadata): Promise<void> => {
			const previousSessionId: string | null = activeSessionIdRef.current;
			if (previousSessionId !== null && previousSessionId !== session.id)
				void unsubscribeSession(previousSessionId);
			setError(null);
			setActiveSession(session);
			activeSessionIdRef.current = session.id;
			setComposerText(
				sessionStorage.getItem(getRemoteDraftStorageKey(session.id)) ??
					"",
			);
			showScreen("conversation");
			const result: SessionOpenResult = await openSession(
				session.id,
				180,
			);
			await subscribeSession(session.id);
			setActiveSession(result.metadata);
			setTimeline(result.timelineBlocks);
			setWorkbench(result.workbench);
			setChatMode(
				result.metadata.chatMode === "ask" ||
					result.metadata.chatMode === "plan"
					? result.metadata.chatMode
					: "agent",
			);
			const nextApprovals: ApprovalListResult = await fetchApprovalList();
			setApprovals(nextApprovals);
			pendingApprovalCountRef.current = nextApprovals.pending.length;
			if (nextApprovals.pending.length > 0) setActiveScreen("approvals");
			await loadPlanFromOpenResult(result);
		},
		[loadPlanFromOpenResult, showScreen],
	);

	useEffect((): (() => void) => {
		let disposed: boolean = false;
		let removeEventListener: (() => void) | null = null;
		const start = async (): Promise<void> => {
			try {
				await pairFromLocationFragment();
				showScreen("sessions", "replace");
				const gateway = await fetchRemoteGatewayStatus();
				if (gateway.pairingRequired) {
					setConnectionStatus("pairing_required");
					return;
				}
				await createBackendClient();
				if (disposed) return;
				notifyNativeBridge("remote.ready", {
					name: gateway.name,
					protocolVersion: gateway.protocolVersion,
					remoteUiCompatibilityVersion:
						gateway.remoteUiCompatibilityVersion,
					studioVersion: gateway.studioVersion,
					certificateFingerprint: gateway.certificateFingerprint,
				});
				setConnectionStatus("connected");
				await refreshCatalog();
				removeEventListener = await onBackendEvent((event): void => {
					if (event.event === "session.catalog.updated") {
						void refreshCatalog().catch(
							(catalogError: unknown): void =>
								setError(describeError(catalogError)),
						);
					}
					const selectedId: string | null =
						activeSessionIdRef.current;
					if (selectedId !== null && event.sessionId === selectedId)
						scheduleRefresh(selectedId);
				});
			} catch (startupError: unknown) {
				if (disposed) return;
				setConnectionStatus("disconnected");
				setError(describeError(startupError));
			}
		};
		void start();
		const removeReconnect = onBackendReconnected((): void => {
			const selectedId: string | null = activeSessionIdRef.current;
			if (selectedId !== null) {
				void openSession(selectedId, 180)
					.then(
						(): Promise<{ subscribed: true; sessionId: string }> =>
							subscribeSession(selectedId),
					)
					.then((): void => scheduleRefresh(selectedId))
					.catch((reconnectError: unknown): void =>
						setError(describeError(reconnectError)),
					);
			} else {
				void refreshCatalog().catch((catalogError: unknown): void =>
					setError(describeError(catalogError)),
				);
			}
		});
		const removeConnectionState = onBackendConnectionStateChanged(
			(state): void => {
				setConnectionStatus(state);
				notifyNativeBridge("remote.connectionState", { state });
			},
		);
		const onVisibility = (): void => {
			if (document.visibilityState !== "visible") return;
			void createBackendClient()
				.then((): void => {
					const selectedId: string | null =
						activeSessionIdRef.current;
					if (selectedId !== null) scheduleRefresh(selectedId);
					else void refreshCatalog();
				})
				.catch((visibilityError: unknown): void => {
					if (visibilityError instanceof BackendConnectionError) {
						setConnectionStatus("disconnected");
					}
					setError(describeError(visibilityError));
				});
		};
		const onPopState = (event: PopStateEvent): void => {
			const requested: unknown = (
				event.state as { daedalusRemoteScreen?: unknown } | null
			)?.daedalusRemoteScreen;
			const next: RemotePrimaryScreen =
				requested === "conversation" ||
				requested === "approvals" ||
				requested === "trajectory" ||
				requested === "sessions"
					? requested
					: "sessions";
			setActiveScreen(
				normalizeRemoteScreen(
					next,
					activeSessionIdRef.current !== null,
				),
			);
		};
		document.addEventListener("visibilitychange", onVisibility);
		window.addEventListener("popstate", onPopState);
		return (): void => {
			disposed = true;
			removeReconnect();
			removeConnectionState();
			removeEventListener?.();
			document.removeEventListener("visibilitychange", onVisibility);
			window.removeEventListener("popstate", onPopState);
			refreshSchedulerRef.current?.dispose();
		};
	}, [describeError, refreshCatalog, scheduleRefresh, showScreen]);

	useEffect((): (() => void) => {
		const handleRetryAgentRun = (event: Event): void => {
			const detail: unknown = (event as CustomEvent<unknown>).detail;
			if (
				typeof detail !== "object" ||
				detail === null ||
				!("runId" in detail) ||
				typeof (detail as { runId?: unknown }).runId !== "string"
			)
				return;
			const sessionId: string | null = activeSessionIdRef.current;
			setSending(true);
			void retryAgentRun((detail as { runId: string }).runId)
				.catch((retryError: unknown): void => {
					void message.error(errorMessage(retryError));
				})
				.finally((): void => {
					setSending(false);
					if (sessionId !== null) scheduleRefresh(sessionId);
				});
		};
		window.addEventListener(
			"daedalus:retry-agent-run",
			handleRetryAgentRun,
		);
		return (): void =>
			window.removeEventListener(
				"daedalus:retry-agent-run",
				handleRetryAgentRun,
			);
	}, [message, scheduleRefresh]);

	async function createRemoteSession(): Promise<void> {
		if (createWorkspaceId === undefined) return;
		setSending(true);
		try {
			const created = await createSession({
				title: t("remote.newSessionTitle"),
				workspaceId: createWorkspaceId,
				chatMode,
				approvalMode: "manual",
			});
			setCreateOpen(false);
			await refreshCatalog();
			await openRemoteSession(created);
		} catch (createError: unknown) {
			void message.error(errorMessage(createError));
		} finally {
			setSending(false);
		}
	}

	async function submitMessage(
		text: string,
		retryFromRequestId?: string,
		modeOverride?: ChatMode,
	): Promise<boolean> {
		const trimmed: string = text.trim();
		if (activeSession === null || trimmed.length === 0) return false;
		setComposerText("");
		sessionStorage.removeItem(getRemoteDraftStorageKey(activeSession.id));
		setSending(true);
		const requestId: string = createRequestId();
		void sendChatMessage({
			requestId,
			message: trimmed,
			mode: modeOverride ?? chatMode,
			retryFromRequestId,
		})
			.catch((sendError: unknown): void => {
				setComposerText(trimmed);
				sessionStorage.setItem(
					getRemoteDraftStorageKey(activeSession.id),
					trimmed,
				);
				setError(describeError(sendError));
				void message.error(errorMessage(sendError));
			})
			.finally((): void => {
				setSending(false);
				scheduleRefresh(activeSession.id);
			});
		scheduleRefresh(activeSession.id);
		return true;
	}

	function updateComposerText(value: string): void {
		setComposerText(value);
		if (activeSession === null) return;
		const storageKey: string = getRemoteDraftStorageKey(activeSession.id);
		if (value.length === 0) sessionStorage.removeItem(storageKey);
		else sessionStorage.setItem(storageKey, value);
	}

	async function updateSessionMode(nextMode: ChatMode): Promise<void> {
		if (nextMode === "goal") return;
		setChatMode(nextMode);
		await saveSessionUiMetadata({ chatMode: nextMode });
		setActiveSession((current): SessionMetadata | null =>
			current === null ? null : { ...current, chatMode: nextMode },
		);
	}

	async function updateSessionModel(
		provider: string,
		model: string,
	): Promise<void> {
		const result = await setSessionModel({ provider, model });
		setActiveSession(result.metadata);
		setWorkbench(result.workbench);
	}

	async function updateReasoningEffort(
		reasoningEffort: string,
	): Promise<void> {
		await saveSessionUiMetadata({ reasoningEffort });
		setActiveSession((current): SessionMetadata | null =>
			current === null ? null : { ...current, reasoningEffort },
		);
		setWorkbench((current): WorkbenchSnapshot | null =>
			current === null
				? null
				: {
						...current,
						composer: { ...current.composer, reasoningEffort },
					},
		);
	}

	async function decideApproval(
		kind: "approve" | "reject" | "auto",
		approvalId: string,
		consentText?: string,
	): Promise<void> {
		setApprovalBusy(kind);
		try {
			if (kind === "reject") await rejectApproval(approvalId);
			else
				await approveApproval(approvalId, consentText, {
					enableAutoSafe: kind === "auto",
				});
			if (activeSession !== null)
				await refreshActiveSession(activeSession.id);
			if (approvals.pending.length <= 1)
				showScreen(
					activeSession === null ? "sessions" : "conversation",
				);
		} catch (approvalError: unknown) {
			void message.error(errorMessage(approvalError));
		} finally {
			setApprovalBusy(null);
		}
	}

	async function saveApprovalMode(
		mode: ApprovalMode,
		confirmationText?: string,
	): Promise<void> {
		if (mode === approvals.mode || approvalModeBusy) return;
		setApprovalModeBusy(true);
		try {
			const result = await setApprovalMode(mode, confirmationText);
			setApprovals(
				(current: ApprovalListResult): ApprovalListResult => ({
					...current,
					mode: result.mode,
				}),
			);
			setFullTrustOpen(false);
			setFullTrustText("");
		} catch (approvalModeError: unknown) {
			void message.error(errorMessage(approvalModeError));
		} finally {
			setApprovalModeBusy(false);
		}
	}

	function requestApprovalMode(mode: ApprovalMode): void {
		if (mode === "full-trust") {
			setFullTrustText("");
			setFullTrustOpen(true);
			return;
		}
		void saveApprovalMode(mode);
	}

	async function loadTrace(): Promise<void> {
		if (activeSession === null) return;
		setTraceBusy(true);
		showScreen("trajectory");
		try {
			const [summary, page] = await Promise.all([
				fetchTraceSummary(activeSession.id),
				fetchTracePage({ sessionId: activeSession.id, limit: 100 }),
			]);
			setTraceSummary(summary);
			setTracePage(page);
			setTraceDetail(null);
		} catch (traceError: unknown) {
			void message.error(errorMessage(traceError));
		} finally {
			setTraceBusy(false);
		}
	}

	function handlePrimaryNavigation(screen: RemotePrimaryScreen): void {
		if (screen === "trajectory") {
			void loadTrace();
			return;
		}
		showScreen(screen);
	}

	const running: boolean =
		workbench?.activeRun.status !== undefined &&
		workbench.activeRun.status !== "idle";
	const pendingApproval = approvals.pending[0] ?? null;
	const selectedWorkspace: WorkspaceConfig | null =
		workspaces.find(
			(workspace: WorkspaceConfig): boolean =>
				workspace.id === activeSession?.workspaceId,
		) ?? null;
	const screenTitle: string =
		activeScreen === "conversation"
			? (activeSession?.title ?? t("remote.navigation.conversation"))
			: t(
					`remote.navigation.${activeScreen === "trajectory" ? "trajectory" : activeScreen}`,
				);
	const headerTitle: string =
		activeScreen === "sessions"
			? t("remote.title")
			: (activeSession?.title ?? screenTitle);
	const isAndroidShell: boolean =
		navigator.userAgent.includes("DaedalusRemote/");

	if (connectionStatus === "connecting") {
		return (
			<main className={styles.center}>
				<Spin size="large" />
				<Typography.Text>{t("remote.connecting")}</Typography.Text>
			</main>
		);
	}

	if (connectionStatus === "pairing_required") {
		return (
			<main className={styles.center}>
				<Alert
					showIcon
					type="warning"
					title={t("remote.pairingRequired.title")}
					description={t("remote.pairingRequired.description")}
				/>
			</main>
		);
	}

	return (
		<main className={styles.shell} data-remote-app="true">
			<header className={styles.topBar}>
				<Button
					type="text"
					className={styles.breadcrumbButton}
					aria-label={t("remote.navigation.open")}
					icon={<BreadcrumbsIcon aria-hidden="true" />}
					onClick={(): void => setNavigationOpen(true)}
				/>
				<Typography.Text strong ellipsis className={styles.topTitle}>
					{headerTitle}
				</Typography.Text>
				<div className={styles.topActions}>
					<span
						className={styles.connectionStatus}
						role="status"
						aria-label={t(`remote.connection.${connectionStatus}`)}
					>
						<Badge status={getConnectionBadgeStatus(connectionStatus)} />
					</span>
					<Dropdown
						trigger={["click"]}
						menu={{
							items: [
								{
									key: "refresh",
									icon: <Icon name="reload" />,
									label: t("remote.actions.refresh"),
								},
								...(isAndroidShell
									? [
											{
												key: "switch",
												icon: <Icon name="remote" />,
												label: t(
													"remote.actions.switchStudio",
												),
											},
										]
									: []),
							],
							onClick: ({ key }: { key: string }): void => {
								if (key === "switch") {
									location.href =
										"daedalus-remote://connection";
									return;
								}
								void createBackendClient()
									.then((): void => {
										const sessionId: string | null =
											activeSessionIdRef.current;
										if (sessionId === null)
											void refreshCatalog();
										else scheduleRefresh(sessionId);
									})
									.catch((refreshError: unknown): void =>
										setError(describeError(refreshError)),
									);
							},
						}}
					>
						<Button
							type="text"
							shape="circle"
							aria-label={t("remote.actions.more")}
							icon={<Icon name="more-v" />}
						/>
					</Dropdown>
				</div>
			</header>

			<div className={styles.screenHost}>
				{error !== null ? (
					<Alert
						className={styles.connectionAlert}
						type="error"
						showIcon
						closable
						title={t("remote.connectionError")}
						description={error}
						onClose={(): void => setError(null)}
					/>
				) : null}

				{activeScreen === "sessions" ? (
					<RemoteSessionHome
						sessions={sessions}
						workspaces={workspaces}
						activeSessionId={activeSession?.id}
						onCreate={(): void => setCreateOpen(true)}
						onOpenSession={(session: SessionMetadata): void => {
							void openRemoteSession(session).catch(
								(openError: unknown): void =>
									setError(describeError(openError)),
							);
						}}
					/>
				) : activeScreen === "conversation" &&
				  activeSession !== null ? (
					<section className={styles.conversationScreen}>
						<div className={styles.timeline}>
							{timeline.length === 0 ? (
								<NewSessionHome
									workspace={selectedWorkspace}
									errorMessage={error}
									message={composerText}
									showStarters={true}
									onStarterSelect={updateComposerText}
								/>
							) : (
								<MessageList
									blocks={timeline}
									retryDisabled={running}
									forkDisabled={true}
									hideInlineDiff={true}
									onRetryFromUserMessage={async (
										payload,
									): Promise<boolean> =>
										await submitMessage(
											payload.message,
											payload.requestId,
										)
									}
								/>
							)}
						</div>
						{plan !== null ? (
							<Button
								type="text"
								className={styles.planBanner}
								icon={<Icon name="plan" />}
								onClick={(): void => setPlanOpen(true)}
							>
								{t("remote.plan.open", { title: plan.title })}
							</Button>
						) : null}
						{pendingApproval !== null ? (
							<Button
								danger
								type="text"
								className={styles.approvalBanner}
								icon={<Icon name="shield" />}
								onClick={(): void => showScreen("approvals")}
							>
								{t("remote.approval.pending", {
									tool: pendingApproval.toolName,
								})}
							</Button>
						) : null}
						<div className={styles.composer}>
							<Composer
								providerModelSelection={providerModelSelection}
								selectedProviderId={
									activeSession.provider ??
									workbench?.composer.provider ??
									null
								}
								selectedModelId={
									activeSession.model ??
									workbench?.composer.model ??
									null
								}
								reasoningEffort={
									activeSession.reasoningEffort ??
									workbench?.composer.reasoningEffort
								}
								message={composerText}
								mode={chatMode}
								approvalMode={approvals.mode}
								isSending={running || sending}
								isCancelling={
									workbench?.activeRun.status === "cancelling"
								}
								selectedWorkspace={selectedWorkspace}
								showContextUsage={false}
								allowedModes={["ask", "agent", "plan"]}
								allowQueue={false}
								layout="mobile"
								onDraftChange={updateComposerText}
								onModeChange={(mode): void => {
									void updateSessionMode(mode);
								}}
								onApprovalModeChange={requestApprovalMode}
								onProviderModelChange={(
									provider,
									model,
								): void => {
									void updateSessionModel(
										provider,
										model,
									).catch((modelError: unknown): void => {
										void message.error(
											errorMessage(modelError),
										);
									});
								}}
								onReasoningEffortChange={(effort): void => {
									void updateReasoningEffort(effort).catch(
										(reasoningError: unknown): void => {
											void message.error(
												errorMessage(reasoningError),
											);
										},
									);
								}}
								onCancel={(): void => {
									const requestId =
										workbench?.activeRun.requestId;
									if (requestId !== undefined)
										void cancelChatMessage(
											requestId,
										).finally((): void =>
											scheduleRefresh(activeSession.id),
										);
								}}
								onSubmit={(text, modeOverride): void => {
									void submitMessage(
										text,
										undefined,
										modeOverride,
									);
								}}
							/>
						</div>
					</section>
				) : activeScreen === "approvals" ? (
					<section
						className={styles.scrollScreen}
						data-testid="remote-approvals-screen"
					>
						<Typography.Paragraph
							type="secondary"
							className={styles.screenDescription}
						>
							{t("remote.approval.description")}
						</Typography.Paragraph>
						<div className={styles.approvalSurface}>
							<div className={styles.approvalModeRow}>
								<div>
									<Typography.Text strong>
										{t("remote.approval.mode")}
									</Typography.Text>
									<Typography.Text
										type="secondary"
										className={styles.fieldHint}
									>
										{t("remote.approval.modeHint")}
									</Typography.Text>
								</div>
								<Select<ApprovalMode>
									value={approvals.mode}
									loading={approvalModeBusy}
									options={[
										{
											value: "manual",
											label: t(
												"composer.approvalMode.manual",
											),
										},
										{
											value: "auto-safe",
											label: t(
												"composer.approvalMode.autoSafe",
											),
										},
										{
											value: "full-trust",
											label: t(
												"composer.approvalMode.fullTrust",
											),
										},
									]}
									onChange={requestApprovalMode}
								/>
							</div>
							{pendingApproval === null ? (
								<Empty
									image={Empty.PRESENTED_IMAGE_SIMPLE}
									description={t("remote.approval.empty")}
								/>
							) : (
								<ApprovalDialog
									pendingApproval={pendingApproval}
									isApproving={approvalBusy === "approve"}
									isRejecting={approvalBusy === "reject"}
									isApprovalAutoSafeEnabling={
										approvalBusy === "auto"
									}
									onApprove={(id, consent): void => {
										void decideApproval(
											"approve",
											id,
											consent,
										);
									}}
									onApproveAndEnableAutoSafe={(
										id,
										consent,
									): void => {
										void decideApproval(
											"auto",
											id,
											consent,
										);
									}}
									onReject={(id): void => {
										void decideApproval("reject", id);
									}}
								/>
							)}
						</div>
					</section>
				) : activeScreen === "trajectory" && activeSession !== null ? (
					<RemoteTraceScreen
						busy={traceBusy}
						summary={traceSummary}
						page={tracePage}
						onSelect={(record: TraceRecord): void => {
							setTraceBusy(true);
							void fetchTraceDetail(
								activeSession.id,
								record.recordId,
							)
								.then(setTraceDetail)
								.finally((): void => setTraceBusy(false));
						}}
						onLoadMore={(): void => {
							if (tracePage?.nextCursor === undefined) return;
							setTraceBusy(true);
							void fetchTracePage({
								sessionId: activeSession.id,
								cursor: tracePage.nextCursor,
								limit: 100,
							})
								.then((next): void =>
									setTracePage({
										...next,
										records: [
											...tracePage.records,
											...next.records,
										],
									}),
								)
								.finally((): void => setTraceBusy(false));
						}}
					/>
				) : (
					<Empty
						className={styles.screenEmpty}
						description={t("remote.home.openSessionFirst")}
					/>
				)}
			</div>

			<RemoteNavigationDrawer
				open={navigationOpen}
				activeScreen={activeScreen}
				activeSessionId={activeSession?.id}
				sessions={sessions}
				workspaces={workspaces}
				onClose={(): void => setNavigationOpen(false)}
				onNavigate={handlePrimaryNavigation}
				onOpenSession={(session: SessionMetadata): void => {
					void openRemoteSession(session).catch(
						(openError: unknown): void =>
							setError(describeError(openError)),
					);
				}}
			/>

			<Drawer
				title={t("remote.newSession")}
				open={createOpen}
				placement="bottom"
				size="auto"
				onClose={(): void => setCreateOpen(false)}
			>
				<Space
					orientation="vertical"
					size="middle"
					className={styles.drawerForm}
				>
					<Typography.Text>
						{t("remote.chooseProject")}
					</Typography.Text>
					<Select
						value={createWorkspaceId}
						options={workspaces.map(
							(workspace: WorkspaceConfig) => ({
								value: workspace.id,
								label: workspace.name,
							}),
						)}
						onChange={setCreateWorkspaceId}
					/>
					<Button
						type="primary"
						size="large"
						loading={sending}
						disabled={createWorkspaceId === undefined}
						onClick={(): void => {
							void createRemoteSession();
						}}
					>
						{t("remote.create")}
					</Button>
				</Space>
			</Drawer>

			<FullTrustConfirmationModal
				open={fullTrustOpen}
				value={fullTrustText}
				token={FULL_TRUST_CONFIRMATION_TEXT}
				loading={approvalModeBusy}
				title={t("app.fullTrust.title")}
				enableLabel={t("app.fullTrust.actions.enable")}
				cancelLabel={t("app.fullTrust.actions.cancel")}
				description={t("app.fullTrust.description")}
				confirmationPrefix={t("app.fullTrust.confirmationPrefix")}
				confirmationSuffix={t("app.fullTrust.confirmationSuffix")}
				onChange={setFullTrustText}
				onConfirm={(): void => {
					void saveApprovalMode("full-trust", fullTrustText);
				}}
				onCancel={(): void => {
					setFullTrustOpen(false);
					setFullTrustText("");
				}}
			/>

			<Drawer
				title={t("remote.toolBudget.title")}
				open={
					workbench?.pendingToolBudget !== null &&
					workbench?.pendingToolBudget !== undefined
				}
				placement="bottom"
				size="auto"
				closable={false}
			>
				<ToolBudgetDialog
					pendingToolBudget={workbench?.pendingToolBudget ?? null}
					onContinue={(budgetId): void => {
						void continueToolBudget(budgetId).finally((): void => {
							if (activeSession !== null)
								scheduleRefresh(activeSession.id);
						});
					}}
					onStop={(budgetId): void => {
						void stopToolBudget(budgetId).finally((): void => {
							if (activeSession !== null)
								scheduleRefresh(activeSession.id);
						});
					}}
					onCancel={(): void => {
						const requestId = workbench?.activeRun.requestId;
						if (requestId !== undefined)
							void cancelChatMessage(requestId).finally(
								(): void => {
									if (activeSession !== null)
										scheduleRefresh(activeSession.id);
								},
							);
					}}
				/>
			</Drawer>

			<Drawer
				title={plan?.title ?? t("remote.plan.title")}
				open={planOpen}
				placement="bottom"
				height="80dvh"
				onClose={(): void => setPlanOpen(false)}
			>
				{plan === null ? (
					<Empty />
				) : plan.status === "clarification_required" ? (
					<ClarificationDialog
						planId={plan.planId}
						title={plan.title}
						question={plan.question}
						recommendedReplies={plan.recommendedReplies}
						isSubmitting={planBusy}
						errorMessage={null}
						onSubmit={(reply): void => {
							setPlanBusy(true);
							void submitPlanClarification(plan.planId, { reply })
								.then(setPlan)
								.finally((): void => setPlanBusy(false));
						}}
						onSkip={(): void => {
							setPlanBusy(true);
							void submitPlanClarification(plan.planId, {
								skip: true,
							})
								.then(setPlan)
								.finally((): void => setPlanBusy(false));
						}}
					/>
				) : plan.status === "ready" ? (
					<PlanApprovalDialog
						plan={plan}
						isApproving={planBusy}
						isRevising={planBusy}
						errorMessage={null}
						onRevise={(planId, feedback): void => {
							setPlanBusy(true);
							void revisePlan(planId, feedback)
								.then(setPlan)
								.finally((): void => setPlanBusy(false));
						}}
						onApprove={(planId): void => {
							setPlanBusy(true);
							void approvePlan(planId)
								.then((): void => {
									setPlanOpen(false);
									if (activeSession !== null)
										scheduleRefresh(activeSession.id);
								})
								.finally((): void => setPlanBusy(false));
						}}
					/>
				) : (
					<Space
						orientation="vertical"
						size="middle"
						className={styles.drawerForm}
					>
						<Tag>{plan.status}</Tag>
						<Typography.Paragraph className={styles.planMarkdown}>
							{plan.markdown ?? plan.previewMarkdown}
						</Typography.Paragraph>
					</Space>
				)}
			</Drawer>

			<Drawer
				title={t("remote.trajectory.detail")}
				open={traceDetail !== null}
				placement="bottom"
				size="82dvh"
				onClose={(): void => setTraceDetail(null)}
			>
				<TraceInspector detail={traceDetail} loading={traceBusy} />
			</Drawer>
		</main>
	);
}

export default RemoteApp;

import {
	lazy,
	Suspense,
	useCallback,
	useEffect,
	useRef,
	useState,
} from "react";
import {
	Alert,
	App,
	Button,
	Descriptions,
	Dropdown,
	Drawer,
	Empty,
	Input,
	Modal,
	Segmented,
	Select,
	Space,
	Spin,
	Tag,
	Typography,
} from "antd";
import { useTranslation } from "react-i18next";
import { Icon } from "@/assets/icons";
import MessageList from "@/widgets/conversation/MessageList";
import ApprovalDialog from "@/widgets/approval/ApprovalDialog";
import ToolBudgetDialog from "@/widgets/approval/ToolBudgetDialog";
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
	subscribeSession,
	unsubscribeSession,
} from "@/platform/rpc/session-api";
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
import RemoteBottomNavigation from "./RemoteBottomNavigation";
import RemoteSessionHome from "./RemoteSessionHome";
import RemoteTraceScreen from "./RemoteTraceScreen";
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
const ReactJsonView = lazy(() => import("@microlink/react-json-view"));

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
	const [activeSession, setActiveSession] = useState<SessionMetadata | null>(
		null,
	);
	const [activeScreen, setActiveScreen] =
		useState<RemotePrimaryScreen>("sessions");
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
	const [planInput, setPlanInput] = useState<string>("");
	const [planBusy, setPlanBusy] = useState<boolean>(false);
	const [traceSummary, setTraceSummary] = useState<TraceSummary | null>(null);
	const [tracePage, setTracePage] = useState<TracePage | null>(null);
	const [traceDetail, setTraceDetail] = useState<TraceDetail | null>(null);
	const [traceBusy, setTraceBusy] = useState<boolean>(false);
	const activeSessionIdRef = useRef<string | null>(null);
	const pendingApprovalCountRef = useRef<number>(0);
	const refreshTimerRef = useRef<number | null>(null);

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
		const [sessionResult, workspaceResult] = await Promise.all([
			fetchSessions(),
			fetchWorkspaces(),
		]);
		setSessions(sessionResult.sessions);
		setWorkspaces(workspaceResult.workspaces);
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
				setConnectionStatus("disconnected");
				setError(errorMessage(refreshError));
			}
		},
		[loadPlanFromOpenResult],
	);

	const scheduleRefresh = useCallback(
		(sessionId: string): void => {
			if (refreshTimerRef.current !== null)
				window.clearTimeout(refreshTimerRef.current);
			refreshTimerRef.current = window.setTimeout((): void => {
				refreshTimerRef.current = null;
				void refreshActiveSession(sessionId);
			}, 90);
		},
		[refreshActiveSession],
	);

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
				setConnectionStatus("connected");
				await refreshCatalog();
				removeEventListener = await onBackendEvent((event): void => {
					if (event.event === "session.catalog.updated")
						void refreshCatalog();
					const selectedId: string | null =
						activeSessionIdRef.current;
					if (selectedId !== null && event.sessionId === selectedId)
						scheduleRefresh(selectedId);
				});
			} catch (startupError: unknown) {
				if (disposed) return;
				setConnectionStatus("disconnected");
				setError(errorMessage(startupError));
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
					.then((): void => scheduleRefresh(selectedId));
			} else {
				void refreshCatalog();
			}
		});
		const removeConnectionState = onBackendConnectionStateChanged(
			(state): void => {
				setConnectionStatus(state);
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
					setConnectionStatus("disconnected");
					setError(errorMessage(visibilityError));
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
			if (refreshTimerRef.current !== null)
				window.clearTimeout(refreshTimerRef.current);
		};
	}, [refreshCatalog, scheduleRefresh, showScreen]);

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
			mode: chatMode,
			retryFromRequestId,
		})
			.catch((sendError: unknown): void => {
				setComposerText(trimmed);
				sessionStorage.setItem(
					getRemoteDraftStorageKey(activeSession.id),
					trimmed,
				);
				setError(errorMessage(sendError));
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
	const screenTitle: string =
		activeScreen === "conversation"
			? (activeSession?.title ?? t("remote.navigation.conversation"))
			: t(
					`remote.navigation.${activeScreen === "trajectory" ? "trajectory" : activeScreen}`,
				);
	const backTarget: RemotePrimaryScreen =
		activeScreen === "conversation"
			? "sessions"
			: activeSession === null
				? "sessions"
				: "conversation";
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
				{activeScreen === "sessions" ? (
					<span className={styles.logoMark} aria-hidden="true">
						<Icon name="remote" />
					</span>
				) : (
					<Button
						type="text"
						aria-label={t("remote.back")}
						icon={<Icon name="arrow-left" />}
						onClick={(): void => showScreen(backTarget)}
					/>
				)}
				<Typography.Text strong ellipsis className={styles.topTitle}>
					{activeScreen === "sessions" ? "Daedalus" : screenTitle}
				</Typography.Text>
				<div className={styles.topActions}>
					<span
						className={styles.connectionState}
						role="status"
						aria-label={t(`remote.connection.${connectionStatus}`)}
					>
						<span
							className={`${styles.connectionDot} ${connectionStatus === "connected" ? styles.connectionDotConnected : ""}`}
						/>
						<span>
							{t(`remote.connection.${connectionStatus}`)}
						</span>
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
										setError(errorMessage(refreshError)),
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
									setError(errorMessage(openError)),
							);
						}}
					/>
				) : activeScreen === "conversation" &&
				  activeSession !== null ? (
					<section className={styles.conversationScreen}>
						<div className={styles.timeline}>
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
							<div className={styles.composerMeta}>
								<Segmented<Exclude<ChatMode, "goal">>
									value={chatMode}
									disabled={running || sending}
									options={[
										{
											value: "ask",
											label: t("remote.mode.ask"),
										},
										{
											value: "agent",
											label: t("remote.mode.agent"),
										},
										{
											value: "plan",
											label: t("remote.mode.plan"),
										},
									]}
									onChange={setChatMode}
								/>
								<Typography.Text
									type="secondary"
									className={styles.runState}
								>
									<span
										className={`${styles.runStateDot} ${running ? styles.runStateDotActive : ""}`}
									/>
									{t(
										running
											? "remote.activity.running"
											: "remote.activity.ready",
									)}
								</Typography.Text>
							</div>
							<div className={styles.composerRow}>
								<Input.TextArea
									variant="borderless"
									value={composerText}
									autoSize={{ minRows: 1, maxRows: 6 }}
									placeholder={t(
										"remote.composerPlaceholder",
									)}
									disabled={running || sending}
									onChange={(event): void =>
										updateComposerText(event.target.value)
									}
								/>
								{running &&
								workbench?.activeRun.requestId !== undefined ? (
									<Button
										aria-label={t("composer.send.stop")}
										danger
										shape="circle"
										size="large"
										icon={<Icon name="stop" />}
										onClick={(): void => {
											void cancelChatMessage(
												workbench.activeRun.requestId!,
											).finally((): void =>
												scheduleRefresh(
													activeSession.id,
												),
											);
										}}
									/>
								) : (
									<Button
										aria-label={t("composer.send.send")}
										type="primary"
										shape="circle"
										size="large"
										icon={<Icon name="send" />}
										loading={sending}
										disabled={
											composerText.trim().length === 0
										}
										onClick={(): void => {
											void submitMessage(composerText);
										}}
									/>
								)}
							</div>
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

			<RemoteBottomNavigation
				activeScreen={activeScreen}
				hasActiveSession={activeSession !== null}
				pendingApprovalCount={approvals.pending.length}
				onNavigate={handlePrimaryNavigation}
			/>

			<Drawer
				title={t("remote.newSession")}
				open={createOpen}
				placement="bottom"
				height="auto"
				onClose={(): void => setCreateOpen(false)}
			>
				<Space
					direction="vertical"
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

			<Modal
				open={fullTrustOpen}
				title={t("app.fullTrust.title")}
				okText={t("app.fullTrust.actions.enable")}
				cancelText={t("app.fullTrust.actions.cancel")}
				okButtonProps={{
					danger: true,
					disabled: fullTrustText !== FULL_TRUST_CONFIRMATION_TEXT,
				}}
				confirmLoading={approvalModeBusy}
				onOk={(): void => {
					void saveApprovalMode("full-trust", fullTrustText);
				}}
				onCancel={(): void => {
					setFullTrustOpen(false);
					setFullTrustText("");
				}}
			>
				<Typography.Paragraph>
					{t("app.fullTrust.description")}
				</Typography.Paragraph>
				<Typography.Paragraph type="secondary">
					{t("app.fullTrust.confirmationPrefix")}{" "}
					<Typography.Text code>
						{FULL_TRUST_CONFIRMATION_TEXT}
					</Typography.Text>{" "}
					{t("app.fullTrust.confirmationSuffix")}
				</Typography.Paragraph>
				<Input
					value={fullTrustText}
					placeholder={FULL_TRUST_CONFIRMATION_TEXT}
					disabled={approvalModeBusy}
					onChange={(event): void =>
						setFullTrustText(event.target.value)
					}
				/>
			</Modal>

			<Drawer
				title={t("remote.toolBudget.title")}
				open={
					workbench?.pendingToolBudget !== null &&
					workbench?.pendingToolBudget !== undefined
				}
				placement="bottom"
				height="auto"
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
				) : (
					<Space
						direction="vertical"
						size="middle"
						className={styles.drawerForm}
					>
						<Tag>{plan.status}</Tag>
						<Typography.Paragraph className={styles.planMarkdown}>
							{plan.markdown ?? plan.previewMarkdown}
						</Typography.Paragraph>
						{plan.question.length > 0 ? (
							<Alert type="info" showIcon title={plan.question} />
						) : null}
						{plan.recommendedReplies.map((reply) => (
							<Button
								key={reply.text}
								block
								onClick={(): void => setPlanInput(reply.text)}
							>
								{reply.label}
							</Button>
						))}
						<Input.TextArea
							value={planInput}
							autoSize={{ minRows: 2, maxRows: 6 }}
							onChange={(event): void =>
								setPlanInput(event.target.value)
							}
							placeholder={t("remote.plan.feedback")}
						/>
						<Space wrap>
							<Button
								loading={planBusy}
								disabled={planInput.trim().length === 0}
								onClick={(): void => {
									setPlanBusy(true);
									void submitPlanClarification(plan.planId, {
										reply: planInput.trim(),
									})
										.then(setPlan)
										.finally((): void =>
											setPlanBusy(false),
										);
								}}
							>
								{t("remote.plan.clarify")}
							</Button>
							<Button
								loading={planBusy}
								disabled={planInput.trim().length === 0}
								onClick={(): void => {
									setPlanBusy(true);
									void revisePlan(
										plan.planId,
										planInput.trim(),
									)
										.then(setPlan)
										.finally((): void =>
											setPlanBusy(false),
										);
								}}
							>
								{t("remote.plan.revise")}
							</Button>
							<Button
								type="primary"
								loading={planBusy}
								disabled={plan.status !== "ready"}
								onClick={(): void => {
									setPlanBusy(true);
									void approvePlan(plan.planId)
										.then((): void => {
											setPlanOpen(false);
											if (activeSession !== null)
												scheduleRefresh(
													activeSession.id,
												);
										})
										.finally((): void =>
											setPlanBusy(false),
										);
								}}
							>
								{t("remote.plan.approve")}
							</Button>
						</Space>
					</Space>
				)}
			</Drawer>

			<Drawer
				title={t("remote.trajectory.detail")}
				open={traceDetail !== null}
				placement="bottom"
				height="82dvh"
				onClose={(): void => setTraceDetail(null)}
			>
				{traceDetail !== null ? (
					<div className={styles.traceDetail}>
						<Descriptions
							column={1}
							size="small"
							items={[
								{
									key: "id",
									label: "recordId",
									children: traceDetail.record.recordId,
								},
								{
									key: "request",
									label: "requestId",
									children: traceDetail.record.requestId,
								},
								{
									key: "level",
									label: "detailLevel",
									children: traceDetail.detailLevel,
								},
							]}
						/>
						<div className={styles.traceJson}>
							<Suspense fallback={<Spin />}>
								<ReactJsonView
									src={{
										promptSections:
											traceDetail.promptSections,
										request: traceDetail.request,
										response: traceDetail.response,
										redactions: traceDetail.redactions,
									}}
									name={false}
									style={{
										width: "100%",
										maxHeight: "52dvh",
										overflow: "auto",
										backgroundColor: "transparent",
										fontFamily:
											"var(--ds-font-family-code)",
										fontSize: 12,
										lineHeight: 1.5,
									}}
									theme="rjv-default"
									iconStyle="triangle"
									indentWidth={2}
									collapsed={false}
									collapseStringsAfterLength={240}
									displayDataTypes={false}
									enableClipboard={true}
									onEdit={false}
									onAdd={false}
									onDelete={false}
								/>
							</Suspense>
						</div>
					</div>
				) : null}
			</Drawer>
		</main>
	);
}

export default RemoteApp;

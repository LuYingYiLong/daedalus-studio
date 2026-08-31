import { useCallback, useEffect, useRef, useState, type TransitionEvent } from "react";
import { useTranslation } from "react-i18next";
import type { SessionMetadata, WorkspaceConfig } from "@/platform/rpc/types";
import { fetchSessions } from "@/platform/rpc/session-api";

const CHAT_SURFACE_POST_TRANSITION_DELAY_MS: number = 80;
const CHAT_SURFACE_TRANSITION_FALLBACK_MS: number = 500;

export type NewSessionOptions = {
	restoreTemporaryDraft?: boolean;
	initialDraft?: string;
};

type UseHomeSurfaceControllerParams = {
	onNewSession: (options?: NewSessionOptions) => void;
	onNewUnboundSession: () => void;
	onNewWorkspaceSession: (
		workspace: WorkspaceConfig,
		environment?: "local" | "worktree",
	) => void;
	onSessionSelect: (session: SessionMetadata) => void;
};

export type HomeSurfaceController = {
	mainSurface: "chat" | "scheduledTasks";
	chatSurfaceSettled: boolean;
	scheduledTaskAttentionCount: number;
	composerInputRequest: { requestId: number; message: string } | null;
	handleHomeStarterSelect: (prompt: string) => void;
	transitionToChatSurface: () => void;
	showScheduledTasksSurface: () => void;
	handleScheduledTasksOverlayTransitionEnd: (
		event: TransitionEvent<HTMLDivElement>,
	) => void;
	beginNewSessionSurface: (options?: NewSessionOptions) => void;
	requestNewSessionSurface: () => void;
	requestNewUnboundSessionSurface: () => void;
	requestNewWorkspaceSessionSurface: (
		workspace: WorkspaceConfig,
		environment?: "local" | "worktree",
	) => void;
	openScheduledTaskSession: (sessionId: string) => void;
	createScheduledTask: () => void;
};

function useHomeSurfaceController({
	onNewSession,
	onNewUnboundSession,
	onNewWorkspaceSession,
	onSessionSelect,
}: UseHomeSurfaceControllerParams): HomeSurfaceController {
	const { t } = useTranslation();
	const [mainSurface, setMainSurface] = useState<
		"chat" | "scheduledTasks"
	>("chat");
	const [chatSurfaceSettled, setChatSurfaceSettled] =
		useState<boolean>(true);
	const [scheduledTaskAttentionCount, setScheduledTaskAttentionCount] =
		useState<number>(0);
	const [composerInputRequest, setComposerInputRequest] = useState<{
		requestId: number;
		message: string;
	} | null>(null);
	const chatSurfaceSettleTimerRef = useRef<number | null>(null);

	const handleHomeStarterSelect = useCallback((prompt: string): void => {
		setComposerInputRequest(
			(currentRequest): { requestId: number; message: string } => ({
				requestId: (currentRequest?.requestId ?? 0) + 1,
				message: prompt,
			}),
		);
	}, []);

	const clearChatSurfaceSettleTimer = useCallback((): void => {
		if (chatSurfaceSettleTimerRef.current === null) return;
		window.clearTimeout(chatSurfaceSettleTimerRef.current);
		chatSurfaceSettleTimerRef.current = null;
	}, []);

	const transitionToChatSurface = useCallback((): void => {
		const wasScheduledTasksSurface: boolean =
			mainSurface === "scheduledTasks";
		clearChatSurfaceSettleTimer();
		setMainSurface("chat");

		if (!wasScheduledTasksSurface) {
			setChatSurfaceSettled(true);
			return;
		}

		setChatSurfaceSettled(false);
		chatSurfaceSettleTimerRef.current = window.setTimeout((): void => {
			chatSurfaceSettleTimerRef.current = null;
			setChatSurfaceSettled(true);
		}, CHAT_SURFACE_TRANSITION_FALLBACK_MS);
	}, [clearChatSurfaceSettleTimer, mainSurface]);

	const showScheduledTasksSurface = useCallback((): void => {
		clearChatSurfaceSettleTimer();
		setChatSurfaceSettled(false);
		setMainSurface("scheduledTasks");
	}, [clearChatSurfaceSettleTimer]);

	const handleScheduledTasksOverlayTransitionEnd = useCallback(
		(event: TransitionEvent<HTMLDivElement>): void => {
			if (
				event.target !== event.currentTarget ||
				mainSurface !== "chat"
			) {
				return;
			}
			if (event.propertyName === "opacity") {
				if (
					window.getComputedStyle(event.currentTarget).transform !==
					"none"
				) {
					return;
				}
			} else if (event.propertyName !== "transform") {
				return;
			}

			clearChatSurfaceSettleTimer();
			chatSurfaceSettleTimerRef.current = window.setTimeout((): void => {
				chatSurfaceSettleTimerRef.current = null;
				setChatSurfaceSettled(true);
			}, CHAT_SURFACE_POST_TRANSITION_DELAY_MS);
		},
		[clearChatSurfaceSettleTimer, mainSurface],
	);

	useEffect((): (() => void) => {
		return (): void => {
			clearChatSurfaceSettleTimer();
		};
	}, [clearChatSurfaceSettleTimer]);

	const beginNewSessionSurface = useCallback(
		(options?: NewSessionOptions): void => {
			transitionToChatSurface();
			onNewSession(options);
		},
		[onNewSession, transitionToChatSurface],
	);

	const requestNewSessionSurface = useCallback((): void => {
		beginNewSessionSurface();
	}, [beginNewSessionSurface]);

	const requestNewUnboundSessionSurface = useCallback((): void => {
		transitionToChatSurface();
		onNewUnboundSession();
	}, [onNewUnboundSession, transitionToChatSurface]);

	const requestNewWorkspaceSessionSurface = useCallback(
		(
			workspace: WorkspaceConfig,
			environment: "local" | "worktree" = "local",
		): void => {
			transitionToChatSurface();
			onNewWorkspaceSession(workspace, environment);
		},
		[onNewWorkspaceSession, transitionToChatSurface],
	);

	const openScheduledTaskSession = useCallback(
		(sessionId: string): void => {
			void fetchSessions()
				.then((result): void => {
					const session: SessionMetadata | undefined =
						result.sessions.find(
							(candidate: SessionMetadata): boolean =>
								candidate.id === sessionId,
						);
					if (session !== undefined) {
						transitionToChatSurface();
						onSessionSelect(session);
					}
				})
				.catch((): void => {});
		},
		[onSessionSelect, transitionToChatSurface],
	);

	useEffect((): (() => void) => {
		const refresh = (): void => {
			void window.electronAPI.scheduledTasks
				.list()
				.then((result): void =>
					setScheduledTaskAttentionCount(result.attentionCount),
				);
		};
		refresh();
		const offChanged = window.electronAPI.scheduledTasks.onChanged(refresh);
		const offNavigate = window.electronAPI.scheduledTasks.onNavigate(
			(target): void => {
				if (target.sessionId !== null) {
					openScheduledTaskSession(target.sessionId);
					return;
				}
				showScheduledTasksSurface();
			},
		);
		return (): void => {
			offChanged();
			offNavigate();
		};
	}, [openScheduledTaskSession, showScheduledTasksSurface]);

	const createScheduledTask = useCallback((): void => {
		const prompt: string = t("scheduledTasks.prefill", {
			defaultValue: "帮我安排一个定时任务：",
		});
		beginNewSessionSurface({
			restoreTemporaryDraft: false,
			initialDraft: prompt,
		});
	}, [beginNewSessionSurface, t]);

	return {
		mainSurface,
		chatSurfaceSettled,
		scheduledTaskAttentionCount,
		composerInputRequest,
		handleHomeStarterSelect,
		transitionToChatSurface,
		showScheduledTasksSurface,
		handleScheduledTasksOverlayTransitionEnd,
		beginNewSessionSurface,
		requestNewSessionSurface,
		requestNewUnboundSessionSurface,
		requestNewWorkspaceSessionSurface,
		openScheduledTaskSession,
		createScheduledTask,
	};
}

export default useHomeSurfaceController;

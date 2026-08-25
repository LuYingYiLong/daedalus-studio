import { useEffect, type Dispatch, type MutableRefObject, type SetStateAction } from "react";
import { fetchSessions } from "@/platform/rpc/session-api";
import type { SessionMetadata } from "@/platform/rpc/types";
import { getRecentSessions } from "../app-helpers";
import { getSessionTitle } from "../session-title";

export type TraySessionIntegrationParams = {
	recentSessions: SessionMetadata[];
	recentSessionsRef: MutableRefObject<SessionMetadata[]>;
	handleNewSession: () => Promise<void>;
	handleSessionSelect: (session: SessionMetadata) => Promise<void>;
	setRecentSessions: Dispatch<SetStateAction<SessionMetadata[]>>;
	showTransientError: (message: string) => void;
};

export default function useTraySessionIntegration({
	recentSessions,
	recentSessionsRef,
	handleNewSession,
	handleSessionSelect,
	setRecentSessions,
	showTransientError,
}: TraySessionIntegrationParams): void {
	useEffect((): void => {
		void window.electronAPI.tray
			.updateRecentSessions(
				recentSessions.map(
					(session: SessionMetadata): TrayRecentSession => ({
						id: session.id,
						title: getSessionTitle(session, session.id),
					}),
				),
			)
			.catch((error: unknown): void => {
				console.error("[App] tray recent session update failed", error);
			});
	}, [recentSessions]);

	useEffect((): (() => void) => {
		const removeNewChatListener: () => void =
			window.electronAPI.tray.onNewChat((): void => {
				void handleNewSession();
			});
		const removeOpenSessionListener: () => void =
			window.electronAPI.tray.onOpenSession((sessionId: string): void => {
				void (async (): Promise<void> => {
					const cachedSession: SessionMetadata | undefined =
						recentSessionsRef.current.find(
							(session: SessionMetadata): boolean =>
								session.id === sessionId,
						);
					if (cachedSession !== undefined) {
						await handleSessionSelect(cachedSession);
						return;
					}

					const sessionList = await fetchSessions();
					setRecentSessions(getRecentSessions(sessionList.sessions));
					const session: SessionMetadata | undefined =
						sessionList.sessions.find(
							(item: SessionMetadata): boolean => item.id === sessionId,
						);
					if (session === undefined) {
						showTransientError("Session not found");
						return;
					}

					await handleSessionSelect(session);
				})().catch((error: unknown): void => {
					showTransientError(
						error instanceof Error
							? error.message
							: "Failed to open session",
					);
					console.error("[App] tray open session failed", error);
				});
			});

		return (): void => {
			removeNewChatListener();
			removeOpenSessionListener();
		};
	}, []);
}

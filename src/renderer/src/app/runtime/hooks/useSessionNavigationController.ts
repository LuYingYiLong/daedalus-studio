import { useCallback, useEffect, type MutableRefObject } from "react";
import { useTranslation } from "react-i18next";
import type { SessionMetadata } from "@/platform/rpc/types";
import { fetchSessions } from "@/platform/rpc/session-api";
import {
	removeSessionFromNavigationHistory,
	SESSION_NAVIGATION_EVENT,
} from "@/domain/session/session-navigation-history";
import { getRecentSessions } from "../app-helpers";

export type SessionNavigationSelectOptions = {
	recordNavigation?: boolean;
};

type UseSessionNavigationControllerParams = {
	activeSessionIdRef: MutableRefObject<string | null>;
	setRecentSessions: (sessions: SessionMetadata[]) => void;
	onSessionSelect: (
		session: SessionMetadata,
		options?: SessionNavigationSelectOptions,
	) => Promise<void>;
	showTransientError: (message: string) => void;
	onInfo: (message: string) => void;
	onError: (message: string) => void;
};

export type SessionNavigationController = {
	openForkSource: (sessionId: string) => Promise<void>;
};

function useSessionNavigationController({
	activeSessionIdRef,
	setRecentSessions,
	onSessionSelect,
	showTransientError,
	onInfo,
	onError,
}: UseSessionNavigationControllerParams): SessionNavigationController {
	const { t } = useTranslation();

	useEffect((): (() => void) => {
		function handleSessionNavigation(event: Event): void {
			const sessionId: unknown = (event as CustomEvent<unknown>).detail;
			if (
				typeof sessionId !== "string" ||
				sessionId.length === 0 ||
				sessionId === activeSessionIdRef.current
			) {
				return;
			}

			void (async (): Promise<void> => {
				try {
					const sessionList = await fetchSessions();
					const session: SessionMetadata | undefined =
						sessionList.sessions.find(
							(candidate: SessionMetadata): boolean =>
								candidate.id === sessionId,
						);
					if (session === undefined) {
						removeSessionFromNavigationHistory(sessionId);
						showTransientError("Session not found");
						return;
					}
					setRecentSessions(getRecentSessions(sessionList.sessions));
					await onSessionSelect(session, { recordNavigation: false });
				} catch (error: unknown) {
					showTransientError(
						error instanceof Error
							? error.message
							: "Failed to open session",
					);
					console.error(
						"[App] navigate session history failed",
						error,
					);
				}
			})();
		}

		window.addEventListener(SESSION_NAVIGATION_EVENT, handleSessionNavigation);
		return (): void => {
			window.removeEventListener(
				SESSION_NAVIGATION_EVENT,
				handleSessionNavigation,
			);
		};
	}, [
		activeSessionIdRef,
		onSessionSelect,
		setRecentSessions,
		showTransientError,
	]);

	const openForkSource = useCallback(
		async (sessionId: string): Promise<void> => {
			try {
				const sessionList = await fetchSessions();
				const source: SessionMetadata | undefined =
					sessionList.sessions.find(
						(session: SessionMetadata): boolean =>
							session.id === sessionId,
					);
				if (source === undefined) {
					onInfo(t("chat.fork.errors.sourceUnavailable"));
					return;
				}
				await onSessionSelect(source);
			} catch (error: unknown) {
				console.error("[App] open fork source failed", error);
				onError(
					error instanceof Error
						? error.message
						: t("chat.fork.errors.openSource"),
				);
			}
		},
		[onError, onInfo, onSessionSelect, t],
	);

	return { openForkSource };
}

export default useSessionNavigationController;

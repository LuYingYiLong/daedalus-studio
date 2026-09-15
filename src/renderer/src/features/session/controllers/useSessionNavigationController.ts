import { useCallback, useEffect, type MutableRefObject } from "react";
import { useTranslation } from "react-i18next";
import type { SessionMetadata } from "@/platform/rpc/types";
import { fetchSessions, openSession } from "@/platform/rpc/session-api";
import {
	removeSessionFromNavigationHistory,
	SESSION_NAVIGATION_EVENT,
	SESSION_SURFACE_NAVIGATION_EVENT,
	type SessionNavigationSurface,
	type SessionNavigationTarget,
} from "@/domain/session/session-navigation-history";
import { getRecentSessions } from "@/domain/application/app-helpers";

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

function parseNavigationTarget(detail: unknown): SessionNavigationTarget | null {
	if (typeof detail === "string" && detail.length > 0) {
		return { sessionId: detail, surface: "chat" };
	}
	if (typeof detail !== "object" || detail === null) {
		return null;
	}
	const candidate: Record<string, unknown> = detail as Record<string, unknown>;
	if (
		typeof candidate.sessionId !== "string" ||
		candidate.sessionId.length === 0 ||
		(candidate.surface !== "chat" && candidate.surface !== "flow")
	) {
		return null;
	}
	return {
		sessionId: candidate.sessionId,
		surface: candidate.surface,
	};
}

function getSessionNavigationSurface(
	session: SessionMetadata,
): SessionNavigationSurface {
	return session.surface === "flow_branch" ? "flow" : "chat";
}

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
			const navigationTarget: SessionNavigationTarget | null =
				parseNavigationTarget((event as CustomEvent<unknown>).detail);
			if (
				navigationTarget === null ||
				navigationTarget.sessionId === activeSessionIdRef.current
			) {
				return;
			}

			void (async (): Promise<void> => {
				try {
					const sessionList = await fetchSessions();
					let session: SessionMetadata | undefined =
						navigationTarget.surface === "flow"
							? undefined
							: sessionList.sessions.find(
									(candidate: SessionMetadata): boolean =>
										candidate.id === navigationTarget.sessionId
								);
					if (session === undefined) {
						const opened = await openSession(navigationTarget.sessionId);
						session = opened.metadata;
					}
					if (session === undefined) {
						removeSessionFromNavigationHistory(
							navigationTarget.sessionId,
						);
						showTransientError("Session not found");
						return;
					}
					setRecentSessions(getRecentSessions(sessionList.sessions));
					await onSessionSelect(session, { recordNavigation: false });
					window.dispatchEvent(
						new CustomEvent<SessionNavigationSurface>(
							SESSION_SURFACE_NAVIGATION_EVENT,
							{
								detail: getSessionNavigationSurface(session),
							},
						),
					);
				} catch (error: unknown) {
					if (navigationTarget.surface === "flow") {
						removeSessionFromNavigationHistory(
							navigationTarget.sessionId,
						);
					}
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

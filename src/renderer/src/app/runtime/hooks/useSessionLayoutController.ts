import {
	useCallback,
	type Dispatch,
	type MutableRefObject,
	type SetStateAction,
} from "react";
import type {
	ClientPreferences,
	WorkspaceSidebarPreferences,
} from "@/platform/rpc/client-preferences-api";
import {
	dispatchClientPreferencesChanged,
	updateClientPreferences,
} from "@/platform/rpc/client-preferences-api";
import { deleteSession } from "@/platform/rpc/session-api";
import type { SessionLayoutMap, SessionLayoutPreferences } from "@/domain/session/session-layout";
import {
	removeSessionFromNavigationHistory,
} from "@/domain/session/session-navigation-history";
import {
	removeUnreadSessions,
} from "@/domain/workspace/session-unread";
import {
	removeRunningSessions,
	type RunningSessionState,
} from "@/domain/workspace/session-running";

export type SessionLayoutControllerParams = {
	activeSessionId: string | null;
	clientPreferencesRef: MutableRefObject<ClientPreferences>;
	composerDraftsRef: MutableRefObject<Map<string, string>>;
	setClientPreferences: Dispatch<SetStateAction<ClientPreferences>>;
	setSessionLayouts: Dispatch<SetStateAction<SessionLayoutMap>>;
	setTemporarySessionLayout: Dispatch<
		SetStateAction<SessionLayoutPreferences>
	>;
	setRunningSessionState: Dispatch<SetStateAction<RunningSessionState>>;
	setUnreadSessionIds: Dispatch<SetStateAction<ReadonlySet<string>>>;
};

export type SessionLayoutController = {
	handleWorkspaceSidebarChange: (
		workspaceSidebar: WorkspaceSidebarPreferences,
		options?: { persist?: boolean },
	) => void;
	handleSessionLayoutChange: (
		layout: SessionLayoutPreferences,
		options?: { persist?: boolean },
	) => void;
	removeStoredSessionLayouts: (sessionIds: string[]) => void;
	deleteSessionWithLayout: (sessionId: string) => Promise<void>;
};

export default function useSessionLayoutController({
	activeSessionId,
	clientPreferencesRef,
	composerDraftsRef,
	setClientPreferences,
	setSessionLayouts,
	setTemporarySessionLayout,
	setRunningSessionState,
	setUnreadSessionIds,
}: SessionLayoutControllerParams): SessionLayoutController {
	const handleWorkspaceSidebarChange = useCallback(
	(
		workspaceSidebar: WorkspaceSidebarPreferences,
		options: { persist?: boolean } = {},
	): void => {
		const nextPreferences: ClientPreferences = {
			...clientPreferencesRef.current,
			workspaceSidebar,
		};
		clientPreferencesRef.current = nextPreferences;
		setClientPreferences(nextPreferences);
		dispatchClientPreferencesChanged(nextPreferences);
		if (options.persist === false) {
			return;
		}
		void updateClientPreferences({ workspaceSidebar })
			.then((savedPreferences: ClientPreferences): void => {
				clientPreferencesRef.current = savedPreferences;
				setClientPreferences(savedPreferences);
			})
			.catch((error: unknown): void => {
				console.error(
					"[App] save workspace sidebar preference failed",
					error,
				);
			});
	}, [clientPreferencesRef]);

	const handleSessionLayoutChange = useCallback(
	(
		layout: SessionLayoutPreferences,
		options: { persist?: boolean } = {},
	): void => {
		if (activeSessionId === null) {
			setTemporarySessionLayout(layout);
			return;
		}

		setSessionLayouts(
			(currentLayouts: SessionLayoutMap): SessionLayoutMap => ({
				...currentLayouts,
				[activeSessionId]: layout,
			}),
		);
		if (options.persist === false) {
			return;
		}
		void window.electronAPI.sessionLayout
			.save({ sessionId: activeSessionId, layout })
			.catch((error: unknown): void => {
				console.error("[App] save session layout failed", error);
			});
	}, [activeSessionId]);

	const removeStoredSessionLayouts = useCallback(
	(sessionIds: string[]): void => {
		if (sessionIds.length === 0) {
			return;
		}
		const removedIds: Set<string> = new Set(sessionIds);
		setSessionLayouts(
			(currentLayouts: SessionLayoutMap): SessionLayoutMap => {
				return Object.fromEntries(
					Object.entries(currentLayouts).filter(
						([sessionId]): boolean => !removedIds.has(sessionId),
					),
				);
			},
		);
		void window.electronAPI.sessionLayout
			.remove({ sessionIds: [...removedIds] })
			.catch((error: unknown): void => {
				console.error("[App] remove session layouts failed", error);
			});
	}, []);

	const deleteSessionWithLayout = useCallback(
	async (sessionId: string): Promise<void> => {
		await deleteSession(sessionId);
		removeSessionFromNavigationHistory(sessionId);
		composerDraftsRef.current.delete(sessionId);
		removeStoredSessionLayouts([sessionId]);
		setRunningSessionState(
			(current: RunningSessionState): RunningSessionState =>
				removeRunningSessions(current, [sessionId]),
		);
		setUnreadSessionIds(
			(
				currentSessionIds: ReadonlySet<string>,
			): ReadonlySet<string> =>
				removeUnreadSessions(currentSessionIds, [sessionId]),
		);
	}, [removeStoredSessionLayouts]);

	return {
		handleWorkspaceSidebarChange,
		handleSessionLayoutChange,
		removeStoredSessionLayouts,
		deleteSessionWithLayout,
	};
}

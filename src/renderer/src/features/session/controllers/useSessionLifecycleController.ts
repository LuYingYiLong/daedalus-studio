import type {
	Dispatch,
	MutableRefObject,
	SetStateAction,
} from "react";
import {
	checkSessionIntegrity,
	type SessionIntegrityCheckResult,
} from "@/platform/rpc/session-api";
import type {
	SessionMetadata,
	WorkspaceConfig,
} from "@/platform/rpc/types";
import type { SessionArchiveContext } from "@/domain/workspace/session-archive-context";
import {
	createSingleSourceWorkspaceSnapshot,
} from "@/domain/application/app-helpers";
import {
	removeUnreadSessions,
} from "@/domain/workspace/session-unread";
import {
	removeRunningSessions,
	type RunningSessionState,
} from "@/domain/workspace/session-running";

export type NewSessionLifecycleOptions = {
	restoreTemporaryDraft?: boolean;
	workspace?: WorkspaceConfig | null;
	initialDraft?: string;
};

export type SessionLifecycleControllerParams = {
	activeSessionId: string | null;
	activeSessionIdRef: MutableRefObject<string | null>;
	activeWorkspace: WorkspaceConfig | null;
	activeSessionMetadata: SessionMetadata | null;
	homeWorkspaceOptions: readonly WorkspaceConfig[];
	handleNewSession: (
		options?: NewSessionLifecycleOptions,
	) => Promise<void>;
	setRunningSessionState: Dispatch<SetStateAction<RunningSessionState>>;
	setUnreadSessionIds: Dispatch<SetStateAction<ReadonlySet<string>>>;
	setActiveSessionMetadata: Dispatch<SetStateAction<SessionMetadata | null>>;
	setSessionError: Dispatch<SetStateAction<string | null>>;
};

export type SessionLifecycleController = {
	findWorkspaceForSession: (
		session: SessionMetadata,
	) => WorkspaceConfig | null;
	handleSessionArchive: (
		session: SessionMetadata,
		context: SessionArchiveContext,
	) => Promise<void>;
	handleSessionRename: (session: SessionMetadata) => void;
	checkActiveSessionIntegrity: (sessionId: string) => Promise<void>;
};

export default function useSessionLifecycleController({
	activeSessionId,
	activeSessionIdRef,
	activeWorkspace,
	activeSessionMetadata,
	homeWorkspaceOptions,
	handleNewSession,
	setRunningSessionState,
	setUnreadSessionIds,
	setActiveSessionMetadata,
	setSessionError,
}: SessionLifecycleControllerParams): SessionLifecycleController {
	function findWorkspaceForSession(
		session: SessionMetadata,
	): WorkspaceConfig | null {
		if (session.workspaceId === undefined) {
			return null;
		}
		if (activeWorkspace?.id === session.workspaceId) {
			return activeWorkspace;
		}

		const knownWorkspace: WorkspaceConfig | undefined =
			homeWorkspaceOptions.find(
				(workspace: WorkspaceConfig): boolean =>
					workspace.id === session.workspaceId,
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
			kind: session.workspaceKind ?? "workspace",
			rootPath: session.workspaceRoot,
			godotExecutablePath: session.godotExecutablePath,
		});
	}

	async function handleSessionArchive(
		session: SessionMetadata,
		context: SessionArchiveContext,
	): Promise<void> {
		setRunningSessionState(
			(current: RunningSessionState): RunningSessionState => {
				return removeRunningSessions(current, [session.id]);
			},
		);
		setUnreadSessionIds(
			(currentSessionIds: ReadonlySet<string>): ReadonlySet<string> => {
				return removeUnreadSessions(currentSessionIds, [session.id]);
			},
		);
		if (!context.wasActive || session.id !== activeSessionIdRef.current) {
			return;
		}

		const workspace: WorkspaceConfig | null =
			findWorkspaceForSession(session);
		try {
			await handleNewSession({
				restoreTemporaryDraft: true,
				workspace,
			});
		} catch (error: unknown) {
			const errorMessage: string =
				error instanceof Error
					? error.message
					: "Failed to open New session";
			setSessionError(errorMessage);
			console.error(
				"[App] return to New session after archive failed",
				error,
			);
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
			const result: SessionIntegrityCheckResult =
				await checkSessionIntegrity(sessionId);
			if (activeSessionIdRef.current !== sessionId || result.ok) {
				return;
			}

			setSessionError(
				`Session integrity warning: found ${result.issues.length} cross-session record${result.issues.length === 1 ? "" : "s"}. Existing data was not modified.`,
			);
		} catch (error: unknown) {
			console.warn("[App] session integrity check failed", error);
		}
	}

	return {
		findWorkspaceForSession,
		handleSessionArchive,
		handleSessionRename,
		checkActiveSessionIntegrity,
	};
}

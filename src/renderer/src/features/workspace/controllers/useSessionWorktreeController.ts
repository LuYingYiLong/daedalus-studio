import { Modal } from "antd";
import { useTranslation } from "react-i18next";
import type {
	Dispatch,
	MutableRefObject,
	SetStateAction,
} from "react";
import { BackendRpcError } from "@/platform/rpc/transport/backend-rpc-client";
import {
	deleteSessionWorktree,
	executeSessionWorktreeHandoff,
	moveSessionWorkspace,
	previewSessionWorktreeHandoff,
	retrySessionWorktreeSetup,
	skipSessionWorktreeSetup,
	type MoveSessionWorkspaceResult,
} from "@/platform/rpc/session-api";
import type {
	SessionMetadata,
	WorkbenchSnapshot,
	WorkspaceConfig,
} from "@/platform/rpc/types";
import {
	listTerminalRuntimeIds,
	resetSessionFilePanelWorkspaceState,
	type SessionLayoutMap,
	type SessionLayoutPreferences,
} from "@/domain/session/session-layout";
import {
	clearCleanFilePanelBuffersForSession,
	hasDirtyFilePanelBuffersForSession,
} from "@/features/files/file-runtime-buffers";
import { DEFAULT_SESSION_LAYOUT } from "@/domain/application/app-helpers";

export type SessionWorktreeControllerParams = {
	activeSessionIdRef: MutableRefObject<string | null>;
	activeSessionMetadata: SessionMetadata | null;
	sessionLayouts: SessionLayoutMap;
	setSessionLayouts: Dispatch<SetStateAction<SessionLayoutMap>>;
	setActiveSessionMetadata: Dispatch<SetStateAction<SessionMetadata | null>>;
	setActiveWorkspace: Dispatch<SetStateAction<WorkspaceConfig | null>>;
	setWorkbench: Dispatch<SetStateAction<WorkbenchSnapshot | null>>;
	setWorkspaceRefreshToken: Dispatch<SetStateAction<number>>;
	setSessionError: Dispatch<SetStateAction<string | null>>;
	onError: (message: string) => void;
	onWarning: (message: string) => void;
};

export type SessionWorktreeController = {
	handleSessionWorktreeDelete: (
		session: SessionMetadata,
	) => Promise<SessionMetadata>;
	handleSessionWorkspaceMove: (
		targetSession: SessionMetadata,
		workspace: WorkspaceConfig,
	) => Promise<MoveSessionWorkspaceResult>;
	handleSessionWorktreeHandoff: (
		target: "local" | "worktree",
	) => Promise<void>;
	handleSessionWorktreeSetup: (action: "retry" | "skip") => Promise<void>;
};

export default function useSessionWorktreeController({
	activeSessionIdRef,
	activeSessionMetadata,
	sessionLayouts,
	setSessionLayouts,
	setActiveSessionMetadata,
	setActiveWorkspace,
	setWorkbench,
	setWorkspaceRefreshToken,
	setSessionError,
	onError,
	onWarning,
}: SessionWorktreeControllerParams): SessionWorktreeController {
	const { t } = useTranslation();

	async function handleSessionWorktreeDelete(
		session: SessionMetadata,
	): Promise<SessionMetadata> {
		const sessionLayout: SessionLayoutPreferences =
			sessionLayouts[session.id] ?? DEFAULT_SESSION_LAYOUT;
		for (const terminalId of listTerminalRuntimeIds(
			session.id,
			sessionLayout,
		)) {
			const terminalState = await window.electronAPI.terminal.getState({
				terminalId,
			});
			if (terminalState?.running === true) {
				throw new Error(
					t("workspaceTree.errors.worktreeTerminalActive"),
				);
			}
		}
		const result = await deleteSessionWorktree(session.id);
		if (activeSessionIdRef.current === session.id) {
			setActiveSessionMetadata(result.metadata);
			setActiveWorkspace(result.workspace);
			if (result.workbench !== null) {
				setWorkbench(result.workbench);
			}
		}
		setWorkspaceRefreshToken(
			(currentToken: number): number => currentToken + 1,
		);
		return result.metadata;
	}

	async function handleSessionWorkspaceMove(
		targetSession: SessionMetadata,
		workspace: WorkspaceConfig,
	): Promise<MoveSessionWorkspaceResult> {
		const sessionLayout: SessionLayoutPreferences =
			sessionLayouts[targetSession.id] ?? DEFAULT_SESSION_LAYOUT;
		for (const terminalId of listTerminalRuntimeIds(
			targetSession.id,
			sessionLayout,
		)) {
			const terminalState = await window.electronAPI.terminal.getState({
				terminalId,
			});
			if (terminalState?.running === true) {
				throw new Error(
					t("workspaceTree.errors.moveSessionTerminalActive"),
				);
			}
		}
		if (hasDirtyFilePanelBuffersForSession(targetSession.id)) {
			throw new Error(t("workspaceTree.errors.moveSessionDirtyFiles"));
		}

		let result: MoveSessionWorkspaceResult;
		try {
			result = await moveSessionWorkspace({
				sessionId: targetSession.id,
				workspaceId: workspace.id,
			});
		} catch (error: unknown) {
			if (error instanceof BackendRpcError) {
				const translationKeyByCode: Readonly<Record<string, string>> = {
					session_workspace_move_busy:
						"workspaceTree.errors.moveSessionBusy",
					session_workspace_context_pending:
						"workspaceTree.errors.moveSessionContextPending",
					session_workspace_managed_worktree:
						"workspaceTree.errors.moveSessionManagedWorktree",
					session_workspace_not_found:
						"workspaceTree.errors.moveSessionWorkspaceNotFound",
					session_workspace_unchanged:
						"workspaceTree.errors.moveSessionUnchanged",
				};
				const translationKey: string | undefined =
					translationKeyByCode[error.code];
				if (translationKey !== undefined) {
					throw new Error(t(translationKey));
				}
			}
			throw error;
		}
		const nextLayout: SessionLayoutPreferences =
			resetSessionFilePanelWorkspaceState(sessionLayout);
		clearCleanFilePanelBuffersForSession(targetSession.id);
		setSessionLayouts(
			(currentLayouts: SessionLayoutMap): SessionLayoutMap => ({
				...currentLayouts,
				[targetSession.id]: nextLayout,
			}),
		);
		void window.electronAPI.sessionLayout
			.save({
				sessionId: targetSession.id,
				layout: nextLayout,
			})
			.catch((error: unknown): void => {
				console.error(
					"[App] reset moved session file panel layout failed",
					error,
				);
				onWarning(t("workspaceTree.errors.moveSessionLayoutSave"));
			});

		if (activeSessionIdRef.current === targetSession.id) {
			setActiveSessionMetadata(result.metadata);
			setActiveWorkspace(result.workspace);
			if (result.workbench !== null) {
				setWorkbench(result.workbench);
			}
		}
		setWorkspaceRefreshToken(
			(currentToken: number): number => currentToken + 1,
		);
		window.electronAPI.sessionCatalog.notifyChanged();
		return result;
	}

	async function handleSessionWorktreeHandoff(
		target: "local" | "worktree",
	): Promise<void> {
		if (activeSessionMetadata?.worktree === undefined) return;
		try {
			let preview = await previewSessionWorktreeHandoff({
				sessionId: activeSessionMetadata.id,
				target,
			});
			const branchBySource: Record<string, string> = Object.fromEntries(
				preview.sources.flatMap(
					(source): Array<[string, string]> =>
						source.newCommits > 0 && source.branch !== null
							? [[source.sourceFolderId, source.branch]]
							: [],
				),
			);
			if (!preview.allowed && Object.keys(branchBySource).length > 0) {
				preview = await previewSessionWorktreeHandoff({
					sessionId: activeSessionMetadata.id,
					target,
					branchBySource,
				});
			}
			if (!preview.allowed) {
				throw new Error(
					preview.sources.find(
						(source) => source.blockedReason !== null,
					)?.blockedReason ?? "Handoff is blocked.",
				);
			}
			const confirmed = await new Promise<boolean>((resolve): void => {
				Modal.confirm({
					title:
						target === "local"
							? "Hand off to local checkout?"
							: "Hand off to worktree?",
					content: `${preview.sources.reduce((count, source) => count + source.modifiedFiles.length, 0)} changed files will move between checkouts. The target must remain clean.`,
					onOk: (): void => resolve(true),
					onCancel: (): void => resolve(false),
				});
			});
			if (!confirmed) return;
			const result = await executeSessionWorktreeHandoff({
				sessionId: activeSessionMetadata.id,
				target,
				branchBySource,
			});
			setActiveSessionMetadata(result.metadata);
			setActiveWorkspace(result.workspace);
			if (result.workbench !== null) setWorkbench(result.workbench);
			setWorkspaceRefreshToken(
				(currentToken: number): number => currentToken + 1,
			);
		} catch (error: unknown) {
			onError(
				error instanceof Error
					? error.message
					: "Failed to hand off worktree",
			);
		}
	}

	async function handleSessionWorktreeSetup(
		action: "retry" | "skip",
	): Promise<void> {
		if (activeSessionMetadata?.worktree === undefined) return;
		try {
			const result =
				action === "retry"
					? await retrySessionWorktreeSetup(activeSessionMetadata.id)
					: await skipSessionWorktreeSetup(activeSessionMetadata.id);
			setActiveSessionMetadata(result.metadata);
			setActiveWorkspace(result.workspace);
			if (result.workbench !== null) setWorkbench(result.workbench);
			setSessionError(
				(result.metadata.worktree?.status ?? "ready") === "ready"
					? null
					: "Worktree setup is not ready.",
			);
			setWorkspaceRefreshToken(
				(currentToken: number): number => currentToken + 1,
			);
		} catch (error: unknown) {
			onError(
				error instanceof Error
					? error.message
					: "Failed to update worktree setup",
			);
		}
	}

	return {
		handleSessionWorktreeDelete,
		handleSessionWorkspaceMove,
		handleSessionWorktreeHandoff,
		handleSessionWorktreeSetup,
	};
}

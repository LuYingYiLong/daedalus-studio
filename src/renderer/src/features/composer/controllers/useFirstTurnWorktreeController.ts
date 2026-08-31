import type { Dispatch, SetStateAction } from "react";
import { createSessionWorktree } from "@/platform/rpc/session-api";
import type {
	SessionMetadata,
	WorkbenchSnapshot,
	WorkspaceConfig,
} from "@/platform/rpc/types";
import type { HomeDraft } from "@/domain/session/home-draft";

export type FirstTurnWorktreeRequest = {
	shouldPrepare: boolean;
	sessionId: string | null;
	workspaceId: string | null;
	worktreeSources: HomeDraft["worktreeSources"];
	nextMessage: string;
	workbench: WorkbenchSnapshot | null;
	workspace: WorkspaceConfig | null;
};

export type FirstTurnWorktreeResult = {
	workbench: WorkbenchSnapshot | null;
	workspace: WorkspaceConfig | null;
	blocked: boolean;
};

export type FirstTurnWorktreeControllerParams = {
	getUnavailableMessage: () => string;
	setIsWorktreePreparing: Dispatch<SetStateAction<boolean>>;
	setSessionError: (message: string | null) => void;
	setActiveSessionMetadata: Dispatch<SetStateAction<SessionMetadata | null>>;
	setActiveWorkspace: Dispatch<SetStateAction<WorkspaceConfig | null>>;
	setWorkbench: Dispatch<SetStateAction<WorkbenchSnapshot | null>>;
	replaceComposerInput: (text: string, scopeId?: string) => void;
};

export type FirstTurnWorktreeController = {
	prepareFirstTurnWorktree: (
		request: FirstTurnWorktreeRequest,
	) => Promise<FirstTurnWorktreeResult>;
};

function useFirstTurnWorktreeController({
	getUnavailableMessage,
	setIsWorktreePreparing,
	setSessionError,
	setActiveSessionMetadata,
	setActiveWorkspace,
	setWorkbench,
	replaceComposerInput,
}: FirstTurnWorktreeControllerParams): FirstTurnWorktreeController {
	async function prepareFirstTurnWorktree(
		request: FirstTurnWorktreeRequest,
	): Promise<FirstTurnWorktreeResult> {
		if (!request.shouldPrepare) {
			return {
				workbench: request.workbench,
				workspace: request.workspace,
				blocked: false,
			};
		}
		if (request.sessionId === null || request.workspaceId === null) {
			setSessionError(getUnavailableMessage());
			return {
				workbench: request.workbench,
				workspace: request.workspace,
				blocked: true,
			};
		}

		try {
			setIsWorktreePreparing(true);
			setSessionError(null);
			const worktreeResult = await createSessionWorktree(
				request.sessionId,
				request.workspaceId,
				request.worktreeSources,
			);
			if (worktreeResult.workbench === null) {
				throw new Error("Worktree session did not return a workbench.");
			}
			setActiveSessionMetadata(worktreeResult.metadata);
			setActiveWorkspace(worktreeResult.workspace);
			setWorkbench(worktreeResult.workbench);
			if (
				(worktreeResult.metadata.worktree?.status ?? "ready") !== "ready"
			) {
				replaceComposerInput(request.nextMessage, request.sessionId);
				setSessionError(
					worktreeResult.metadata.worktree?.status === "setup-failed"
						? "Worktree setup failed. Retry, skip, or delete the worktree before sending."
						: "Review and trust the selected development environment before setup can continue.",
				);
				return {
					workbench: worktreeResult.workbench,
					workspace: worktreeResult.workspace,
					blocked: true,
				};
			}
			return {
				workbench: worktreeResult.workbench,
				workspace: worktreeResult.workspace,
				blocked: false,
			};
		} catch (error: unknown) {
			setSessionError(
				error instanceof Error
					? error.message
					: "Failed to create worktree",
			);
			return {
				workbench: request.workbench,
				workspace: request.workspace,
				blocked: true,
			};
		} finally {
			setIsWorktreePreparing(false);
		}
	}

	return { prepareFirstTurnWorktree };
}

export default useFirstTurnWorktreeController;

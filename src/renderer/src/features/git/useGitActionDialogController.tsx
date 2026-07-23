import { useCallback, useEffect, useMemo, useState, type ReactElement } from "react";
import { message as antdMessage } from "antd";
import {
	commitOrPushGit,
	generateGitCommitMessage,
	type CommitOrPushAction,
	type CommitOrPushResult,
	type GenerateGitCommitMessageResult
} from "@/api/workspace-git-api";
import type { GitActionDialogsProps } from "./GitActionDialogs";

type UseGitActionDialogControllerOptions = {
	workspaceId: string | null;
	resetKey?: unknown;
	onCommitSuccess?: (result: CommitOrPushResult) => void | Promise<void>;
	onBeforeCommitOpen?: () => void;
};

type GitActionDialogController = {
	contextHolder: ReactElement;
	dialogProps: GitActionDialogsProps;
	openCommitDialog: () => void;
	openBranchDialog: () => void;
	closeBranchDialog: () => void;
};

function getCommitActionLabel(action: CommitOrPushAction): string {
	if (action === "commit") {
		return "Commit";
	}
	if (action === "commit_and_push") {
		return "Commit & Push";
	}
	return "Push";
}

function formatCommitActionSuccess(result: CommitOrPushResult): string {
	if (result.committed && result.pushed) {
		return `Committed ${result.commitHash ?? "changes"} and pushed.`;
	}
	if (result.committed) {
		return `Committed ${result.commitHash ?? "changes"}.`;
	}
	return "Pushed changes.";
}

export function useGitActionDialogController({
	workspaceId,
	resetKey,
	onCommitSuccess,
	onBeforeCommitOpen
}: UseGitActionDialogControllerOptions): GitActionDialogController {
	const [messageApi, contextHolder] = antdMessage.useMessage();
	const [commitOpen, setCommitOpen] = useState<boolean>(false);
	const [branchOpen, setBranchOpen] = useState<boolean>(false);
	const [commitMessage, setCommitMessage] = useState<string>("");
	const [includeUnstagedChanges, setIncludeUnstagedChanges] = useState<boolean>(true);
	const [commitOperation, setCommitOperation] = useState<CommitOrPushAction | null>(null);
	const [commitError, setCommitError] = useState<string | null>(null);
	const isCommitOperationRunning: boolean = commitOperation !== null;

	useEffect((): void => {
		setCommitOpen(false);
		setBranchOpen(false);
		setCommitMessage("");
		setCommitError(null);
		setCommitOperation(null);
	}, [resetKey, workspaceId]);

	const openCommitDialog = useCallback((): void => {
		onBeforeCommitOpen?.();
		setCommitError(null);
		setCommitOpen(true);
	}, [onBeforeCommitOpen]);

	const closeCommitDialog = useCallback((): void => {
		if (isCommitOperationRunning) {
			return;
		}
		setCommitOpen(false);
		setCommitError(null);
	}, [isCommitOperationRunning]);

	const openBranchDialog = useCallback((): void => {
		setBranchOpen(true);
	}, []);

	const closeBranchDialog = useCallback((): void => {
		setBranchOpen(false);
	}, []);

	const generateMessageForCommitAction = useCallback(async (): Promise<string> => {
		if (workspaceId === null) {
			throw new Error("Please select a workspace before committing.");
		}

		const generated: GenerateGitCommitMessageResult = await generateGitCommitMessage({
			workspaceId,
			includeUnstagedChanges
		});
		setCommitMessage(generated.message);
		return generated.message;
	}, [includeUnstagedChanges, workspaceId]);

	const handleCommitAction = useCallback(async (action: CommitOrPushAction): Promise<void> => {
		if (workspaceId === null) {
			setCommitError("Please select a workspace before committing.");
			return;
		}

		setCommitOperation(action);
		setCommitError(null);
		try {
			let nextMessage: string | undefined = commitMessage.trim();
			if (action !== "push" && (nextMessage ?? "").length === 0) {
				nextMessage = await generateMessageForCommitAction();
			}

			const result: CommitOrPushResult = await commitOrPushGit({
				workspaceId,
				action,
				message: action === "push" ? undefined : nextMessage,
				includeUnstagedChanges
			});
			void messageApi.success(formatCommitActionSuccess(result));
			setCommitOpen(false);
			setCommitMessage("");
			await onCommitSuccess?.(result);
		} catch (error: unknown) {
			setCommitError(error instanceof Error ? error.message : `Failed to ${getCommitActionLabel(action).toLowerCase()}.`);
		} finally {
			setCommitOperation(null);
		}
	}, [
		commitMessage,
		generateMessageForCommitAction,
		includeUnstagedChanges,
		messageApi,
		onCommitSuccess,
		workspaceId
	]);

	const dialogProps: GitActionDialogsProps = useMemo((): GitActionDialogsProps => {
		return {
			commitOpen,
			branchOpen,
			commitMessage,
			includeUnstagedChanges,
			commitOperation,
			commitError,
			hasWorkspace: workspaceId !== null,
			onCommitCancel: closeCommitDialog,
			onCommitMessageChange: setCommitMessage,
			onIncludeUnstagedChangesChange: setIncludeUnstagedChanges,
			onCommitAction: (action: CommitOrPushAction): void => {
				void handleCommitAction(action);
			},
			onBranchClose: closeBranchDialog
		};
	}, [
		branchOpen,
		closeBranchDialog,
		closeCommitDialog,
		commitError,
		commitMessage,
		commitOpen,
		commitOperation,
		handleCommitAction,
		includeUnstagedChanges,
		workspaceId
	]);

	return {
		contextHolder,
		dialogProps,
		openCommitDialog,
		openBranchDialog,
		closeBranchDialog
	};
}

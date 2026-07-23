import { useCallback, useEffect, useMemo, useState } from "react";
import { App as AntdApp } from "antd";
import {
	checkoutWorkspaceGitBranch,
	commitOrPushGit,
	createWorkspaceGitBranch,
	generateGitCommitMessage,
	listWorkspaceGitBranches,
	type CommitOrPushAction,
	type CommitOrPushResult,
	type GenerateGitCommitMessageResult,
	type WorkspaceGitBranchItem,
	type WorkspaceGitBranchOperationResult,
	type WorkspaceGitBranchesResult
} from "@/api/workspace-git-api";
import type { BranchActionDialogProps } from "./BranchActionDialog";
import type { CommitActionDialogProps } from "./CommitActionDialog";
import type { CreateBranchDialogProps } from "./CreateBranchDialog";

type BranchOperation = "checkout" | "create";

type UseGitActionDialogControllerOptions = {
	workspaceId: string | null;
	resetKey?: unknown;
	onCommitSuccess?: (result: CommitOrPushResult) => void | Promise<void>;
	onBranchSuccess?: (result: WorkspaceGitBranchOperationResult) => void | Promise<void>;
	onBeforeCommitOpen?: () => void;
	onBeforeBranchOpen?: () => void;
};

type GitActionDialogController = {
	commitDialogProps: CommitActionDialogProps;
	branchDialogProps: BranchActionDialogProps;
	createBranchDialogProps: CreateBranchDialogProps;
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
	onBranchSuccess,
	onBeforeCommitOpen,
	onBeforeBranchOpen
}: UseGitActionDialogControllerOptions): GitActionDialogController {
	const { message: messageApi } = AntdApp.useApp();
	const [commitOpen, setCommitOpen] = useState<boolean>(false);
	const [branchOpen, setBranchOpen] = useState<boolean>(false);
	const [createBranchOpen, setCreateBranchOpen] = useState<boolean>(false);
	const [commitMessage, setCommitMessage] = useState<string>("");
	const [includeUnstagedChanges, setIncludeUnstagedChanges] = useState<boolean>(true);
	const [commitOperation, setCommitOperation] = useState<CommitOrPushAction | null>(null);
	const [commitError, setCommitError] = useState<string | null>(null);
	const [branches, setBranches] = useState<WorkspaceGitBranchItem[]>([]);
	const [branchSearch, setBranchSearch] = useState<string>("");
	const [selectedBranchName, setSelectedBranchName] = useState<string | null>(null);
	const [newBranchName, setNewBranchName] = useState<string>("");
	const [newBranchStartPoint, setNewBranchStartPoint] = useState<string>("");
	const [isBranchesLoading, setIsBranchesLoading] = useState<boolean>(false);
	const [branchOperation, setBranchOperation] = useState<BranchOperation | null>(null);
	const [branchError, setBranchError] = useState<string | null>(null);
	const isCommitOperationRunning: boolean = commitOperation !== null;
	const isBranchOperationRunning: boolean = branchOperation !== null;

	useEffect((): void => {
		setCommitOpen(false);
		setBranchOpen(false);
		setCreateBranchOpen(false);
		setCommitMessage("");
		setCommitError(null);
		setCommitOperation(null);
		setBranches([]);
		setBranchSearch("");
		setSelectedBranchName(null);
		setNewBranchName("");
		setNewBranchStartPoint("");
		setIsBranchesLoading(false);
		setBranchOperation(null);
		setBranchError(null);
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

	const loadBranches = useCallback(async (): Promise<void> => {
		if (workspaceId === null) {
			setBranchError("Please select a workspace before switching branches.");
			setBranches([]);
			setSelectedBranchName(null);
			return;
		}

		setIsBranchesLoading(true);
		setBranchError(null);
		try {
			const result: WorkspaceGitBranchesResult = await listWorkspaceGitBranches({ workspaceId });
			setBranches(result.branches);
			setSelectedBranchName((previous: string | null): string | null => {
				if (previous !== null && result.branches.some((branch: WorkspaceGitBranchItem): boolean => branch.name === previous)) {
					return previous;
				}
				return result.currentBranch ?? result.branches[0]?.name ?? null;
			});
			if (!result.hasGitRepository) {
				setBranchError("Workspace is not a Git repository.");
			}
		} catch (error: unknown) {
			setBranchError(error instanceof Error ? error.message : "Failed to load branches.");
			setBranches([]);
			setSelectedBranchName(null);
		} finally {
			setIsBranchesLoading(false);
		}
	}, [workspaceId]);

	const openBranchDialog = useCallback((): void => {
		onBeforeBranchOpen?.();
		setBranchOpen(true);
		void loadBranches();
	}, [loadBranches, onBeforeBranchOpen]);

	const closeBranchDialog = useCallback((): void => {
		if (isBranchOperationRunning) {
			return;
		}
		setBranchOpen(false);
		setCreateBranchOpen(false);
		setBranchError(null);
	}, [isBranchOperationRunning]);

	const openCreateBranchDialog = useCallback((): void => {
		setBranchError(null);
		setNewBranchStartPoint(selectedBranchName ?? "");
		setCreateBranchOpen(true);
	}, [selectedBranchName]);

	const closeCreateBranchDialog = useCallback((): void => {
		if (isBranchOperationRunning) {
			return;
		}
		setCreateBranchOpen(false);
		setBranchError(null);
	}, [isBranchOperationRunning]);

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

	const handleBranchCheckout = useCallback(async (branchNameOverride?: string): Promise<void> => {
		if (workspaceId === null) {
			setBranchError("Please select a workspace before switching branches.");
			return;
		}
		const branchName: string | null = branchNameOverride ?? selectedBranchName;
		if (branchName === null) {
			setBranchError("Please select a branch.");
			return;
		}

		setBranchOperation("checkout");
		setBranchError(null);
		setSelectedBranchName(branchName);
		try {
			const result: WorkspaceGitBranchOperationResult = await checkoutWorkspaceGitBranch({
				workspaceId,
				branchName
			});
			void messageApi.success(`Switched to ${result.branch}.`);
			setBranchOpen(false);
			await onBranchSuccess?.(result);
		} catch (error: unknown) {
			setBranchError(error instanceof Error ? error.message : "Failed to switch branch.");
		} finally {
			setBranchOperation(null);
		}
	}, [messageApi, onBranchSuccess, selectedBranchName, workspaceId]);

	const handleBranchCreate = useCallback(async (): Promise<void> => {
		if (workspaceId === null) {
			setBranchError("Please select a workspace before creating branches.");
			return;
		}
		const branchName: string = newBranchName.trim();
		if (branchName.length === 0) {
			setBranchError("Please enter a branch name.");
			return;
		}

		setBranchOperation("create");
		setBranchError(null);
		try {
			const result: WorkspaceGitBranchOperationResult = await createWorkspaceGitBranch({
				workspaceId,
				branchName,
				startPoint: newBranchStartPoint.trim().length > 0 ? newBranchStartPoint.trim() : undefined
			});
			void messageApi.success(`Created and switched to ${result.branch}.`);
			setNewBranchName("");
			setNewBranchStartPoint("");
			setSelectedBranchName(result.branch);
			await loadBranches();
			setCreateBranchOpen(false);
			setBranchOpen(false);
			await onBranchSuccess?.(result);
		} catch (error: unknown) {
			setBranchError(error instanceof Error ? error.message : "Failed to create branch.");
		} finally {
			setBranchOperation(null);
		}
	}, [loadBranches, messageApi, newBranchName, newBranchStartPoint, onBranchSuccess, workspaceId]);

	const commitDialogProps: CommitActionDialogProps = useMemo((): CommitActionDialogProps => {
		return {
			open: commitOpen,
			commitMessage,
			includeUnstagedChanges,
			commitOperation,
			errorMessage: commitError,
			hasWorkspace: workspaceId !== null,
			onCancel: closeCommitDialog,
			onCommitMessageChange: setCommitMessage,
			onIncludeUnstagedChangesChange: setIncludeUnstagedChanges,
			onCommitAction: (action: CommitOrPushAction): void => {
				void handleCommitAction(action);
			}
		};
	}, [
		closeCommitDialog,
		commitError,
		commitMessage,
		commitOpen,
		commitOperation,
		handleCommitAction,
		includeUnstagedChanges,
		workspaceId
	]);

	const branchDialogProps: BranchActionDialogProps = useMemo((): BranchActionDialogProps => {
		return {
			open: branchOpen,
			branches,
			branchSearch,
			selectedBranchName,
			isBranchesLoading,
			branchOperation,
			errorMessage: branchError,
			hasWorkspace: workspaceId !== null,
			onClose: closeBranchDialog,
			onCreateBranchOpen: openCreateBranchDialog,
			onRefresh: (): void => {
				void loadBranches();
			},
			onSearchChange: setBranchSearch,
			onBranchSelect: setSelectedBranchName,
			onBranchCheckout: (branchName?: string): void => {
				void handleBranchCheckout(branchName);
			}
		};
	}, [
		branchOpen,
		branchError,
		branchOperation,
		branchSearch,
		branches,
		closeBranchDialog,
		handleBranchCheckout,
		isBranchesLoading,
		loadBranches,
		openCreateBranchDialog,
		selectedBranchName,
		workspaceId
	]);

	const createBranchDialogProps: CreateBranchDialogProps = useMemo((): CreateBranchDialogProps => {
		return {
			open: createBranchOpen,
			newBranchName,
			newBranchStartPoint,
			branchOperation,
			errorMessage: branchError,
			hasWorkspace: workspaceId !== null,
			onClose: closeCreateBranchDialog,
			onNewBranchNameChange: setNewBranchName,
			onNewBranchStartPointChange: setNewBranchStartPoint,
			onCreate: (): void => {
				void handleBranchCreate();
			}
		};
	}, [
		branchError,
		branchOperation,
		closeCreateBranchDialog,
		createBranchOpen,
		handleBranchCreate,
		newBranchName,
		newBranchStartPoint,
		workspaceId
	]);

	return {
		commitDialogProps,
		branchDialogProps,
		createBranchDialogProps,
		openCommitDialog,
		openBranchDialog,
		closeBranchDialog
	};
}

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { App as AntdApp } from "antd";
import type { TFunction } from "i18next";
import { useTranslation } from "react-i18next";
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
	isCommitMessageGenerating: boolean;
	openCommitDialog: () => void;
	openBranchDialog: () => void;
	closeBranchDialog: () => void;
};

function getCommitActionLabel(action: CommitOrPushAction, t: TFunction<"common">): string {
	if (action === "commit") {
		return t("git.commit.actions.commit");
	}
	if (action === "commit_and_push") {
		return t("git.commit.actions.commitAndPush");
	}
	return t("git.commit.actions.push");
}

function formatCommitActionSuccess(result: CommitOrPushResult, t: TFunction<"common">): string {
	if (result.committed && result.pushed) {
		return t("git.commit.messages.committedAndPushed", { target: result.commitHash ?? t("git.commit.messages.changes") });
	}
	if (result.committed) {
		return t("git.commit.messages.committed", { target: result.commitHash ?? t("git.commit.messages.changes") });
	}
	return t("git.commit.messages.pushed");
}

function formatCommitActionError(error: unknown, action: CommitOrPushAction, t: TFunction<"common">): string {
	if (error instanceof Error && error.message.startsWith("workspace_git_commit_message_generation_timeout:")) {
		return t("git.commit.errors.generationTimeout");
	}
	return error instanceof Error
		? error.message
		: t("git.commit.errors.actionFailed", { action: getCommitActionLabel(action, t).toLowerCase() });
}

export function useGitActionDialogController({
	workspaceId,
	resetKey,
	onCommitSuccess,
	onBranchSuccess,
	onBeforeCommitOpen,
	onBeforeBranchOpen
}: UseGitActionDialogControllerOptions): GitActionDialogController {
	const { t } = useTranslation();
	const { message: messageApi } = AntdApp.useApp();
	const [commitOpen, setCommitOpen] = useState<boolean>(false);
	const commitOpenRef = useRef<boolean>(false);
	const [branchOpen, setBranchOpen] = useState<boolean>(false);
	const [createBranchOpen, setCreateBranchOpen] = useState<boolean>(false);
	const [commitMessage, setCommitMessage] = useState<string>("");
	const [includeUnstagedChanges, setIncludeUnstagedChanges] = useState<boolean>(true);
	const [commitOperation, setCommitOperation] = useState<CommitOrPushAction | null>(null);
	const [isCommitMessageGenerating, setIsCommitMessageGenerating] = useState<boolean>(false);
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
		commitOpenRef.current = false;
		setCommitOpen(false);
		setBranchOpen(false);
		setCreateBranchOpen(false);
		setCommitMessage("");
		setCommitError(null);
		setCommitOperation(null);
		setIsCommitMessageGenerating(false);
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
		commitOpenRef.current = true;
		setCommitOpen(true);
	}, [onBeforeCommitOpen]);

	const closeCommitDialog = useCallback((): void => {
		if (isCommitOperationRunning && !isCommitMessageGenerating) {
			return;
		}
		commitOpenRef.current = false;
		setCommitOpen(false);
		setCommitError(null);
	}, [isCommitMessageGenerating, isCommitOperationRunning]);

	const loadBranches = useCallback(async (): Promise<void> => {
		if (workspaceId === null) {
			setBranchError(t("git.branch.errors.selectWorkspaceBeforeSwitching"));
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
				setBranchError(t("git.branch.errors.notGitRepository"));
			}
		} catch (error: unknown) {
			setBranchError(error instanceof Error ? error.message : t("git.branch.errors.load"));
			setBranches([]);
			setSelectedBranchName(null);
		} finally {
			setIsBranchesLoading(false);
		}
	}, [t, workspaceId]);

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
			throw new Error(t("git.commit.errors.selectWorkspace"));
		}

		const generated: GenerateGitCommitMessageResult = await generateGitCommitMessage({
			workspaceId,
			includeUnstagedChanges
		});
		setCommitMessage(generated.message);
		return generated.message;
	}, [includeUnstagedChanges, t, workspaceId]);

	const handleCommitAction = useCallback(async (action: CommitOrPushAction): Promise<void> => {
		if (workspaceId === null) {
			setCommitError(t("git.commit.errors.selectWorkspace"));
			return;
		}

		setCommitOperation(action);
		setCommitError(null);
		try {
			let nextMessage: string | undefined = commitMessage.trim();
			if (action !== "push" && (nextMessage ?? "").length === 0) {
				setIsCommitMessageGenerating(true);
				try {
					nextMessage = await generateMessageForCommitAction();
				} finally {
					setIsCommitMessageGenerating(false);
				}
			}

			const result: CommitOrPushResult = await commitOrPushGit({
				workspaceId,
				action,
				message: action === "push" ? undefined : nextMessage,
				includeUnstagedChanges
			});
			void messageApi.success(formatCommitActionSuccess(result, t));
			commitOpenRef.current = false;
			setCommitOpen(false);
			setCommitMessage("");
			await onCommitSuccess?.(result);
		} catch (error: unknown) {
			const errorMessage: string = formatCommitActionError(error, action, t);
			setCommitError(errorMessage);
			if (!commitOpenRef.current) {
				void messageApi.error(errorMessage);
			}
		} finally {
			setCommitOperation(null);
		}
	}, [
		commitMessage,
		generateMessageForCommitAction,
		includeUnstagedChanges,
		messageApi,
		onCommitSuccess,
		t,
		workspaceId
	]);

	const handleBranchCheckout = useCallback(async (branchNameOverride?: string): Promise<void> => {
		if (workspaceId === null) {
			setBranchError(t("git.branch.errors.selectWorkspaceBeforeSwitching"));
			return;
		}
		const branchName: string | null = branchNameOverride ?? selectedBranchName;
		if (branchName === null) {
			setBranchError(t("git.branch.errors.selectBranch"));
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
			void messageApi.success(t("git.branch.messages.switched", { branch: result.branch }));
			setBranchOpen(false);
			await onBranchSuccess?.(result);
		} catch (error: unknown) {
			setBranchError(error instanceof Error ? error.message : t("git.branch.errors.switch"));
		} finally {
			setBranchOperation(null);
		}
	}, [messageApi, onBranchSuccess, selectedBranchName, t, workspaceId]);

	const handleBranchCreate = useCallback(async (): Promise<void> => {
		if (workspaceId === null) {
			setBranchError(t("git.branch.errors.selectWorkspaceBeforeCreating"));
			return;
		}
		const branchName: string = newBranchName.trim();
		if (branchName.length === 0) {
			setBranchError(t("git.branch.errors.enterBranchName"));
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
			void messageApi.success(t("git.branch.messages.createdAndSwitched", { branch: result.branch }));
			setNewBranchName("");
			setNewBranchStartPoint("");
			setSelectedBranchName(result.branch);
			await loadBranches();
			setCreateBranchOpen(false);
			setBranchOpen(false);
			await onBranchSuccess?.(result);
		} catch (error: unknown) {
			setBranchError(error instanceof Error ? error.message : t("git.branch.errors.create"));
		} finally {
			setBranchOperation(null);
		}
	}, [loadBranches, messageApi, newBranchName, newBranchStartPoint, onBranchSuccess, t, workspaceId]);

	const commitDialogProps: CommitActionDialogProps = useMemo((): CommitActionDialogProps => {
		return {
			open: commitOpen,
			commitMessage,
			includeUnstagedChanges,
			commitOperation,
			isCommitMessageGenerating,
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
		isCommitMessageGenerating,
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
		isCommitMessageGenerating,
		openCommitDialog,
		openBranchDialog,
		closeBranchDialog
	};
}

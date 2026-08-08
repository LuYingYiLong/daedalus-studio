import type { WorkspaceGitBranchItem, CommitOrPushAction } from "@/platform/rpc/workspace-git-api";
import type { WorkspaceGitDiffFileSummary } from "@/platform/rpc/workspace-git-diff-api";

export type BranchCheckoutDraft = {
	branchName: string;
	files: WorkspaceGitDiffFileSummary[];
	changedFiles: number;
	additions: number;
	deletions: number;
};

export type BranchActionDialogProps = {
	open: boolean;
	branches: WorkspaceGitBranchItem[];
	branchSearch: string;
	selectedBranchName: string | null;
	isBranchesLoading: boolean;
	branchOperation: "checkout" | "create" | null;
	errorMessage: string | null;
	checkoutDraft: BranchCheckoutDraft | null;
	checkoutCommitMessage: string;
	checkoutDraftError: string | null;
	isCheckoutDraftCommitting: boolean;
	hasWorkspace: boolean;
	onClose: () => void;
	onCreateBranchOpen: () => void;
	onRefresh: () => void;
	onSearchChange: (search: string) => void;
	onBranchCheckout: (branchName?: string) => void;
	onCheckoutCommitMessageChange: (message: string) => void;
	onCheckoutDraftCancel: () => void;
	onCheckoutDraftCommit: () => void;
};

export type CommitActionDialogProps = {
	open: boolean;
	commitMessage: string;
	includeUnstagedChanges: boolean;
	commitOperation: CommitOrPushAction | null;
	isCommitMessageGenerating: boolean;
	errorMessage: string | null;
	hasWorkspace: boolean;
	onCancel: () => void;
	onCommitMessageChange: (message: string) => void;
	onIncludeUnstagedChangesChange: (include: boolean) => void;
	onCommitAction: (action: CommitOrPushAction) => void;
};

export type CreateBranchDialogProps = {
	open: boolean;
	newBranchName: string;
	newBranchStartPoint: string;
	branchOperation: "checkout" | "create" | null;
	errorMessage: string | null;
	hasWorkspace: boolean;
	onClose: () => void;
	onNewBranchNameChange: (branchName: string) => void;
	onNewBranchStartPointChange: (startPoint: string) => void;
	onCreate: () => void;
};

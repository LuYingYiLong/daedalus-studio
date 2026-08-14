import { describe, expect, it } from "vitest";
import { readRepoFile } from "../../../../helpers/repo-paths";

describe("HomePage git commit dialog source", () => {
	const agentSource: string = readRepoFile("src", "renderer", "src", "widgets", "home", "HomePage.tsx");
	const commitActionDialogSource: string = readRepoFile("src", "renderer", "src", "widgets", "git", "CommitActionDialog.tsx");
	const branchActionDialogSource: string = readRepoFile("src", "renderer", "src", "widgets", "git", "BranchActionDialog.tsx");
	const createBranchDialogSource: string = readRepoFile("src", "renderer", "src", "widgets", "git", "CreateBranchDialog.tsx");
	const gitActionControllerSource: string = readRepoFile("src", "renderer", "src", "features", "git", "useGitActionDialogController.tsx");

	it("generates commit messages and wires commit push actions", () => {
		expect(gitActionControllerSource).toContain("generateGitCommitMessage");
		expect(gitActionControllerSource).toContain("commitOrPushGit");
		expect(agentSource).toContain("gitActions.openCommitDialog");
		expect(agentSource).toContain("useGitActionDialogController");
		expect(agentSource).toContain("<CommitActionDialog {...gitActions.commitDialogProps} />");
		expect(agentSource).toContain("<BranchActionDialog {...gitActions.branchDialogProps} />");
		expect(agentSource).toContain("<CreateBranchDialog {...gitActions.createBranchDialogProps} />");
		expect(gitActionControllerSource).toContain("handleCommitAction");
		expect(gitActionControllerSource).toContain("action !== \"push\"");
		expect(gitActionControllerSource).toContain("AntdApp.useApp()");
		expect(gitActionControllerSource).not.toContain("contextHolder");
		expect(agentSource).not.toContain("gitActions.contextHolder");
		expect(commitActionDialogSource).toContain('t("git.commit.actions.commitAndPush")');
		expect(commitActionDialogSource).toContain('t("git.commit.includeUnstaged")');
		expect(commitActionDialogSource).toContain("loading={commitOperation === \"commit\"}");
		expect(commitActionDialogSource).toContain("loading={commitOperation === \"commit_and_push\"}");
		expect(commitActionDialogSource).toContain("loading={commitOperation === \"push\"}");
		expect(commitActionDialogSource).toContain("const canClose: boolean = !isCommitOperationRunning && !isCommitMessageGenerating;");
		expect(commitActionDialogSource).toContain("mask={{ closable: canClose }}");
		expect(gitActionControllerSource).toContain("setIsCommitMessageGenerating(true)");
		expect(gitActionControllerSource).toContain("setIsCommitMessageGenerating(false)");
		expect(gitActionControllerSource).toContain("if (isCommitOperationRunning || isCommitMessageGenerating)");
		expect(gitActionControllerSource).toContain("workspace_git_commit_message_generation_timeout:");
		expect(gitActionControllerSource).not.toContain("provider: selectedProviderId");
		expect(gitActionControllerSource).not.toContain("model: selectedModelId");
	});

	it("wires branch listing checkout and creation into the shared git dialog", () => {
		expect(gitActionControllerSource).toContain("listWorkspaceGitBranches");
		expect(gitActionControllerSource).toContain("checkoutWorkspaceGitBranch");
		expect(gitActionControllerSource).toContain("createWorkspaceGitBranch");
		expect(branchActionDialogSource).toContain('t("git.branch.actions.createAndCheckout")');
		expect(branchActionDialogSource).toContain("footer={null}");
		expect(gitActionControllerSource).toContain("createBranchDialogProps");
		expect(branchActionDialogSource).toContain("onCreateBranchOpen");
		expect(gitActionControllerSource).toContain("onRefresh:");
		expect(branchActionDialogSource).toContain('description={t("git.branch.empty")}');
		expect(branchActionDialogSource).toContain("<Menu");
		expect(branchActionDialogSource).toContain("if (branch.remote)");
		expect(branchActionDialogSource).toContain("onBranchCheckout(branch.name)");
		expect(branchActionDialogSource).not.toContain("styles.branchItem");
		expect(branchActionDialogSource).not.toContain('t("git.branch.actions.checkout")');
		expect(branchActionDialogSource).not.toContain('t("git.branch.tags.remote")');
		expect(createBranchDialogSource).toContain('okText={t("git.branch.actions.createAndCheckout")}');
		expect(gitActionControllerSource).toContain("onBeforeBranchOpen");
		expect(agentSource).toContain("onBeforeBranchOpen");
	});

	it("preflights working tree changes before checkout and offers an atomic commit flow", () => {
		expect(gitActionControllerSource).toContain("fetchWorkspaceGitDiffSummary");
		expect(gitActionControllerSource).toContain("summary.changedFiles > 0");
		expect(gitActionControllerSource).toContain("setCheckoutDraft({");
		expect(gitActionControllerSource).toContain('action: "commit"');
		expect(gitActionControllerSource).toContain("includeUnstagedChanges: true");
		expect(gitActionControllerSource).toContain("checkoutDraft.branchName");
		expect(branchActionDialogSource).toContain('title={t("git.branch.checkoutDraft.title")}');
		expect(branchActionDialogSource).toContain("destroyOnHidden={true}");
		expect(branchActionDialogSource).toContain("mask={{ closable: !isCheckoutDraftCommitting }}");
		expect(branchActionDialogSource).toContain('okText={t("git.branch.checkoutDraft.commitAndCheckout")}');
	});
});

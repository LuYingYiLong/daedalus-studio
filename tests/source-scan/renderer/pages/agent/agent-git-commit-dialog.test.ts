import { describe, expect, it } from "vitest";
import { readRepoFile } from "../../../../helpers/repo-paths";

describe("AgentPage git commit dialog source", () => {
	const agentSource: string = readRepoFile("src", "renderer", "src", "pages", "agent", "AgentPage.tsx");
	const commitActionDialogSource: string = readRepoFile("src", "renderer", "src", "features", "git", "CommitActionDialog.tsx");
	const branchActionDialogSource: string = readRepoFile("src", "renderer", "src", "features", "git", "BranchActionDialog.tsx");
	const createBranchDialogSource: string = readRepoFile("src", "renderer", "src", "features", "git", "CreateBranchDialog.tsx");
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
		expect(commitActionDialogSource).toContain("Commit & Push");
		expect(commitActionDialogSource).toContain("Includes unstaged changes");
		expect(commitActionDialogSource).toContain("loading={commitOperation === \"commit\"}");
		expect(commitActionDialogSource).toContain("loading={commitOperation === \"commit_and_push\"}");
		expect(commitActionDialogSource).toContain("loading={commitOperation === \"push\"}");
		expect(gitActionControllerSource).not.toContain("provider: selectedProviderId");
		expect(gitActionControllerSource).not.toContain("model: selectedModelId");
	});

	it("wires branch listing checkout and creation into the shared git dialog", () => {
		expect(gitActionControllerSource).toContain("listWorkspaceGitBranches");
		expect(gitActionControllerSource).toContain("checkoutWorkspaceGitBranch");
		expect(gitActionControllerSource).toContain("createWorkspaceGitBranch");
		expect(branchActionDialogSource).toContain("Create & Checkout");
		expect(branchActionDialogSource).toContain("footer={null}");
		expect(gitActionControllerSource).toContain("createBranchDialogProps");
		expect(branchActionDialogSource).toContain("onCreateBranchOpen");
		expect(gitActionControllerSource).toContain("onRefresh:");
		expect(branchActionDialogSource).toContain("No branches found");
		expect(createBranchDialogSource).toContain("okText=\"Create & Checkout\"");
		expect(gitActionControllerSource).toContain("onBeforeBranchOpen");
		expect(agentSource).toContain("onBeforeBranchOpen");
	});
});

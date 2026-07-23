import { describe, expect, it } from "vitest";
import { readRepoFile } from "../../../../helpers/repo-paths";

describe("AgentPage git commit dialog source", () => {
	const agentSource: string = readRepoFile("src", "renderer", "src", "pages", "agent", "AgentPage.tsx");
	const gitActionDialogsSource: string = readRepoFile("src", "renderer", "src", "features", "git", "GitActionDialogs.tsx");
	const gitActionControllerSource: string = readRepoFile("src", "renderer", "src", "features", "git", "useGitActionDialogController.tsx");

	it("generates commit messages and wires commit push actions", () => {
		expect(gitActionControllerSource).toContain("generateGitCommitMessage");
		expect(gitActionControllerSource).toContain("commitOrPushGit");
		expect(agentSource).toContain("openCommitOrPushDialog");
		expect(agentSource).toContain("useGitActionDialogController");
		expect(agentSource).toContain("<GitActionDialogs {...gitActions.dialogProps} />");
		expect(gitActionControllerSource).toContain("handleCommitAction");
		expect(gitActionControllerSource).toContain("action !== \"push\"");
		expect(gitActionDialogsSource).toContain("Commit & Push");
		expect(gitActionDialogsSource).toContain("Includes unstaged changes");
		expect(gitActionDialogsSource).toContain("loading={commitOperation === \"commit\"}");
		expect(gitActionDialogsSource).toContain("loading={commitOperation === \"commit_and_push\"}");
		expect(gitActionDialogsSource).toContain("loading={commitOperation === \"push\"}");
		expect(gitActionControllerSource).not.toContain("provider: selectedProviderId");
		expect(gitActionControllerSource).not.toContain("model: selectedModelId");
	});
});

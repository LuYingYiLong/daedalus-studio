import { describe, expect, it } from "vitest";
import { readRepoFile } from "../../../../helpers/repo-paths";

describe("AgentPage git commit dialog source", () => {
	const agentSource: string = readRepoFile("src", "renderer", "src", "pages", "agent", "AgentPage.tsx");

	it("generates commit messages and wires commit push actions", () => {
		expect(agentSource).toContain("generateGitCommitMessage");
		expect(agentSource).toContain("commitOrPushGit");
		expect(agentSource).toContain("openCommitOrPushDialog");
		expect(agentSource).toContain("handleCommitOrPushAction");
		expect(agentSource).toContain("action !== \"push\"");
		expect(agentSource).toContain("Commit & Push");
		expect(agentSource).toContain("Includes unstaged changes");
		expect(agentSource).toContain("loading={commitOperation === \"commit\"}");
		expect(agentSource).toContain("loading={commitOperation === \"commit_and_push\"}");
		expect(agentSource).toContain("loading={commitOperation === \"push\"}");
		expect(agentSource).not.toContain("provider: selectedProviderId");
		expect(agentSource).not.toContain("model: selectedModelId");
	});
});

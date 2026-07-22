import { describe, expect, it } from "vitest";
import { readRepoFile } from "../../../helpers/repo-paths";

describe("workspace git API source", () => {
	const apiSource: string = readRepoFile("src", "renderer", "src", "api", "workspace-git-api.ts");

	it("wraps git commit message generation and commit or push RPCs", () => {
		expect(apiSource).toContain("workspace.git.commit.message.generate");
		expect(apiSource).toContain("workspace.git.commitOrPush");
		expect(apiSource).toContain("GenerateGitCommitMessageResult");
		expect(apiSource).toContain("CommitOrPushAction");
		expect(apiSource).toContain("commit_and_push");
	});
});

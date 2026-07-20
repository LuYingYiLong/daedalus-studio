import { describe, expect, it } from "vitest";
import { readRepoFile } from "../../../helpers/repo-paths";

describe("workspace git diff api source", () => {
	const apiSource: string = readRepoFile("src", "renderer", "src", "api", "workspace-git-diff-api.ts");

	it("requests the backend workspace git diff RPC", () => {
		expect(apiSource).toContain("fetchWorkspaceGitDiff");
		expect(apiSource).toContain("WorkspaceGitDiffResult");
		expect(apiSource).toContain("\"workspace.git.diff.get\"");
		expect(apiSource).toContain("workspaceId: string;");
	});
});

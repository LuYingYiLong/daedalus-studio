import { createBackendClient } from "./backend-client";

export type WorkspaceGitDiffResult = {
	workspaceId: string;
	hasGitRepository: boolean;
	branch: string | null;
	patch: string;
	additions: number;
	deletions: number;
	changedFiles: number;
	untrackedFiles: number;
	truncated: boolean;
	generatedAt: string;
};

export type FetchWorkspaceGitDiffParams = {
	workspaceId: string;
};

export async function fetchWorkspaceGitDiff(params: FetchWorkspaceGitDiffParams): Promise<WorkspaceGitDiffResult> {
	const client = await createBackendClient();

	return client.request<WorkspaceGitDiffResult>("workspace.git.diff.get", params);
}

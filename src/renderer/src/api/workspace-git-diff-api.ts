import { createBackendClient } from "@/shared/api/transport/backend-client";

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

export type WorkspaceGitDiffFileType = "add" | "delete" | "modify" | "rename" | "copy";

export type WorkspaceGitDiffFileSummary = {
	path: string;
	oldPath?: string;
	type: WorkspaceGitDiffFileType;
	additions: number | null;
	deletions: number | null;
	sizeBytes: number | null;
	isBinary: boolean;
	isUntracked: boolean;
	canAutoExpand: boolean;
};

export type WorkspaceGitDiffSummaryResult = {
	workspaceId: string;
	hasGitRepository: boolean;
	branch: string | null;
	additions: number;
	deletions: number;
	changedFiles: number;
	untrackedFiles: number;
	files: WorkspaceGitDiffFileSummary[];
	nextCursor: number | null;
	generatedAt: string;
};

export type WorkspaceGitDiffFileResult = {
	workspaceId: string;
	path: string;
	patch: string;
	isBinary: boolean;
	tooLargeToRender: boolean;
	generatedAt: string;
};

export type FetchWorkspaceGitDiffParams = {
	workspaceId: string;
};

export async function fetchWorkspaceGitDiff(params: FetchWorkspaceGitDiffParams): Promise<WorkspaceGitDiffResult> {
	const client = await createBackendClient();

	return client.request<WorkspaceGitDiffResult>("workspace.git.diff.get", params);
}

export async function fetchWorkspaceGitDiffSummary(params: FetchWorkspaceGitDiffParams & { cursor?: number; limit?: number }): Promise<WorkspaceGitDiffSummaryResult> {
	const client = await createBackendClient();
	return client.request<WorkspaceGitDiffSummaryResult>("workspace.git.diff.summary.get", params);
}

export async function fetchWorkspaceGitDiffFile(params: FetchWorkspaceGitDiffParams & { path: string }): Promise<WorkspaceGitDiffFileResult> {
	const client = await createBackendClient();
	return client.request<WorkspaceGitDiffFileResult>("workspace.git.diff.file.get", params);
}

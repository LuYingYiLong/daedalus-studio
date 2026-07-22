import { createBackendClient } from "./backend-client";

export type GenerateGitCommitMessageParams = {
	workspaceId: string;
	includeUnstagedChanges: boolean;
	provider?: string | undefined;
	model?: string | undefined;
};

export type GenerateGitCommitMessageResult = {
	message: string;
	subject: string;
	body: string;
	additions: number;
	deletions: number;
	changedFiles: number;
	truncated: boolean;
};

export type CommitOrPushAction = "commit" | "push" | "commit_and_push";

export type CommitOrPushParams = {
	workspaceId: string;
	action: CommitOrPushAction;
	message?: string | undefined;
	includeUnstagedChanges: boolean;
};

export type CommitOrPushResult = {
	workspaceId: string;
	action: CommitOrPushAction;
	branch: string | null;
	commitHash: string | null;
	committed: boolean;
	pushed: boolean;
	stdout: string;
	stderr: string;
};

export async function generateGitCommitMessage(params: GenerateGitCommitMessageParams): Promise<GenerateGitCommitMessageResult> {
	const client = await createBackendClient();

	return client.request<GenerateGitCommitMessageResult>("workspace.git.commit.message.generate", params);
}

export async function commitOrPushGit(params: CommitOrPushParams): Promise<CommitOrPushResult> {
	const client = await createBackendClient();

	return client.request<CommitOrPushResult>("workspace.git.commitOrPush", params);
}

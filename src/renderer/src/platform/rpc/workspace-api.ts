import { createBackendClient } from "@/platform/rpc/transport/backend-client";
import type {
	WorkspaceColor,
	WorkspaceConfig,
	WorkspaceIcon,
	WorkspaceListResult,
} from "./types";

export type ConfigureWorkspaceParams = {
	workspaceRoot: string;
	godotExecutablePath?: string;
	sessionId?: string | null;
};

export type ConfigureWorkspaceResult = {
	configured: true;
	godotExecutablePath: string | null;
	workspaceRoot: string | null;
	workspaceId: string | null;
	workspace: WorkspaceConfig | null;
};

export type ConfigureEnvironmentParams = ConfigureWorkspaceParams;
export type ConfigureEnvironmentResult = ConfigureWorkspaceResult;

export type DeleteWorkspaceResult = {
	deleted: true;
	workspaceId: string;
	movedSessions: Array<{
		sessionId: string;
		archived: boolean;
		workspaceId: string;
	}>;
	deletedSessionIds: string[];
	deletedArchivedSessionIds: string[];
};

export type UpdateWorkspaceParams = {
	workspaceId: string;
	name: string;
	icon: WorkspaceIcon;
	color: WorkspaceColor;
	sourceFolders: Array<{ id?: string; path: string }>;
	primarySourceFolderId: string;
};

export type SelectWorkspaceOptions = {
	sessionId?: string | null;
};

export type WorktreeEligibilitySource = {
	sourceFolderId: string;
	sourcePath: string;
	eligible: boolean;
	repositoryRoot: string | null;
	commonDirectory: string | null;
	baseCommit: string | null;
	baseRef: string | null;
	dirty: boolean;
	reasonCode: string | null;
	reason: string | null;
};

export type WorktreeEligibilityResult = {
	workspaceId: string;
	eligible: boolean;
	sources: WorktreeEligibilitySource[];
};

export type WorkspaceTreeOrderPreferences = {
	schemaVersion: 2;
	workspaceIds: string[];
	sessionIdsByWorkspace: Record<string, string[]>;
	pinnedSessionIds: string[];
	recentSessionIds: string[];
	expandedSectionKeys: WorkspaceTreeSectionKey[];
	expandedWorkspaceIds: string[];
	updatedAt: string;
};

export type WorkspaceTreeSectionKey = "pinned" | "projects" | "recent";

export type WorkspaceTreeOrderUpdate = Pick<
	WorkspaceTreeOrderPreferences,
	| "workspaceIds"
	| "sessionIdsByWorkspace"
	| "pinnedSessionIds"
	| "recentSessionIds"
	| "expandedSectionKeys"
	| "expandedWorkspaceIds"
>;

export async function fetchWorkspaces(): Promise<WorkspaceListResult> {
	const client = await createBackendClient();

	return client.request<WorkspaceListResult>("workspace.list");
}

export async function fetchWorkspaceTreeOrder(): Promise<WorkspaceTreeOrderPreferences> {
	const client = await createBackendClient();
	return client.request<WorkspaceTreeOrderPreferences>(
		"workspace.tree.order.get",
	);
}

export async function updateWorkspaceTreeOrder(
	order: WorkspaceTreeOrderUpdate,
): Promise<WorkspaceTreeOrderPreferences> {
	const client = await createBackendClient();
	return client.request<WorkspaceTreeOrderPreferences>(
		"workspace.tree.order.update",
		order,
	);
}

export async function selectWorkspace(
	workspaceId: string,
	options: SelectWorkspaceOptions = {},
): Promise<WorkspaceConfig> {
	const client = await createBackendClient();
	const result = await client.request<{
		selected: true;
		workspace: WorkspaceConfig;
	}>("workspace.select", {
		workspaceId,
		...options,
	});

	return result.workspace;
}

export async function configureEnvironment(
	params: ConfigureEnvironmentParams,
): Promise<ConfigureEnvironmentResult> {
	const client = await createBackendClient();

	return client.request<ConfigureEnvironmentResult>(
		"environment.configure",
		params,
	);
}

export async function deleteWorkspace(
	workspaceId: string,
): Promise<DeleteWorkspaceResult> {
	const client = await createBackendClient();

	return client.request<DeleteWorkspaceResult>("workspace.delete", {
		workspaceId,
	});
}

export async function getWorktreeEligibility(
	workspaceId: string,
): Promise<WorktreeEligibilityResult> {
	const client = await createBackendClient();
	return client.request<WorktreeEligibilityResult>(
		"workspace.worktree.eligibility.get",
		{ workspaceId },
	);
}

export async function updateWorkspace(
	params: UpdateWorkspaceParams,
): Promise<WorkspaceConfig> {
	const client = await createBackendClient();
	const result = await client.request<{ workspace: WorkspaceConfig }>(
		"workspace.update",
		params,
	);
	return result.workspace;
}

import { createBackendClient } from "@/shared/api/transport/backend-client";
import type { WorkspaceColor, WorkspaceConfig, WorkspaceIcon, WorkspaceListResult } from "./types";

export type ConfigureEnvironmentParams = {
	godotProjectPath: string;
	godotExecutablePath?: string;
	sessionId?: string | null;
};

export type ConfigureEnvironmentResult = {
	configured: true;
	godotExecutablePath: string | null;
	godotProjectPath: string | null;
	workspaceId: string | null;
	workspace: WorkspaceConfig | null;
};

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

export type WorkspaceTreeOrderPreferences = {
	schemaVersion: 2;
	workspaceIds: string[];
	sessionIdsByWorkspace: Record<string, string[]>;
	pinnedSessionIds: string[];
	recentSessionIds: string[];
	expandedSectionKeys: WorkspaceTreeSectionKey[];
	updatedAt: string;
};

export type WorkspaceTreeSectionKey = "pinned" | "projects" | "recent";

export type WorkspaceTreeOrderUpdate = Pick<
	WorkspaceTreeOrderPreferences,
	"workspaceIds"
	| "sessionIdsByWorkspace"
	| "pinnedSessionIds"
	| "recentSessionIds"
	| "expandedSectionKeys"
>;

export async function fetchWorkspaces(): Promise<WorkspaceListResult> {
	const client = await createBackendClient();

	return client.request<WorkspaceListResult>("workspace.list");
}

export async function fetchWorkspaceTreeOrder(): Promise<WorkspaceTreeOrderPreferences> {
	const client = await createBackendClient();
	return client.request<WorkspaceTreeOrderPreferences>("workspace.tree.order.get");
}

export async function updateWorkspaceTreeOrder(
	order: WorkspaceTreeOrderUpdate
): Promise<WorkspaceTreeOrderPreferences> {
	const client = await createBackendClient();
	return client.request<WorkspaceTreeOrderPreferences>("workspace.tree.order.update", order);
}

export async function selectWorkspace(workspaceId: string, options: SelectWorkspaceOptions = {}): Promise<WorkspaceConfig> {
	const client = await createBackendClient();
	const result = await client.request<{ selected: true; workspace: WorkspaceConfig }>("workspace.select", {
		workspaceId,
		...options
	});

	return result.workspace;
}

export async function configureEnvironment(params: ConfigureEnvironmentParams): Promise<ConfigureEnvironmentResult> {
	const client = await createBackendClient();

	return client.request<ConfigureEnvironmentResult>("environment.configure", params);
}

export async function deleteWorkspace(workspaceId: string): Promise<DeleteWorkspaceResult> {
	const client = await createBackendClient();

	return client.request<DeleteWorkspaceResult>("workspace.delete", {
		workspaceId
	});
}

export async function updateWorkspace(params: UpdateWorkspaceParams): Promise<WorkspaceConfig> {
	const client = await createBackendClient();
	const result = await client.request<{ workspace: WorkspaceConfig }>("workspace.update", params);
	return result.workspace;
}

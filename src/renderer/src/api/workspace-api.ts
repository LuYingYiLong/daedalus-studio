import { createBackendClient } from "./backend-client";
import type { WorkspaceConfig, WorkspaceListResult } from "./types";

export async function fetchWorkspaces(): Promise<WorkspaceListResult> {
	const client = await createBackendClient();

	return client.request<WorkspaceListResult>("workspace.list");
}

export async function selectWorkspace(workspaceId: string): Promise<WorkspaceConfig> {
	const client = await createBackendClient();
	const result = await client.request<{ selected: true; workspace: WorkspaceConfig }>("workspace.select", {
		workspaceId
	});

	return result.workspace;
}

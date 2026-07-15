import { createBackendClient } from "./backend-client";
import type { WorkspaceConfig, WorkspaceListResult } from "./types";

export type ConfigureEnvironmentParams = {
	godotProjectPath: string;
	godotExecutablePath?: string;
};

export type ConfigureEnvironmentResult = {
	configured: true;
	godotExecutablePath: string | null;
	godotProjectPath: string | null;
	workspaceId: string | null;
	workspace: WorkspaceConfig | null;
};

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

export async function configureEnvironment(params: ConfigureEnvironmentParams): Promise<ConfigureEnvironmentResult> {
	const client = await createBackendClient();

	return client.request<ConfigureEnvironmentResult>("environment.configure", params);
}

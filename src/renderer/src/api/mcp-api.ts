import { createBackendClient } from "./backend-client";

export type McpTransport = "stdio" | "http";
export type McpPlanAccess = "disabled" | "read";
export type McpRuntimeStatus = "connected" | "connecting" | "failed" | "disabled" | string;

export type CustomMcpServer = {
	id: string;
	name: string;
	description: string;
	transport: McpTransport;
	enabled: boolean;
	planAccess: McpPlanAccess;
	createdAt: string;
	updatedAt: string;
	command: string | null;
	args: string[];
	envNames: string[];
	envMasked: Record<string, string>;
	url: string | null;
	headerNames: string[];
	headerMasked: Record<string, string>;
	status: McpRuntimeStatus;
	toolCount: number;
	error: string | null;
};

export type McpConfigListResult = {
	customMcpServers: CustomMcpServer[];
	mcpServers: CustomMcpServer[];
	connectedServerIds: string[];
	error?: string | undefined;
};

export type AddStdioMcpServerParams = {
	name: string;
	description?: string | undefined;
	transport: "stdio";
	enabled?: boolean | undefined;
	command: string;
	args?: string[] | undefined;
	env?: Record<string, string> | undefined;
};

export type AddHttpMcpServerParams = {
	name: string;
	description?: string | undefined;
	transport: "http";
	enabled?: boolean | undefined;
	url: string;
	headers?: Record<string, string> | undefined;
};

export type AddMcpServerParams = AddStdioMcpServerParams | AddHttpMcpServerParams;

export type UpdateStdioMcpServerParams = Omit<AddStdioMcpServerParams, "name"> & {
	serverId: string;
};

export type UpdateHttpMcpServerParams = Omit<AddHttpMcpServerParams, "name"> & {
	serverId: string;
};

export type UpdateMcpServerParams = UpdateStdioMcpServerParams | UpdateHttpMcpServerParams;

export type McpConfigMutationResult = McpConfigListResult & {
	added?: boolean | undefined;
	updated?: boolean | undefined;
	removed?: boolean | undefined;
	serverId?: string | undefined;
	server?: CustomMcpServer | null | undefined;
};

export async function fetchMcpConfig(): Promise<McpConfigListResult> {
	const client = await createBackendClient();
	return client.request<McpConfigListResult>("mcp.config.list");
}

export async function addMcpServer(params: AddMcpServerParams): Promise<McpConfigMutationResult> {
	const client = await createBackendClient();
	return client.request<McpConfigMutationResult>("mcp.config.add", params);
}

export async function updateMcpServer(params: UpdateMcpServerParams): Promise<McpConfigMutationResult> {
	const client = await createBackendClient();
	return client.request<McpConfigMutationResult>("mcp.config.update", params);
}

export async function removeMcpServer(serverId: string): Promise<McpConfigMutationResult> {
	const client = await createBackendClient();
	return client.request<McpConfigMutationResult>("mcp.config.remove", { serverId });
}

export async function setMcpServerEnabled(serverId: string, enabled: boolean): Promise<McpConfigMutationResult> {
	const client = await createBackendClient();
	return client.request<McpConfigMutationResult>("mcp.config.setEnabled", { serverId, enabled });
}

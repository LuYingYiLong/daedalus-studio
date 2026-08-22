import { createBackendClient } from "@/platform/rpc/transport/backend-client";

export async function startPluginLanguageService(serviceId: string, workspaceRoot: string): Promise<Record<string, unknown>> {
	const client = await createBackendClient();
	return client.request<Record<string, unknown>>("plugin.language-service.start", { serviceId, workspaceRoot });
}

export async function stopPluginLanguageService(serviceId: string): Promise<Record<string, unknown>> {
	const client = await createBackendClient();
	return client.request<Record<string, unknown>>("plugin.language-service.stop", { serviceId });
}

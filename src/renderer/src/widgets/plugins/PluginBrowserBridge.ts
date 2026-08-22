import { invokePluginBrowser } from "@/platform/rpc/plugin-p2-api";

export async function invokePluginBrowserAction(pluginId: string, action: string, args: Record<string, unknown> = {}): Promise<Record<string, unknown>> {
	return invokePluginBrowser(pluginId, action, args);
}

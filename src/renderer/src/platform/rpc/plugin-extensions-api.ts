import { createBackendClient } from "@/platform/rpc/transport/backend-client";

function namespacedId(pluginId: string, localId: string): string {
	return pluginId.startsWith("plugin:") || pluginId.startsWith("harness:")
		? `${pluginId}:${localId}`
		: `plugin:${pluginId}:${localId}`;
}

export type PluginP2RegistrySnapshot = {
	apiVersion: number;
	commands: Array<Record<string, unknown>>;
	contextProviders: Array<Record<string, unknown>>;
	panels: Array<Record<string, unknown>>;
	settings: Array<Record<string, unknown>>;
	timelineParts: Array<Record<string, unknown>>;
	browser: Array<Record<string, unknown>>;
	languageServices: Array<Record<string, unknown>>;
	events: Array<Record<string, unknown>>;
	warnings: string[];
};

export async function fetchPluginP2Registry(): Promise<PluginP2RegistrySnapshot> {
	const client = await createBackendClient();
	return client.request<PluginP2RegistrySnapshot>(
		"plugin.extensions.registry.get",
	);
}

export async function resolvePluginCommand(
	command: string,
	args: Record<string, string> = {},
): Promise<Record<string, unknown>> {
	const client = await createBackendClient();
	return client.request<Record<string, unknown>>("plugin.command.resolve", {
		command,
		args,
	});
}

export async function listPluginContextProviders(): Promise<{
	providers: Array<Record<string, unknown>>;
}> {
	const client = await createBackendClient();
	return client.request<{ providers: Array<Record<string, unknown>> }>(
		"plugin.context-provider.list",
	);
}

export async function resolvePluginContextProvider(
	providerId: string,
	args: Record<string, unknown> = {},
): Promise<Record<string, unknown>> {
	const client = await createBackendClient();
	return client.request<Record<string, unknown>>(
		"plugin.context-provider.resolve",
		{ providerId, args },
	);
}

export async function getPluginPanelState(
	pluginId: string,
	panelId: string,
	instanceId: string,
): Promise<Record<string, unknown>> {
	const client = await createBackendClient();
	return client.request<Record<string, unknown>>(
		"plugin.ui.panel.state.get",
		{ panelId: namespacedId(pluginId, `${panelId}:${instanceId}`) },
	);
}

export async function updatePluginPanelState(
	pluginId: string,
	panelId: string,
	instanceId: string,
	state: Record<string, unknown>,
): Promise<{ saved: true }> {
	const client = await createBackendClient();
	return client.request<{ saved: true }>("plugin.ui.panel.state.update", {
		panelId: namespacedId(pluginId, `${panelId}:${instanceId}`),
		state,
	});
}

export async function createPluginPanel(
	panelId: string,
	location: "side" | "bottom",
	state?: Record<string, unknown>,
): Promise<Record<string, unknown>> {
	const client = await createBackendClient();
	return client.request<Record<string, unknown>>("plugin.ui.panel.create", {
		panelId,
		location,
		...(state === undefined ? {} : { state }),
	});
}

export async function invokePluginPanelAction(
	panelId: string,
	action: string,
	args: Record<string, unknown> = {},
): Promise<Record<string, unknown>> {
	const client = await createBackendClient();
	return client.request<Record<string, unknown>>("plugin.ui.panel.action", {
		panelId,
		action,
		args,
	});
}

export async function getPluginSettingsState(
	pluginId: string,
	settingsId: string,
): Promise<Record<string, unknown>> {
	const client = await createBackendClient();
	return client.request<Record<string, unknown>>(
		"plugin.settings.state.get",
		{ settingsId: namespacedId(pluginId, settingsId) },
	);
}

export async function updatePluginSettingsState(
	pluginId: string,
	settingsId: string,
	state: Record<string, unknown>,
): Promise<{ saved: true }> {
	const client = await createBackendClient();
	return client.request<{ saved: true }>("plugin.settings.state.update", {
		settingsId: namespacedId(pluginId, settingsId),
		state,
	});
}

export async function publishPluginEvent(
	pluginId: string,
	topic: string,
	payload: Record<string, unknown>,
): Promise<Record<string, unknown>> {
	const client = await createBackendClient();
	return client.request<Record<string, unknown>>("plugin.events.publish", {
		pluginId,
		topic,
		payload,
	});
}

export async function subscribePluginEvents(
	pluginId: string,
	topic: string,
	cursor?: string,
): Promise<Record<string, unknown>> {
	const client = await createBackendClient();
	return client.request<Record<string, unknown>>("plugin.events.subscribe", {
		pluginId,
		topic,
		...(cursor === undefined ? {} : { cursor }),
	});
}

export async function acknowledgePluginEvent(
	pluginId: string,
	topic: string,
	cursor: string,
): Promise<Record<string, unknown>> {
	const client = await createBackendClient();
	return client.request<Record<string, unknown>>("plugin.events.ack", {
		pluginId,
		topic,
		cursor,
	});
}

export async function appendPluginTimelinePart(params: {
	pluginId: string;
	partType: string;
	title?: string;
	summary?: string;
	status?: "info" | "success" | "warning" | "error";
	data: Record<string, unknown>;
}): Promise<{ appended: true; requestId: string }> {
	const client = await createBackendClient();
	return client.request<{ appended: true; requestId: string }>(
		"plugin.timeline.append",
		params,
	);
}

export async function previewHarnessNativeConversion(
	pluginId: string,
): Promise<Record<string, unknown>> {
	const client = await createBackendClient();
	return client.request<Record<string, unknown>>(
		"plugin.harness.convert.preview",
		{ pluginId },
	);
}

export async function activateHarnessNativeConversion(
	pluginId: string,
	expectedFingerprint: string,
): Promise<Record<string, unknown>> {
	const client = await createBackendClient();
	return client.request<Record<string, unknown>>(
		"plugin.harness.convert.activate",
		{ pluginId, expectedFingerprint },
	);
}

export async function invokePluginBrowser(
	pluginId: string,
	action: string,
	args: Record<string, unknown> = {},
): Promise<Record<string, unknown>> {
	const client = await createBackendClient();
	return client.request<Record<string, unknown>>("plugin.browser.invoke", {
		pluginId,
		action,
		args,
	});
}

export async function startPluginLanguageService(
	serviceId: string,
	workspaceRoot: string,
): Promise<Record<string, unknown>> {
	const client = await createBackendClient();
	return client.request<Record<string, unknown>>(
		"plugin.language-service.start",
		{ serviceId, workspaceRoot },
	);
}

export async function stopPluginLanguageService(
	serviceId: string,
): Promise<Record<string, unknown>> {
	const client = await createBackendClient();
	return client.request<Record<string, unknown>>(
		"plugin.language-service.stop",
		{ serviceId },
	);
}

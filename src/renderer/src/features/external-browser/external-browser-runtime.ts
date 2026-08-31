import {
	createBackendClient,
	onBackendConnectionStateChanged,
} from "@/platform/rpc/transport/backend-client";
import { getPlatformRuntime } from "@/platform/runtime/platform-runtime";
import {
	browserId,
	browserObject,
	parseBrowserScope,
	sameBrowserScope,
	type ExternalBrowserScope,
} from "../../../../contracts/external-browser";
export function bindExternalBrowserRuntime(
	sessionId: string | null,
	workspaceId: string | null,
): () => void {
	const api = getPlatformRuntime().system?.externalBrowser;
	if (!api) return () => {};
	let alive = true,
		revision = 0,
		connectionId: string | null = null,
		supported = false,
		active: ExternalBrowserScope | null = null,
		heartbeatBusy = false;
	let removeEvents: (() => void) | undefined,
		ready = Promise.resolve();
	const handled = new Set<string>();
	const refresh = (): void => {
		const version = ++revision;
		connectionId = null;
		supported = false;
		ready = (async () => {
			await api.setContext(null);
			const client = await createBackendClient();
			const info = await client.request<{
				connection: { connectionId: string };
				features?: { externalBrowser?: number };
			}>("client.info");
			if (!alive || version !== revision) return;
			connectionId = info.connection.connectionId;
			supported = info.features?.externalBrowser === 1;
			if (supported)
				await api.setContext({ connectionId, sessionId, workspaceId });
		})().catch(() => {});
	};
	const heartbeat = async (): Promise<void> => {
		if (!active || !alive || heartbeatBusy) return;
		const scope = active;
		heartbeatBusy = true;
		try {
			const client = await createBackendClient();
			if (client.isOpen() && scope.connectionId === connectionId) {
				await Promise.all([
					api.heartbeat(scope),
					client.request("browser.external.update", {
						sessionId: scope.sessionId,
						runId: scope.runId,
						generation: scope.generation,
						state: "heartbeat",
					}),
				]);
			}
		} catch {
			/* 双端截止时间停止失联执行 */
		} finally {
			heartbeatBusy = false;
		}
	};
	const interval = setInterval(() => {
		void heartbeat();
	}, 1000);
	const removeState = api.onState((state) => {
		active = state.active;
		void heartbeat();
	});
	const removeRevoked = api.onRevoked((scope) => {
		if (scope.connectionId !== connectionId) return;
		void createBackendClient()
			.then((client) =>
				client.isOpen()
					? client.request("browser.external.update", {
							sessionId: scope.sessionId,
							runId: scope.runId,
							generation: scope.generation,
							state: "revoke",
						})
					: undefined,
			)
			.catch(() => {});
	});
	const removeConnection = onBackendConnectionStateChanged((state) => {
		if (state === "disconnected") {
			revision++;
			connectionId = null;
			active = null;
			void api.setContext(null);
		} else refresh();
	});
	refresh();
	void createBackendClient()
		.then((client) => {
			if (!alive) return;
			removeEvents = client.addEventListener((event) => {
				if (
					!event.data ||
					typeof event.data !== "object" ||
					(event.data as Record<string, unknown>).external !== true
				)
					return;
				const data = event.data as Record<string, unknown>;
				if (event.event === "browser.tool.cancel") {
					try {
						const scope = parseBrowserScope(data.scope);
						if (sameBrowserScope(active, scope)) {
							if (data.finished === true)
								void api
									.finish(scope, data.keepTarget === true)
									.catch(() => {});
							else void api.stop().catch(() => {});
						}
					} catch {
						/* 无效取消不能影响其他轮次 */
					}
					return;
				}
				if (event.event !== "browser.tool.request") return;
				void (async () => {
					await ready;
					if (!alive || !supported) return;
					const scope = parseBrowserScope(data.scope),
						callId = browserId(data.callId);
					if (
						scope.sessionId !== sessionId ||
						scope.connectionId !== connectionId ||
						handled.has(callId)
					)
						return;
					handled.add(callId);
					if (handled.size > 512)
						handled.delete(handled.values().next().value!);
					const version = revision;
					try {
						const result = await api.execute({
							scope,
							callId,
							toolCallId: browserId(data.toolCallId),
							toolName: String(data.toolName),
							args: browserObject(data.args),
						});
						if (alive && version === revision && client.isOpen())
							await client.request("browser.tool.result", {
								callId,
								ok: true,
								result,
							});
					} catch (error) {
						const code =
							error instanceof Error
								? error.message.match(/browser_[a-z_]+/u)?.[0] ||
									"browser_failed"
								: "browser_failed";
						if (alive && version === revision && client.isOpen())
							await client.request("browser.tool.result", {
								callId,
								ok: false,
								error: { code, message: code, retryable: false },
							});
					}
				})().catch(() => {});
			});
		})
		.catch(() => {});
	return () => {
		alive = false;
		revision++;
		clearInterval(interval);
		removeState();
		removeEvents?.();
		removeConnection();
		void api
			.setContext(null)
			.catch(() => {})
			.finally(removeRevoked);
	};
}

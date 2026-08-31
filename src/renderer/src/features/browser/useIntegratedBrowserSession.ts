import { useCallback, useEffect, useRef } from "react";
import type { MessageInstance } from "antd/es/message/interface";
import { useTranslation } from "react-i18next";
import {
	createDefaultBrowserPanelLayout,
	type DockLayoutPreferences,
	type SessionLayoutPreferences,
} from "@/domain/session/session-layout";
import { createDockTab } from "@/widgets/dock/DockPanelTabs";
import { createBackendClient } from "@/platform/rpc/transport/backend-client";
import type { BackendEvent } from "@/platform/rpc/transport/backend-rpc-client";
import {
	findBrowserRuntime,
	waitForBrowserRuntime,
	type BrowserRuntimeRegistration,
} from "@/widgets/browser/browser-runtime-registry";
import { getCachedClientPreferences } from "@/platform/rpc/client-preferences-api";

export type IntegratedBrowserSessionParams = {
	activeSessionId: string | null;
	visualSessionLayoutRef: { current: SessionLayoutPreferences };
	commitSessionLayout: (layout: SessionLayoutPreferences) => void;
	messageApi: MessageInstance;
};

export type IntegratedBrowserSession = {
	openMessageWebUrl: (url: string) => void;
	openMessageHtmlFile: (params: {
		workspaceRoot: string;
		filePath: string;
	}) => void;
};

export default function useIntegratedBrowserSession({
	activeSessionId,
	visualSessionLayoutRef,
	commitSessionLayout,
	messageApi,
}: IntegratedBrowserSessionParams): IntegratedBrowserSession {
	const { t } = useTranslation();

	const ensureBrowserRuntime = useCallback(
		async (sessionId: string): Promise<BrowserRuntimeRegistration> => {
			const registered: BrowserRuntimeRegistration | null =
				findBrowserRuntime(sessionId);
			if (registered !== null) {
				const current: SessionLayoutPreferences =
					visualSessionLayoutRef.current;
				const targetLayout: DockLayoutPreferences =
					registered.placement === "side"
						? current.side
						: current.bottom;
				commitSessionLayout({
					...current,
					[registered.placement]: {
						...targetLayout,
						open: true,
						activeTabKey: registered.panelKey,
					},
				});
				return registered;
			}

			const current: SessionLayoutPreferences =
				visualSessionLayoutRef.current;
			const sideTab = current.side.tabs.find(
				(tab): boolean => tab.kind === "browser",
			);
			const bottomTab = current.bottom.tabs.find(
				(tab): boolean => tab.kind === "browser",
			);
			if (sideTab !== undefined || bottomTab !== undefined) {
				const placement =
					sideTab !== undefined
						? ("side" as const)
						: ("bottom" as const);
				const tab = sideTab ?? bottomTab!;
				const targetLayout: DockLayoutPreferences =
					placement === "side" ? current.side : current.bottom;
				commitSessionLayout({
					...current,
					[placement]: {
						...targetLayout,
						open: true,
						activeTabKey: tab.key,
					},
				});
				return await waitForBrowserRuntime(sessionId);
			}

			const tab = createDockTab("side", "browser", 1);
			commitSessionLayout({
				...current,
				side: {
					...current.side,
					open: true,
					tabs: [...current.side.tabs, tab],
					activeTabKey: tab.key,
				},
				browserPanels: {
					...current.browserPanels,
					[tab.key]: createDefaultBrowserPanelLayout(),
				},
			});
			return await waitForBrowserRuntime(sessionId);
		},
		[commitSessionLayout, visualSessionLayoutRef],
	);

	const openMessageWebUrl = useCallback(
		(url: string): void => {
			const rawUrl: string = url.trim();
			let parsed: URL;
			try {
				parsed = new URL(rawUrl);
			} catch {
				return;
			}
			if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
				return;
			}

			const preferences = getCachedClientPreferences();
			if (
				preferences.webLinkOpenMode === "external" ||
				activeSessionId === null
			) {
				void window.electronAPI.windowControl.openExternal(rawUrl);
				return;
			}

			void ensureBrowserRuntime(activeSessionId)
				.then(
					(runtime: BrowserRuntimeRegistration): Promise<unknown> =>
						window.electronAPI.browser.view.navigate(
							runtime.browserId,
							rawUrl,
						),
				)
				.catch((error: unknown): void => {
					console.error(
						"[HomePage] failed to open web link in integrated browser",
						error,
					);
					messageApi.error(t("chat.markdownResource.openWebLinkFailed"));
				});
		},
		[activeSessionId, ensureBrowserRuntime, messageApi, t],
	);

	const openMessageHtmlFile = useCallback(
		(params: { workspaceRoot: string; filePath: string }): void => {
			const preferences = getCachedClientPreferences();
			if (
				preferences.webLinkOpenMode === "external" ||
				activeSessionId === null
			) {
				void window.electronAPI.workspaceFs
					.openFile(params)
					.catch((error: unknown): void => {
						console.error(
							"[HomePage] failed to open HTML file externally",
							error,
						);
						messageApi.error(
							t("chat.markdownResource.openWebLinkFailed"),
						);
					});
				return;
			}

			void ensureBrowserRuntime(activeSessionId)
				.then(
					(runtime: BrowserRuntimeRegistration): Promise<unknown> =>
						window.electronAPI.browser.view.openFile(
							runtime.browserId,
							params,
						),
				)
				.catch((error: unknown): void => {
					console.error(
						"[HomePage] failed to open HTML file in integrated browser",
						error,
					);
					messageApi.error(t("chat.markdownResource.openWebLinkFailed"));
				});
		},
		[activeSessionId, ensureBrowserRuntime, messageApi, t],
	);

	const activeBrowserCallsRef = useRef<Map<string, string>>(new Map());
	useEffect((): (() => void) => {
		let disposed: boolean = false;
		let removeListener: (() => void) | null = null;
		void createBackendClient()
			.then((client): void => {
				if (disposed) return;
				removeListener = client.addEventListener(
					(event: BackendEvent): void => {
						if (event.data && typeof event.data === "object" && (event.data as Record<string, unknown>).external === true) return;
						if (event.event === "browser.tool.cancel") {
							const data = event.data as
								| { callId?: unknown }
								| undefined;
							if (typeof data?.callId !== "string") return;
							const browserId: string | undefined =
								activeBrowserCallsRef.current.get(data.callId);
							if (browserId !== undefined)
								void window.electronAPI.browser.automation.cancel(
									browserId,
									data.callId,
								);
							return;
						}
						if (event.event !== "browser.tool.request") return;
						const data = event.data as
							| {
									callId?: unknown;
									sessionId?: unknown;
									toolName?: unknown;
									args?: unknown;
							  }
							| undefined;
						if (
							typeof data?.callId !== "string" ||
							typeof data.sessionId !== "string" ||
							typeof data.toolName !== "string" ||
							data.args === null ||
							typeof data.args !== "object" ||
							Array.isArray(data.args)
						)
							return;
						const callId: string = data.callId;
						const requestSessionId: string = data.sessionId;
						const toolName: string = data.toolName;
						const args: Record<string, unknown> =
							data.args as Record<string, unknown>;
						void (async (): Promise<void> => {
							if (requestSessionId !== activeSessionId)
								throw new Error("browser_session_not_active");
							const runtime: BrowserRuntimeRegistration =
								await ensureBrowserRuntime(requestSessionId);
							activeBrowserCallsRef.current.set(
								callId,
								runtime.browserId,
							);
							try {
								const result =
									await window.electronAPI.browser.automation.execute({
										browserId: runtime.browserId,
										callId,
										toolName,
										args,
									});
								await client.request("browser.tool.result", {
									callId,
									ok: true,
									result,
								});
							} finally {
								activeBrowserCallsRef.current.delete(callId);
							}
						})().catch((error: unknown): void => {
							const message: string =
								error instanceof Error ? error.message : String(error);
							void client
								.request("browser.tool.result", {
									callId,
									ok: false,
									error: {
										code:
											message.match(/browser_[a-z_]+/u)?.[0] ??
											"browser_tool_failed",
										message,
										retryable: /busy|timeout|unavailable/u.test(
											message,
										),
									},
								})
								.catch((): void => {});
						});
					},
				);
			})
			.catch((error: unknown): void => {
				console.error(
					"[HomePage] failed to attach browser tool runtime",
					error,
				);
			});
		return (): void => {
			disposed = true;
			removeListener?.();
		};
	}, [activeSessionId, ensureBrowserRuntime]);

	return { openMessageWebUrl, openMessageHtmlFile };
}

import type { Tab } from "./chrome-api";
import { NativeConnection } from "./native-connection";
import { BrowserNetworkIdle } from "../contracts/browser-network-idle";
import {
	browserId,
	browserObject,
	normalizeExternalBrowserUrl,
	parseBrowserScope,
	sameBrowserScope,
	type ExternalBrowserScope,
} from "../contracts/external-browser";
type Target = {
	id: string;
	tabId: number;
	url: string;
	scope: ExternalBrowserScope;
	deadline: number;
	attached: boolean;
	suspended: boolean;
	world?: number;
	pendingUntil?: number;
	network: BrowserNetworkIdle;
};
const targets = new Map<string, Target>(),
	matches = new Map<string, number>();
const methods = new Set([
	"Page.enable",
	"Page.getFrameTree",
	"Page.createIsolatedWorld",
	"Page.captureScreenshot",
	"Runtime.evaluate",
]);
const connection = new NativeConnection(
	chrome,
	__BROWSER_CHANNEL__,
	navigator.userAgent.includes("Edg/") ? "Microsoft Edge" : "Google Chrome",
	operation,
	() => {
		matches.clear();
		for (const target of [...targets.values()]) void detach(target);
	},
);
const send = (value: unknown): void => connection.send(value);
async function detach(target: Target): Promise<void> {
	targets.delete(target.id);
	target.suspended = true;
	if (target.attached) {
		if (target.world)
			await chrome.debugger
				.sendCommand({ tabId: target.tabId }, "Runtime.evaluate", {
					contextId: target.world,
					expression: "globalThis.__daedalusExternal?.('clear', {})",
				})
				.catch(() => {});
		await chrome.debugger.detach({ tabId: target.tabId }).catch(() => {});
	}
}
function lost(target: Target, code: string): void {
	send({ kind: "revoked", scope: target.scope, code });
	void detach(target);
}
async function operation(
	message: Record<string, unknown>,
	checkConnection: () => void,
): Promise<unknown> {
	checkConnection();
	const scope = parseBrowserScope(message.scope),
		args = browserObject(message.args),
		op = String(message.operation);
	if (op === "connect" || op === "match") {
		const url = normalizeExternalBrowserUrl(args.url),
			tabs = (await chrome.tabs.query({})).filter((tab) => {
				try {
					return normalizeExternalBrowserUrl(tab.url) === url;
				} catch {
					return false;
				}
			});
		checkConnection();
		if (op === "match" || (tabs.length > 1 && args.matchId === undefined)) {
			matches.clear();
			return {
				ambiguous: true,
				matches: tabs.slice(0, 20).map((tab) => {
					const id = crypto.randomUUID();
					matches.set(id, tab.id!);
					return { matchId: id, title: (tab.title || "").slice(0, 200), url };
				}),
			};
		}
		let tab: Tab | undefined =
			args.matchId === undefined
				? tabs[0]
				: tabs.find((tab) => tab.id === matches.get(browserId(args.matchId)));
		if (args.matchId !== undefined && !tab)
			throw new Error("browser_match_stale");
		if (!tab) tab = await chrome.tabs.create({ url, active: false });
		checkConnection();
		if (tab.id === undefined) throw new Error("browser_tab_missing");
		if ([...targets.values()].some((item) => item.tabId === tab!.id))
			throw new Error("browser_tab_busy");
		const id = crypto.randomUUID(),
			target: Target = {
				id,
				tabId: tab.id,
				url,
				scope,
				deadline: Date.now() + 5000,
				attached: false,
				suspended: false,
				network: new BrowserNetworkIdle(),
			};
		targets.set(id, target);
		try {
			await chrome.debugger.attach({ tabId: target.tabId }, "1.3");
			target.attached = true;
			checkConnection();
			await chrome.debugger.sendCommand({ tabId: target.tabId }, "Page.enable");
			await chrome.debugger.sendCommand(
				{ tabId: target.tabId },
				"Network.enable",
				{
					maxTotalBufferSize: 0,
					maxResourceBufferSize: 0,
					maxPostDataSize: 0,
				},
			);
			checkConnection();
		} catch {
			await detach(target);
			throw new Error("browser_debugger_unavailable");
		}
		return { targetId: id, url, title: (tab.title || "").slice(0, 200) };
	}
	const target = targets.get(browserId(args.targetId));
	if (!target) throw new Error("browser_target_stale");
	if (op === "lease") {
		if (
			target.scope.sessionId !== scope.sessionId ||
			target.scope.connectionId !== scope.connectionId ||
			(!sameBrowserScope(target.scope, scope) &&
				(!target.pendingUntil || Date.now() > target.pendingUntil))
		)
			throw new Error("browser_lease_stale");
		target.scope = scope;
		target.deadline = Date.now() + 5000;
		target.suspended = false;
		target.pendingUntil = undefined;
		return {};
	}
	if (!sameBrowserScope(target.scope, scope))
		throw new Error("browser_scope_stale");
	if (op === "close") {
		await detach(target);
		return {};
	}
	if (op === "heartbeat") {
		if (!target.suspended) target.deadline = Date.now() + 5000;
		return {};
	}
	if (op === "finish") {
		target.suspended = true;
		target.pendingUntil = Date.now() + 600000;
		if (target.world)
			await chrome.debugger.sendCommand(
				{ tabId: target.tabId },
				"Runtime.evaluate",
				{
					contextId: target.world,
					expression: "globalThis.__daedalusExternal?.('suspend', {})",
				},
			);
		return {};
	}
	if (target.suspended || target.deadline < Date.now())
		throw new Error("browser_lease_expired");
	if (
		normalizeExternalBrowserUrl((await chrome.tabs.get(target.tabId)).url) !==
		target.url
	) {
		lost(target, "browser_page_changed");
		throw new Error("browser_page_changed");
	}
	if (
		!targets.has(target.id) ||
		target.suspended ||
		target.deadline < Date.now() ||
		!sameBrowserScope(target.scope, scope)
	)
		throw new Error("browser_scope_stale");
	if (op === "networkIdle") return { idle: target.network.isIdle() };
	if (op !== "cdp") throw new Error("browser_operation_forbidden");
	const method = String(args.method),
		params = browserObject(args.params || {});
	if (
		!methods.has(method) ||
		params.grantUniveralAccess ||
		params.grantUniversalAccess
	)
		throw new Error("browser_cdp_forbidden");
	if (
		method === "Runtime.evaluate" &&
		(!target.world || params.contextId !== target.world)
	)
		throw new Error("browser_isolated_world_required");
	const result = await chrome.debugger.sendCommand(
		{ tabId: target.tabId },
		method,
		params,
	);
	if (method === "Page.createIsolatedWorld")
		target.world = Number(browserObject(result).executionContextId);
	if (
		!targets.has(target.id) ||
		target.suspended ||
		!sameBrowserScope(target.scope, scope)
	)
		throw new Error("browser_scope_stale");
	return result;
}
setInterval(() => {
	for (const target of targets.values())
		if (
			target.suspended
				? Date.now() > (target.pendingUntil || 0)
				: Date.now() > target.deadline
		)
			lost(target, "browser_lease_expired");
}, 500);
setInterval(() => {
	void connection.connect().catch(() => {});
}, 3000);
chrome.tabs.onRemoved.addListener((tabId) => {
	for (const target of targets.values())
		if (target.tabId === tabId) lost(target, "browser_tab_closed");
});
chrome.tabs.onUpdated.addListener((tabId, change) => {
	for (const target of targets.values())
		if (target.tabId === tabId && change.url && change.url !== target.url)
			lost(target, "browser_page_changed");
});
chrome.debugger.onDetach.addListener((target) => {
	for (const item of targets.values())
		if (target.tabId === item.tabId) {
			item.attached = false;
			lost(item, "browser_debugger_detached");
		}
});
chrome.debugger.onEvent.addListener((target, method, params) => {
	for (const item of [...targets.values()])
		if (item.tabId === target.tabId) {
			item.network.accept(method, params?.requestId);
			if (method === "Page.javascriptDialogOpening")
				lost(item, "browser_native_dialog");
			else if (method === "Page.windowOpen")
				lost(item, "browser_unplanned_popup");
			else if (method === "Page.frameNavigated" && item.world)
				lost(item, "browser_document_changed");
		}
});
chrome.runtime.onMessage.addListener((message, sender, respond) => {
	if (sender.url !== chrome.runtime.getURL("status.html")) return;
	const row = browserObject(message);
	const state = () => ({
		...connection.state(),
		channel: __BROWSER_CHANNEL__,
		active: [...targets.values()].filter((t) => !t.suspended).length,
	});
	void (async () => {
		if (row.method === "stop") {
			for (const target of [...targets.values()])
				lost(target, "browser_user_cancelled");
		} else if (row.method === "enable") {
			await connection.setEnabled(row.enabled === true);
		} else if (row.method === "state" || row.method === "retry") {
			// 打开状态页会唤醒 MV3 worker；仅恢复通道，不恢复标签页租约
			await connection.connect();
		}
		respond(state());
	})().catch(() =>
		respond({ ...state(), error: "browser_extension_unavailable" }),
	);
	return true;
});
void connection.connect();

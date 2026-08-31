import { randomUUID } from "node:crypto";
import {
	browserId,
	browserObject,
	normalizeExternalBrowserUrl,
	parseBrowserScope,
	parseBrowserSteps,
	sameBrowserScope,
	type ExternalBrowserContext,
	type ExternalBrowserRequest,
	type ExternalBrowserScope,
	type ExternalBrowserState,
} from "../../../contracts/external-browser";
import type { BrowserCdpTransport } from "./browser-transport";
import { BrowserHostClient } from "./browser-host-client";
import { createExternalDomRuntime } from "./external-dom-runtime";
import cursorSvg from "../../../renderer/src/assets/icons/ai-cursor.svg?raw";
import { clientPreferencesService } from "../client-preferences";
type Target = {
	peer: number;
	url: string;
	scope: ExternalBrowserScope;
	world?: number;
	pendingUntil?: number;
};
type Preparation = {
	targetId: string;
	id: string;
	steps: Record<string, unknown>[];
	scope: ExternalBrowserScope;
	expires: number;
};
export class ExternalBrowserService {
	readonly host: BrowserHostClient;
	private enabled = false;
	private defaultConnectionId: string | null = null;
	private context: ExternalBrowserContext | null = null;
	private active: ExternalBrowserScope | null = null;
	private targets = new Map<string, Target>();
	private matches = new Map<
		string,
		{ peer: number; url: string; scope: ExternalBrowserScope; expires: number }
	>();
	private preparations = new Map<string, Preparation>();
	private results = new Map<string, Record<string, unknown>>();
	private busy = false;
	private lastHeartbeat = 0;
	private error: string | null = null;
	private timer: NodeJS.Timeout;
	constructor(
		directory: string,
		channel: "stable" | "development",
		private readonly changed: (state: ExternalBrowserState) => void,
		private readonly revoked: (scope: ExternalBrowserScope) => void,
	) {
		this.host = new BrowserHostClient(
			directory,
			channel,
			() => {
				if (
					[...this.targets.values()].some((t) => !this.host.peers.has(t.peer))
				)
					this.stop();
				this.publish();
			},
			(scope) => {
				try {
					const parsed = parseBrowserScope(scope);
					if (
						sameBrowserScope(this.active, parsed) ||
						[...this.targets.values()].some((target) =>
							sameBrowserScope(target.scope, parsed),
						)
					)
						this.stop();
				} catch {
					this.stop();
				}
			},
		);
		this.timer = setInterval(() => {
			if (this.active && Date.now() - this.lastHeartbeat > 5000) this.stop();
			for (const [id, target] of this.targets)
				if (target.pendingUntil && target.pendingUntil < Date.now())
					this.closeTarget(id, target);
			for (const [id, match] of this.matches)
				if (match.expires < Date.now()) this.matches.delete(id);
		}, 500);
		this.timer.unref();
	}
	state(): ExternalBrowserState {
		return {
			available: process.platform === "win32" && process.arch === "x64",
			enabled: this.enabled,
			defaultConnectionId: this.defaultConnectionId,
			connections: [...this.host.peers.values()].map((p) => ({
				id: p.id,
				name: p.name,
			})),
			active: this.active,
			error: this.error,
		};
	}
	private publish(): void {
		this.changed(this.state());
	}
	async configure(patch: {
		enabled?: boolean;
		defaultConnectionId?: string | null;
	}): Promise<ExternalBrowserState> {
		if (patch.defaultConnectionId !== undefined) {
			if (patch.defaultConnectionId !== null)
				browserId(patch.defaultConnectionId);
			this.defaultConnectionId = patch.defaultConnectionId;
		}
		if (patch.enabled !== undefined) this.enabled = patch.enabled === true;
		if (!this.enabled) {
			this.stop();
			this.host.stop();
		} else {
			try {
				if (!this.state().available)
					throw new Error("browser_platform_unsupported");
				await this.host.start();
				this.error = null;
			} catch (error) {
				this.enabled = false;
				this.error =
					error instanceof Error ? error.message : "browser_host_unavailable";
				this.publish();
				throw error;
			}
		}
		this.publish();
		return this.state();
	}
	setContext(context: ExternalBrowserContext | null): void {
		if (JSON.stringify(context) !== JSON.stringify(this.context)) {
			this.stop();
			this.context = context;
		}
	}
	private valid(scope: ExternalBrowserScope): void {
		if (
			!this.enabled ||
			this.context?.connectionId !== scope.connectionId ||
			this.context.sessionId !== scope.sessionId ||
			!sameBrowserScope(this.active, scope) ||
			Date.now() - this.lastHeartbeat > 5000
		)
			throw new Error("browser_scope_stale");
	}
	private target(id: unknown, scope: ExternalBrowserScope): [string, Target] {
		this.valid(scope);
		const key = browserId(id),
			target = this.targets.get(key);
		if (!target || !sameBrowserScope(target.scope, scope))
			throw new Error("browser_target_stale");
		return [key, target];
	}
	heartbeat(scope: ExternalBrowserScope): void {
		if (!sameBrowserScope(this.active, scope)) return;
		this.lastHeartbeat = Date.now();
		for (const [id, target] of this.targets)
			if (sameBrowserScope(target.scope, scope) && !target.pendingUntil)
				void this.host
					.request(target.peer, "heartbeat", { targetId: id }, scope)
					.catch(() => {
						if (sameBrowserScope(this.active, scope)) this.stop();
					});
	}
	private transport(
		id: string,
		target: Target,
		scope: ExternalBrowserScope,
	): BrowserCdpTransport {
		return {
			acquire: async () => () => {},
			sendCommand: async <T>(
				method: string,
				params?: Record<string, unknown>,
			): Promise<T> => {
				this.valid(scope);
				const result = await this.host.request(
					target.peer,
					"cdp",
					{ targetId: id, method, params: params || {} },
					scope,
				);
				this.valid(scope);
				return result as T;
			},
		};
	}
	private async evaluate(
		id: string,
		target: Target,
		scope: ExternalBrowserScope,
		op: string,
		args: Record<string, unknown> = {},
	): Promise<Record<string, unknown>> {
		const cdp = this.transport(id, target, scope);
		if (!target.world) {
			const tree = await cdp.sendCommand<{
				frameTree: { frame: { id: string; url: string } };
			}>("Page.getFrameTree");
			if (normalizeExternalBrowserUrl(tree.frameTree.frame.url) !== target.url)
				throw new Error("browser_page_changed");
			const world = await cdp.sendCommand<{ executionContextId: number }>(
				"Page.createIsolatedWorld",
				{
					frameId: tree.frameTree.frame.id,
					worldName: "daedalus-external-browser",
				},
			);
			target.world = world.executionContextId;
			await cdp.sendCommand("Runtime.evaluate", {
				contextId: target.world,
				expression: `(${createExternalDomRuntime.toString()})()`,
				returnByValue: true,
			});
		}
		const response = await cdp.sendCommand<{
			result?: { value?: unknown };
			exceptionDetails?: { exception?: { description?: string } };
		}>("Runtime.evaluate", {
			contextId: target.world,
			expression: `globalThis.__daedalusExternal(${JSON.stringify(op)}, ${JSON.stringify(args)})`,
			returnByValue: true,
			awaitPromise: false,
		});
		if (response.exceptionDetails) {
			const code =
				response.exceptionDetails.exception?.description?.match(
					/browser_[a-z_]+/u,
				)?.[0];
			throw new Error(code || "browser_dom_unavailable");
		}
		return browserObject(response.result?.value);
	}
	async execute(raw: ExternalBrowserRequest): Promise<Record<string, unknown>> {
		const scope = parseBrowserScope(raw.scope),
			args = browserObject(raw.args);
		browserId(raw.callId);
		browserId(raw.toolCallId);
		if (
			![
				"connect",
				"observe",
				"scroll",
				"wait",
				"screenshot",
				"prepare",
				"execute",
			].includes(raw.toolName)
		)
			throw new Error("browser_operation_forbidden");
		if (
			!this.enabled ||
			this.context?.connectionId !== scope.connectionId ||
			this.context.sessionId !== scope.sessionId
		)
			throw new Error("browser_context_mismatch");
		if (this.active && !sameBrowserScope(this.active, scope))
			throw new Error("browser_run_busy");
		if (this.busy) throw new Error("browser_busy");
		this.active = scope;
		this.lastHeartbeat = Date.now();
		this.busy = true;
		this.publish();
		try {
			if (raw.toolName === "connect") {
				const url = normalizeExternalBrowserUrl(args.url),
					peers = [...this.host.peers.values()];
				let peer =
					args.connectionId === undefined
						? undefined
						: peers.find((p) => p.id === browserId(args.connectionId));
				if (args.connectionId !== undefined && !peer)
					throw new Error("browser_not_connected");
				let matchId =
					args.matchId === undefined ? undefined : browserId(args.matchId);
				if (matchId) {
					const match = this.matches.get(matchId);
					if (
						!match ||
						match.url !== url ||
						match.expires <= Date.now() ||
						match.scope.connectionId !== scope.connectionId ||
						match.scope.sessionId !== scope.sessionId ||
						(peer && peer.peer !== match.peer)
					)
						throw new Error("browser_match_stale");
					peer = peers.find((p) => p.peer === match.peer);
				} else {
					// 先在所有连接中精确匹配；默认浏览器只决定无匹配时在哪里新建
					this.matches.clear();
					const matches = (
						await Promise.all(
							(peer ? [peer] : peers).map(async (candidate) => {
								const result = await this.host.request(
									candidate.peer,
									"match",
									{ url },
									scope,
								);
								this.valid(scope);
								if (
									!Array.isArray(result.matches) ||
									result.matches.length > 20
								)
									throw new Error("browser_matches_invalid");
								return result.matches.map((raw) => {
									const match = browserObject(raw),
										id = browserId(match.matchId);
									if (
										match.url !== url ||
										typeof match.title !== "string" ||
										match.title.length > 200
									)
										throw new Error("browser_matches_invalid");
									this.matches.set(id, {
										peer: candidate.peer,
										url,
										scope,
										expires: Date.now() + 600000,
									});
									return {
										matchId: id,
										connectionId: candidate.id,
										browser: candidate.name,
										title: match.title,
										url,
									};
								});
							}),
						)
					).flat();
					if (matches.length > 1) return { ambiguous: true, matches };
					if (matches.length === 1) {
						matchId = matches[0].matchId;
						peer = peers.find((p) => p.id === matches[0].connectionId);
					} else
						peer ??=
							peers.find((p) => p.id === this.defaultConnectionId) ??
							(peers.length === 1 ? peers[0] : undefined);
				}
				if (!peer)
					throw new Error(
						peers.length > 1
							? "browser_default_required"
							: "browser_not_connected",
					);
				const result = await this.host.request(
					peer.peer,
					"connect",
					{ url, matchId },
					scope,
				);
				this.valid(scope);
				if (result.targetId && result.url === url)
					this.targets.set(browserId(result.targetId), {
						peer: peer.peer,
						url,
						scope,
					});
				return result;
			}
			const key = browserId(args.targetId),
				retained = this.targets.get(key);
			if (
				retained?.pendingUntil &&
				retained.pendingUntil > Date.now() &&
				retained.scope.connectionId === scope.connectionId &&
				retained.scope.sessionId === scope.sessionId
			) {
				await this.host.request(
					retained.peer,
					"lease",
					{ targetId: key },
					scope,
				);
				this.valid(scope);
				retained.scope = scope;
				retained.pendingUntil = undefined;
			}
			const [id, target] = this.target(args.targetId, scope);
			if (raw.toolName === "observe" || raw.toolName === "scroll")
				return await this.evaluate(id, target, scope, raw.toolName, args);
			if (raw.toolName === "wait") {
				const timeoutMs = args.timeoutMs ?? 5000;
				if (
					!["load", "text", "network_idle"].includes(String(args.condition)) ||
					typeof timeoutMs !== "number" ||
					!Number.isInteger(timeoutMs) ||
					timeoutMs < 100 ||
					timeoutMs > 10000
				)
					throw new Error("browser_invalid_wait");
				const deadline = Date.now() + timeoutMs;
				do {
					const result = await this.evaluate(id, target, scope, "wait", args);
					const idle =
						args.condition === "network_idle"
							? (
									await this.host.request(
										target.peer,
										"networkIdle",
										{ targetId: id },
										scope,
									)
								).idle === true
							: true;
					this.valid(scope);
					if (result.ready === true && idle)
						return {
							ready: true,
							condition: args.condition,
							...(await this.evaluate(id, target, scope, "observe")),
						};
					await new Promise((resolve) =>
						setTimeout(
							resolve,
							Math.min(100, Math.max(0, deadline - Date.now())),
						),
					);
				} while (Date.now() < deadline);
				throw new Error("browser_wait_timeout");
			}
			if (raw.toolName === "screenshot") {
				await this.evaluate(id, target, scope, "hide");
				try {
					const result = await this.transport(id, target, scope).sendCommand<{
						data: string;
					}>("Page.captureScreenshot", {
						format: "png",
						captureBeyondViewport: false,
					});
					if (Buffer.byteLength(result.data, "base64") > 2 * 1024 * 1024)
						throw new Error("browser_screenshot_too_large");
					return {
						url: target.url,
						mimeType: "image/png",
						dataUrl: `data:image/png;base64,${result.data}`,
					};
				} finally {
					await this.evaluate(id, target, scope, "show").catch(() => {});
				}
			}
			if (raw.toolName === "prepare") {
				const steps = parseBrowserSteps(args.steps);
				const result = await this.evaluate(id, target, scope, "prepare", args),
					prepareId = browserId(result.prepareId);
				this.preparations.set(prepareId, {
					id: prepareId,
					targetId: id,
					scope,
					steps,
					expires: Date.now() + 600000,
				});
				return result;
			}
			if (raw.toolName === "execute") {
				const prepared = browserObject(args.prepared),
					preparation = this.preparations.get(browserId(prepared.prepareId)),
					step = browserObject(args.step),
					actionId = browserId(args.actionId);
				if (
					!preparation ||
					preparation.expires < Date.now() ||
					preparation.targetId !== id ||
					preparation.scope.sessionId !== scope.sessionId ||
					preparation.scope.connectionId !== scope.connectionId ||
					!preparation.steps.some(
						(saved) => JSON.stringify(saved) === JSON.stringify(step),
					)
				)
					throw new Error("browser_proposal_stale");
				const prior = this.results.get(actionId);
				if (prior) return prior;
				this.results.set(actionId, { actionId, status: "unknown" });
				try {
					const result = await this.evaluate(id, target, scope, "execute", {
						prepareId: preparation.id,
						actionId,
						stepId: step.id,
						cursorSvg,
						color: clientPreferencesService.getCachedPreferences().themeColor,
					});
					this.results.set(actionId, result);
					return result;
				} catch (error) {
					const code =
						error instanceof Error
							? error.message
							: "browser_action_unconfirmed";
					const notDispatched = [
						"browser_form_changed",
						"browser_target_changed",
						"browser_target_outside_viewport",
						"browser_target_obscured",
						"browser_proposal_stale",
						"browser_step_invalid",
					].includes(code);
					const result = {
						actionId,
						status: notDispatched ? "not_dispatched" : "unknown",
						code: notDispatched ? code : "browser_action_unconfirmed",
					};
					this.results.set(actionId, result);
					return result;
				}
			}
			throw new Error("browser_operation_forbidden");
		} finally {
			this.busy = false;
		}
	}
	async finish(
		scope: ExternalBrowserScope,
		keepTarget: boolean,
	): Promise<void> {
		if (!sameBrowserScope(this.active, scope)) return;
		this.active = null;
		this.publish();
		for (const [id, target] of this.targets)
			if (sameBrowserScope(target.scope, scope)) {
				if (keepTarget) {
					target.pendingUntil = Date.now() + 600000;
					await this.host
						.request(target.peer, "finish", { targetId: id }, scope)
						.catch(() => this.closeTarget(id, target));
				} else this.closeTarget(id, target);
			}
	}
	private closeTarget(id: string, target: Target): void {
		this.targets.delete(id);
		for (const [key, prep] of this.preparations)
			if (prep.targetId === id) this.preparations.delete(key);
		void this.host
			.request(target.peer, "close", { targetId: id }, target.scope)
			.catch(() => {});
	}
	stop(): void {
		const active = this.active;
		const pending = [...this.targets.values()]
			.filter((target) => target.pendingUntil)
			.map((target) => target.scope);
		this.active = null;
		for (const [id, target] of this.targets) this.closeTarget(id, target);
		this.results.clear();
		this.matches.clear();
		this.preparations.clear();
		if (active) this.revoked(active);
		for (const scope of pending)
			if (!sameBrowserScope(active, scope)) this.revoked(scope);
		this.publish();
	}
	dispose(): void {
		clearInterval(this.timer);
		this.stop();
		this.host.stop();
	}
}

import type {
  ComputerConsent,
  ComputerObservation,
  ComputerScope,
  ComputerSource,
  ComputerState,
  ComputerToolRequest,
} from "../../../contracts/computer-observation";
import {
  parseComputerObservation,
  parseComputerRequest,
} from "../../../contracts/computer-observation";
import { randomUUID } from "node:crypto";
import type { ComputerHelper } from "./helper-client";

type Context = {
  connectionId: string;
  sessionId: string | null;
  workspaceId: string | null;
};
type Access = { scope: ComputerScope; title: string; accessId: string };
function scopeKey(scope: ComputerScope): string {
  return [scope.connectionId, scope.sessionId, scope.requestId].join(":");
}
function turnKey(scope: ComputerScope): string {
  // 断线换连接不能让同一轮已拒绝/撤销的请求重新弹窗
  return [scope.sessionId, scope.requestId].join(":");
}
export class ComputerService {
  private context: Context | null = null;
  private access: Access | null = null;
  private generation = 0;
  private denied = new Set<string>();
  private sources = new Map<string, ComputerSource>();
  private calls = new Map<string, Promise<Record<string, unknown>>>();
  private activeCall: string | null = null;
  private monitor: ReturnType<typeof setInterval> | null = null;
  private healthCheck: Promise<void> | null = null;
  private lastObservationAt = -Infinity;
  private observations = new Map<string, ComputerObservation>();
  private decision: {
    scope: ComputerScope;
    promise: Promise<Record<string, unknown>>;
    resolve(value: Record<string, unknown>): void;
    reject(error: Error): void;
    timer: ReturnType<typeof setTimeout>;
  } | null = null;
  private state: ComputerState = {
    enabled: false,
    available: false,
    error: null,
    pending: null,
    sharing: null,
    observation: null,
  };
  constructor(
    private readonly helper: ComputerHelper,
    private readonly changed: (state: ComputerState) => void,
    private readonly now: () => number = Date.now,
    private readonly revoked: (
      scope: ComputerScope,
      code: string,
    ) => void = () => {},
  ) {}
  getState(): ComputerState {
    return this.state;
  }
  private publish(patch: Partial<ComputerState>): void {
    this.state = { ...this.state, ...patch };
    this.changed(this.state);
  }
  setAvailability(available: boolean, error: string | null = null): void {
    this.publish({ available, error });
  }
  setEnabled(enabled: boolean): void {
    if (!enabled) this.revoke();
    this.publish({ enabled });
  }
  setContext(context: Context | null): void {
    if (JSON.stringify(context) !== JSON.stringify(this.context)) this.revoke();
    this.context = context;
  }
  private assertScope(scope: ComputerScope): void {
    if (!this.state.enabled || !this.state.available)
      throw new Error("computer_disabled");
    if (
      !this.context ||
      scope.connectionId !== this.context.connectionId ||
      scope.sessionId !== this.context.sessionId
    )
      throw new Error("computer_scope_mismatch");
  }
  async list(): Promise<ComputerSource[]> {
    if (!this.state.pending) throw new Error("computer_consent_required");
    const generation = this.generation;
    const result = await this.helper.request("list");
    if (generation !== this.generation || !this.state.pending)
      throw new Error("computer_cancelled");
    const sources = result.sources as ComputerSource[];
    if (
      !Array.isArray(sources) ||
      sources.length > 100 ||
      sources.some(
        (s) => typeof s.sourceId !== "string" || typeof s.title !== "string",
      )
    )
      throw new Error("computer_protocol_invalid");
    this.sources = new Map(sources.map((s) => [s.sourceId, s]));
    return sources;
  }
  execute(value: ComputerToolRequest): Promise<Record<string, unknown>> {
    const request = parseComputerRequest(value);
    this.assertScope(request);
    const existing = this.calls.get(request.callId);
    if (existing) return existing;
    const operation = this.executeOnce(request).finally(() =>
      this.calls.delete(request.callId),
    );
    this.calls.set(request.callId, operation);
    return operation;
  }
  private async executeOnce(
    request: ComputerToolRequest,
  ): Promise<Record<string, unknown>> {
    const key = scopeKey(request);
    if (this.denied.has(turnKey(request)))
      throw new Error("computer_access_denied");
    if (request.toolName === "mcp_computer_request_access") {
      if (this.access && scopeKey(this.access.scope) === key)
        return { granted: true, accessId: this.access.accessId };
      if (this.decision) {
        if (scopeKey(this.decision.scope) !== key)
          throw new Error("computer_busy");
        return this.decision.promise;
      }
      if (this.access) this.revoke();
      let resolve!: (v: Record<string, unknown>) => void,
        reject!: (e: Error) => void;
      const promise = new Promise<Record<string, unknown>>((r, j) => {
        resolve = r;
        reject = j;
      });
      const timer = setTimeout(
        () => this.revoke("computer_consent_timeout"),
        120_000,
      );
      this.decision = { scope: request, promise, resolve, reject, timer };
      const pending: ComputerConsent = {
        callId: request.callId,
        reason: request.args.reason as string,
        sessionId: request.sessionId,
        expiresAt: this.now() + 120_000,
      };
      this.publish({ pending, error: null });
      return promise;
    }
    if (!this.access || scopeKey(this.access.scope) !== key)
      throw new Error("computer_consent_required");
    if (this.activeCall) throw new Error("computer_busy");
    const generation = this.generation;
    this.activeCall = request.callId;
    const deadline = setTimeout(() => this.revoke("computer_timeout"), 20_000);
    try {
      await this.healthCheck;
      if (generation !== this.generation) throw new Error("computer_cancelled");
      const valid = await this.helper.request("validate");
      if (!valid.valid) {
        this.revoke("computer_window_unavailable");
        throw new Error("computer_window_unavailable");
      }
      if (generation !== this.generation) throw new Error("computer_cancelled");
      if (request.toolName === "mcp_computer_screenshot") {
        const observation = this.observations.get(
          request.args.observationId as string,
        );
        if (!observation?.dataUrl)
          throw new Error("computer_observation_stale");
        return { ...observation };
      }
      if (this.now() - this.lastObservationAt < 1000)
        throw new Error("computer_rate_limited");
      this.lastObservationAt = this.now();
      const observation = parseComputerObservation(
        await this.helper.request("observe"),
      );
      if (generation !== this.generation) throw new Error("computer_cancelled");
      this.observations.set(observation.observationId, observation);
      // 有界内存；过旧的帧明确失效，绝不偷偷重拍
      while (
        this.observations.size > 8 ||
        [...this.observations.values()].reduce(
          (sum, value) => sum + (value.dataUrl?.length ?? 0),
          0,
        ) >
          32 * 1024 * 1024
      )
        this.observations.delete(this.observations.keys().next().value!);
      this.publish({ observation });
      const { dataUrl: _image, ...result } = observation;
      return result;
    } catch (error) {
      if (
        error instanceof Error &&
        [
          "computer_helper_stopped",
          "computer_protocol_invalid",
          "computer_native_failed",
          "computer_timeout",
        ].includes(error.message)
      )
        this.revoke(error.message);
      throw error;
    } finally {
      clearTimeout(deadline);
      if (this.activeCall === request.callId) this.activeCall = null;
    }
  }
  async decide(callId: string, sourceId: string | null): Promise<void> {
    if (this.state.pending?.callId !== callId || !this.decision)
      throw new Error("computer_consent_expired");
    if (!sourceId) {
      this.revoke("computer_access_denied");
      return;
    }
    const source = this.sources.get(sourceId);
    if (!source) throw new Error("computer_window_unavailable");
    const generation = this.generation,
      decision = this.decision;
    await this.helper.request("select", { sourceId });
    if (generation !== this.generation || decision !== this.decision)
      throw new Error("computer_cancelled");
    this.assertScope(decision.scope);
    clearTimeout(decision.timer);
    this.decision = null;
    this.access = {
      scope: decision.scope,
      title: source.title,
      accessId: randomUUID(),
    };
    this.sources.clear();
    this.publish({
      pending: null,
      sharing: {
        title: source.title,
        sessionId: decision.scope.sessionId,
        requestId: decision.scope.requestId,
      },
    });
    decision.resolve({ granted: true, accessId: this.access.accessId });
    this.monitor = setInterval(() => {
      if (this.activeCall || !this.access) return;
      const generation = this.generation;
      if (this.healthCheck) return;
      this.healthCheck = this.helper
        .request("validate")
        .then((result) => {
          if (generation === this.generation && !result.valid)
            this.revoke("computer_window_unavailable");
        })
        .catch(() => {
          if (generation === this.generation)
            this.revoke("computer_window_unavailable");
        })
        .finally(() => {
          this.healthCheck = null;
        });
    }, 1000);
  }
  finish(scope: ComputerScope): void {
    const matches = (current: ComputerScope): boolean =>
      current.connectionId === scope.connectionId &&
      current.sessionId === scope.sessionId &&
      (current.requestId === scope.requestId || current.runId === scope.runId);
    if (
      (this.access && matches(this.access.scope)) ||
      (this.decision && matches(this.decision.scope))
    )
      this.revoke();
  }
  cancel(callId: string): void {
    if (this.calls.has(callId) || this.activeCall === callId)
      this.revoke("computer_cancelled");
  }
  revoke(code = "computer_access_revoked"): void {
    const revokedScope = this.access?.scope;
    this.generation++;
    if (this.monitor) clearInterval(this.monitor);
    this.monitor = null;
    if (this.access) this.denied.add(turnKey(this.access.scope));
    if (this.decision) {
      this.denied.add(turnKey(this.decision.scope));
      clearTimeout(this.decision.timer);
      this.decision.reject(new Error(code));
      this.decision = null;
    }
    this.access = null;
    this.sources.clear();
    this.observations.clear();
    this.helper.stop();
    this.activeCall = null;
    while (this.denied.size > 512)
      this.denied.delete(this.denied.values().next().value!);
    this.publish({ pending: null, sharing: null, observation: null });
    // 先使授权、内存帧和助手失效，不能让通知失败阻止安全清理
    if (revokedScope) this.revoked(revokedScope, code);
  }
}

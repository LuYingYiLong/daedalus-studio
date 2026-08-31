import type {
  ComputerConsent,
  ComputerControlState,
  ComputerAction,
  ComputerRect,
  ComputerObservation,
  ComputerScreenPoint,
  ComputerScope,
  ComputerSource,
  ComputerState,
  ComputerForwardedRequest,
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
  controlSupported?: boolean;
};
type Access = {
  scope: ComputerScope;
  title: string;
  accessId: string;
  mode: "observe" | "control";
};
export type ComputerPresentation = {
  prepare(bounds: ComputerRect): Promise<string[]>;
  update(state: ComputerControlState | null): void;
  moveCursor(point: ComputerScreenPoint): void;
  click(): void;
  highlight?(bounds: ComputerRect | null): void;
  close(): void;
};
function scopeOnly(scope: ComputerScope): ComputerScope {
  return {
    connectionId: scope.connectionId,
    sessionId: scope.sessionId,
    requestId: scope.requestId,
    runId: scope.runId,
  };
}
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
  private resuming: Promise<void> | null = null;
  private nativeStart: {
    generation: number;
    paused?: { code: string; generation: number };
  } | null = null;
  private target: { title: string; scope: ComputerScope } | null = null;
  private actions = new Map<string, Promise<Record<string, unknown>>>();
  private startingAccess: {
    key: string;
    promise: Promise<Record<string, unknown>>;
  } | null = null;
  private nativeHeartbeat: ReturnType<typeof setInterval> | null = null;
  private rendererHeartbeatAt = 0;
  private denied = new Set<string>();
  private sources = new Map<string, ComputerSource>();
  private calls = new Map<string, Promise<Record<string, unknown>>>();
  private activeCall: string | null = null;
  private activeAction: { id: string; generation: number; action: ComputerAction; observation: ComputerObservation } | null = null;
  private monitor: ReturnType<typeof setInterval> | null = null;
  private healthCheck: Promise<void> | null = null;
  private inputReadiness: Promise<void> | null = null;
  private checkingInput = new Map<string, ComputerScope>();
  private lastObservationAt = -Infinity;
  private observations = new Map<string, ComputerObservation>();
  private decision: {
    scope: ComputerScope;
    request: ComputerForwardedRequest;
    promise: Promise<Record<string, unknown>>;
    resolve(value: Record<string, unknown>): void;
    reject(error: Error): void;
    timer: ReturnType<typeof setTimeout>;
  } | null = null;
  private state: ComputerState = {
    enabled: false,
    groundingSupported: true,
    controlEnabled: false,
    control: null,
    rememberedTarget: null,
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
    private readonly presentation?: ComputerPresentation,
  ) {
    helper.onControl?.((event) => {
      if (event.event === "progress") {
        const current = this.activeAction;
        if (!current || event.actionId !== current.id || event.generation !== current.generation || event.generation !== this.generation || this.state.control?.state !== "running") return;
        if (typeof event.x !== "number" || typeof event.y !== "number" || !Number.isFinite(event.x) || !Number.isFinite(event.y)) return;
        const { screenBounds: b } = current.observation;
        if (event.x < b.x || event.y < b.y || event.x >= b.x+b.width || event.y >= b.y+b.height) return;
        const semantic = "nodeId" in current.action;
        if (!semantic || event.phase !== "semantic") return;
        this.presentation?.moveCursor({ x: event.x, y: event.y });
        if (semantic && "nodeId" in current.action) {
          const nodeId = current.action.nodeId;
          const node = current.observation.nodes.find(node => node.id === nodeId);
          if (node) this.presentation?.highlight?.({
            x: b.x + node.bounds.x * b.width / current.observation.width,
            y: b.y + node.bounds.y * b.height / current.observation.height,
            width: node.bounds.width * b.width / current.observation.width,
            height: node.bounds.height * b.height / current.observation.height,
          });
        }
        return;
      }
      if (event.event === "paused") {
        // 助手的暂停通知可能先于 control.start 响应到达，不能被初始空状态吞掉
        if (this.nativeStart && event.generation >= this.nativeStart.generation) {
          this.nativeStart.paused = event;
          return;
        }
        this.pause(event.code, event.generation);
      }
      else if (event.event === "cancelled") this.revoke(event.code);
    });
  }
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
    if (!enabled) {
      this.revoke();
      this.publish({ controlEnabled: false });
    }
    this.publish({ enabled });
  }
  setControlEnabled(enabled: boolean): void {
    if (enabled && !this.state.enabled)
      throw new Error("computer_observation_required");
    if (
      !enabled &&
      (this.state.control || this.decision?.request.args.mode === "control")
    )
      this.revoke("computer_control_disabled");
    this.publish({ controlEnabled: enabled });
  }
  acknowledgeControl(scope: ComputerScope): void {
    if (
      this.state.control?.state === "cancelled" &&
      ["connectionId", "sessionId", "requestId", "runId"].every(
        (key) =>
          this.state.control![key as keyof ComputerScope] ===
          scope[key as keyof ComputerScope],
      )
    ) {
      this.presentation?.close();
      this.publish({ control: null });
    }
  }
  heartbeat(scope: ComputerScope): void {
    if (
      this.access &&
      ["connectionId", "sessionId", "requestId", "runId"].every(
        (key) =>
          this.access!.scope[key as keyof ComputerScope] ===
          scope[key as keyof ComputerScope],
      )
    )
      this.rendererHeartbeatAt = this.now();
  }
  clearTarget(): void {
    if (this.access || this.decision) throw new Error("computer_busy");
    this.revoke();
  }
  pause(code = "computer_user_takeover", nativeGeneration?: number): void {
    const control = this.state.control;
    if (!control || control.state === "cancelled") return;
    if (
      nativeGeneration !== undefined &&
      (nativeGeneration < this.generation ||
        (control.state === "paused" && nativeGeneration <= this.generation))
    )
      return;
    this.generation = Math.max(this.generation + 1, nativeGeneration ?? 0);
    this.observations.clear();
    const next: ComputerControlState = {
      ...control,
      state: "paused",
      code,
      generation: this.generation,
    };
    delete next.resuming;
    this.presentation?.update(next);
    this.publish({ control: next, observation: null });
    void this.helper
      .request("control.pause")
      .catch(() => this.revoke("computer_helper_stopped"));
  }
  private async startControl(
    holdPaused = false,
  ): Promise<ComputerControlState> {
    if (!this.access || !this.presentation || !this.state.controlEnabled)
      throw new Error("computer_control_disabled");
    const generation = ++this.generation;
    await this.healthCheck;
    const info = await this.helper.request("target");
    const overlays = await this.presentation.prepare(
      info.screenBounds as ComputerRect,
    );
    if (generation !== this.generation || !this.access)
      throw new Error("computer_cancelled");
    const start: NonNullable<ComputerService["nativeStart"]> = { generation };
    this.nativeStart = start;
    let result: Record<string, unknown>;
    try {
      result = await this.helper.request("control.start", { overlays, generation });
    } finally {
      if (this.nativeStart === start) this.nativeStart = null;
    }
    if (generation !== this.generation || !this.access)
      throw new Error("computer_cancelled");
    if (typeof result.active !== "boolean")
      throw new Error("computer_protocol_invalid");
    const paused = start.paused;
    if (paused) this.generation = Math.max(this.generation, paused.generation);
    const active = result.active && !paused;
    const code = paused?.code ?? (
      typeof result.code === "string" && /^computer_[a-z_]+$/.test(result.code)
        ? result.code : "computer_activation_required"
    );
    const control: ComputerControlState = {
      ...this.access.scope,
      generation: this.generation,
      state: active ? "running" : "paused",
      ...(!active ? { code } : {}),
    };
    // 不提前公布新代次的 paused；否则 Backend 会拒绝随后同代次的 running
    if (!holdPaused || !active) this.publish({ control });
    this.presentation.update(this.state.control!);
    if (this.nativeHeartbeat) clearInterval(this.nativeHeartbeat);
    this.rendererHeartbeatAt = this.now();
    this.nativeHeartbeat = setInterval(() => {
      if (this.now() - this.rendererHeartbeatAt > 5000) {
        this.revoke("computer_heartbeat_timeout");
        return;
      }
      void this.helper
        .request("control.heartbeat")
        .catch(() => this.revoke("computer_helper_stopped"));
    }, 500);
    return control;
  }
  resume(): Promise<void> {
    if (this.resuming) return this.resuming;
    if (this.state.control?.state !== "paused" || !this.access)
      return Promise.reject(new Error("computer_access_revoked"));
    if (this.activeCall) return Promise.reject(new Error("computer_busy"));
    this.activeCall = "resume";
    this.observations.clear();
    const access = this.access;
    this.publish({ control: { ...this.state.control, resuming: true } });
    this.presentation?.update(this.state.control!);
    let operation!: Promise<void>;
    operation = (async () => {
      const deadline = setTimeout(() => {
        if (this.access === access) this.revoke("computer_timeout");
      }, 20_000);
      let generation = this.generation + 1;
      try {
        const control = await this.startControl(true);
        generation = control.generation;
        if (control.state !== "running") return;
        const observation = parseComputerObservation(await this.helper.request("observe"));
        if (generation !== this.generation || this.access !== access)
          throw new Error("computer_cancelled");
        this.observations.set(observation.observationId, observation);
        // 新帧完成后才公布新代次并唤醒 Backend
        this.publish({ observation, control });
        this.presentation?.update(control);
      } catch (error) {
        if (this.access === access && generation === this.generation) {
          const code = error instanceof Error && /^computer_[a-z_]+$/.test(error.message)
            ? error.message : "computer_resume_failed";
          if (["computer_protocol_invalid", "computer_helper_stopped", "computer_timeout"].includes(code)) this.revoke(code);
          else this.pause(code);
        }
        throw error;
      } finally {
        clearTimeout(deadline);
        if (this.resuming === operation) {
          this.resuming = null;
          if (this.activeCall === "resume") this.activeCall = null;
          if (this.state.control?.resuming) {
            const { resuming: _, ...control } = this.state.control;
            this.publish({ control });
            this.presentation?.update(control);
          }
        }
      }
    })();
    this.resuming = operation;
    return operation;
  }
  setContext(context: Context | null): void {
    if (JSON.stringify(context) !== JSON.stringify(this.context)) this.revoke();
    this.context = context;
    this.publish({ controlSupported: context?.controlSupported === true });
  }
  assertPreviewContext(connectionId: string, sessionId: string): void {
    if (this.context?.connectionId !== connectionId || this.context.sessionId !== sessionId)
      throw new Error("computer_context_changed");
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
    const generation = this.generation, pending = this.state.pending;
    await this.healthCheck;
    if (generation !== this.generation || this.state.pending !== pending)
      throw new Error("computer_cancelled");
    const result = await this.helper.request("list");
    if (generation !== this.generation || this.state.pending !== pending)
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
  execute(value: ComputerForwardedRequest): Promise<Record<string, unknown>> {
    const request = parseComputerRequest(value);
    this.assertScope(request);
    if (request.toolName === "grounding.prepare" || request.toolName === "grounding.validate")
      this.requireGroundingFrame(request);
    const existing = request.actionId
      ? this.actions.get(request.actionId)
      : this.calls.get(request.callId);
    if (existing) return existing;
    const operation = this.executeOnce(request).finally(() =>
      this.calls.delete(request.callId),
    );
    this.calls.set(request.callId, operation);
    if (request.actionId) this.actions.set(request.actionId, operation);
    return operation;
  }
  private async executeOnce(
    request: ComputerForwardedRequest,
  ): Promise<Record<string, unknown>> {
    const key = scopeKey(request);
    const mode = request.args.mode === "control" ? "control" : "observe";
    if (
      (mode === "control" || request.toolName === "mcp_computer_action") &&
      (!this.state.controlEnabled || !this.state.controlSupported)
    )
      throw new Error("computer_control_disabled");
    if (this.denied.has(turnKey(request))) throw new Error("computer_access_denied");
    if ((mode === "control" || request.toolName === "mcp_computer_action") && this.helper.assertControlReady) {
      // 在打开授权弹窗前核验助手，Backend 版本和开关不能单独证明输入可用
      const generation = this.generation;
      this.checkingInput.set(request.callId, request);
      try {
        if (!this.inputReadiness) {
          const flight = (async () => {
            await this.healthCheck;
            if (generation !== this.generation) throw new Error("computer_cancelled");
            await this.helper.assertControlReady!();
          })();
          this.inputReadiness = flight;
          void flight.finally(() => { if (this.inputReadiness === flight) this.inputReadiness = null; }).catch(() => {});
        }
        await this.inputReadiness;
        if (generation !== this.generation) throw new Error("computer_cancelled");
        this.assertScope(request);
      } finally { this.checkingInput.delete(request.callId); }
    }
    if (this.denied.has(turnKey(request)))
      throw new Error("computer_access_denied");
    if (request.toolName === "mcp_computer_request_access") {
      if (this.startingAccess) {
        if (this.startingAccess.key !== key) throw new Error("computer_busy");
        return this.startingAccess.promise;
      }
      if (this.decision) {
        if (
          scopeKey(this.decision.scope) !== key ||
          (this.decision.request.args.mode ?? "observe") !== mode
        )
          throw new Error("computer_busy");
        return this.decision.promise;
      }
      if (
        this.access &&
        scopeKey(this.access.scope) === key &&
        this.access.scope.runId === request.runId &&
        (mode === "observe" || this.access.mode === "control")
      )
        return {
          granted: true,
          accessId: this.access.accessId,
          mode,
          ...(mode === "control"
            ? { generation: this.generation }
            : {}),
        };
      if (
        !this.access &&
        mode === "control" &&
        request.authorization?.approvalMode === "full-trust" &&
        this.target &&
        this.target.scope.connectionId === request.connectionId &&
        this.target.scope.sessionId === request.sessionId
      ) {
        const generation = this.generation,
          target = this.target;
        const promise = (async () => {
          await this.healthCheck;
          const valid = await this.helper.request("validate");
          if (generation !== this.generation || this.target !== target)
            throw new Error("computer_cancelled");
          if (!valid.valid) {
            this.revoke("computer_window_unavailable");
            throw new Error("computer_window_unavailable");
          }
          this.assertScope(request);
          this.access = {
            scope: scopeOnly(request),
            title: target.title,
            accessId: randomUUID(),
            mode,
          };
          try {
            await this.startControl();
          } catch (error) {
            this.revoke("computer_start_failed");
            throw error;
          }
          this.publish({
            sharing: {
              title: target.title,
              sessionId: request.sessionId,
              requestId: request.requestId,
            },
          });
          return {
            granted: true,
            accessId: this.access!.accessId,
            mode,
            generation: this.generation,
          };
        })();
        const starting = { key, promise };
        this.startingAccess = starting;
        try {
          return await promise;
        } finally {
          if (this.startingAccess === starting) this.startingAccess = null;
        }
      }
      if (this.access) {
        this.access = null;
        this.observations.clear();
      }
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
      this.decision = {
        scope: scopeOnly(request),
        request,
        promise,
        resolve,
        reject,
        timer,
      };
      const pending: ComputerConsent = {
        callId: request.callId,
        reason: request.args.reason as string,
        sessionId: request.sessionId,
        expiresAt: this.now() + 120_000,
        mode,
        approvalMode: request.authorization?.approvalMode,
      };
      this.publish({ pending, error: null });
      return promise;
    }
    if (!this.access || scopeKey(this.access.scope) !== key || this.access.scope.runId !== request.runId)
      throw new Error("computer_consent_required");
    if (this.state.control?.state === "paused")
      throw new Error("computer_paused");
    if (this.activeCall) throw new Error("computer_busy");
    const generation = this.generation;
    const access = this.access;
    const groundingFrame = request.toolName === "grounding.prepare" || request.toolName === "grounding.validate"
      ? this.requireGroundingFrame(request) : null;
    this.activeCall = request.callId;
    const deadline = setTimeout(() => this.revoke("computer_timeout"), 20_000);
    try {
      await this.healthCheck;
      if (generation !== this.generation) throw new Error("computer_cancelled");
      const valid = await this.helper.request("validate");
      if (valid.valid !== true) {
        this.revoke("computer_window_unavailable");
        throw new Error("computer_window_unavailable");
      }
      if (generation !== this.generation) throw new Error("computer_cancelled");
      if (groundingFrame) {
        this.assertScope(request);
        if (this.access !== access) throw new Error("computer_access_revoked");
        if (this.requireGroundingFrame(request) !== groundingFrame)
          throw new Error("computer_observation_stale");
        // 模型等待发生在 Backend；这里只校验现有帧，随即释放原生串行通道
        return request.toolName === "grounding.prepare"
          ? { observation: structuredClone(groundingFrame), generation }
          : { observationId: groundingFrame.observationId, generation, valid: true };
      }
      if (request.toolName === "mcp_computer_action") {
        if (
          this.access?.mode !== "control" ||
          this.state.control?.state !== "running"
        )
          throw new Error("computer_consent_required");
        const observationId = request.args.observationId as string;
        if (
          !this.observations.has(observationId) ||
          this.state.observation?.observationId !== observationId
        )
          throw new Error("computer_observation_stale");
        const action = request.args.action as ComputerAction;
        const observation = this.observations.get(observationId)!;
        if ("nodeId" in action && !observation.nodes.some(node => node.id === action.nodeId && node.supportedActions?.includes(action.type))) throw new Error("computer_uia_unsupported");
        this.presentation?.highlight?.(null);
        this.activeAction = { id: request.actionId!, generation, action, observation };
        const result = await this.helper.request("action", {
          observationId,
          action,
          actionId: request.actionId,
          generation,
        });
        if (generation !== this.generation)
          throw new Error("computer_action_unknown");
        if (
          result.actionId !== request.actionId ||
          result.observationId !== observationId ||
          result.status !== "dispatched" || result.generation !== generation ||
          result.transport !== ("nodeId" in action ? "uia" : "keyboard")
        )
          throw new Error("computer_action_unknown");
        this.publish({ observation: null });
        return result;
      }
      if (request.toolName === "mcp_computer_screenshot") {
        const observation = this.observations.get(
          request.args.observationId as string,
        );
        if (!observation?.dataUrl)
          throw new Error("computer_observation_stale");
        return { ...observation };
      }
      if (request.toolName !== "mcp_computer_observe")
        throw new Error("computer_tool_not_supported");
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
      if (request.toolName === "mcp_computer_action") {
        this.publish({ observation: null });
        this.pause(
          error instanceof Error && /^computer_[a-z_]+$/.test(error.message)
            ? error.message
            : "computer_action_unknown",
        );
      }
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
      if (this.activeAction?.id === request.actionId) this.activeAction = null;
      clearTimeout(deadline);
      if (this.activeCall === request.callId) this.activeCall = null;
    }
  }
  private requireGroundingFrame(request: ComputerForwardedRequest): ComputerObservation {
    if (!this.access || scopeKey(this.access.scope) !== scopeKey(request) || this.access.scope.runId !== request.runId)
      throw new Error("computer_consent_required");
    if (this.state.control?.state === "paused") throw new Error("computer_paused");
    const observationId = request.args.observationId as string;
    const frame = this.observations.get(observationId);
    if (!frame?.dataUrl || this.state.observation !== frame ||
      (request.toolName === "grounding.validate" && request.args.generation !== this.generation))
      throw new Error("computer_observation_stale");
    return frame;
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
    await this.healthCheck;
    if (generation !== this.generation || decision !== this.decision)
      throw new Error("computer_cancelled");
    await this.helper.request("select", { sourceId });
    if (generation !== this.generation || decision !== this.decision)
      throw new Error("computer_cancelled");
    this.assertScope(decision.scope);
    clearTimeout(decision.timer);
    this.access = {
      scope: decision.scope,
      title: source.title,
      accessId: randomUUID(),
      mode: decision.request.args.mode === "control" ? "control" : "observe",
    };
    this.target = { title: source.title, scope: decision.scope };
    if (this.access.mode === "control") {
      try {
        await this.startControl();
      } catch (error) {
        decision.reject(error as Error);
        this.revoke("computer_start_failed");
        throw error;
      }
    }
    if (decision !== this.decision) throw new Error("computer_cancelled");
    this.decision = null;
    this.sources.clear();
    this.publish({
      pending: null,
      rememberedTarget: source.title,
      sharing: {
        title: source.title,
        sessionId: decision.scope.sessionId,
        requestId: decision.scope.requestId,
      },
    });
    decision.resolve({
      granted: true,
      accessId: this.access!.accessId,
      mode: this.access!.mode,
      ...(this.access!.mode === "control"
        ? { generation: this.generation }
        : {}),
    });
    if (this.monitor) clearInterval(this.monitor);
    this.monitor = setInterval(() => {
      // 观察升级为控制时旧巡检仍存在；选择/启动与助手共用串行通道
      if (this.activeCall || this.decision || this.startingAccess || this.checkingInput.size || (!this.access && !this.target)) return;
      const generation = this.generation;
      if (this.healthCheck) return;
      this.healthCheck = this.helper
        .request("validate")
        .then((result) => {
          if (generation === this.generation && !result.valid)
            this.revoke("computer_window_unavailable");
        })
        .catch((error: unknown) => {
          // 忙碌不是窗口销毁，不得因此撤销授权并取消整个模型运行
          if (error instanceof Error && error.message === "computer_busy") return;
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
      (this.decision && matches(this.decision.scope)) ||
      [...this.checkingInput.values()].some(matches)
    ) {
      const ended = this.access?.scope;
      for (const pending of this.checkingInput.values()) if (matches(pending)) this.denied.add(turnKey(pending));
      this.generation++;
      this.resuming = null;
      this.nativeStart = null;
      if (this.activeCall === "resume") this.activeCall = null;
      if (this.nativeHeartbeat) clearInterval(this.nativeHeartbeat);
      this.nativeHeartbeat = null;
      void this.helper
        .request("control.stop")
        .catch(() => this.revoke("computer_helper_stopped"));
      if (ended) this.denied.add(turnKey(ended));
      if (this.decision) {
        clearTimeout(this.decision.timer);
        this.decision.reject(new Error("computer_turn_finished"));
        this.decision = null;
      }
      this.access = null;
      this.observations.clear();
      this.actions.clear();
      this.presentation?.close();
      this.publish({
        pending: null,
        sharing: null,
        control: null,
        observation: null,
      });
      if (ended) this.revoked(ended, "computer_turn_finished");
    }
  }
  cancel(callId: string): void {
    if (this.calls.has(callId) || this.activeCall === callId)
      this.revoke("computer_cancelled");
  }
  revoke(code = "computer_access_revoked"): void {
    const revokedScope = this.access?.scope;
    const control = this.state.control;
    this.resuming = null;
    this.nativeStart = null;
    this.inputReadiness = null;
    for (const pending of this.checkingInput.values()) this.denied.add(turnKey(pending));
    this.checkingInput.clear();
    if (this.nativeHeartbeat) clearInterval(this.nativeHeartbeat);
    this.nativeHeartbeat = null;
    this.target = null;
    this.actions.clear();
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
    const cancelled = control
      ? {
          ...control,
          generation: this.generation,
          state: "cancelled" as const,
          code,
        }
      : null;
    this.presentation?.update(cancelled);
    if (!cancelled) this.presentation?.close();
    this.publish({
      pending: null,
      sharing: null,
      observation: null,
      rememberedTarget: null,
      control: cancelled,
    });
    // 先使授权、内存帧和助手失效，不能让通知失败阻止安全清理
    if (revokedScope) this.revoked(revokedScope, code);
  }
}

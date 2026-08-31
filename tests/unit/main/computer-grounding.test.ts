import { afterEach, describe, expect, it, vi } from "vitest";
import { ComputerService } from "../../../src/main/services/computer-observation/computer-service";
import {
  COMPUTER_PROTOCOL_VERSION,
  parseComputerRequest,
  type ComputerForwardedRequest,
  type ComputerObservation,
} from "../../../src/contracts/computer-observation";
import { parseComputerGroundingPreparation } from "../../../src/contracts/computer-grounding";

const scope = { connectionId: "connection", sessionId: "session", requestId: "turn", runId: "run" };
const frame: ComputerObservation = {
  observationId: "frame", capturedAt: "2026-08-30T00:00:00.000Z", uiaCapturedAt: "2026-08-30T00:00:00.000Z",
  screenBounds: { x: -100, y: 0, width: 100, height: 100 }, width: 100, height: 100, dpi: 96,
  nodes: [{ id: "button", parentId: null, name: "Save", automationId: "save", controlType: "Button",
    bounds: { x: 10, y: 10, width: 40, height: 20 }, enabled: true, password: false, supportedActions: ["uia_invoke"] }],
  texts: [], truncated: false, durationMs: 1, dataUrl: "data:image/png;base64,AQID",
};
function request(toolName: ComputerForwardedRequest["toolName"], args: Record<string, unknown> = {}): ComputerForwardedRequest {
  return { ...scope, callId: crypto.randomUUID(), toolCallId: crypto.randomUUID(), toolName, args };
}
function setup() {
  vi.useFakeTimers();
  let clock = 0, sequence = 0;
  const helper = {
    stop: vi.fn(),
    request: vi.fn(async (method: string, params?: Record<string, unknown>): Promise<Record<string, unknown>> => {
      switch (method) {
        case "list": return { sources: [{ sourceId: "source", title: "Fixture" }] };
        case "validate": return { valid: true };
        case "target": return { screenBounds: frame.screenBounds };
        case "control.start": return { active: true };
        case "observe": return structuredClone({ ...frame, observationId: `frame-${++sequence}` });
        case "action": return { ...params, status: "dispatched", transport: "uia" };
        default: return {};
      }
    }),
  };
  const service = new ComputerService(helper, vi.fn(), () => clock, vi.fn(), {
    prepare: async () => [], update: vi.fn(), moveCursor: vi.fn(), click: vi.fn(), close: vi.fn(),
  });
  service.setContext({ ...scope, workspaceId: "workspace", controlSupported: true });
  service.setAvailability(true);
  service.setEnabled(true);
  const execute = (value: ComputerForwardedRequest) => Promise.resolve().then(() => service.execute(value));
  const observe = () => {
    clock += 1001;
    return execute(request("mcp_computer_observe"));
  };
  const grant = async (mode: "observe" | "control" = "observe") => {
    if (mode === "control") service.setControlEnabled(true);
    const input = request("mcp_computer_request_access", { reason: "fixture", mode });
    input.authorization = { approvalMode: "manual" };
    const pending = service.execute(input);
    await service.list();
    await service.decide(input.callId, "source");
    await pending;
  };
  return { service, helper, execute, observe, grant };
}
afterEach(() => vi.useRealTimers());

describe("Main internal grounding operations", () => {
  it("prepares full immutable read-only evidence and validates without capture or native protocol changes", async () => {
    const { service, helper, execute, observe, grant } = setup();
    await grant();
    const observed = await observe();
    const before = structuredClone(service.getState());
    helper.request.mockClear();
    const prepared = parseComputerGroundingPreparation(await execute(request("grounding.prepare", { observationId: observed.observationId })));
    expect(COMPUTER_PROTOCOL_VERSION).toBe(3);
    expect(service.getState().groundingSupported).toBe(true);
    expect(prepared.observation).toEqual(before.observation);
    expect(prepared.generation).toBeGreaterThanOrEqual(0);
    expect(Number.isSafeInteger(prepared.generation)).toBe(true);
    expect(await execute(request("grounding.validate", { observationId: observed.observationId, generation: prepared.generation })))
      .toEqual({ observationId: observed.observationId, generation: prepared.generation, valid: true });
    expect(helper.request.mock.calls).toEqual([["validate"], ["validate"]]);
    expect(service.getState()).toEqual(before);
    prepared.observation.nodes[0].name = "changed by caller";
    expect(service.getState().observation?.nodes[0].name).toBe("Save");
    service.revoke();
  });

  it("rejects a superseded frame still in the screenshot cache and leaves the queue free during model work", async () => {
    const { service, helper, execute, observe, grant } = setup();
    await grant();
    const first = await observe();
    const prepared = await execute(request("grounding.prepare", { observationId: first.observationId }));
    const second = await observe();
    expect(second.observationId).not.toBe(first.observationId);
    expect(await execute(request("mcp_computer_screenshot", { observationId: first.observationId }))).toHaveProperty("dataUrl");
    helper.request.mockClear();
    await expect(execute(request("grounding.prepare", { observationId: first.observationId }))).rejects.toThrow("computer_observation_stale");
    await expect(execute(request("grounding.validate", { observationId: first.observationId, generation: prepared.generation }))).rejects.toThrow("computer_observation_stale");
    expect(helper.request).not.toHaveBeenCalled();
    const nextPrepared = await execute(request("grounding.prepare", { observationId: second.observationId }));
    expect(nextPrepared.generation).toBe(prepared.generation);
    expect(service.getState().control).toBeNull();
    expect(await execute(request("grounding.validate", { observationId: second.observationId, generation: prepared.generation })))
      .toEqual({ observationId: second.observationId, generation: prepared.generation, valid: true });
    service.revoke();
  });

  it("publishes the control generation with the resumed frame and rejects grounding during the temporary mismatch", async () => {
    const { service, helper, execute, observe, grant } = setup();
    await grant("control");
    const observed = await observe();
    const prepared = await execute(request("grounding.prepare", { observationId: observed.observationId }));
    expect(prepared.generation).toBe(service.getState().control!.generation);
    service.pause();
    const pausedGeneration = service.getState().control!.generation;
    const original = helper.request.getMockImplementation()!;
    let complete!: (result: Record<string, unknown>) => void;
    helper.request.mockImplementation((method, params) => method === "observe"
      ? new Promise(resolve => { complete = resolve; }) : original(method, params));
    const resuming = service.resume();
    await vi.advanceTimersByTimeAsync(0);
    const nativeGeneration = helper.request.mock.calls.filter(([method]) => method === "control.start").at(-1)![1]!.generation;
    expect(nativeGeneration).toBeGreaterThan(pausedGeneration);
    expect(service.getState().control).toMatchObject({ generation: pausedGeneration, state: "paused", resuming: true });
    await expect(execute(request("grounding.prepare", { observationId: observed.observationId }))).rejects.toThrow("computer_paused");
    complete({ ...frame, observationId: "resumed-frame" });
    await resuming;
    const resumed = await execute(request("grounding.prepare", { observationId: "resumed-frame" }));
    expect(resumed.generation).toBe(nativeGeneration);
    expect(resumed.generation).toBe(service.getState().control!.generation);
    await expect(execute(request("grounding.validate", { observationId: "resumed-frame", generation: prepared.generation }))).rejects.toThrow("computer_observation_stale");
    expect(await execute(request("grounding.validate", { observationId: "resumed-frame", generation: resumed.generation })))
      .toEqual({ observationId: "resumed-frame", generation: resumed.generation, valid: true });
    service.revoke();
  });

  it("rejects a wrong generation or frame without ever repairing it by recapture", async () => {
    const { service, helper, execute, observe, grant } = setup();
    await grant();
    const observed = await observe();
    const prepared = await execute(request("grounding.prepare", { observationId: observed.observationId }));
    helper.request.mockClear();
    await expect(execute(request("grounding.validate", { observationId: observed.observationId, generation: Number(prepared.generation) + 1 }))).rejects.toThrow("computer_observation_stale");
    await expect(execute(request("grounding.prepare", { observationId: "missing" }))).rejects.toThrow("computer_observation_stale");
    expect(helper.request).not.toHaveBeenCalled();
    const { dataUrl: _, ...withoutImage } = frame;
    helper.request.mockImplementation(async method => method === "observe" ? withoutImage : { valid: true });
    await observe();
    await expect(execute(request("grounding.prepare", { observationId: "frame" }))).rejects.toThrow("computer_observation_stale");
    service.revoke();
  });

  it.each(["connectionId", "sessionId", "requestId", "runId"] as const)("requires the same %s, including deduplicated calls", async key => {
    const { service, helper, execute, observe, grant } = setup();
    await grant();
    const observed = await observe();
    const input = request("grounding.prepare", { observationId: observed.observationId });
    helper.request.mockClear();
    const pending = execute(input);
    await expect(execute({ ...input, [key]: "other" })).rejects.toThrow(/computer_(scope_mismatch|consent_required)/);
    await pending;
    expect(helper.request.mock.calls).toEqual([["validate"]]);
    service.revoke();
  });

  it.each(["grounding.prepare", "grounding.validate"] as const)("%s cannot acquire consent, survive pause, or reuse revoked access", async toolName => {
    const { service, execute, observe, grant } = setup();
    await expect(execute(request(toolName, { observationId: "frame", ...(toolName === "grounding.validate" ? { generation: 0 } : {}) }))).rejects.toThrow("computer_consent_required");
    expect(service.getState().pending).toBeNull();
    await grant("control");
    const observed = await observe();
    const input = request(toolName, { observationId: observed.observationId, ...(toolName === "grounding.validate" ? { generation: service.getState().control!.generation } : {}) });
    service.pause();
    await expect(execute(input)).rejects.toThrow("computer_paused");
    service.revoke();
    await expect(execute(input)).rejects.toThrow("computer_consent_required");
  });

  it.each((["grounding.prepare", "grounding.validate"] as const).flatMap(toolName =>
    ["pause", "revoke", "finish", "disable", "unavailable", "context"].map(ending => ({ toolName, ending })),
  ))("rejects late $toolName after $ending", async ({ toolName, ending }) => {
    const { service, helper, execute, observe, grant } = setup();
    await grant("control");
    const observed = await observe();
    const input = request(toolName, { observationId: observed.observationId,
      ...(toolName === "grounding.validate" ? { generation: service.getState().control!.generation } : {}) });
    let finish!: (result: Record<string, unknown>) => void;
    helper.request.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    const pending = execute(input);
    const rejected = expect(pending).rejects.toThrow(/computer_(cancelled|disabled|scope_mismatch|consent_required|access_revoked)/);
    await vi.advanceTimersByTimeAsync(0);
    if (ending === "pause") service.pause();
    if (ending === "revoke") service.revoke();
    if (ending === "finish") service.finish(scope);
    if (ending === "disable") service.setEnabled(false);
    if (ending === "unavailable") service.setAvailability(false);
    if (ending === "context") service.setContext(null);
    finish({ valid: true });
    await rejected;
    expect(helper.request.mock.calls.filter(([method]) => method === "observe")).toHaveLength(1);
    service.revoke();
  });

  it("revokes when native target revalidation fails", async () => {
    const { service, helper, execute, observe, grant } = setup();
    await grant(); const observed = await observe();
    helper.request.mockResolvedValueOnce({ valid: false });
    await expect(execute(request("grounding.prepare", { observationId: observed.observationId }))).rejects.toThrow("computer_window_unavailable");
    expect(service.getState().sharing).toBeNull();
    expect(service.getState().observation).toBeNull();
  });

  it("forwards only native action fields and invalidates the grounded frame after input", async () => {
    const { service, helper, execute, observe, grant } = setup();
    await grant("control"); const observed = await observe();
    const prepared = await execute(request("grounding.prepare", { observationId: observed.observationId }));
    const action = { type: "uia_invoke", nodeId: "button" };
    await execute({ ...request("mcp_computer_action", { observationId: observed.observationId, groundingId: "receipt-1", action }),
      actionId: "action-1", authorization: { approvalMode: "manual" } });
    expect(helper.request).toHaveBeenCalledWith("action", { observationId: observed.observationId, action, actionId: "action-1", generation: prepared.generation });
    await expect(execute(request("grounding.validate", { observationId: observed.observationId, generation: prepared.generation }))).rejects.toThrow("computer_observation_stale");
    service.revoke();
  });

  it.each(["unknown", "mcp_computer_locate", "grounding.locate", "observe", ["mcp_computer_observe"], ["grounding.prepare"], null])("rejects unknown operation %s without native calls", toolName => {
    const { service, helper } = setup();
    expect(() => service.execute({ ...request("mcp_computer_observe"), toolName } as ComputerForwardedRequest)).toThrow("computer_tool_not_supported");
    expect(helper.request).not.toHaveBeenCalled();
    service.revoke();
  });

  it("accepts receipt syntax only and never enables raw input", () => {
    const actionRequest = { ...request("mcp_computer_action", { observationId: "frame", groundingId: "receipt", action: { type: "uia_invoke", nodeId: "button" } }),
      actionId: "action", authorization: { approvalMode: "manual" as const } };
    expect(parseComputerRequest(actionRequest).args.groundingId).toBe("receipt");
    for (const groundingId of ["", "../receipt", 1, null, "x".repeat(161)])
      expect(() => parseComputerRequest({ ...actionRequest, args: { ...actionRequest.args, groundingId } })).toThrow();
    for (const action of [{ type: "click", x: 10, y: 10 }, { type: "move", x: 10, y: 10 }, { type: "uia_invoke", nodeId: "button", hwnd: 1 }])
      expect(() => parseComputerRequest({ ...actionRequest, args: { ...actionRequest.args, action } })).toThrow();
    for (const toolName of ["grounding.prepare", "grounding.validate"] as const) {
      const args = { observationId: "frame", ...(toolName === "grounding.validate" ? { generation: 0 } : {}) };
      expect(parseComputerRequest(request(toolName, args)).args).toEqual(args);
      for (const extra of [{ target: "Save" }, { x: 1, y: 1 }, { dataUrl: frame.dataUrl }, { nodeId: "button" }, { hwnd: 1 }, { groundingId: "receipt" }])
        expect(() => parseComputerRequest(request(toolName, { ...args, ...extra }))).toThrow();
    }
    for (const generation of [-1, 0.5, Infinity, NaN, "0", undefined])
      expect(() => parseComputerRequest(request("grounding.validate", { observationId: "frame", generation }))).toThrow();
  });
});

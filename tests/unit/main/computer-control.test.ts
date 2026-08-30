import { afterEach, describe, expect, it, vi } from "vitest";
import { ComputerService } from "../../../src/main/services/computer-observation/computer-service";
import {
  parseComputerAction,
  type ComputerToolRequest,
} from "../../../src/contracts/computer-observation";
import { normalizeClientPreferences } from "../../../src/main/services/client-preferences-store";

const scope = {
  connectionId: "connection",
  sessionId: "session",
  requestId: "turn",
  runId: "run",
};
const frame = {
  observationId: "frame",
  capturedAt: new Date().toISOString(),
  uiaCapturedAt: new Date().toISOString(),
  screenBounds: { x: -1200, y: 0, width: 200, height: 100 },
  width: 200,
  height: 100,
  dpi: 144,
  nodes: [],
  texts: [],
  truncated: false,
  durationMs: 5,
};
function setup(mode: "manual" | "auto-safe" | "full-trust" = "manual") {
  vi.useFakeTimers();
  let sequence = 0;
  const helper = {
    stop: vi.fn(),
    request: vi.fn(
      async (
        method: string,
        params?: Record<string, unknown>,
      ): Promise<Record<string, unknown>> => {
        switch (method) {
          case "list":
            return { sources: [{ sourceId: "source", title: "Fixture" }] };
          case "validate":
            return { valid: true };
          case "target":
            return { screenBounds: frame.screenBounds };
          case "control.start":
            return { active: true };
          case "observe":
            return { ...frame, observationId: `frame-${++sequence}` };
          case "action":
            return {
              actionId: params!.actionId,
              observationId: params!.observationId,
              generation: params!.generation,
              status: "dispatched",
              dispatchedAt: new Date().toISOString(),
            };
          default:
            return {};
        }
      },
    ),
  };
  const presentation = {
    prepare: vi.fn(async () => ["1", "2"]),
    update: vi.fn(),
    click: vi.fn(),
    close: vi.fn(),
  };
  const revoked = vi.fn();
  const service = new ComputerService(
    helper,
    vi.fn(),
    Date.now,
    revoked,
    presentation,
  );
  service.setAvailability(true);
  service.setContext({
    ...scope,
    workspaceId: "workspace",
    controlSupported: true,
  });
  service.setEnabled(true);
  const request = (
    toolName: ComputerToolRequest["toolName"],
    args: Record<string, unknown>,
    extra: Partial<ComputerToolRequest> = {},
  ): ComputerToolRequest => ({
    ...scope,
    callId: crypto.randomUUID(),
    toolCallId: crypto.randomUUID(),
    toolName,
    args,
    authorization: { approvalMode: mode },
    ...extra,
  });
  const grant = async (extra: Partial<ComputerToolRequest> = {}) => {
    const r = request(
      "mcp_computer_request_access",
      { reason: "fixture", mode: "control" },
      extra,
    );
    const pending = service.execute(r);
    await service.list();
    await service.decide(r.callId, "source");
    return pending;
  };
  return { service, helper, presentation, revoked, request, grant };
}
afterEach(() => vi.useRealTimers());
describe("computer control safety", () => {
  it("does not enable input with an older Backend", async () => {
    const { service, request } = setup();
    service.setControlEnabled(true);
    service.setContext({
      ...scope,
      workspaceId: "workspace",
      controlSupported: false,
    });
    await expect(
      service.execute(
        request("mcp_computer_request_access", {
          reason: "old backend",
          mode: "control",
        }),
      ),
    ).rejects.toThrow("computer_control_disabled");
  });
  it("stops input when the controller renderer stops sending verified heartbeats", async () => {
    const { service, grant, helper } = setup();
    service.setControlEnabled(true);
    await grant();
    await vi.advanceTimersByTimeAsync(5500);
    expect(service.getState().control?.state).toBe("cancelled");
    expect(helper.stop).toHaveBeenCalled();
  });
  it("keeps Backend paused while the fresh resume observation is pending", async () => {
    const { service, grant, helper } = setup();
    service.setControlEnabled(true);
    await grant();
    const original = helper.request.getMockImplementation()!;
    let complete!: (value: Record<string, unknown>) => void;
    helper.request.mockImplementation((method, params) =>
      method === "observe"
        ? new Promise((resolve) => {
            complete = resolve;
          })
        : original(method, params),
    );
    service.pause();
    const resuming = service.resume();
    await vi.advanceTimersByTimeAsync(0);
    expect(service.getState().control?.state).toBe("paused");
    await expect(service.resume()).rejects.toThrow("computer_busy");
    complete(frame);
    await resuming;
    expect(service.getState().control?.state).toBe("running");
    expect(Object.keys(service.getState().control!).sort()).toEqual(
      [
        "connectionId",
        "sessionId",
        "requestId",
        "runId",
        "generation",
        "state",
      ].sort(),
    );
    service.revoke();
  });
  it("ignores a cancellation acknowledgement for another turn", async () => {
    const { service, grant } = setup();
    service.setControlEnabled(true);
    await grant();
    service.revoke();
    service.acknowledgeControl({ ...scope, requestId: "older-turn" });
    expect(service.getState().control?.state).toBe("cancelled");
    service.acknowledgeControl(scope);
    expect(service.getState().control).toBeNull();
  });
  it("does not migrate observation permission into control permission", () => {
    const { service } = setup();
    expect(service.getState().controlEnabled).toBe(false);
    expect(
      normalizeClientPreferences({ allowComputerObservation: true }).preferences
        .allowComputerControl,
    ).toBe(false);
    service.setEnabled(false);
    expect(() => service.setControlEnabled(true)).toThrow(
      "computer_observation_required",
    );
  });
  it.each(["manual", "auto-safe"] as const)(
    "%s approves once per turn and again next turn",
    async (mode) => {
      const { service, grant, request } = setup(mode);
      service.setControlEnabled(true);
      await grant();
      await expect(
        service.execute(
          request("mcp_computer_request_access", {
            reason: "reuse",
            mode: "control",
          }),
        ),
      ).resolves.toMatchObject({ granted: true });
      expect(service.getState().pending).toBeNull();
      service.finish(scope);
      const pending = service.execute(
        request(
          "mcp_computer_request_access",
          { reason: "next", mode: "control" },
          { requestId: "next", runId: "next-run" },
        ),
      );
      const rejected = expect(pending).rejects.toThrow();
      expect(service.getState().pending?.mode).toBe("control");
      service.revoke();
      await rejected;
    },
  );
  it("readonly requests do not inherit a control result and other runs cannot use the grant", async () => {
    const { service, grant, request } = setup();
    service.setControlEnabled(true);
    await grant();
    await expect(service.execute(request("mcp_computer_request_access", { reason: "read only" }))).resolves.toMatchObject({ mode: "observe" });
    await expect(service.execute(request("mcp_computer_observe", {}, { runId: "another-run" }))).rejects.toThrow("computer_consent_required");
    service.revoke();
  });
  it("full trust reuses only a live target in the same session and connection", async () => {
    const { service, grant, request, helper } = setup("full-trust");
    service.setControlEnabled(true);
    await grant();
    service.finish(scope);
    await expect(
      service.execute(
        request(
          "mcp_computer_request_access",
          { reason: "reuse", mode: "control" },
          { requestId: "next", runId: "next-run" },
        ),
      ),
    ).resolves.toMatchObject({ granted: true, mode: "control" });
    expect(
      helper.request.mock.calls.filter(([method]) => method === "select"),
    ).toHaveLength(1);
    service.setContext({
      connectionId: "other",
      sessionId: "other",
      workspaceId: "workspace",
    });
    expect(service.getState().rememberedTarget).toBeNull();
  });
  it("deduplicates inputs and invalidates coordinates on pause/resume", async () => {
    const { service, request, grant, helper, presentation } = setup();
    service.setControlEnabled(true);
    await grant();
    const observed = await service.execute(request("mcp_computer_observe", {}));
    const action = request(
      "mcp_computer_action",
      {
        observationId: observed.observationId,
        action: { type: "click", x: 10, y: 10, count: 1 },
      },
      { actionId: "action-1" },
    );
    expect(await service.execute(action)).toMatchObject({
      status: "dispatched",
    });
    await service.execute({ ...action, callId: "duplicate" });
    expect(
      helper.request.mock.calls.filter(([method]) => method === "action"),
    ).toHaveLength(1);
    expect(presentation.click).toHaveBeenCalledOnce();
    service.pause();
    expect(service.getState().control?.state).toBe("paused");
    await expect(
      service.execute(
        request("mcp_computer_action", action.args, {
          actionId: "paused-action",
        }),
      ),
    ).rejects.toThrow("computer_paused");
    await service.resume();
    await expect(
      service.execute(
        request("mcp_computer_action", action.args, {
          actionId: "stale-action",
        }),
      ),
    ).rejects.toThrow("computer_observation_stale");
    service.revoke();
  });
  it("stops native work before cancellation notifications and rejects late results", async () => {
    const { service, request, grant, helper, revoked } = setup();
    service.setControlEnabled(true);
    await grant();
    let resolve!: (value: Record<string, unknown>) => void;
    helper.request.mockImplementation(async (method) =>
      method === "validate"
        ? { valid: true }
        : new Promise((r) => {
            resolve = r;
          }),
    );
    const pending = service.execute(request("mcp_computer_observe", {}));
    const rejected = expect(pending).rejects.toThrow("computer_cancelled");
    await vi.advanceTimersByTimeAsync(0);
    service.revoke("computer_cancelled");
    resolve(frame);
    await rejected;
    expect(helper.stop).toHaveBeenCalled();
    expect(revoked).toHaveBeenCalledWith(
      expect.objectContaining(scope),
      "computer_cancelled",
    );
    expect(service.getState().control?.state).toBe("cancelled");
    service.acknowledgeControl(scope);
    expect(service.getState().control).toBeNull();
  });
  it("does not grant control when the protected overlay cannot start", async () => {
    const { service, grant, presentation } = setup();
    service.setControlEnabled(true);
    presentation.prepare.mockRejectedValue(
      new Error("computer_overlay_unavailable"),
    );
    // The grant and decide promises both reject; cover the consumer path explicitly.
    const r: ComputerToolRequest = {
      ...scope,
      callId: "call",
      toolCallId: "tool",
      toolName: "mcp_computer_request_access",
      args: { reason: "fixture", mode: "control" },
      authorization: { approvalMode: "manual" },
    };
    const pending = expect(service.execute(r)).rejects.toThrow();
    await service.list();
    await expect(service.decide("call", "source")).rejects.toThrow(
      "computer_overlay_unavailable",
    );
    await pending;
    expect(service.getState().sharing).toBeNull();
    expect(service.getState().control).toBeNull();
  });
  it("rejects raw targets, arbitrary keys and batching", () => {
    for (const value of [
      { type: "key", key: "Win+R" },
      { type: "click", x: 0, y: 0, count: 1, hwnd: 1 },
      [{ type: "key", key: "Enter" }],
      { type: "scroll", x: 0, y: 0, axis: "vertical", amount: 0 },
    ])
      expect(() => parseComputerAction(value)).toThrow();
  });
});

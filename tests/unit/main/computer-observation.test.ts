import { afterEach, describe, expect, it, vi } from "vitest";
import { ComputerService } from "../../../src/main/services/computer-observation/computer-service";
import {
  parseComputerObservation,
  parseComputerRequest,
  type ComputerToolName,
  type ComputerToolRequest,
} from "../../../src/contracts/computer-observation";
const PNG =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";
const observation = {
  observationId: "obs-1",
  capturedAt: "2026-08-30T00:00:00.000Z",
  uiaCapturedAt: "2026-08-30T00:00:00.000Z",
  screenBounds: { x: -100, y: 0, width: 1, height: 1 },
  width: 1,
  height: 1,
  dpi: 144,
  nodes: [],
  texts: [],
  durationMs: 10,
  truncated: false,
  dataUrl: PNG,
};
function request(
  toolName: ComputerToolName,
  args: Record<string, unknown> = {},
  callId = crypto.randomUUID(),
): ComputerToolRequest {
  return {
    connectionId: "connection",
    sessionId: "session",
    requestId: "turn",
    runId: "run",
    toolCallId: "tool",
    callId,
    toolName,
    args,
  };
}
function setup(changed = vi.fn(), revoked = vi.fn()) {
  vi.useFakeTimers();
  const helper = {
    request: vi.fn(
      async (method: string): Promise<Record<string, unknown>> =>
        method === "list"
          ? { sources: [{ sourceId: "source", title: "Fixture" }] }
          : method === "validate"
            ? { valid: true }
            : method === "observe"
              ? observation
              : {},
    ),
    stop: vi.fn(),
  };
  const service = new ComputerService(helper, changed, Date.now, revoked);
  service.setAvailability(true);
  service.setContext({
    connectionId: "connection",
    sessionId: "session",
    workspaceId: "workspace",
  });
  return { service, helper };
}
async function grant(service: ComputerService) {
  const access = request("mcp_computer_request_access", {
    reason: "Read the test fixture",
  });
  const pending = service.execute(access);
  await service.list();
  await service.decide(access.callId, "source");
  await expect(pending).resolves.toMatchObject({ granted: true });
}
afterEach(() => vi.useRealTimers());
describe("computer observation consent boundary", () => {
  it.each(["state", "revoked"])(
    "cleans up access before a failing %s notification",
    async (notification) => {
      const changed = vi.fn(),
        revoked = vi.fn();
      const { service, helper } = setup(changed, revoked);
      service.setEnabled(true);
      await grant(service);
      await service.execute(request("mcp_computer_observe"));
      helper.stop.mockClear();
      (notification === "state" ? changed : revoked).mockImplementation(() => {
        expect(service.getState()).toMatchObject({
          pending: null,
          sharing: null,
          observation: null,
        });
        expect(helper.stop).toHaveBeenCalledOnce();
        throw new Error("fixture_notification_failed");
      });
      expect(() => service.revoke()).toThrow("fixture_notification_failed");
      await expect(
        service.execute(request("mcp_computer_observe")),
      ).rejects.toThrow("computer_access_denied");
      expect(vi.getTimerCount()).toBe(0);
    },
  );
  it("revokes promptly when a registered window closes and does not inherit access on reconnect", async () => {
    const { service, helper } = setup();
    service.setEnabled(true);
    await grant(service);
    helper.request.mockResolvedValue({ valid: false });
    await vi.advanceTimersByTimeAsync(1000);
    expect(service.getState().sharing).toBeNull();
    expect(helper.stop).toHaveBeenCalled();
    service.setContext({
      connectionId: "new-connection",
      sessionId: "session",
      workspaceId: "workspace",
    });
    await expect(
      service.execute({
        ...request("mcp_computer_observe"),
        connectionId: "new-connection",
      }),
    ).rejects.toThrow("computer_access_denied");
    await expect(
      service.execute({
        ...request("mcp_computer_request_access", {
          reason: "Must not reprompt",
        }),
        connectionId: "new-connection",
      }),
    ).rejects.toThrow("computer_access_denied");
    expect(service.getState().pending).toBeNull();
  });
  it("retains an earlier observation's exact frame without recapturing", async () => {
    const { service, helper } = setup();
    service.setEnabled(true);
    await grant(service);
    await service.execute(request("mcp_computer_observe"));
    await vi.advanceTimersByTimeAsync(1001);
    helper.request.mockImplementation(async (method) =>
      method === "observe"
        ? { ...observation, observationId: "obs-2" }
        : { valid: true },
    );
    await service.execute(request("mcp_computer_observe"));
    const first = await service.execute(
      request("mcp_computer_screenshot", { observationId: "obs-1" }),
    );
    expect(first).toEqual(observation);
    expect(
      helper.request.mock.calls.filter(([method]) => method === "observe"),
    ).toHaveLength(2);
    service.revoke();
  });
  it("finishes canonical turns and disabling the preference revokes sharing", async () => {
    const { service } = setup();
    service.setEnabled(true);
    await grant(service);
    service.finish({
      connectionId: "connection",
      sessionId: "session",
      requestId: "turn",
      runId: "retry-run",
    });
    expect(service.getState().sharing).toBeNull();
    await expect(
      service.execute(request("mcp_computer_observe")),
    ).rejects.toThrow("computer_access_denied");
    service.setEnabled(false);
    expect(service.getState().observation).toBeNull();
  });
  it("is disabled by default and rejects unknown tool arguments", () => {
    const { service } = setup();
    expect(() => service.execute(request("mcp_computer_observe"))).toThrow(
      "computer_disabled",
    );
    expect(() =>
      parseComputerRequest(request("mcp_computer_observe", { hwnd: 123 })),
    ).toThrow();
  });
  it("requires explicit per-turn consent even after enabling", async () => {
    const { service, helper } = setup();
    service.setEnabled(true);
    await expect(
      service.execute(request("mcp_computer_observe")),
    ).rejects.toThrow("computer_consent_required");
    expect(helper.request).not.toHaveBeenCalled();
  });
  it("merges access requests and returns the immutable observation frame", async () => {
    const { service, helper } = setup();
    service.setEnabled(true);
    await grant(service);
    const second = await service.execute(
      request("mcp_computer_request_access", { reason: "Reuse" }),
    );
    expect(second.granted).toBe(true);
    expect(service.getState().pending).toBeNull();
    const result = await service.execute(request("mcp_computer_observe"));
    expect(result.dataUrl).toBeUndefined();
    expect(
      await service.execute(
        request("mcp_computer_screenshot", { observationId: "obs-1" }),
      ),
    ).toEqual(observation);
    expect(
      helper.request.mock.calls.filter(([method]) => method === "observe"),
    ).toHaveLength(1);
    await expect(
      service.execute(
        request("mcp_computer_screenshot", { observationId: "stale" }),
      ),
    ).rejects.toThrow("computer_observation_stale");
    service.revoke();
  });
  it("does not prompt again after denial or switching away and back", async () => {
    const { service } = setup();
    service.setEnabled(true);
    const access = request("mcp_computer_request_access", { reason: "Test" });
    const denied = expect(service.execute(access)).rejects.toThrow(
      "computer_access_denied",
    );
    await service.decide(access.callId, null);
    await denied;
    service.setContext(null);
    service.setContext({
      connectionId: "connection",
      sessionId: "session",
      workspaceId: "workspace",
    });
    await expect(
      service.execute(
        request("mcp_computer_request_access", { reason: "Again" }),
      ),
    ).rejects.toThrow("computer_access_denied");
  });
  it("rejects other connections, sessions and unlisted windows", async () => {
    const { service } = setup();
    service.setEnabled(true);
    expect(() =>
      service.execute({
        ...request("mcp_computer_observe"),
        connectionId: "other",
      }),
    ).toThrow("computer_scope_mismatch");
    const access = request("mcp_computer_request_access", { reason: "Test" });
    const pending = service.execute(access);
    const rejected = expect(pending).rejects.toThrow();
    await service.list();
    await expect(service.decide(access.callId, "unknown")).rejects.toThrow(
      "computer_window_unavailable",
    );
    service.revoke();
    await rejected;
  });
  it("invalidates late observations and clears cached pixels when revoked", async () => {
    const { service, helper } = setup();
    service.setEnabled(true);
    await grant(service);
    let resolve!: (value: Record<string, unknown>) => void;
    helper.request.mockImplementation(async (method) =>
      method === "validate"
        ? { valid: true }
        : new Promise((r) => {
            resolve = r;
          }),
    );
    const pending = service.execute(request("mcp_computer_observe"));
    const rejected = expect(pending).rejects.toThrow("computer_cancelled");
    await vi.advanceTimersByTimeAsync(0);
    service.revoke();
    resolve(observation);
    await rejected;
    expect(service.getState().observation).toBeNull();
  });
  it("times out consent and revokes when the selected window closes", async () => {
    const { service, helper } = setup();
    service.setEnabled(true);
    const access = service.execute(
      request("mcp_computer_request_access", { reason: "Test" }),
    );
    const rejected = expect(access).rejects.toThrow("computer_consent_timeout");
    await vi.advanceTimersByTimeAsync(120000);
    await rejected;
    service.setContext({
      connectionId: "connection",
      sessionId: "session",
      workspaceId: "new-workspace",
    });
    await expect(
      service.execute(
        request("mcp_computer_request_access", { reason: "Again" }),
      ),
    ).rejects.toThrow();
    expect(helper.stop).toHaveBeenCalled();
  });
  it("enforces password redaction, bounds, PNG and text limits", () => {
    expect(parseComputerObservation(observation).screenBounds.x).toBe(-100);
    const maximumPng =
      "data:image/png;base64," +
      Buffer.alloc(5 * 1024 * 1024).toString("base64");
    expect(() =>
      parseComputerObservation({ ...observation, dataUrl: maximumPng }),
    ).not.toThrow();
    expect(() =>
      parseComputerObservation({
        ...observation,
        dataUrl:
          "data:image/png;base64," +
          Buffer.alloc(5 * 1024 * 1024 + 3).toString("base64"),
      }),
    ).toThrow("computer_image_invalid");
    expect(() =>
      parseComputerObservation({ ...observation, width: 3000 }),
    ).toThrow();
    expect(() =>
      parseComputerObservation({ ...observation, dataUrl: "file://secret" }),
    ).toThrow();
    expect(() =>
      parseComputerObservation({
        ...observation,
        nodes: [
          {
            id: "1",
            parentId: null,
            password: true,
            name: "secret",
            automationId: "",
            controlType: "Edit",
            enabled: true,
            bounds: observation.screenBounds,
          },
        ],
      }),
    ).toThrow();
  });
});

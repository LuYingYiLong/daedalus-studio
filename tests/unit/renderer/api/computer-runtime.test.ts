import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { BackendEvent } from "@/platform/rpc/transport/backend-rpc-client";
import { bindComputerRuntime } from "@/features/computer-observation/computer-runtime";

const mock = vi.hoisted(() => ({
  event: (_event: BackendEvent): void => {},
  connection: (_state: "connected" | "disconnected"): void => {},
  request: vi.fn(), execute: vi.fn(), setContext: vi.fn(), cancel: vi.fn(),
  features: { computerGrounding: 1, computerControl: 3 } as Record<string, unknown>,
}));
vi.mock("@/platform/rpc/transport/backend-client", () => ({
  createBackendClient: async () => ({
    isOpen: () => true,
    request: mock.request,
    addEventListener: (listener: typeof mock.event) => { mock.event = listener; return () => {}; },
  }),
  onBackendConnectionStateChanged: (listener: typeof mock.connection) => { mock.connection = listener; return () => {}; },
}));
vi.mock("@/platform/runtime/platform-runtime", () => ({ getPlatformRuntime: () => ({ system: { computerObservation: {
  execute: mock.execute, setContext: mock.setContext, cancel: mock.cancel,
  onState: () => () => {}, onRevoked: () => () => {},
} } }) }));

const observation = {
  observationId: "frame", capturedAt: "2026-08-31T00:00:00.000Z", uiaCapturedAt: "2026-08-31T00:00:00.000Z",
  screenBounds: { x: -100, y: 0, width: 100, height: 100 }, width: 100, height: 100, dpi: 96,
  nodes: [], texts: [], truncated: false, durationMs: 1, dataUrl: "data:image/png;base64,AQID",
};
let dispose: (() => void) | undefined;
beforeEach(() => {
  vi.useFakeTimers(); vi.clearAllMocks();
  mock.features = { computerGrounding: 1, computerControl: 3 };
  mock.setContext.mockResolvedValue(undefined); mock.cancel.mockResolvedValue(undefined);
  mock.request.mockImplementation(async method => method === "client.info" ? { connection: { connectionId: "connection" }, features: mock.features } : {});
  mock.execute.mockImplementation(async input => input.toolName === "grounding.prepare"
    ? { observation, generation: 0 } : { observationId: "frame", generation: 0, valid: true });
});
afterEach(() => { dispose?.(); dispose = undefined; vi.useRealTimers(); });

async function bind() {
  dispose = bindComputerRuntime("session", "workspace");
  await vi.advanceTimersByTimeAsync(0);
}
function emit(toolName: string, args: Record<string, unknown>, callId: string = crypto.randomUUID(), extra: Record<string, unknown> = {}) {
  mock.event({ type: "event", event: "computer.tool.request", sessionId: "session", data: {
    connectionId: "connection", sessionId: "session", requestId: "turn", runId: "run",
    toolCallId: "tool", callId, toolName, args, ...extra,
  } } as BackendEvent);
  return callId;
}
const replies = () => mock.request.mock.calls.filter(([method]) => method === "computer.tool.result");

describe("forwarded grounding runtime", () => {
  it("forwards prepare/validate separately and returns full evidence without occupying the model wait", async () => {
    await bind();
    const callId = emit("grounding.prepare", { observationId: "frame" });
    await vi.advanceTimersByTimeAsync(0);
    expect(replies()[0][1]).toEqual({ callId, ok: true, result: { observation, generation: 0 } });
    const validationId = emit("grounding.validate", { observationId: "frame", generation: 0 });
    await vi.advanceTimersByTimeAsync(0);
    expect(replies()[1][1]).toEqual({ callId: validationId, ok: true, result: { observationId: "frame", generation: 0, valid: true } });
    expect(mock.execute.mock.calls.map(([input]) => input.toolName)).toEqual(["grounding.prepare", "grounding.validate"]);
  });

  it.each(["mcp_computer_locate", "grounding.locate", "unknown"])("reports unsupported %s without calling Main", async operation => {
    await bind(); const callId = emit(operation, {});
    await vi.advanceTimersByTimeAsync(0);
    expect(replies()[0][1]).toMatchObject({ callId, ok: false, error: { code: "computer_tool_not_supported" } });
    expect(mock.execute).not.toHaveBeenCalled();
  });

  it("rejects unsupported server features and raw arguments before Main", async () => {
    mock.features = {}; await bind();
    emit("grounding.prepare", { observationId: "frame" });
    emit("grounding.validate", { observationId: "frame", generation: 0, x: 1, y: 1 });
    await vi.advanceTimersByTimeAsync(0);
    expect(replies().map(([, value]) => value.error.code)).toEqual(["computer_tool_not_supported", "computer_invalid_request"]);
    expect(mock.execute).not.toHaveBeenCalled();
  });

  it.each([
    ["grounding.prepare", { observation: { ...observation, dataUrl: undefined }, generation: 0 }],
    ["grounding.prepare", { observation: { ...observation, observationId: "old" }, generation: 0 }],
    ["grounding.prepare", { observation, generation: -1 }],
    ["grounding.validate", { observationId: "frame", generation: 1, valid: true }],
    ["grounding.validate", { observationId: "frame", generation: 0, valid: false }],
    ["grounding.validate", { observationId: "frame", generation: 0, valid: true, hwnd: 1 }],
  ])("validates the Main response for %s independently", async (operation, result) => {
    await bind(); mock.execute.mockResolvedValueOnce(result);
    emit(operation as string, { observationId: "frame", ...(operation === "grounding.validate" ? { generation: 0 } : {}) });
    await vi.advanceTimersByTimeAsync(0);
    expect(replies()[0][1].ok).toBe(false);
    expect(replies()[0][1]).not.toHaveProperty("result");
  });

  it("ignores wrong scopes and drops late replies after disconnect", async () => {
    await bind();
    emit("grounding.prepare", { observationId: "frame" }, "wrong-connection", { connectionId: "other" });
    emit("grounding.prepare", { observationId: "frame" }, "wrong-session", { sessionId: "other" });
    let complete!: (result: unknown) => void;
    mock.execute.mockImplementationOnce(() => new Promise(resolve => { complete = resolve; }));
    emit("grounding.prepare", { observationId: "frame" });
    await vi.advanceTimersByTimeAsync(0);
    expect(mock.execute).toHaveBeenCalledOnce();
    mock.connection("disconnected");
    complete({ observation, generation: 0 });
    await vi.advanceTimersByTimeAsync(0);
    expect(replies()).toHaveLength(0);
    expect(mock.setContext).toHaveBeenLastCalledWith(null);
  });

  it("still delivers cancellation while Main validation is pending", async () => {
    await bind(); mock.execute.mockImplementationOnce(() => new Promise(() => {}));
    const callId = emit("grounding.prepare", { observationId: "frame" });
    await vi.advanceTimersByTimeAsync(0);
    mock.event({ event: "computer.tool.cancel", data: { callId } } as BackendEvent);
    expect(mock.cancel).toHaveBeenCalledWith(callId);
  });
});

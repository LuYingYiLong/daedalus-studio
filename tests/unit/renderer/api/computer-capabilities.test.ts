import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ComputerState } from "../../../../src/contracts/computer-observation";

const mock = vi.hoisted(() => ({
  request: vi.fn(),
  getState: vi.fn(),
  state: {} as ComputerState,
  features: {} as Record<string, unknown>,
  capabilities: {} as Record<string, boolean>,
  computerChanged: (_state: ComputerState): void => {},
  browserChanged: (_settings: { aiCdpEnabled: boolean }): void => {},
  connectionChanged: (_event: { reconnected: boolean; state: "connected" | "disconnected" }): void => {},
  open: true,
}));
vi.mock("@/platform/rpc/transport/scheduled-task-tool-runtime", () => ({ attachScheduledTaskToolRuntime: vi.fn() }));
vi.mock("@/platform/rpc/transport/backend-rpc-client", () => ({
  BackendRpcClient: class {
    connect = async () => {};
    close = () => { mock.open = false; };
    isOpen = () => mock.open;
    request = mock.request;
    addConnectionListener = (listener: typeof mock.connectionChanged) => { mock.connectionChanged = listener; };
  },
}));

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  mock.open = true;
  mock.features = { computerGrounding: 1, computerControl: 3 };
  mock.capabilities = {};
  mock.state = { enabled: true, available: true, groundingSupported: true, controlEnabled: false,
    controlSupported: true, pending: null, sharing: null, observation: null, error: null };
  mock.getState.mockImplementation(async () => ({ ...mock.state }));
  mock.request.mockImplementation(async (method: string, params?: { capabilities?: Record<string, boolean> }) => {
    if (method === "client.hello") mock.capabilities = { ...params?.capabilities };
    if (method === "client.info") return { features: { ...mock.features } };
    if (method === "client.capabilities.update") Object.assign(mock.capabilities, params?.capabilities);
    return {};
  });
  vi.stubGlobal("window", { electronAPI: {
    computerObservation: { getState: mock.getState, onState: (listener: typeof mock.computerChanged) => { mock.computerChanged = listener; return () => {}; } },
    backend: { getConnectionInfo: async () => ({ port: 1234, authProtocol: null }) },
    browser: { settings: { get: async () => ({ aiCdpEnabled: false }), onChanged: (listener: typeof mock.browserChanged) => { mock.browserChanged = listener; return () => {}; } } },
  } });
});
afterEach(() => vi.unstubAllGlobals());

async function connect() {
  const { configurePlatformRuntime } = await import("@/platform/runtime/platform-runtime");
  const { desktopPlatformRuntime } = await import("@/platform/runtime/desktop-platform-runtime");
  configurePlatformRuntime(desktopPlatformRuntime);
  const { createBackendClient } = await import("@/platform/rpc/transport/backend-client");
  await createBackendClient();
}
const updates = () => mock.request.mock.calls.filter(([method]) => method === "client.capabilities.update");

describe("computer grounding capability negotiation", () => {
  it("negotiates after hello and advertises read-only grounding without requiring control", async () => {
    await connect();
    expect(mock.request.mock.calls.map(([method]) => method)).toEqual(["client.hello", "client.info", "client.capabilities.update"]);
    const hello = mock.request.mock.calls[0][1];
    expect(hello.capabilities).not.toHaveProperty("computerGrounding");
    expect(mock.capabilities).toMatchObject({ computerObservation: true, computerControl: false, computerGrounding: true });
  });

  it.each([undefined, 0, 2, true, "1"])("never sends the new field to a server advertising %s", async version => {
    mock.features = { computerGrounding: version };
    await connect();
    mock.browserChanged({ aiCdpEnabled: true });
    await vi.waitFor(() => expect(updates()).toHaveLength(2));
    for (const [, params] of mock.request.mock.calls)
      expect(params?.capabilities ?? {}).not.toHaveProperty("computerGrounding");
  });

  it.each([
    { enabled: false }, { available: false }, { groundingSupported: false }, { groundingSupported: undefined },
  ])("requires enabled and available Main implementation %j", async patch => {
    Object.assign(mock.state, patch);
    await connect();
    expect(mock.capabilities.computerGrounding).toBe(false);
  });

  it("preserves grounding on unrelated updates and turns it off/on with Main state", async () => {
    await connect();
    mock.browserChanged({ aiCdpEnabled: true });
    await vi.waitFor(() => expect(updates()).toHaveLength(2));
    expect(mock.capabilities.computerGrounding).toBe(true);
    mock.state.enabled = false;
    mock.computerChanged(mock.state);
    await vi.waitFor(() => expect(mock.capabilities.computerGrounding).toBe(false));
    mock.state.enabled = true;
    mock.computerChanged(mock.state);
    await vi.waitFor(() => expect(mock.capabilities.computerGrounding).toBe(true));
    expect(mock.request.mock.calls.filter(([method]) => method === "client.hello")).toHaveLength(1);
  });

  it("serializes state changes so late updates cannot hide the latest capability", async () => {
    await connect();
    let release!: (state: ComputerState) => void;
    mock.getState.mockImplementationOnce(() => new Promise(resolve => { release = resolve; }));
    mock.browserChanged({ aiCdpEnabled: true });
    await vi.waitFor(() => expect(release).toBeTypeOf("function"));
    mock.state.enabled = false;
    mock.computerChanged(mock.state);
    release({ ...mock.state, enabled: true });
    await vi.waitFor(() => expect(updates()).toHaveLength(3));
    expect(mock.capabilities).toMatchObject({ computerObservation: false, computerGrounding: false });
  });

  it("renegotiates every connection and never reuses support after server downgrade", async () => {
    await connect();
    mock.connectionChanged({ state: "disconnected", reconnected: false });
    mock.features = {};
    mock.connectionChanged({ state: "connected", reconnected: true });
    await vi.waitFor(() => expect(updates()).toHaveLength(2));
    expect(mock.capabilities).not.toHaveProperty("computerGrounding");
    expect(updates().at(-1)?.[1].capabilities).not.toHaveProperty("computerGrounding");
    for (const [, params] of mock.request.mock.calls.filter(([method]) => method === "client.hello"))
      expect(params.capabilities).not.toHaveProperty("computerGrounding");
  });

  it("discards an old connection's pending capability calculation", async () => {
    await connect();
    let release!: (state: ComputerState) => void;
    mock.getState.mockImplementationOnce(() => new Promise(resolve => { release = resolve; }));
    mock.browserChanged({ aiCdpEnabled: true });
    await vi.waitFor(() => expect(release).toBeTypeOf("function"));
    mock.connectionChanged({ state: "disconnected", reconnected: false });
    mock.features = {};
    mock.connectionChanged({ state: "connected", reconnected: true });
    await vi.waitFor(() => expect(updates()).toHaveLength(2));
    release(mock.state);
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(updates()).toHaveLength(2);
    expect(mock.capabilities).not.toHaveProperty("computerGrounding");
  });

  it("keeps the remote runtime explicitly disabled", async () => {
    const { remotePlatformRuntime } = await import("@/platform/runtime/remote-platform-runtime");
    expect((await remotePlatformRuntime.getClientHello()).capabilities.computerGrounding).toBe(false);
    expect(remotePlatformRuntime.system?.computerObservation).toBeUndefined();
  });
});

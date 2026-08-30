import { afterEach, expect, it, vi } from "vitest";
import { ComputerOverlay } from "../../../src/main/services/computer-observation/computer-overlay";

const mock = vi.hoisted(() => ({ handlers: new Map<string, (...args: any[]) => void>(), windows: [] as any[] }));
vi.mock("electron", () => ({
  app: { isPackaged: true, whenReady: async () => {} },
  ipcMain: { on: (key: string, handler: (...args: any[]) => void) => mock.handlers.set(key, handler) },
  globalShortcut: { register: () => true, unregister: vi.fn() },
  screen: { on: vi.fn(), screenToDipRect: (_: unknown, r: unknown) => r,
    getDisplayMatching: () => ({ bounds: { x: 0, y: 0, width: 800, height: 600 }, workArea: { x: 0, y: 0, width: 800, height: 560 } }),
    getCursorScreenPoint: () => ({ x: 12, y: 34 }) },
  BrowserWindow: class {
    id = mock.windows.length + 1;
    destroyed = false;
    webContents = { id: this.id, mainFrame: {}, isDestroyed: () => this.destroyed, send: vi.fn(), on: vi.fn(), setWindowOpenHandler: vi.fn() };
    constructor(readonly options: any) { mock.windows.push(this); }
    on = vi.fn();
    isDestroyed = () => this.destroyed;
    destroy = () => { this.destroyed = true; };
    getNativeWindowHandle = () => { const b = Buffer.alloc(8); b.writeBigUInt64LE(BigInt(this.id)); return b; };
    getBounds = () => this.options;
    setBounds = vi.fn();
    setContentProtection = vi.fn();
    setIgnoreMouseEvents = vi.fn();
    showInactive = vi.fn();
    moveTop = vi.fn();
    async loadFile() { mock.handlers.get("computer-overlay:ready")!({ sender: this.webContents, senderFrame: this.webContents.mainFrame }); }
  },
}));
afterEach(() => { vi.useRealTimers(); mock.windows.length = 0; mock.handlers.clear(); });

it("keeps the bar clickable above the transparent edge and coalesces repeated continue", async () => {
  vi.useFakeTimers();
  let reject!: (error: Error) => void;
  const resume = vi.fn(() => new Promise<void>((_resolve, fail) => { reject = fail; }));
  const pause = vi.fn(), cancel = vi.fn();
  const overlay = new ComputerOverlay(cancel, resume, pause);
  try {
    await overlay.prepare({ x: 0, y: 0, width: 300, height: 200 });
    const [edge, bar] = mock.windows;
    expect(edge.setIgnoreMouseEvents).toHaveBeenCalledWith(true);
    expect(bar.setIgnoreMouseEvents).toHaveBeenCalledWith(false);
    expect(bar.options.focusable).toBe(false);
    expect(bar.moveTop).toHaveBeenCalledOnce();
    expect(edge.showInactive.mock.invocationCallOrder[0]).toBeLessThan(bar.showInactive.mock.invocationCallOrder[0]);
    const state = { connectionId: "fixture", sessionId: "session", requestId: "turn", runId: "run", generation: 2, state: "paused" as const, code: "computer_activation_required" };
    overlay.update(state);
    const event = { sender: bar.webContents, senderFrame: bar.webContents.mainFrame };
    mock.handlers.get("computer-overlay:resume")!(event);
    mock.handlers.get("computer-overlay:resume")!(event);
    expect(resume).toHaveBeenCalledOnce();
    expect(bar.webContents.send.mock.lastCall[1].resuming).toBe(true);
    overlay.update({ ...state, code: "computer_user_takeover", generation: 4 });
    reject(new Error("computer_cancelled"));
    await vi.advanceTimersByTimeAsync(0);
    expect(pause).not.toHaveBeenCalled();
    expect(bar.webContents.send.mock.lastCall[1]).toMatchObject({ code: "computer_user_takeover", resuming: false });
    mock.handlers.get("computer-overlay:cancel")!(event);
    expect(cancel).toHaveBeenCalledOnce();
    mock.handlers.get("computer-overlay:resume")!({ sender: {}, senderFrame: {} });
    expect(resume).toHaveBeenCalledOnce();
  } finally { overlay.close(); }
});

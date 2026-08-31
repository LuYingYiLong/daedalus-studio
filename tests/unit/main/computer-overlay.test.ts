import { afterEach, expect, it, vi } from "vitest";
import { globalShortcut } from "electron";
import { ComputerOverlay } from "../../../src/main/services/computer-observation/computer-overlay";

const mock = vi.hoisted(() => ({
  handlers: new Map<string, (...args: any[]) => void>(), windows: [] as any[], dark: false,
  appReady: true, registerSucceeds: true, failWindowCreation: false,
  display: { bounds: { x: 0, y: 0, width: 800, height: 600 }, workArea: { x: 0, y: 0, width: 800, height: 560 } },
  preferences: { theme: "system", themeColor: "#478cbf", fontFamily: "Arial", fontFamilyCode: "Consolas", uiFontSize: 14, codeFontSize: 13, animationsEnabled: true, allowComputerControl: false, language: "zh-CN" },
}));
vi.mock("../../../src/main/services/client-preferences", () => ({
  clientPreferencesService: { getCachedPreferences: () => ({ ...mock.preferences }) },
}));
vi.mock("electron", () => ({
  app: { isPackaged: true, isReady: () => mock.appReady,
    whenReady: () => mock.appReady ? Promise.resolve() : new Promise<void>(() => {}) },
  nativeTheme: { get shouldUseDarkColors() { return mock.dark; } },
  ipcMain: { on: (key: string, handler: (...args: any[]) => void) => mock.handlers.set(key, handler) },
  globalShortcut: {
    register: vi.fn(() => {
      if (!mock.appReady) throw new Error("globalShortcut cannot be used before the app is ready");
      return mock.registerSucceeds;
    }),
    unregister: vi.fn(() => {
      if (!mock.appReady) throw new Error("globalShortcut cannot be used before the app is ready");
    }),
  },
  screen: { on: vi.fn(), screenToDipRect: (_: unknown, r: unknown) => r,
    screenToDipPoint: (point: unknown) => point,
    getDisplayMatching: () => mock.display,
    getCursorScreenPoint: () => { throw new Error("system cursor must not drive the AI cursor"); } },
  BrowserWindow: class {
    id = mock.windows.length + 1;
    destroyed = false;
    webContents = { id: this.id, mainFrame: {}, isDestroyed: () => this.destroyed, send: vi.fn(), on: vi.fn(), setWindowOpenHandler: vi.fn() };
    constructor(readonly options: any) {
      if (mock.failWindowCreation) throw new Error("fixture_window_creation_failed");
      mock.windows.push(this);
    }
    on = vi.fn();
    isDestroyed = () => this.destroyed;
    destroy = () => { this.destroyed = true; };
    getNativeWindowHandle = () => { const b = Buffer.alloc(8); b.writeBigUInt64LE(BigInt(this.id)); return b; };
    getBounds = () => this.options;
    setBounds = vi.fn((rect: object) => Object.assign(this.options, rect));
    setAlwaysOnTop = vi.fn();
    setContentProtection = vi.fn();
    setIgnoreMouseEvents = vi.fn();
    showInactive = vi.fn();
    moveTop = vi.fn();
    async loadURL() { mock.handlers.get("computer-overlay:ready")!({ sender: this.webContents, senderFrame: this.webContents.mainFrame }); }
  },
}));
afterEach(() => {
  vi.useRealTimers(); mock.windows.length = 0; mock.handlers.clear(); mock.dark = false;
  vi.clearAllMocks(); mock.appReady = true; mock.registerSucceeds = true; mock.failWindowCreation = false;
  mock.preferences.theme = "system";
  mock.preferences.language = "zh-CN";
  mock.display = { bounds: { x: 0, y: 0, width: 800, height: 600 }, workArea: { x: 0, y: 0, width: 800, height: 560 } };
});

it("can revoke repeatedly before ready when a second instance quits without opening an overlay", () => {
  mock.appReady = false;
  const overlay = new ComputerOverlay(vi.fn(), async () => {}, vi.fn());
  expect(() => { overlay.close(); overlay.close(); }).not.toThrow();
  expect(globalShortcut.register).not.toHaveBeenCalled();
  expect(globalShortcut.unregister).not.toHaveBeenCalled();
  expect(mock.windows).toHaveLength(0);
});

it("rejects prepare before ready without creating windows or touching shortcuts", async () => {
  mock.appReady = false;
  const overlay = new ComputerOverlay(vi.fn(), async () => {}, vi.fn());
  await expect(overlay.prepare({ x: 0, y: 0, width: 300, height: 200 })).rejects.toThrow("computer_app_not_ready");
  expect(globalShortcut.register).not.toHaveBeenCalled();
  expect(globalShortcut.unregister).not.toHaveBeenCalled();
  expect(mock.windows).toHaveLength(0);
});

it("only unregisters its acquired stop shortcut once, including repeated shutdown cleanup", async () => {
  const overlay = new ComputerOverlay(vi.fn(), async () => {}, vi.fn());
  overlay.close();
  expect(globalShortcut.unregister).not.toHaveBeenCalled();
  try {
    await overlay.prepare({ x: 0, y: 0, width: 300, height: 200 });
    expect(globalShortcut.register).toHaveBeenCalledOnce();
    expect(globalShortcut.unregister).not.toHaveBeenCalled();
  } finally { overlay.close(); overlay.close(); }
  expect(globalShortcut.unregister).toHaveBeenCalledExactlyOnceWith("Control+Alt+Escape");
  expect(mock.windows.every(window => window.destroyed)).toBe(true);
});

it("does not unregister an unowned shortcut when registration is refused", async () => {
  mock.registerSucceeds = false;
  const overlay = new ComputerOverlay(vi.fn(), async () => {}, vi.fn());
  await expect(overlay.prepare({ x: 0, y: 0, width: 300, height: 200 })).rejects.toThrow("computer_stop_shortcut_unavailable");
  overlay.close();
  expect(globalShortcut.register).toHaveBeenCalledOnce();
  expect(globalShortcut.unregister).not.toHaveBeenCalled();
  expect(mock.windows).toHaveLength(0);
});

it("releases the acquired shortcut if window creation fails", async () => {
  mock.failWindowCreation = true;
  const overlay = new ComputerOverlay(vi.fn(), async () => {}, vi.fn());
  await expect(overlay.prepare({ x: 0, y: 0, width: 300, height: 200 })).rejects.toThrow("fixture_window_creation_failed");
  overlay.close();
  expect(globalShortcut.unregister).toHaveBeenCalledExactlyOnceWith("Control+Alt+Escape");
});

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
    expect(edge.options).toMatchObject({ x: 0, y: 0, width: 800, height: 600, frame: false, thickFrame: false, roundedCorners: false, focusable: false });
    expect(edge.setAlwaysOnTop).toHaveBeenCalledWith(true, "screen-saver");
    expect(bar.setAlwaysOnTop).toHaveBeenCalledWith(true, "screen-saver");
    expect(bar.setIgnoreMouseEvents).toHaveBeenCalledWith(false);
    expect(bar.options.focusable).toBe(false);
    expect(bar.moveTop).toHaveBeenCalledOnce();
    expect(edge.showInactive.mock.invocationCallOrder[0]).toBeLessThan(bar.showInactive.mock.invocationCallOrder[0]);
    overlay.moveCursor({ x: 100, y: 200 });
    expect(edge.webContents.send.mock.lastCall[1]).toMatchObject({
      cursor: { x: 100, y: 200 },
      cursorVisible: true,
    });
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

it("uses full display bounds including taskbar on negative-coordinate monitors", async () => {
  mock.display = { bounds: { x: -1280, y: -200, width: 1280, height: 1024 }, workArea: { x: -1280, y: -200, width: 1280, height: 984 } };
  const overlay = new ComputerOverlay(vi.fn(), async () => {}, vi.fn());
  try {
    await overlay.prepare({ x: -1000, y: 0, width: 500, height: 500 });
    const [edge, bar] = mock.windows;
    expect(edge.options).toMatchObject(mock.display.bounds);
    expect(bar.options.y + bar.options.height).toBeLessThanOrEqual(mock.display.workArea.y + mock.display.workArea.height);
    overlay.moveCursor({ x: -900, y: 120 });
    expect(edge.webContents.send.mock.lastCall[1].cursor).toEqual({ x: 380, y: 320 });
  } finally { overlay.close(); }
});

it("publishes only current appearance fields on ready and follows system theme changes", async () => {
  const overlay = new ComputerOverlay(vi.fn(), async () => {}, vi.fn());
  try {
    await overlay.prepare({ x: 0, y: 0, width: 300, height: 200 });
    const [edge, bar] = mock.windows;
    const expected = { resolvedTheme: "light", resolvedLanguage: "zh-CN", themeColor: "#478cbf", fontFamily: "Arial", fontFamilyCode: "Consolas", uiFontSize: 14, codeFontSize: 13, animationsEnabled: true };
    expect(edge.webContents.send.mock.lastCall[1].appearance).toEqual(expected);
    expect(bar.webContents.send.mock.lastCall[1].appearance).toEqual(expected);
    mock.dark = true;
    overlay.update({ state: "running", preview: true });
    expect(bar.webContents.send.mock.lastCall[1].appearance.resolvedTheme).toBe("dark");
    mock.preferences.theme = "light";
    overlay.update({ state: "running", preview: true });
    expect(bar.webContents.send.mock.lastCall[1].appearance.resolvedTheme).toBe("light");
    mock.preferences.language = "en-US";
    overlay.update({ state: "running", preview: true });
    expect(bar.webContents.send.mock.lastCall[1].appearance.resolvedLanguage).toBe("en-US");
  } finally { overlay.close(); }
});

import {
  app,
  BrowserWindow,
  globalShortcut,
  ipcMain,
  screen,
  type IpcMainEvent,
} from "electron";
import { join } from "node:path";
import type {
  ComputerControlState,
  ComputerRect,
} from "../../../contracts/computer-observation";
import type { ComputerPresentation } from "./computer-service";

const STOP_KEY = "Control+Alt+Escape";
export class ComputerOverlay implements ComputerPresentation {
  private windows: BrowserWindow[] = [];
  private state: ComputerControlState | null = null;
  private pulses = new Map<number, number>();
  private ready = new Map<number, () => void>();
  private tick: ReturnType<typeof setInterval> | null = null;
  private generation = 0;
  private clickSequence = 0;
  private layoutDirty = false;
  private pendingReady: Promise<string[]> | null = null;
  constructor(
    private readonly cancel: () => void,
    private readonly resume: () => Promise<void>,
    private readonly pause: () => void,
  ) {
    const trusted = (event: IpcMainEvent): boolean =>
      this.windows.some(
        (w) =>
          !w.isDestroyed() &&
          w.webContents === event.sender &&
          event.senderFrame === event.sender.mainFrame,
      );
    ipcMain.on("computer-overlay:ready", (event) => {
      if (trusted(event)) {
        this.pulses.set(event.sender.id, Date.now());
        this.ready.get(event.sender.id)?.();
      }
    });
    ipcMain.on("computer-overlay:pulse", (event) => {
      if (trusted(event)) this.pulses.set(event.sender.id, Date.now());
    });
    ipcMain.on("computer-overlay:cancel", (event) => {
      if (trusted(event)) this.cancel();
    });
    ipcMain.on("computer-overlay:resume", (event) => {
      if (trusted(event) && this.state?.state === "paused")
        void this.resume().catch(() => this.pause());
    });
    void app.whenReady().then(() => {
      const changed = (): void => {
        this.layoutDirty = true;
        if (this.state && this.state.state !== "cancelled") this.pause();
      };
      screen.on("display-added", changed);
      screen.on("display-removed", changed);
      screen.on("display-metrics-changed", changed);
    });
  }
  prepare(bounds: ComputerRect): Promise<string[]> {
    if (this.pendingReady) return this.pendingReady;
    if (
      this.windows.length === 2 &&
      this.windows.every((w) => !w.isDestroyed())
    ) {
      if (this.layoutDirty) {
        const rects = this.rectangles(bounds);
        this.windows.forEach((window, index) =>
          window.setBounds(rects[index]!),
        );
        this.layoutDirty = false;
      }
      return Promise.resolve(this.handles());
    }
    this.pendingReady = this.create(bounds).finally(() => {
      this.pendingReady = null;
    });
    return this.pendingReady;
  }
  private handles(): string[] {
    return this.windows.map((w) =>
      w.getNativeWindowHandle().readBigUInt64LE().toString(),
    );
  }
  private rectangles(bounds: ComputerRect): Electron.Rectangle[] {
    const physical = {
      x: Math.round(bounds.x),
      y: Math.round(bounds.y),
      width: Math.round(bounds.width),
      height: Math.round(bounds.height),
    };
    const display = screen.getDisplayMatching(
      screen.screenToDipRect(null, physical),
    );
    const work = display.workArea;
    const width = Math.min(440, work.width - 24),
      height = 64;
    return [
      display.bounds,
      {
        x: Math.round(work.x + (work.width - width) / 2),
        y: Math.round(
          Math.max(
            work.y,
            Math.min(
              work.y + work.height - height,
              work.y + work.height * 0.72 - height / 2,
            ),
          ),
        ),
        width,
        height,
      },
    ];
  }
  private async create(bounds: ComputerRect): Promise<string[]> {
    this.close();
    const generation = this.generation;
    if (!globalShortcut.register(STOP_KEY, this.cancel))
      throw new Error("computer_stop_shortcut_unavailable");
    try {
      this.layoutDirty = false;
      for (const [index, rect] of this.rectangles(bounds).entries()) {
        const window = new BrowserWindow({
          ...rect,
          show: false,
          frame: false,
          transparent: true,
          backgroundColor: "#00000000",
          alwaysOnTop: true,
          skipTaskbar: true,
          focusable: false,
          resizable: false,
          hasShadow: false,
          webPreferences: {
            preload: join(__dirname, "../preload/computer-overlay.js"),
            contextIsolation: true,
            sandbox: true,
            nodeIntegration: false,
            backgroundThrottling: false,
          },
        });
        this.windows.push(window);
        window.setContentProtection(true);
        window.setIgnoreMouseEvents(index === 0);
        window.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
        window.webContents.on("will-navigate", (event) =>
          event.preventDefault(),
        );
        window.webContents.on("render-process-gone", () => {
          if (generation === this.generation) this.cancel();
        });
        window.on("unresponsive", () => {
          if (generation === this.generation) this.cancel();
        });
        window.on("closed", () => {
          if (generation === this.generation) this.cancel();
        });
      }
      await Promise.all(
        this.windows.map(async (window, index) => {
          let timer: ReturnType<typeof setTimeout>;
          const ready = new Promise<void>((resolve, reject) => {
            timer = setTimeout(
              () => reject(new Error("computer_overlay_unavailable")),
              5000,
            );
            this.ready.set(window.webContents.id, resolve);
          });
          try {
            if (!app.isPackaged && process.env.ELECTRON_RENDERER_URL) {
              const url = new URL(
                "computer-overlay.html",
                process.env.ELECTRON_RENDERER_URL,
              );
              url.searchParams.set("surface", index === 0 ? "edge" : "bar");
              await window.loadURL(url.toString());
            } else
              await window.loadFile(
                join(__dirname, "../renderer/computer-overlay.html"),
                { query: { surface: index === 0 ? "edge" : "bar" } },
              );
            await ready;
            if (generation !== this.generation || window.isDestroyed())
              throw new Error("computer_cancelled");
            window.showInactive();
          } finally {
            clearTimeout(timer!);
          }
        }),
      );
      this.tick = setInterval(() => {
        if (
          this.windows.some(
            (w) =>
              w.isDestroyed() ||
              Date.now() - (this.pulses.get(w.webContents.id) ?? 0) > 2500,
          )
        ) {
          this.cancel();
          return;
        }
        this.publish();
      }, 40);
      return this.handles();
    } catch (error) {
      this.close();
      throw error;
    }
  }
  update(state: ComputerControlState | null): void {
    this.state = state;
    this.publish();
  }
  click(): void {
    this.clickSequence++;
    this.publish();
  }
  private publish(): void {
    for (const window of this.windows) {
      if (window.isDestroyed() || window.webContents.isDestroyed()) continue;
      const bounds = window.getBounds(),
        cursor = screen.getCursorScreenPoint();
      try {
        window.webContents.send("computer-overlay:state", {
          state: this.state?.state ?? "starting",
          code: this.state?.code,
          cursor: { x: cursor.x - bounds.x, y: cursor.y - bounds.y },
          clickSequence: this.clickSequence,
        });
      } catch {
        if (!window.webContents.isDestroyed()) this.cancel();
      }
    }
  }
  close(): void {
    this.generation++;
    if (this.tick) clearInterval(this.tick);
    this.tick = null;
    this.state = null;
    globalShortcut.unregister(STOP_KEY);
    const windows = this.windows;
    this.windows = [];
    this.pulses.clear();
    this.ready.clear();
    for (const window of windows) if (!window.isDestroyed()) window.destroy();
  }
}

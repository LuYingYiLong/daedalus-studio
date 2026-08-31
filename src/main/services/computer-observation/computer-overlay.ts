import {
  app,
  BrowserWindow,
  globalShortcut,
  ipcMain,
  screen,
  type IpcMainEvent,
} from "electron";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import type {
  ComputerControlState,
  ComputerOverlayViewState,
  ComputerRect,
  ComputerScreenPoint,
} from "../../../contracts/computer-observation";
import type { ComputerPresentation } from "./computer-service";
import type { ComputerOverlayState } from "../../../contracts/computer-overlay";
import { getComputerOverlayAppearance } from "./overlay-appearance";

const STOP_KEY = "Control+Alt+Escape";
export class ComputerOverlay implements ComputerPresentation {
  private windows: BrowserWindow[] = [];
  private state: ComputerOverlayViewState | null = null;
  private pulses = new Map<number, number>();
  private ready = new Map<number, () => void>();
  private tick: ReturnType<typeof setInterval> | null = null;
  private stopShortcutRegistered = false;
  private generation = 0;
  private clickSequence = 0;
  private layoutDirty = false;
  private pendingReady: Promise<string[]> | null = null;
  private resuming = false;
  private resumeError: string | undefined;
  private virtualCursor: ComputerScreenPoint | null = null;
  private semanticBounds: ComputerRect | null = null;
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
        this.publish();
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
      if (!trusted(event) || this.state?.state !== "paused" || this.resuming || this.state.resuming) return;
      const generation = this.generation;
      this.resuming = true;
      this.resumeError = undefined;
      this.publish();
      void this.resume().catch((error: unknown) => {
        if (generation === this.generation && this.state?.state === "paused") {
          const code = error instanceof Error && /^computer_[a-z_]+$/.test(error.message)
            ? error.message : "computer_resume_failed";
          if (code === "computer_busy" || !this.state.code) this.resumeError = code;
        }
      }).finally(() => {
        if (generation !== this.generation) return;
        this.resuming = false;
        this.publish();
      });
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
    if (!app.isReady()) return Promise.reject(new Error("computer_app_not_ready"));
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
        this.setCursorToTargetCenter(bounds);
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
      height = 104;
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
    this.setCursorToTargetCenter(bounds);
    const generation = this.generation;
    if (!globalShortcut.register(STOP_KEY, this.cancel))
      throw new Error("computer_stop_shortcut_unavailable");
    this.stopShortcutRegistered = true;
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
          movable: false,
          minimizable: false,
          maximizable: false,
          fullscreenable: false,
          thickFrame: false,
          roundedCorners: false,
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
        // 使用显示器完整 bounds 的无边框覆盖，而非会改变焦点的独占全屏
        // 默认 floating 置顶仍在 Windows 任务栏下方
        window.setAlwaysOnTop(true, "screen-saver");
        window.setBounds(rect);
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
            } else {
              // Windows 下 loadFile 的 query 组合可能保留反斜杠，生成无法加载的 file URL
              const url = pathToFileURL(
                join(__dirname, "../renderer/computer-overlay.html"),
              );
              url.searchParams.set("surface", index === 0 ? "edge" : "bar");
              await window.loadURL(url.toString());
            }
            await ready;
            if (generation !== this.generation || window.isDestroyed())
              throw new Error("computer_cancelled");
          } finally {
            clearTimeout(timer!);
          }
        }),
      );
      // 固定显示顺序，状态条始终位于穿透层之上，且不抢目标窗口焦点
      for (const window of this.windows) window.showInactive();
      this.windows[1]!.moveTop();
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
  update(state: ComputerOverlayViewState | ComputerControlState | null): void {
    this.state = state;
    if (state?.state !== "running") this.semanticBounds = null;
    this.resumeError = undefined;
    this.publish();
  }
  moveCursor(point: ComputerScreenPoint): void {
    if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) return;
    this.virtualCursor = screen.screenToDipPoint(point);
    this.publish();
  }
  highlight(bounds: ComputerRect | null): void {
    this.semanticBounds = bounds ? screen.screenToDipRect(null, {
      x: Math.round(bounds.x), y: Math.round(bounds.y), width: Math.round(bounds.width), height: Math.round(bounds.height),
    }) : null;
    this.publish();
  }
  private setCursorToTargetCenter(bounds: ComputerRect): void {
    this.virtualCursor = screen.screenToDipPoint({
      x: bounds.x + bounds.width / 2,
      y: bounds.y + bounds.height / 2,
    });
  }
  click(): void {
    this.clickSequence++;
    this.publish();
  }
  private publish(): void {
    if (this.windows.length === 0) return;
    const appearance = getComputerOverlayAppearance();
    for (const window of this.windows) {
      if (window.isDestroyed() || window.webContents.isDestroyed()) continue;
      const bounds = window.getBounds();
      const cursor = this.virtualCursor;
      try {
        window.webContents.send("computer-overlay:state", {
          state: this.state?.state ?? "starting",
          code: this.resumeError ?? this.state?.code,
          resuming: this.state?.state === "paused" && (this.resuming || !!this.state.resuming),
          cursor: cursor === null
            ? { x: -100, y: -100 }
            : { x: cursor.x - bounds.x, y: cursor.y - bounds.y },
          cursorVisible: cursor !== null,
          clickSequence: this.clickSequence,
          highlight: this.semanticBounds ? { ...this.semanticBounds, x: this.semanticBounds.x - bounds.x, y: this.semanticBounds.y - bounds.y } : null,
          preview: this.state?.preview === true,
          appearance,
        } satisfies ComputerOverlayState);
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
    this.resuming = false;
    this.resumeError = undefined;
    this.clickSequence = 0;
    this.virtualCursor = null;
    this.semanticBounds = null;
    // 第二实例可能在 ready 前退出；只释放本实例实际注册过的快捷键
    if (this.stopShortcutRegistered) {
      this.stopShortcutRegistered = false;
      if (app.isReady()) globalShortcut.unregister(STOP_KEY);
    }
    const windows = this.windows;
    this.windows = [];
    this.pulses.clear();
    this.ready.clear();
    for (const window of windows) if (!window.isDestroyed()) window.destroy();
  }
}

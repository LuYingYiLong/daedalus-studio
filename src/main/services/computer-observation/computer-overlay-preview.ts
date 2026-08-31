import type { ComputerOverlayPreviewAction, ComputerOverlayViewState, ComputerRect, ComputerScreenPoint } from "../../../contracts/computer-observation";

type PreviewSurface = {
  prepare(bounds: ComputerRect): Promise<string[]>;
  update(state: ComputerOverlayViewState | null): void;
  moveCursor(point: ComputerScreenPoint): void;
  click(): void;
  close(): void;
};

/** 只持有显示层，不接触 ComputerService、原生助手、授权或 Backend 运行 */
export class ComputerOverlayPreviewController {
  active = false;
  private generation = 0;
  private pending: Promise<string[]> | null = null;
  private expiry: ReturnType<typeof setTimeout> | null = null;

  constructor(private readonly surface: PreviewSurface) {}

  async show(action: ComputerOverlayPreviewAction, bounds: ComputerRect): Promise<void> {
    if (action === "stop") { this.close(); return; }
    if (!this.active) {
      if (this.pending) throw new Error("computer_busy");
      this.active = true;
      this.generation++;
      this.pending = this.surface.prepare(bounds);
    }
    const generation = this.generation;
    const pending = this.pending;
    try {
      await pending;
      if (!this.active || generation !== this.generation) throw new Error("computer_cancelled");
      this.surface.moveCursor({
        x: bounds.x + bounds.width / 2,
        y: bounds.y + bounds.height / 2,
      });
      this.surface.update({ state: action === "paused" ? "paused" : "running", preview: true });
      if (action === "click") this.surface.click();
      if (this.expiry) clearTimeout(this.expiry);
      this.expiry = setTimeout(() => this.close(), 5 * 60_000);
    } catch (error) {
      if (generation === this.generation) this.close();
      throw error;
    } finally {
      if (this.pending === pending) this.pending = null;
    }
  }

  resume(): Promise<void> {
    if (this.active) this.surface.update({ state: "running", preview: true });
    return Promise.resolve();
  }

  pause(): void {
    if (this.active) this.surface.update({ state: "paused", preview: true });
  }

  close(): void {
    if (!this.active) return;
    this.active = false;
    this.generation++;
    if (this.expiry) clearTimeout(this.expiry);
    this.expiry = null;
    this.surface.close();
  }
}

import { afterEach, expect, it, vi } from "vitest";
import { ComputerOverlayPreviewController } from "../../../src/main/services/computer-observation/computer-overlay-preview";
import { parseComputerOverlayPreview } from "../../../src/contracts/computer-observation";

const bounds = { x: -1000, y: 0, width: 800, height: 600 };
function fixture() {
  const surface = { prepare: vi.fn(async () => [] as string[]), update: vi.fn(), click: vi.fn(), close: vi.fn() };
  return { surface, preview: new ComputerOverlayPreviewController(surface) };
}
afterEach(() => vi.useRealTimers());

it("previews states and click feedback with no native service or permission state", async () => {
  vi.useFakeTimers();
  const { surface, preview } = fixture();
  await preview.show("running", bounds);
  expect(surface.prepare).toHaveBeenCalledWith(bounds);
  expect(surface.update).toHaveBeenLastCalledWith({ state: "running", preview: true });
  await preview.show("paused", bounds);
  expect(surface.update).toHaveBeenLastCalledWith({ state: "paused", preview: true });
  await preview.resume();
  await preview.show("click", bounds);
  expect(surface.click).toHaveBeenCalledOnce();
  expect(surface.prepare).toHaveBeenCalledOnce();
  preview.pause();
  expect(surface.update).toHaveBeenLastCalledWith({ state: "paused", preview: true });
  await preview.show("stop", bounds);
  preview.close();
  expect(surface.close).toHaveBeenCalledOnce();
  expect(preview.active).toBe(false);
});

it("stopping an idle preview does not close a real overlay and preview expires", async () => {
  vi.useFakeTimers();
  const { surface, preview } = fixture();
  await preview.show("stop", bounds);
  expect(surface.close).not.toHaveBeenCalled();
  await preview.show("running", bounds);
  await vi.advanceTimersByTimeAsync(5 * 60_000);
  expect(preview.active).toBe(false);
  expect(surface.close).toHaveBeenCalledOnce();
});

it("cancellation during startup discards late results and does not resurrect the preview", async () => {
  const { surface, preview } = fixture();
  let resolve!: (value: string[]) => void;
  surface.prepare.mockImplementationOnce(() => new Promise(done => { resolve = done; }));
  const pending = preview.show("running", bounds);
  const rejected = expect(pending).rejects.toThrow("computer_cancelled");
  preview.close();
  resolve([]);
  await rejected;
  expect(surface.update).not.toHaveBeenCalled();
  expect(surface.close).toHaveBeenCalledOnce();
});

it("concurrent requests share startup and failed startup is cleaned up", async () => {
  vi.useFakeTimers();
  const { surface, preview } = fixture();
  await Promise.all([preview.show("running", bounds), preview.show("paused", bounds)]);
  expect(surface.prepare).toHaveBeenCalledOnce();
  preview.close();
  surface.prepare.mockRejectedValueOnce(new Error("computer_overlay_unavailable"));
  await expect(preview.show("running", bounds)).rejects.toThrow("computer_overlay_unavailable");
  expect(preview.active).toBe(false);
});

it("only accepts strict preview parameters, not handles, scripts or input actions", () => {
  const request = { connectionId: "conn", sessionId: "session", requestId: "request", action: "running" };
  expect(parseComputerOverlayPreview(request)).toEqual(request);
  for (const value of [null, { ...request, hwnd: 123 }, { ...request, action: "type" }, { ...request, sessionId: "../session" }])
    expect(() => parseComputerOverlayPreview(value)).toThrow("computer_invalid_request");
});

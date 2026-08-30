import { afterEach, describe, expect, it, vi } from "vitest";
import {
	WindowCaptureService,
	encodeCaptureImage,
	type CaptureImage,
	type CaptureSource,
	type WindowCaptureAdapter,
} from "../../../src/main/services/window-capture/window-capture-service";

class TestImage implements CaptureImage {
	constructor(
		readonly width = 640,
		readonly height = 480,
		readonly bytesPerPixel = 1,
		readonly empty = false,
	) {}
	getSize() {
		return { width: this.width, height: this.height };
	}
	isEmpty() {
		return this.empty;
	}
	resize({ width, height }: { width: number; height: number }): TestImage {
		return new TestImage(width, height, this.bytesPerPixel);
	}
	toPNG(): Buffer {
		return Buffer.alloc(this.width * this.height * this.bytesPerPixel, 42);
	}
}
const source = (
	id = "window:22:0",
	image: CaptureImage = new TestImage(),
): CaptureSource => ({ id, name: "Private window title", thumbnail: image });
function setup(sources = [source()], timeout?: number) {
	const adapter: WindowCaptureAdapter = {
		getSources: vi.fn(async () => sources),
		getOwnSourceIds: () => ["window:99:0"],
	};
	return { adapter, service: new WindowCaptureService(adapter, timeout) };
}
afterEach(() => vi.useRealTimers());

describe("Windows capture service", () => {
	it("enumerates windows only, excludes all Studio windows, and returns opaque IDs", async () => {
		const { adapter, service } = setup([
			source(),
			source("window:1:1"),
			source("window:99:0"),
			source("screen:1:0"),
		]);
		const { sources } = await service.list("picker");
		expect(sources).toHaveLength(1);
		expect(sources[0]!.sourceId).not.toContain("window:");
		expect(adapter.getSources).toHaveBeenCalledWith({
			types: ["window"],
			thumbnailSize: { width: 320, height: 180 },
			fetchWindowIcons: true,
		});
		const shot = await service.capture("picker", sources[0]!.sourceId);
		expect(shot).toMatchObject({
			mimeType: "image/png",
			width: 640,
			height: 480,
			byteSize: 640 * 480,
		});
		expect(JSON.stringify(shot)).not.toContain("Private window title");
	});
	it("rejects arbitrary, wrong-picker, refreshed and released identifiers", async () => {
		const { service } = setup();
		const id = (await service.list("p")).sources[0]!.sourceId;
		await expect(service.capture("p", "window:22:0")).rejects.toThrow(
			"source_expired",
		);
		await expect(service.capture("other", id)).rejects.toThrow(
			"source_expired",
		);
		await service.list("p");
		await expect(service.capture("p", id)).rejects.toThrow("source_expired");
		const next = (await service.list("p")).sources[0]!.sourceId;
		service.release("p");
		await expect(service.capture("p", next)).rejects.toThrow("source_expired");
	});
	it("does not upscale and reports actual dimensions", () => {
		expect(
			encodeCaptureImage(new TestImage(160, 80), 2560, 5 * 1024 * 1024),
		).toMatchObject({ width: 160, height: 80 });
		const large = encodeCaptureImage(
			new TestImage(4000, 2000, 4),
			2560,
			5 * 1024 * 1024,
		);
		expect(large.width).toBeLessThanOrEqual(2560);
		expect(large.width / large.height).toBeCloseTo(2, 1);
		expect(large.byteSize).toBeLessThanOrEqual(5 * 1024 * 1024);
		expect(Buffer.from(large.dataUrl.split(",")[1]!, "base64").length).toBe(
			large.byteSize,
		);
	});
	it("returns actionable empty and disappeared window failures without leaking native errors", async () => {
		const { adapter, service } = setup();
		const id = (await service.list("p")).sources[0]!.sourceId;
		vi.mocked(adapter.getSources).mockResolvedValueOnce([]);
		await expect(service.capture("p", id)).rejects.toThrow("window_closed");
		vi.mocked(adapter.getSources).mockResolvedValueOnce([
			source("window:22:0", new TestImage(0, 0, 1, true)),
		]);
		await expect(service.capture("p", id)).rejects.toThrow("empty");
		vi.mocked(adapter.getSources).mockRejectedValueOnce(
			new Error("secret window title"),
		);
		await expect(service.capture("p", id)).rejects.toThrow(
			/^window_capture_failed$/,
		);
	});
	it("serializes capture calls and drops results after closing", async () => {
		const { adapter, service } = setup();
		const id = (await service.list("p")).sources[0]!.sourceId;
		let finish!: (sources: CaptureSource[]) => void;
		vi.mocked(adapter.getSources).mockImplementationOnce(
			() =>
				new Promise((resolve) => {
					finish = resolve;
				}),
		);
		const first = service.capture("p", id);
		const second = service.capture("p", id);
		const settled = Promise.allSettled([first, second]);
		await Promise.resolve();
		expect(adapter.getSources).toHaveBeenCalledTimes(2);
		service.release("p");
		finish([source()]);
		const results = await settled;
		expect(results.every((result) => result.status === "rejected")).toBe(true);
		expect(adapter.getSources).toHaveBeenCalledTimes(2);
	});
	it("does not start another native operation while a timed-out call is still running", async () => {
		vi.useFakeTimers();
		const { adapter, service } = setup(undefined, 100);
		let finish!: (sources: CaptureSource[]) => void;
		vi.mocked(adapter.getSources).mockImplementationOnce(
			() =>
				new Promise((resolve) => {
					finish = resolve;
				}),
		);
		const first = expect(service.list("p")).rejects.toThrow("timeout");
		await vi.advanceTimersByTimeAsync(101);
		await first;
		const second = service.list("q");
		await Promise.resolve();
		expect(adapter.getSources).toHaveBeenCalledTimes(1);
		finish([source()]);
		await expect(second).resolves.toHaveProperty("sources");
		expect(adapter.getSources).toHaveBeenCalledTimes(2);
	});
});

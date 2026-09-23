import { describe, expect, it, vi } from "vitest";
import {
	loadWindowThumbnails,
	type CaptureImage,
	type CaptureSource,
} from "../../../src/main/services/window-capture/window-capture-service";

function image(byteLength = 11): CaptureImage {
	const bytes = Buffer.alloc(byteLength, 97);
	return {
		isEmpty: () => false,
		getSize: () => ({ width: 120, height: 60 }),
		resize: () => image(Math.floor(bytes.length / 2)),
		toPNG: () => bytes,
	};
}

describe("window capture thumbnails", () => {
	it("returns thumbnails only for native-eligible source IDs", async () => {
		const getSources = vi.fn(
			async () =>
				[
					{
						id: "window:123:0",
						name: "Eligible",
						thumbnail: image(),
					},
					{
						id: "window:999:0",
						name: "Unlisted",
						thumbnail: image(),
					},
				] satisfies CaptureSource[],
		);

		const thumbnails = await loadWindowThumbnails(getSources, [
			"window:123:0",
		]);

		expect(getSources).toHaveBeenCalledWith({
			types: ["window"],
			thumbnailSize: { width: 320, height: 180 },
			fetchWindowIcons: false,
		});
		expect([...thumbnails.keys()]).toEqual(["window:123:0"]);
		expect(thumbnails.get("window:123:0")).toMatch(
			/^data:image\/png;base64,/,
		);
	});

	it("keeps an unavailable preview from failing the eligible window list", async () => {
		const getSources = vi.fn(async () => {
			throw new Error("capture unavailable");
		});

		await expect(
			loadWindowThumbnails(getSources, ["window:123:0"]),
		).resolves.toEqual(new Map());
	});

	it("keeps the encoded preview within the renderer payload limit", async () => {
		const thumbnails = await loadWindowThumbnails(
			async () => [
				{
					id: "window:123:0",
					name: "Eligible",
					thumbnail: image(80 * 1024),
				},
			],
			["window:123:0"],
		);

		expect(thumbnails.get("window:123:0")!.length).toBeLessThanOrEqual(
			48 * 1024,
		);
	});
});

import { describe, expect, it, vi } from "vitest";
import {
	filterWindowSources,
	WindowScreenshotController,
} from "@/features/window-capture/window-screenshot-controller";
import type { WindowScreenshot } from "../../../../../src/contracts/window-capture";
import type { ImageImport } from "@/features/workspace/controllers/image-import";

const shot: WindowScreenshot = {
	sourceId: "opaque-1",
	mimeType: "image/png",
	dataUrl: "data:image/png;base64,AQ==",
	width: 1,
	height: 1,
	byteSize: 1,
	capturedAt: "2026-08-30T00:00:00Z",
};
const sources = [
	{
		sourceId: "opaque-1",
		title: "Test Editor",
		thumbnailDataUrl: shot.dataUrl,
	},
];
function setup() {
	let scope = 1;
	const api = {
		list: vi.fn(async () => ({ sources })),
		capture: vi.fn(async () => shot),
		release: vi.fn(async () => undefined),
	};
	const importImage = vi.fn<ImageImport>(async () => undefined);
	const controller = new WindowScreenshotController({
		api,
		createImport: () => importImage,
		getScope: () => scope,
		filename: () => "Window screenshot-1.png",
	});
	return {
		controller,
		api,
		importImage,
		changeScope: () => {
			scope += 1;
			controller.validateScope();
		},
	};
}
async function open(controller: WindowScreenshotController) {
	controller.open();
	await Promise.resolve();
	await Promise.resolve();
}

describe("window screenshot selection behavior", () => {
	it("filters without enumerating again and clicking imports the full capture directly", async () => {
		const { controller, api, importImage } = setup();
		await open(controller);
		controller.setSearch("EDITOR");
		expect(
			filterWindowSources(sources, controller.getSnapshot().search),
		).toHaveLength(1);
		expect(filterWindowSources(sources, "missing")).toEqual([]);
		expect(api.list).toHaveBeenCalledTimes(1);
		expect(importImage).not.toHaveBeenCalled();
		await controller.select("unknown");
		expect(api.capture).not.toHaveBeenCalled();
		await controller.select("opaque-1");
		expect(api.capture).toHaveBeenCalledTimes(1);
		expect(importImage).toHaveBeenCalledWith(
			{
				dataUrl: shot.dataUrl,
				mimeType: "image/png",
				width: 1,
				height: 1,
				byteSize: 1,
				title: "Window screenshot-1.png",
			},
			expect.any(Function),
		);
		expect(JSON.stringify(importImage.mock.calls)).not.toContain("Test Editor");
		expect(controller.getSnapshot().open).toBe(false);
	});
	it("refresh clears a failed import so selecting captures a new image", async () => {
		const { controller, api, importImage } = setup();
		await open(controller);
		importImage.mockRejectedValueOnce(new Error("save failed"));
		await controller.select("opaque-1");
		await controller.refresh();
		expect(controller.getSnapshot()).toMatchObject({
			selectedSourceId: null,
			error: null,
		});
		api.capture.mockResolvedValueOnce({ ...shot, dataUrl: "updated" });
		await controller.select("opaque-1");
		expect(api.list).toHaveBeenCalledTimes(2);
		expect(api.capture).toHaveBeenCalledTimes(2);
		expect(importImage).toHaveBeenLastCalledWith(
			expect.objectContaining({ dataUrl: "updated" }),
			expect.any(Function),
		);
	});
	it.each(["cancel", "navigation"])(
		"%s invalidates pending captures without adding an attachment",
		async (action) => {
			const { controller, api, importImage, changeScope } = setup();
			await open(controller);
			let finish!: (value: WindowScreenshot) => void;
			api.capture.mockImplementationOnce(
				() =>
					new Promise((resolve) => {
						finish = resolve;
					}),
			);
			const pending = controller.select("opaque-1");
			if (action === "cancel") controller.close();
			else changeScope();
			finish(shot);
			await pending;
			expect(controller.getSnapshot().open).toBe(false);
			expect(importImage).not.toHaveBeenCalled();
			expect(api.release).toHaveBeenCalledTimes(1);
		},
	);
	it("keeps the dialog open until save completes and ignores repeated clicks during capture and save", async () => {
		const { controller, api, importImage } = setup();
		await open(controller);
		let captured!: (value: WindowScreenshot) => void;
		let saved!: () => void;
		api.capture.mockImplementationOnce(
			() =>
				new Promise((resolve) => {
					captured = resolve;
				}),
		);
		importImage.mockImplementationOnce(
			() =>
				new Promise((resolve) => {
					saved = () => resolve(undefined);
				}),
		);
		const first = controller.select("opaque-1");
		await controller.select("opaque-1");
		expect(api.capture).toHaveBeenCalledTimes(1);
		captured(shot);
		await Promise.resolve();
		await Promise.resolve();
		await controller.select("opaque-1");
		expect(importImage).toHaveBeenCalledTimes(1);
		expect(controller.getSnapshot()).toMatchObject({
			open: true,
			capturing: false,
			saving: true,
		});
		saved();
		await first;
		expect(controller.getSnapshot().open).toBe(false);
	});
	it("capture/save failures can be retried by clicking the same window without recapturing a saved PNG", async () => {
		const { controller, api, importImage } = setup();
		await open(controller);
		api.capture.mockRejectedValueOnce(new Error("private details"));
		await controller.select("opaque-1");
		expect(controller.getSnapshot().error).toBe("window_capture_failed");
		importImage.mockRejectedValueOnce(new Error("save failed"));
		await controller.select("opaque-1");
		expect(controller.getSnapshot()).toMatchObject({
			open: true,
			saving: false,
			error: "image_import_failed",
		});
		await controller.select("opaque-1");
		expect(api.capture).toHaveBeenCalledTimes(2);
		expect(importImage.mock.calls[0]![0]).toBe(importImage.mock.calls[1]![0]);
		expect(controller.getSnapshot().open).toBe(false);
	});
	it("a late capture from a closed picker cannot affect a newly opened picker", async () => {
		const { controller, api, importImage } = setup();
		await open(controller);
		let finish!: (value: WindowScreenshot) => void;
		api.capture.mockImplementationOnce(
			() =>
				new Promise((resolve) => {
					finish = resolve;
				}),
		);
		const pending = controller.select("opaque-1");
		controller.close();
		await open(controller);
		finish(shot);
		await pending;
		expect(controller.getSnapshot()).toMatchObject({
			open: true,
			capturing: false,
			saving: false,
			selectedSourceId: null,
		});
		expect(importImage).not.toHaveBeenCalled();
		controller.close();
	});
});

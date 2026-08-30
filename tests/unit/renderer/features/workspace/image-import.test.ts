import { describe, expect, it, vi } from "vitest";
import {
	assertImageQuota,
	createImageImportTask,
	type PreparedImage,
} from "@/features/workspace/controllers/image-import";
import type { AdditionalContextItem } from "@/platform/rpc/types";

const image: PreparedImage = {
	mimeType: "image/png",
	dataUrl: "data:image/png;base64,AQ==",
	byteSize: 1,
	title: "Window screenshot.png",
};
const attachment: AdditionalContextItem = {
	id: "image-1",
	kind: "image",
	title: image.title!,
	source: "manual",
	data: { byteSize: 1 },
};
function setup() {
	let sessionId: string | null = null;
	let valid = true;
	const deps = {
		assertCurrent: () => {
			if (!valid) throw new Error("image_import_scope_changed");
		},
		getSessionId: () => sessionId,
		ensureSession: vi.fn(async () => {
			sessionId = "session-1";
			return sessionId;
		}),
		getItems: () => [],
		save: vi.fn(async () => ({ attachment })),
		commit: vi.fn(async () => undefined),
	};
	return {
		deps,
		task: createImageImportTask(deps),
		invalidate: () => {
			valid = false;
			sessionId = "session-2";
		},
	};
}
describe("awaitable image import", () => {
	it("does nothing until confirm and accepts its own temporary session creation", async () => {
		const { deps, task } = setup();
		expect(deps.ensureSession).not.toHaveBeenCalled();
		await task(image);
		expect(deps.ensureSession).toHaveBeenCalledTimes(1);
		expect(deps.save).toHaveBeenCalledWith(
			{ ...image, sessionId: "session-1" },
			expect.any(Function),
		);
		expect(deps.commit).toHaveBeenCalledWith(attachment, expect.any(Function));
	});
	it("checks count, individual size and total size without modifying existing items", () => {
		const large = { ...attachment, data: { byteSize: 5 * 1024 * 1024 } };
		expect(() =>
			assertImageQuota([attachment, attachment, attachment], image),
		).toThrow("count_limit");
		expect(() =>
			assertImageQuota([], { ...image, byteSize: 5 * 1024 * 1024 + 1 }),
		).toThrow("size_limit");
		expect(() =>
			assertImageQuota([large, large], { ...image, byteSize: 3 * 1024 * 1024 }),
		).toThrow("total_limit");
		expect(() =>
			assertImageQuota([large, large], { ...image, byteSize: 2 * 1024 * 1024 }),
		).not.toThrow();
	});
	it("rejects navigation before save and between save and context update", async () => {
		const before = setup();
		before.invalidate();
		await expect(before.task(image)).rejects.toThrow("scope_changed");
		expect(before.deps.save).not.toHaveBeenCalled();
		const during = setup();
		during.deps.save.mockImplementationOnce(async () => {
			during.invalidate();
			return { attachment };
		});
		await expect(during.task(image)).rejects.toThrow("scope_changed");
		expect(during.deps.commit).not.toHaveBeenCalled();
	});
	it("propagates save failures and retries context failures without resaving the PNG", async () => {
		const { deps, task } = setup();
		deps.save.mockRejectedValueOnce(new Error("save_failed"));
		await expect(task(image)).rejects.toThrow("save_failed");
		deps.commit.mockRejectedValueOnce(new Error("patch_failed"));
		await expect(task(image)).rejects.toThrow("patch_failed");
		await task(image);
		expect(deps.save).toHaveBeenCalledTimes(2);
		expect(deps.commit).toHaveBeenCalledTimes(2);
	});
	it("cancellation prevents persistence", async () => {
		const { task, deps } = setup();
		await expect(task(image, () => true)).rejects.toThrow("scope_changed");
		expect(deps.ensureSession).not.toHaveBeenCalled();
	});
	it("navigation during temporary session creation cannot import into the next session", async () => {
		const { task, deps, invalidate } = setup();
		deps.ensureSession.mockImplementationOnce(async () => {
			invalidate();
			return "session-2";
		});
		await expect(task(image)).rejects.toThrow("scope_changed");
		expect(deps.save).not.toHaveBeenCalled();
		expect(deps.commit).not.toHaveBeenCalled();
	});
});

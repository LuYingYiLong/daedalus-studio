import { describe, expect, it } from "vitest";
import { resolveSupportedImageMimeType } from "@/features/workspace/controllers/context-helpers";

function createFileLike(name: string, type: string): File {
	return { name, type } as File;
}

describe("workspace context image helpers", () => {
	it("accepts supported MIME types and normalizes image/jpg", () => {
		expect(resolveSupportedImageMimeType(createFileLike("photo.jpeg", "image/jpeg"))).toBe("image/jpeg");
		expect(resolveSupportedImageMimeType(createFileLike("photo.jpg", "image/jpg"))).toBe("image/jpeg");
	});

	it("infers image MIME types when Electron does not populate File.type", () => {
		expect(resolveSupportedImageMimeType(createFileLike("capture.PNG", ""))).toBe("image/png");
		expect(resolveSupportedImageMimeType(createFileLike("capture.webp", "application/octet-stream"))).toBe("image/webp");
		expect(resolveSupportedImageMimeType(createFileLike("notes.txt", ""))).toBeNull();
	});
});

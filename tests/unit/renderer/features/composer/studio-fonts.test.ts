import { describe, expect, it } from "vitest";
import {
	CRITICAL_STUDIO_FONTS,
	waitForStudioFonts,
	type StudioFontFaceSet
} from "@renderer/styles/studio-fonts";

describe("studio font readiness", () => {
	it("loads every critical UI font before reporting readiness", async () => {
		const calls: Array<{ descriptor: string; sample: string | undefined }> = [];
		const fonts: StudioFontFaceSet = {
			load: async (descriptor: string, sample?: string): Promise<unknown> => {
				calls.push({ descriptor, sample });
				return [];
			}
		};

		await expect(waitForStudioFonts(fonts, 100)).resolves.toBe("loaded");
		expect(calls).toEqual(CRITICAL_STUDIO_FONTS.map((font) => ({
			descriptor: font.descriptor,
			sample: font.sample
		})));
	});

	it("falls back after the readiness timeout instead of blocking the window", async () => {
		const fonts: StudioFontFaceSet = {
			load: async (): Promise<unknown> => await new Promise((): void => {})
		};

		await expect(waitForStudioFonts(fonts, 1)).resolves.toBe("timeout");
	});

	it("reports unsupported and failed font loaders", async () => {
		await expect(waitForStudioFonts(undefined)).resolves.toBe("unsupported");
		await expect(waitForStudioFonts({
			load: async (): Promise<unknown> => {
				throw new Error("font unavailable");
			}
		}, 100)).resolves.toBe("failed");
	});
});

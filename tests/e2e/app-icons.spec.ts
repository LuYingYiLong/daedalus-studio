import { resolve } from "node:path";
import { expect, test } from "./fixtures/studio";

test("Windows desktop icon is decodable and preserves transparency", async ({ launchStudio }) => {
	test.skip(process.platform !== "win32", "Native ICO loading is Windows-only");
	const { electronApp, mainWindow } = await launchStudio();
	const icon = await electronApp.evaluate(({ nativeImage }, iconPath) => {
		const image = nativeImage.createFromPath(iconPath);
		const size = image.getSize();
		const bitmap = image.toBitmap();
		return {
			iconPath,
			empty: image.isEmpty(),
			size,
			cornerAlpha: bitmap[3],
			centerAlpha: bitmap[(Math.floor(size.height / 2) * size.width + Math.floor(size.width / 2)) * 4 + 3],
		};
	}, resolve("build/icon.ico"));
	expect(icon.empty, JSON.stringify(icon)).toBe(false);
	expect([16, 24, 32, 48, 64, 128, 256]).toContain(icon.size.width);
	expect(icon.size.height).toBe(icon.size.width);
	expect(icon.cornerAlpha).toBe(0);
	expect(icon.centerAlpha).toBe(255);
	await expect(mainWindow.locator('link[rel="icon"]')).toHaveAttribute("href", /icon-colorful.*\.svg/);
});

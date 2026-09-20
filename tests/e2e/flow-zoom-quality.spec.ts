import { test, expect } from "./fixtures/studio";
import { installFlowPerformanceScenario } from "./fixtures/flow-performance";

test("keeps enlarged node text sharp without requiring a node interaction", async ({ launchStudio, mockBackend }, testInfo) => {
	test.skip(process.env.FLOW_PERF !== "1", "Requires real GPU rasterization");
	installFlowPerformanceScenario(mockBackend, 12);
	const { mainWindow: page, electronApp } = await launchStudio({ hardwareAcceleration: true });
	expect(await electronApp.evaluate(({ app }) => app.getGPUFeatureStatus().gpu_compositing)).toBe("enabled");
	await page.locator(".ant-segmented-item").filter({ hasText: /^Flow$/ }).click();
	await page.getByText("Performance 12", { exact: true }).first().click();
	const node = page.locator('[data-flow-shell="perf-0"]');
	const header = node.locator("header");
	await expect(header).toBeVisible();
	const viewport = page.locator(".react-flow__viewport");
	const zoomTo = async (zoom: number): Promise<void> => {
		const current = await viewport.evaluate((element) => new DOMMatrix(getComputedStyle(element).transform).a);
		const bounds = (await header.boundingBox())!;
		await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
		await page.mouse.wheel(0, -Math.log2(zoom / current) / 0.002);
		await expect.poll(() => viewport.evaluate((element) => new DOMMatrix(getComputedStyle(element).transform).a)).toBeCloseTo(zoom, 2);
		await page.waitForTimeout(800);
	};
	await zoomTo(0.3);
	await node.locator("textarea").first().fill("Text edited at a small scale");
	await header.click();
	await page.waitForTimeout(800);
	await zoomTo(1.7);
	await expect.poll(() => viewport.evaluate((element) => getComputedStyle(element).willChange)).toBe("auto");
	const clip = (await node.boundingBox())!;
	const before = await page.screenshot({ clip, path: testInfo.outputPath("after-zoom.png") });
	// 以最终比例重新栅格化作为参照；节点 DOM、内容和几何都保持不变
	await viewport.evaluate(async (element: HTMLElement) => {
		element.style.willChange = "auto";
		element.style.backfaceVisibility = "visible";
		await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
	});
	await page.waitForTimeout(150);
	const reference = await page.screenshot({ clip, path: testInfo.outputPath("fresh-raster-reference.png") });
	await testInfo.attach("after-zoom.png", { body: before, contentType: "image/png" });
	await testInfo.attach("fresh-raster-reference.png", { body: reference, contentType: "image/png" });
	const difference = await electronApp.evaluate(({ nativeImage }, images) => {
		const a = nativeImage.createFromBuffer(Buffer.from(images[0]!, "base64")).toBitmap();
		const b = nativeImage.createFromBuffer(Buffer.from(images[1]!, "base64")).toBitmap();
		if (a.length !== b.length) return 1;
		let changed = 0;
		for (let i = 0; i < a.length; i += 4) {
			if (Math.max(Math.abs(a[i]! - b[i]!), Math.abs(a[i + 1]! - b[i + 1]!), Math.abs(a[i + 2]! - b[i + 2]!)) > 24) changed++;
		}
		return changed / (a.length / 4);
	}, [before.toString("base64"), reference.toString("base64")]);
	console.log({ enlargedTextPixelDifference: difference });
	expect(difference).toBeLessThan(0.002);

	// 同一缩放下的短距离平移可以复用位图，但停止后必须提交最终坐标的清晰帧
	const canvas = page.locator("[data-flow-canvas-layer]");
	const bounds = (await page.locator(".react-flow").boundingBox())!;
	await page.mouse.move(bounds.x + bounds.width - 50, bounds.y + bounds.height - 50);
	await page.mouse.down({ button: "middle" });
	await page.mouse.move(bounds.x + bounds.width - 93, bounds.y + bounds.height - 77, { steps: 8 });
	await page.mouse.up({ button: "middle" });
	await expect.poll(() => canvas.evaluate((element) => element.style.transform)).toBe("none");
	const expectedDpr = Math.min(await page.evaluate(() => devicePixelRatio), 2);
	await expect.poll(() => canvas.evaluate((element: HTMLCanvasElement) => {
		const zoom = new DOMMatrix(getComputedStyle(document.querySelector(".react-flow__viewport")!).transform).a;
		return element.getContext("2d")!.getTransform().a / zoom;
	})).toBeCloseTo(expectedDpr, 2);
	const alignment = await canvas.evaluate((element: HTMLCanvasElement) => {
		const raster = element.getContext("2d")!.getTransform();
		const view = new DOMMatrix(getComputedStyle(document.querySelector(".react-flow__viewport")!).transform);
		const dpr = raster.a / view.a;
		return { x: raster.e / dpr - view.e - 256, y: raster.f / dpr - view.f - 256, dpr };
	});
	expect(Math.abs(alignment.x)).toBeLessThan(0.01);
	expect(Math.abs(alignment.y)).toBeLessThan(0.01);
	expect(alignment.dpr).toBeCloseTo(expectedDpr, 2);
});

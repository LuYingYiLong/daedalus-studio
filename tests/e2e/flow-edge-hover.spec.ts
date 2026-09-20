import { test, expect } from "./fixtures/studio";
import { installFlowPerformanceScenario } from "./fixtures/flow-performance";

test("keeps edge pixels stable when entering and leaving the SVG interaction layer", async ({
	launchStudio,
	mockBackend,
}) => {
	installFlowPerformanceScenario(mockBackend, 12);
	const { mainWindow: page } = await launchStudio();
	await page.locator(".ant-segmented-item").filter({ hasText: /^Flow$/ }).click();
	await page.getByText("Performance 12", { exact: true }).first().click();
	const source = page.locator('[data-flow-shell="perf-0"] .react-flow__handle.source');
	const target = page.locator('[data-flow-shell="perf-1"] .react-flow__handle.target');
	await expect(source).toBeVisible();
	await expect(target).toBeVisible();
	await page.waitForTimeout(800);
	const a = (await source.boundingBox())!;
	const b = (await target.boundingBox())!;
	const point = { x: (a.x + a.width + b.x) / 2, y: (a.y + a.height / 2 + b.y + b.height / 2) / 2 };
	const canvas = page.locator("[data-flow-canvas-layer]");
	const sampleFrames = (frames: number): Promise<string[]> => canvas.evaluate(async (canvasElement, args) => {
		const element = canvasElement as HTMLCanvasElement;
		const samples: string[] = [];
		for (let frame = 0; frame < args.frames; frame++) {
			await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
			const bounds = element.getBoundingClientRect();
			const x = Math.round((args.point.x - bounds.x) * element.width / bounds.width);
			const y = Math.round((args.point.y - bounds.y) * element.height / bounds.height);
			const pixels = element.getContext("2d")!.getImageData(x - 20, y - 20, 40, 40).data;
			let hash = 2166136261;
			for (const value of pixels) hash = Math.imul(hash ^ value, 16777619);
			samples.push(String(hash >>> 0));
		}
		return samples;
	}, { point, frames });
	const [baseline] = await sampleFrames(1);
	const reads = mockBackend.getRequests("flow.get").length;
	const edge = page.locator('.react-flow__edge[data-id="perf-edge-0"]');
	for (let cycle = 0; cycle < 3; cycle++) {
		await page.mouse.move(point.x, point.y);
		await expect(edge).toBeAttached();
		expect(await sampleFrames(12)).toEqual(Array(12).fill(baseline));
		await expect(edge.locator(".react-flow__edge-path")).toHaveCSS("stroke-opacity", "0");
		await page.mouse.move(a.x + a.width + 12, a.y + a.height / 2);
		expect(await sampleFrames(4)).toEqual(Array(4).fill(baseline));
		await source.hover();
		expect(await sampleFrames(4)).toEqual(Array(4).fill(baseline));
		await page.mouse.move(point.x, point.y + 100);
		await expect(page.locator(".react-flow__edge")).toHaveCount(0);
		expect(await sampleFrames(4)).toEqual(Array(4).fill(baseline));
	}
	await page.mouse.click(point.x, point.y);
	await expect(edge).toHaveClass(/selected/);
	await page.waitForTimeout(600);
	await page.mouse.move(point.x, point.y + 100);
	await expect(edge).toBeAttached();
	expect(await sampleFrames(4)).toEqual(Array(4).fill(baseline));
	await page.keyboard.press("Delete");
	await expect(edge).toHaveCount(0);
	await expect(canvas).toHaveAttribute("data-flow-edge-count", "23");
	expect(mockBackend.getRequests("flow.get").length).toBe(reads);
});
